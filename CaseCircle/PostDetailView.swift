import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct ReportTarget: Identifiable {
    var id: String { "\(type)-\(targetID.uuidString)" }
    var type: String
    var targetID: UUID
}

struct PostDetailView: View {
    var postID: UUID
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }
    private var votes: [Vote] { context.allVotes }
    private var blocks: [UserBlock] { context.blocks }

    @State private var reply = ""
    @State private var parentID: UUID?
    @State private var parentName = ""
    @State private var reportTarget: ReportTarget?
    @State private var blockID: UUID?
    @State private var editing = false
    @State private var editTitle = ""
    @State private var editBody = ""
    @State private var confirmDelete = false
    @State private var zoomed: Data?

    private var post: Post? { posts.first { $0.id == postID } }
    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        Group {
            if let post, let me {
                content(post, me: me)
            } else {
                EmptyState(title: L10n.s(.emptyFeedTitle, lang), message: L10n.s(.feedDisclaimer, lang))
                    .padding()
            }
        }
        .background(Theme.paper)
        .navigationTitle(L10n.s(.typeQuestion, lang))
        .navInline()
        .sheet(item: $reportTarget) { target in
            ReportSheet(target: target)
        }
        .sheet(isPresented: $editing) { editSheet }
        .confirmationDialog(L10n.s(.blockTitle, lang), isPresented: blockPresented, titleVisibility: .visible) {
            Button(L10n.s(.blockUser, lang), role: .destructive) {
                if let me, let blockID {
                    try? CommunityActions.block(blockID, blocker: me, database: context)
                    model.toast = L10n.s(.blockedToast, lang)
                }
            }
            Button(L10n.s(.cancel, lang), role: .cancel) {}
        } message: {
            Text(L10n.s(.blockConfirm, lang))
        }
        .confirmationDialog(L10n.s(.deletePostTitle, lang), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(L10n.s(.delete, lang), role: .destructive) {
                if let post, let me { try? CommunityActions.deletePost(post, actor: me, database: context) }
            }
        } message: {
            Text(L10n.s(.deletePostBody, lang))
        }
        .sheet(item: zoomBinding) { item in
            PhotoView(data: item.data).frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.ink)
        }
    }

    private var blockPresented: Binding<Bool> {
        Binding(get: { blockID != nil }, set: { if !$0 { blockID = nil } })
    }

    private var zoomBinding: Binding<PhotoItem?> {
        Binding(
            get: { zoomed.map { PhotoItem(data: $0) } },
            set: { zoomed = $0?.data }
        )
    }

    @ViewBuilder
    private func content(_ post: Post, me: Member) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Pill(text: L10n.postKind(post.type, lang), tint: Theme.kind(post.type))
                    if post.author?.isSample == true { Pill(text: L10n.s(.sample, lang), tint: Theme.amber) }
                    Spacer()
                    Text(Formatters.relative(post.createdAt, lang)).font(.caption).foregroundStyle(Theme.secondary)
                }
                Text(post.title).font(.title3.weight(.semibold))
                AuthorLine(member: post.author, spaceIDs: post.spaceIDs)
                if post.status == "held" { SafetyNote(text: L10n.s(.heldBanner, lang), held: true) }
                if post.status == "removed" { SafetyNote(text: L10n.s(.removedBanner, lang)) }
                let badge = BadgeText.make(form: post.formCode, officeID: post.officeID, filed: post.filedMonth, stage: post.stage, lang: lang)
                if !badge.isEmpty {
                    Text(badge).font(.subheadline.weight(.medium)).foregroundStyle(Theme.teal)
                }
                if !post.stage.isEmpty {
                    StatusDecoderCard(stage: post.stage)
                }
                Text(post.bodyText).font(.body).textSelection(.enabled)
                if post.editedAt != nil {
                    Text(L10n.s(.editedLabel, lang)).font(.caption).foregroundStyle(Theme.secondary)
                }
                if !post.images.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(post.images.sorted { $0.sortIndex < $1.sortIndex }, id: \.id) { image in
                                Button { zoomed = image.data } label: { PhotoView(data: image.data) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
                HStack(spacing: 16) {
                    voteButton(id: post.id, type: "post", count: post.upvoteCount, me: me, authorID: post.author?.id)
                    Button {
                        try? CommunityActions.toggleBookmark(postID: post.id, member: me, database: context)
                        model.toast = L10n.s(.saved, lang)
                    } label: {
                        Label(
                            me.bookmarks.contains { $0.postID == post.id } ? L10n.s(.bookmarked, lang) : L10n.s(.bookmark, lang),
                            systemImage: "bookmark"
                        )
                    }
                    ShareLink(item: shareText(post)) { Label(L10n.s(.share, lang), systemImage: "square.and.arrow.up") }
                    Menu {
                        if post.author?.id == me.id, Date().timeIntervalSince(post.createdAt) <= 86_400 {
                            Button(L10n.s(.edit, lang)) {
                                editTitle = post.title
                                editBody = post.bodyText
                                editing = true
                            }
                        }
                        if post.author?.id == me.id || me.role == "mod" {
                            Button(L10n.s(.delete, lang), role: .destructive) { confirmDelete = true }
                        }
                        if post.author?.id != me.id {
                            Button(L10n.s(.report, lang)) { reportTarget = ReportTarget(type: "post", targetID: post.id) }
                            if let authorID = post.author?.id {
                                Button(L10n.s(.blockUser, lang), role: .destructive) { blockID = authorID }
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(L10n.s(.moreActions, lang))
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.plain)
                DisclaimerBanner()
                Text(L10n.s(.communityBanner, lang)).font(.caption).foregroundStyle(Theme.secondary)
                ForEach(visibleComments(post, me: me), id: \.id) { comment in
                    commentCard(comment, post: post, me: me)
                }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            composer(post, me: me)
        }
    }

    private func commentCard(_ comment: Comment, post: Post, me: Member) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            AuthorLine(member: comment.author, spaceIDs: post.spaceIDs)
            if comment.status == "held" { SafetyNote(text: L10n.s(.heldBanner, lang), held: true) }
            Text(comment.bodyText).font(.body).textSelection(.enabled)
            Text(L10n.s(.notLegalShort, lang)).font(.caption2).foregroundStyle(Theme.secondary)
            HStack {
                voteButton(id: comment.id, type: "comment", count: comment.upvoteCount, me: me, authorID: comment.author?.id)
                Button(L10n.s(.reply, lang)) {
                    parentID = comment.id
                    parentName = comment.author?.username ?? L10n.s(.deletedMember, lang)
                }
                .font(.caption.weight(.semibold))
                if post.type == PostKind.question.rawValue, post.author?.id == me.id, comment.author?.id != me.id {
                    Button(post.helpfulCommentID == comment.id ? L10n.s(.helpful, lang) : L10n.s(.markHelpful, lang)) {
                        try? CommunityActions.markHelpful(comment, voter: me, database: context)
                    }
                    .font(.caption.weight(.semibold))
                }
                if comment.author?.id != me.id {
                    Button(L10n.s(.report, lang)) {
                        reportTarget = ReportTarget(type: "comment", targetID: comment.id)
                    }
                    .font(.caption)
                }
                if comment.author?.id == me.id || me.role == "mod" {
                    Button(L10n.s(.delete, lang), role: .destructive) {
                        try? CommunityActions.deleteComment(comment, actor: me, database: context)
                    }
                    .font(.caption)
                }
            }
        }
        .padding(.leading, comment.parentID == nil ? 0 : 16)
        .cardStyle()
    }

    private func voteButton(id: UUID, type: String, count: Int, me: Member, authorID: UUID?) -> some View {
        let voted = votes.contains { $0.targetID == id && $0.targetType == type && $0.voter?.id == me.id }
        return Button {
            try? CommunityActions.toggleVote(targetID: id, targetType: type, voter: me, database: context)
        } label: {
            Label("\(count)", systemImage: voted ? "arrow.up.circle.fill" : "arrow.up")
        }
        .disabled(authorID == me.id)
        .accessibilityLabel(L10n.s(.upvote, lang))
    }

    private func composer(_ post: Post, me: Member) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if parentID != nil {
                HStack {
                    Text(L10n.s(.replyTo, lang, parentName)).font(.caption)
                    Spacer()
                    Button(L10n.s(.cancelReply, lang)) { parentID = nil }
                        .font(.caption.weight(.semibold))
                }
            }
            if let message = L10n.safetyMessage(replyVerdict, lang), !reply.isEmpty {
                SafetyNote(text: message, held: replyVerdict == .hold(.scam))
            }
            HStack(alignment: .bottom) {
                TextField(L10n.s(.commentPlaceholder, lang), text: $reply, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                Button(L10n.s(.sendReply, lang)) { send(post, me: me) }
                    .font(.subheadline.weight(.semibold))
                    .disabled(!canSend)
            }
        }
        .padding(12)
        .background(Theme.paper)
    }

    private var replyVerdict: SafetyVerdict {
        reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .allow : SafetyFilter.evaluate(reply)
    }

    private var canSend: Bool {
        let clean = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.count < 8 { return false }
        if case .block = replyVerdict { return false }
        return true
    }

    private func send(_ post: Post, me: Member) {
        do {
            let comment = try CommunityActions.comment(on: post, parentID: parentID, body: reply, author: me, database: context)
            reply = ""
            parentID = nil
            model.toast = comment.status == "held" ? L10n.s(.commentHeld, lang) : L10n.s(.postedToast, lang)
        } catch let error as ActionError {
            if case .blocked(let reason) = error {
                model.toast = L10n.safetyMessage(.block(reason), lang)
            } else if case .rateLimited = error {
                model.toast = L10n.s(.slowDown, lang)
            } else {
                model.toast = L10n.s(.bodyTooShort, lang)
            }
        } catch {
            model.toast = L10n.s(.couldNotSignIn, lang)
        }
    }

    private func visibleComments(_ post: Post, me: Member) -> [Comment] {
        let blocked = FeedQuery.blockedIDs(for: me.id, blocks: blocks)
        return post.comments.filter { comment in
            if let authorID = comment.author?.id, blocked.contains(authorID) { return false }
            if comment.status == "live" { return true }
            if comment.status == "held" && (comment.author?.id == me.id || me.role == "mod") { return true }
            return false
        }
        .sorted { $0.createdAt < $1.createdAt }
    }

    private func shareText(_ post: Post) -> String {
        "\(post.title)\n\n\(post.bodyText)\n\n—\nCaseCircle. \(L10n.s(.notLegalShort, lang))"
    }

    private var editSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                TextField(L10n.s(.titleLabel, lang), text: $editTitle)
                    .textFieldStyle(.roundedBorder)
                TextField(L10n.s(.bodyLabel, lang), text: $editBody, axis: .vertical)
                    .lineLimit(5...12)
                    .textFieldStyle(.roundedBorder)
                Text(L10n.s(.editWindow, lang)).font(.caption).foregroundStyle(Theme.secondary)
                Spacer()
            }
            .padding()
            .background(Theme.paper)
            .navigationTitle(L10n.s(.edit, lang))
            .navInline()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.s(.cancel, lang)) { editing = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.s(.save, lang)) {
                        if let post, let me {
                            do {
                                try CommunityActions.edit(post: post, title: editTitle, body: editBody, editor: me, database: context)
                                editing = false
                                model.toast = L10n.s(.saved, lang)
                            } catch {
                                model.toast = L10n.s(.editWindow, lang)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct PhotoItem: Identifiable {
    var id: Int { data.hashValue }
    var data: Data
}

struct ReportSheet: View {
    var target: ReportTarget
    @Environment(\.dismiss) private var dismiss
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }

    private var reasons: [(String, LKey)] {
        [
            ("spam", .reportSpam),
            ("identifiers", .reportIdentifiers),
            ("harassment", .reportHarassment),
            ("misinformation", .reportMisinfo),
            ("solicitation", .reportSolicitation),
            ("other", .reportOther)
        ]
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(L10n.s(.threeReportNote, lang)).font(.footnote).foregroundStyle(Theme.secondary)
                }
                ForEach(reasons, id: \.0) { reason, key in
                    Button(L10n.s(key, lang)) { submit(reason) }
                        .foregroundStyle(Theme.ink)
                }
            }
            .navigationTitle(L10n.s(.reportTitle, lang))
            .navInline()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.s(.cancel, lang)) { dismiss() }
                }
            }
        }
    }

    private func submit(_ reason: String) {
        guard let me = members.first(where: { $0.isCurrentUser }) else { return }
        do {
            try CommunityActions.report(
                targetType: target.type,
                targetID: target.targetID,
                reason: reason,
                reporter: me,
                database: context
            )
            model.toast = L10n.s(.reportThanks, lang)
            dismiss()
        } catch {
            model.toast = L10n.s(.alreadyReported, lang)
            dismiss()
        }
    }
}
