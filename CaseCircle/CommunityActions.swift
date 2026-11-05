import Foundation
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

@MainActor
enum CommunityActions {
    static func createAccount(
        username: String,
        locale: String,
        appleUserID: String,
        email: String,
        spaceIDs: [String],
        profile: ProfileDraft?,
        database: Database
    ) throws -> Member {
        let members = database.members
        if let appleUserID = appleUserID.nilIfEmpty,
           let existing = members.first(where: { $0.appleUserID == appleUserID }) {
            members.forEach { $0.isCurrentUser = false }
            existing.isCurrentUser = true
            existing.locale = locale
            database.save()
            return existing
        }
        if let email = email.nilIfEmpty?.lowercased(),
           let existing = members.first(where: { $0.email.lowercased() == email && !email.isEmpty }) {
            members.forEach { $0.isCurrentUser = false }
            existing.isCurrentUser = true
            existing.locale = locale
            database.save()
            return existing
        }
        let taken = Set(members.map { $0.username.lowercased() })
        if UsernameRules.issue(for: username, taken: taken) != nil {
            throw ActionError.notAllowed
        }
        members.forEach { $0.isCurrentUser = false }
        let member = Member(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            locale: locale,
            isCurrentUser: true,
            appleUserID: appleUserID,
            email: email.lowercased()
        )
        database.add(member)
        for spaceID in Set(spaceIDs) {
            database.add(Membership(spaceID: spaceID, member: member))
        }
        if let profile, !profile.currentStage.isEmpty {
            try saveProfile(profile, member: member, database: database, alreadyJoined: true)
        }
        NotificationService.record(
            member: member,
            kind: "welcome",
            title: L10n.s(.welcomeNoteTitle, locale),
            body: L10n.s(.welcomeNoteBody, locale),
            postID: nil,
            database: database,
            push: false
        )
        database.save()
        return member
    }

    static func saveProfile(
        _ draft: ProfileDraft,
        member: Member,
        database: Database,
        alreadyJoined: Bool = false
    ) throws {
        guard !draft.currentStage.isEmpty, !draft.formCode.isEmpty else { throw ActionError.tooShort }
        var dates = draft.stageDates
        dates["filed"] = Formatters.monthStart(draft.filedMonth)
        if dates[draft.currentStage] == nil {
            dates[draft.currentStage] = Formatters.monthStart(.now)
        }
        if let existing = member.profiles.first(where: { $0.spaceID == draft.spaceID }) {
            existing.formCode = draft.formCode
            existing.basedOn = draft.basedOn
            existing.filedMonth = Formatters.monthStart(draft.filedMonth)
            existing.officeID = draft.officeID
            existing.filingMethod = draft.filingMethod
            existing.currentStage = draft.currentStage
            existing.stageDates = dates
        } else {
            database.add(CaseProfile(
                spaceID: draft.spaceID,
                formCode: draft.formCode,
                basedOn: draft.basedOn,
                filedMonth: Formatters.monthStart(draft.filedMonth),
                officeID: draft.officeID,
                filingMethod: draft.filingMethod,
                currentStage: draft.currentStage,
                stageDates: dates,
                member: member
            ))
        }
        var completed = Set(member.completedSpaceIDs)
        let finished = draft.completed && (draft.currentStage == Stage.approved.rawValue || draft.currentStage == Stage.oath.rawValue)
        if finished { completed.insert(draft.spaceID) } else { completed.remove(draft.spaceID) }
        member.completedSpaceIDs = Array(completed).sorted()
        if !alreadyJoined && !member.memberships.contains(where: { $0.spaceID == draft.spaceID }) {
            database.add(Membership(spaceID: draft.spaceID, member: member))
        }
        database.save()
    }

    static func deleteProfile(_ profile: CaseProfile, member: Member, database: Database) throws {
        member.completedSpaceIDs.removeAll { $0 == profile.spaceID }
        database.delete(profile)
        database.save()
    }

    static func join(_ spaceID: String, member: Member, database: Database) throws {
        guard !member.memberships.contains(where: { $0.spaceID == spaceID }) else { return }
        database.add(Membership(spaceID: spaceID, member: member))
        database.save()
    }

    static func leave(_ spaceID: String, member: Member, database: Database) throws {
        member.memberships.filter { $0.spaceID == spaceID }.forEach { database.delete($0) }
        database.save()
    }

    static func publish(_ draft: NewPostDraft, author: Member, database: Database) throws -> Post {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = draft.body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard title.count >= 8, body.count >= 20, !draft.spaceIDs.isEmpty else { throw ActionError.tooShort }
        let verdict = SafetyFilter.evaluate(title + "\n" + body)
        if case .block(let reason) = verdict { throw ActionError.blocked(reason) }
        let status = verdict == .hold(.scam) ? "held" : "live"
        let spaceIDs = Array(draft.spaceIDs.prefix(3))
        for spaceID in spaceIDs where !author.memberships.contains(where: { $0.spaceID == spaceID }) {
            database.add(Membership(spaceID: spaceID, member: author))
        }
        let profile = author.profiles.first { $0.spaceID == spaceIDs[0] }
        let post = Post(
            spaceIDs: spaceIDs,
            type: draft.type,
            title: title,
            bodyText: body,
            stage: draft.stage.isEmpty ? (profile?.currentStage ?? "") : draft.stage,
            officeID: draft.officeID.isEmpty ? (profile?.officeID ?? "") : draft.officeID,
            formCode: draft.formCode.isEmpty ? (profile?.formCode ?? Taxonomy.space(spaceIDs[0])?.primaryForm ?? "") : draft.formCode,
            filedMonth: draft.filedMonth ?? profile?.filedMonth,
            status: status,
            heldReason: status == "held" ? SafetyHold.scam.rawValue : "",
            author: author
        )
        database.add(post)
        for (index, data) in draft.images.prefix(4).enumerated() {
            database.add(PostImage(data: data, sortIndex: index, post: post))
        }
        if draft.type == PostKind.timeline.rawValue, !post.stage.isEmpty {
            var profileDraft = ProfileDraft.fresh(spaceID: spaceIDs[0])
            if let profile {
                profileDraft.formCode = profile.formCode
                profileDraft.basedOn = profile.basedOn
                profileDraft.filedMonth = profile.filedMonth
                profileDraft.officeID = profile.officeID
                profileDraft.filingMethod = profile.filingMethod
                profileDraft.stageDates = profile.stageDates
                profileDraft.completed = author.completedSpaceIDs.contains(spaceIDs[0])
            }
            if !draft.officeID.isEmpty { profileDraft.officeID = draft.officeID }
            if !draft.formCode.isEmpty { profileDraft.formCode = draft.formCode }
            if let filed = draft.filedMonth { profileDraft.filedMonth = filed }
            profileDraft.currentStage = post.stage
            profileDraft.stageDates[post.stage] = Formatters.monthStart(.now)
            try saveProfile(profileDraft, member: author, database: database, alreadyJoined: true)
        }
        if status == "held" {
            NotificationService.record(
                member: author,
                kind: "held",
                title: L10n.s(.heldToast, author.locale),
                body: L10n.s(.heldBanner, author.locale),
                postID: post.id,
                database: database,
                push: false
            )
        }
        database.save()
        return post
    }

    static func edit(post: Post, title: String, body: String, editor: Member, database: Database) throws {
        guard post.author?.id == editor.id else { throw ActionError.notAllowed }
        guard Date().timeIntervalSince(post.createdAt) <= 86_400 else { throw ActionError.editExpired }
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanTitle.count >= 8, cleanBody.count >= 20 else { throw ActionError.tooShort }
        let verdict = SafetyFilter.evaluate(cleanTitle + "\n" + cleanBody)
        if case .block(let reason) = verdict { throw ActionError.blocked(reason) }
        post.title = cleanTitle
        post.bodyText = cleanBody
        post.editedAt = .now
        if verdict == .hold(.scam) {
            post.status = "held"
            post.heldReason = SafetyHold.scam.rawValue
        }
        database.save()
    }

    static func deletePost(_ post: Post, actor: Member, database: Database) throws {
        guard post.author?.id == actor.id || actor.role == "mod" else { throw ActionError.notAllowed }
        database.delete(post)
        database.save()
    }

    static func deleteComment(_ comment: Comment, actor: Member, database: Database) throws {
        guard comment.author?.id == actor.id || actor.role == "mod" else { throw ActionError.notAllowed }
        if comment.post?.helpfulCommentID == comment.id {
            comment.post?.helpfulCommentID = nil
        }
        database.delete(comment)
        database.save()
    }

    static func comment(on post: Post, parentID: UUID?, body: String, author: Member, database: Database) throws -> Comment {
        let clean = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 8 else { throw ActionError.tooShort }
        let verdict = SafetyFilter.evaluate(clean)
        if case .block(let reason) = verdict { throw ActionError.blocked(reason) }
        let status = verdict == .hold(.scam) ? "held" : "live"
        let comment = Comment(bodyText: clean, status: status, parentID: parentID, post: post, author: author)
        database.add(comment)
        if status == "live" {
            if let owner = post.author, owner.id != author.id {
                NotificationService.record(
                    member: owner,
                    kind: "reply_post",
                    title: author.username,
                    body: clean,
                    postID: post.id,
                    database: database,
                    push: true
                )
            }
            if let parentID, let parent = post.comments.first(where: { $0.id == parentID }),
               let owner = parent.author, owner.id != author.id, owner.id != post.author?.id {
                NotificationService.record(
                    member: owner,
                    kind: "reply_comment",
                    title: author.username,
                    body: clean,
                    postID: post.id,
                    database: database,
                    push: true
                )
            }
            let bookmarks = database.allBookmarks
            for bookmark in bookmarks where bookmark.postID == post.id {
                guard let member = bookmark.member, member.id != author.id, member.id != post.author?.id else { continue }
                NotificationService.record(
                    member: member,
                    kind: "followed",
                    title: post.title,
                    body: clean,
                    postID: post.id,
                    database: database,
                    push: true
                )
            }
        }
        database.save()
        return comment
    }

    static func toggleVote(targetID: UUID, targetType: String, voter: Member, database: Database) throws {
        let posts = database.posts
        let comments = database.allComments
        let author: Member?
        if targetType == "post" {
            author = posts.first { $0.id == targetID }?.author
        } else {
            author = comments.first { $0.id == targetID }?.author
        }
        if author?.id == voter.id { return }
        let votes = database.allVotes
        if let existing = votes.first(where: { $0.targetID == targetID && $0.targetType == targetType && $0.voter?.id == voter.id }) {
            applyVote(targetID: targetID, targetType: targetType, delta: -1, posts: posts, comments: comments)
            database.delete(existing)
        } else {
            database.add(Vote(targetID: targetID, targetType: targetType, voter: voter))
            applyVote(targetID: targetID, targetType: targetType, delta: 1, posts: posts, comments: comments)
        }
        database.save()
    }

    static func markHelpful(_ comment: Comment, voter: Member, database: Database) throws {
        guard let post = comment.post else { throw ActionError.notAllowed }
        guard post.type == PostKind.question.rawValue else { throw ActionError.notAllowed }
        guard post.author?.id == voter.id else { throw ActionError.notAllowed }
        guard comment.author?.id != voter.id else { throw ActionError.notAllowed }
        if post.helpfulCommentID == comment.id {
            if let previous = comment.author {
                previous.reputation = max(0, previous.reputation - 10)
            }
            post.helpfulCommentID = nil
        } else {
            if let previousID = post.helpfulCommentID,
               let previous = post.comments.first(where: { $0.id == previousID })?.author {
                previous.reputation = max(0, previous.reputation - 10)
            }
            post.helpfulCommentID = comment.id
            if let author = comment.author {
                author.reputation += 10
                NotificationService.record(
                    member: author,
                    kind: "helpful",
                    title: L10n.s(.helpful, author.locale),
                    body: post.title,
                    postID: post.id,
                    database: database,
                    push: true
                )
            }
        }
        database.save()
    }

    static func toggleBookmark(postID: UUID, member: Member, database: Database) throws {
        if let existing = member.bookmarks.first(where: { $0.postID == postID }) {
            database.delete(existing)
        } else {
            database.add(Bookmark(postID: postID, member: member))
        }
        database.save()
    }

    static func report(targetType: String, targetID: UUID, reason: String, reporter: Member, database: Database) throws {
        let reports = database.reports
        if reports.contains(where: { $0.reporterID == reporter.id && $0.targetID == targetID && $0.targetType == targetType && $0.state == "open" }) {
            throw ActionError.alreadyReported
        }
        database.add(ReportItem(reporterID: reporter.id, targetType: targetType, targetID: targetID, reason: reason))
        let open = reports.filter { $0.targetID == targetID && $0.targetType == targetType && $0.state == "open" }.count + 1
        if open >= 3 {
            if targetType == "post" {
                let posts = database.posts
                posts.first { $0.id == targetID }?.status = "removed"
            } else {
                let comments = database.allComments
                comments.first { $0.id == targetID }?.status = "removed"
            }
        }
        database.save()
    }

    static func block(_ personID: UUID, blocker: Member, database: Database) throws {
        guard personID != blocker.id else { throw ActionError.notAllowed }
        let blocks = database.blocks
        guard !blocks.contains(where: { $0.blockerID == blocker.id && $0.blockedID == personID }) else { return }
        database.add(UserBlock(blockerID: blocker.id, blockedID: personID))
        database.save()
    }

    static func unblock(_ personID: UUID, blocker: Member, database: Database) throws {
        let blocks = database.blocks
        blocks.filter { $0.blockerID == blocker.id && $0.blockedID == personID }.forEach { database.delete($0) }
        database.save()
    }

    static func restore(post: Post, database: Database) throws {
        post.status = "live"
        let reports = database.reports
        reports.filter { $0.targetID == post.id && $0.state == "open" }.forEach { $0.state = "resolved" }
        database.save()
    }

    static func remove(post: Post, database: Database) throws {
        post.status = "removed"
        let reports = database.reports
        reports.filter { $0.targetID == post.id && $0.state == "open" }.forEach { $0.state = "resolved" }
        database.save()
    }

    static func dismissReports(for targetID: UUID, database: Database) throws {
        let reports = database.reports
        reports.filter { $0.targetID == targetID && $0.state == "open" }.forEach { $0.state = "resolved" }
        database.save()
    }

    static func deleteAccount(_ member: Member, database: Database) throws {
        let posts = database.posts
        let comments = database.allComments
        for vote in member.votes {
            applyVote(targetID: vote.targetID, targetType: vote.targetType, delta: -1, posts: posts, comments: comments)
        }
        for post in posts where post.author?.id == member.id { post.author = nil }
        for comment in comments where comment.author?.id == member.id { comment.author = nil }
        let blocks = database.blocks
        blocks.filter { $0.blockerID == member.id || $0.blockedID == member.id }.forEach { database.delete($0) }
        database.deleteAccount(member)
        database.save()
    }

    private static func applyVote(targetID: UUID, targetType: String, delta: Int, posts: [Post], comments: [Comment]) {
        if targetType == "post", let post = posts.first(where: { $0.id == targetID }) {
            post.upvoteCount = max(0, post.upvoteCount + delta)
            if let author = post.author { author.reputation = max(0, author.reputation + delta) }
        } else if let comment = comments.first(where: { $0.id == targetID }) {
            comment.upvoteCount = max(0, comment.upvoteCount + delta)
            if let author = comment.author { author.reputation = max(0, author.reputation + delta) }
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
