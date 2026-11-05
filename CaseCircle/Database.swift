import Foundation
import SwiftUI

@Observable
final class Database {
    var revision = 0
    var members: [Member] = []
    var posts: [Post] = []
    var reports: [ReportItem] = []
    var blocks: [UserBlock] = []

    private let fileURL: URL?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        if CommandLine.arguments.contains("-memory") {
            fileURL = nil
        } else {
            let url = Self.storeURL()
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            fileURL = url
            load()
        }
    }

    func add(_ member: Member) { members.append(member) }
    func add(_ report: ReportItem) { reports.append(report) }
    func add(_ block: UserBlock) { blocks.append(block) }

    func add(_ membership: Membership) {
        membership.member?.memberships.append(membership)
    }

    func add(_ profile: CaseProfile) {
        profile.member?.profiles.append(profile)
    }

    func add(_ post: Post) {
        posts.append(post)
        post.author?.posts.append(post)
    }

    func add(_ comment: Comment) {
        comment.post?.comments.append(comment)
        comment.author?.comments.append(comment)
    }

    func add(_ image: PostImage) {
        image.post?.images.append(image)
    }

    func add(_ vote: Vote) {
        vote.voter?.votes.append(vote)
    }

    func add(_ bookmark: Bookmark) {
        bookmark.member?.bookmarks.append(bookmark)
    }

    func add(_ note: AppNotification) {
        note.member?.notifications.append(note)
    }

    func delete(_ post: Post) {
        posts.removeAll { $0.id == post.id }
        post.author?.posts.removeAll { $0.id == post.id }
        let commentIDs = Set(post.comments.map(\.id))
        for member in members {
            member.bookmarks.removeAll { $0.postID == post.id }
            member.votes.removeAll { $0.targetID == post.id || commentIDs.contains($0.targetID) }
            member.comments.removeAll { commentIDs.contains($0.id) }
        }
        reports.removeAll { $0.targetID == post.id || commentIDs.contains($0.targetID) }
    }

    func delete(_ comment: Comment) {
        comment.post?.comments.removeAll { $0.id == comment.id }
        comment.author?.comments.removeAll { $0.id == comment.id }
        for member in members {
            member.votes.removeAll { $0.targetID == comment.id }
        }
        reports.removeAll { $0.targetID == comment.id }
        if comment.post?.helpfulCommentID == comment.id {
            comment.post?.helpfulCommentID = nil
        }
    }

    func delete(_ profile: CaseProfile) {
        profile.member?.profiles.removeAll { $0.id == profile.id }
    }

    func delete(_ block: UserBlock) {
        blocks.removeAll { $0.id == block.id }
    }

    func delete(_ vote: Vote) {
        vote.voter?.votes.removeAll { $0.id == vote.id }
    }

    func delete(_ bookmark: Bookmark) {
        bookmark.member?.bookmarks.removeAll { $0.id == bookmark.id }
    }

    func delete(_ membership: Membership) {
        membership.member?.memberships.removeAll { $0.id == membership.id }
    }

    func deleteAccount(_ member: Member) {
        for post in posts where post.author?.id == member.id { post.author = nil }
        for post in posts {
            for comment in post.comments where comment.author?.id == member.id { comment.author = nil }
        }
        blocks.removeAll { $0.blockerID == member.id || $0.blockedID == member.id }
        members.removeAll { $0.id == member.id }
    }

    var allVotes: [Vote] { members.flatMap(\.votes) }
    var allComments: [Comment] { posts.flatMap(\.comments) }
    var allBookmarks: [Bookmark] { members.flatMap(\.bookmarks) }
    var allProfiles: [CaseProfile] { members.flatMap(\.profiles) }

    func save() {
        revision += 1
        guard let fileURL else { return }
        let snapshot = Snapshot(database: self)
        guard let data = try? encoder.encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    private func load() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL),
              let snapshot = try? decoder.decode(Snapshot.self, from: data) else { return }
        snapshot.apply(to: self)
    }

    private static func storeURL() -> URL {
        let arguments = CommandLine.arguments
        if let index = arguments.firstIndex(of: "-store"), index + 1 < arguments.count {
            return URL(fileURLWithPath: arguments[index + 1])
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("CaseCircle", isDirectory: true).appendingPathComponent("CaseCircle.store.json")
    }
}

private struct Snapshot: Codable {
    var members: [MemberDTO]
    var posts: [PostDTO]
    var reports: [ReportDTO]
    var blocks: [BlockDTO]

    init(database: Database) {
        members = database.members.map(MemberDTO.init)
        posts = database.posts.map(PostDTO.init)
        reports = database.reports.map(ReportDTO.init)
        blocks = database.blocks.map(BlockDTO.init)
    }

    func apply(to database: Database) {
        let builtMembers = members.map { $0.make() }
        let byID = Dictionary(uniqueKeysWithValues: builtMembers.map { ($0.id, $0) })
        database.members = builtMembers
        database.posts = posts.map { $0.make(members: byID) }
        for post in database.posts {
            post.author?.posts.append(post)
            for comment in post.comments {
                comment.author?.comments.append(comment)
            }
        }
        database.reports = reports.map { $0.make() }
        database.blocks = blocks.map { $0.make() }
    }
}

private struct MemberDTO: Codable {
    var id: UUID
    var username: String
    var locale: String
    var reputation: Int
    var role: String
    var isCurrentUser: Bool
    var isSample: Bool
    var appleUserID: String
    var email: String
    var completedSpaceIDs: [String]
    var createdAt: Date
    var notifyRepliesToPost: Bool
    var notifyRepliesToComment: Bool
    var notifySolved: Bool
    var notifyFollowed: Bool
    var notifyDigest: Bool
    var quietHours: Bool
    var memberships: [MembershipDTO]
    var profiles: [ProfileDTO]
    var votes: [VoteDTO]
    var bookmarks: [BookmarkDTO]
    var notifications: [NoteDTO]

    init(_ member: Member) {
        id = member.id
        username = member.username
        locale = member.locale
        reputation = member.reputation
        role = member.role
        isCurrentUser = member.isCurrentUser
        isSample = member.isSample
        appleUserID = member.appleUserID
        email = member.email
        completedSpaceIDs = member.completedSpaceIDs
        createdAt = member.createdAt
        notifyRepliesToPost = member.notifyRepliesToPost
        notifyRepliesToComment = member.notifyRepliesToComment
        notifySolved = member.notifySolved
        notifyFollowed = member.notifyFollowed
        notifyDigest = member.notifyDigest
        quietHours = member.quietHours
        memberships = member.memberships.map { MembershipDTO(id: $0.id, spaceID: $0.spaceID) }
        profiles = member.profiles.map(ProfileDTO.init)
        votes = member.votes.map { VoteDTO(id: $0.id, targetID: $0.targetID, targetType: $0.targetType) }
        bookmarks = member.bookmarks.map { BookmarkDTO(id: $0.id, postID: $0.postID, createdAt: $0.createdAt) }
        notifications = member.notifications.map(NoteDTO.init)
    }

    func make() -> Member {
        let member = Member(
            id: id, username: username, locale: locale, reputation: reputation, role: role,
            isCurrentUser: isCurrentUser, isSample: isSample, appleUserID: appleUserID, email: email,
            completedSpaceIDs: completedSpaceIDs, createdAt: createdAt,
            notifyRepliesToPost: notifyRepliesToPost, notifyRepliesToComment: notifyRepliesToComment,
            notifySolved: notifySolved, notifyFollowed: notifyFollowed, notifyDigest: notifyDigest, quietHours: quietHours
        )
        member.memberships = memberships.map { dto in
            let item = Membership(id: dto.id, spaceID: dto.spaceID, member: member)
            return item
        }
        member.profiles = profiles.map { $0.make(member: member) }
        member.votes = votes.map { Vote(id: $0.id, targetID: $0.targetID, targetType: $0.targetType, voter: member) }
        member.bookmarks = bookmarks.map { Bookmark(id: $0.id, postID: $0.postID, createdAt: $0.createdAt, member: member) }
        member.notifications = notifications.map { $0.make(member: member) }
        return member
    }
}

private struct MembershipDTO: Codable { var id: UUID; var spaceID: String }
private struct VoteDTO: Codable { var id: UUID; var targetID: UUID; var targetType: String }
private struct BookmarkDTO: Codable { var id: UUID; var postID: UUID; var createdAt: Date }

private struct ProfileDTO: Codable {
    var id: UUID
    var spaceID: String
    var formCode: String
    var basedOn: String
    var filedMonth: Date
    var officeID: String
    var filingMethod: String
    var currentStage: String
    var stageDatesData: Data
    var isSample: Bool

    init(_ profile: CaseProfile) {
        id = profile.id
        spaceID = profile.spaceID
        formCode = profile.formCode
        basedOn = profile.basedOn
        filedMonth = profile.filedMonth
        officeID = profile.officeID
        filingMethod = profile.filingMethod
        currentStage = profile.currentStage
        stageDatesData = profile.stageDatesData
        isSample = profile.isSample
    }

    func make(member: Member) -> CaseProfile {
        let profile = CaseProfile(
            id: id, spaceID: spaceID, formCode: formCode, basedOn: basedOn, filedMonth: filedMonth,
            officeID: officeID, filingMethod: filingMethod, currentStage: currentStage, isSample: isSample, member: member
        )
        profile.stageDatesData = stageDatesData
        return profile
    }
}

private struct NoteDTO: Codable {
    var id: UUID
    var kind: String
    var title: String
    var bodyText: String
    var postID: UUID?
    var createdAt: Date
    var isRead: Bool

    init(_ note: AppNotification) {
        id = note.id
        kind = note.kind
        title = note.title
        bodyText = note.bodyText
        postID = note.postID
        createdAt = note.createdAt
        isRead = note.isRead
    }

    func make(member: Member) -> AppNotification {
        AppNotification(id: id, kind: kind, title: title, bodyText: bodyText, postID: postID, createdAt: createdAt, isRead: isRead, member: member)
    }
}

private struct PostDTO: Codable {
    var id: UUID
    var authorID: UUID?
    var spaceIDs: [String]
    var type: String
    var title: String
    var bodyText: String
    var stage: String
    var officeID: String
    var formCode: String
    var filedMonth: Date?
    var status: String
    var heldReason: String
    var isFAQ: Bool
    var createdAt: Date
    var editedAt: Date?
    var helpfulCommentID: UUID?
    var upvoteCount: Int
    var comments: [CommentDTO]
    var images: [ImageDTO]

    init(_ post: Post) {
        id = post.id
        authorID = post.author?.id
        spaceIDs = post.spaceIDs
        type = post.type
        title = post.title
        bodyText = post.bodyText
        stage = post.stage
        officeID = post.officeID
        formCode = post.formCode
        filedMonth = post.filedMonth
        status = post.status
        heldReason = post.heldReason
        isFAQ = post.isFAQ
        createdAt = post.createdAt
        editedAt = post.editedAt
        helpfulCommentID = post.helpfulCommentID
        upvoteCount = post.upvoteCount
        comments = post.comments.map(CommentDTO.init)
        images = post.images.map { ImageDTO(id: $0.id, data: $0.data, sortIndex: $0.sortIndex) }
    }

    func make(members: [UUID: Member]) -> Post {
        let post = Post(
            id: id, spaceIDs: spaceIDs, type: type, title: title, bodyText: bodyText, stage: stage,
            officeID: officeID, formCode: formCode, filedMonth: filedMonth, status: status, heldReason: heldReason,
            isFAQ: isFAQ, createdAt: createdAt, editedAt: editedAt, helpfulCommentID: helpfulCommentID,
            upvoteCount: upvoteCount, author: authorID.flatMap { members[$0] }
        )
        post.comments = comments.map { $0.make(post: post, members: members) }
        post.images = images.map { dto in
            PostImage(id: dto.id, data: dto.data, sortIndex: dto.sortIndex, post: post)
        }
        return post
    }
}

private struct CommentDTO: Codable {
    var id: UUID
    var authorID: UUID?
    var bodyText: String
    var createdAt: Date
    var status: String
    var parentID: UUID?
    var upvoteCount: Int

    init(_ comment: Comment) {
        id = comment.id
        authorID = comment.author?.id
        bodyText = comment.bodyText
        createdAt = comment.createdAt
        status = comment.status
        parentID = comment.parentID
        upvoteCount = comment.upvoteCount
    }

    func make(post: Post, members: [UUID: Member]) -> Comment {
        Comment(
            id: id, bodyText: bodyText, createdAt: createdAt, status: status, parentID: parentID,
            upvoteCount: upvoteCount, post: post, author: authorID.flatMap { members[$0] }
        )
    }
}

private struct ImageDTO: Codable { var id: UUID; var data: Data; var sortIndex: Int }

private struct ReportDTO: Codable {
    var id: UUID
    var reporterID: UUID
    var targetType: String
    var targetID: UUID
    var reason: String
    var state: String
    var createdAt: Date

    init(_ item: ReportItem) {
        id = item.id
        reporterID = item.reporterID
        targetType = item.targetType
        targetID = item.targetID
        reason = item.reason
        state = item.state
        createdAt = item.createdAt
    }

    func make() -> ReportItem {
        ReportItem(id: id, reporterID: reporterID, targetType: targetType, targetID: targetID, reason: reason, state: state, createdAt: createdAt)
    }
}

private struct BlockDTO: Codable {
    var id: UUID
    var blockerID: UUID
    var blockedID: UUID
    var createdAt: Date

    init(_ block: UserBlock) {
        id = block.id
        blockerID = block.blockerID
        blockedID = block.blockedID
        createdAt = block.createdAt
    }

    func make() -> UserBlock {
        UserBlock(id: id, blockerID: blockerID, blockedID: blockedID, createdAt: createdAt)
    }
}
