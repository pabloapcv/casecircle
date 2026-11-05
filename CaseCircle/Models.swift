import Foundation
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum StageDateStore {
    static func encode(_ dates: [String: Date]) -> Data {
        let payload = dates.mapValues { $0.timeIntervalSince1970 }
        return (try? JSONEncoder().encode(payload)) ?? Data()
    }

    static func decode(_ data: Data) -> [String: Date] {
        guard let payload = try? JSONDecoder().decode([String: Double].self, from: data) else { return [:] }
        return payload.mapValues { Date(timeIntervalSince1970: $0) }
    }
}

final class Member: Identifiable {
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
    var memberships: [Membership] = []
    var profiles: [CaseProfile] = []
    var posts: [Post] = []
    var comments: [Comment] = []
    var votes: [Vote] = []
    var bookmarks: [Bookmark] = []
    var notifications: [AppNotification] = []

    init(
        id: UUID = UUID(),
        username: String,
        locale: String = "en",
        reputation: Int = 0,
        role: String = "member",
        isCurrentUser: Bool = false,
        isSample: Bool = false,
        appleUserID: String = "",
        email: String = "",
        completedSpaceIDs: [String] = [],
        createdAt: Date = .now,
        notifyRepliesToPost: Bool = true,
        notifyRepliesToComment: Bool = true,
        notifySolved: Bool = true,
        notifyFollowed: Bool = true,
        notifyDigest: Bool = false,
        quietHours: Bool = true
    ) {
        self.id = id
        self.username = username
        self.locale = locale
        self.reputation = reputation
        self.role = role
        self.isCurrentUser = isCurrentUser
        self.isSample = isSample
        self.appleUserID = appleUserID
        self.email = email
        self.completedSpaceIDs = completedSpaceIDs
        self.createdAt = createdAt
        self.notifyRepliesToPost = notifyRepliesToPost
        self.notifyRepliesToComment = notifyRepliesToComment
        self.notifySolved = notifySolved
        self.notifyFollowed = notifyFollowed
        self.notifyDigest = notifyDigest
        self.quietHours = quietHours
    }
}

final class Membership: Identifiable {
    var id: UUID
    var spaceID: String
    weak var member: Member?

    init(id: UUID = UUID(), spaceID: String, member: Member? = nil) {
        self.id = id
        self.spaceID = spaceID
        self.member = member
    }
}

final class CaseProfile: Identifiable {
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
    weak var member: Member?

    init(
        id: UUID = UUID(),
        spaceID: String,
        formCode: String,
        basedOn: String = "other",
        filedMonth: Date,
        officeID: String,
        filingMethod: String = "online",
        currentStage: String,
        stageDates: [String: Date] = [:],
        isSample: Bool = false,
        member: Member? = nil
    ) {
        self.id = id
        self.spaceID = spaceID
        self.formCode = formCode
        self.basedOn = basedOn
        self.filedMonth = filedMonth
        self.officeID = officeID
        self.filingMethod = filingMethod
        self.currentStage = currentStage
        self.stageDatesData = StageDateStore.encode(stageDates)
        self.isSample = isSample
        self.member = member
    }

    var stageDates: [String: Date] {
        get { StageDateStore.decode(stageDatesData) }
        set { stageDatesData = StageDateStore.encode(newValue) }
    }

    func snapshot() -> ProfileSnapshot {
        ProfileSnapshot(spaceId: spaceID, officeId: officeID, isSample: isSample, stageDates: stageDates)
    }
}

final class Post: Identifiable {
    var id: UUID
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
    weak var author: Member?
    var comments: [Comment] = []
    var images: [PostImage] = []

    init(
        id: UUID = UUID(),
        spaceIDs: [String],
        type: String,
        title: String,
        bodyText: String,
        stage: String = "",
        officeID: String = "",
        formCode: String = "",
        filedMonth: Date? = nil,
        status: String = "live",
        heldReason: String = "",
        isFAQ: Bool = false,
        createdAt: Date = .now,
        editedAt: Date? = nil,
        helpfulCommentID: UUID? = nil,
        upvoteCount: Int = 0,
        author: Member? = nil
    ) {
        self.id = id
        self.spaceIDs = spaceIDs
        self.type = type
        self.title = title
        self.bodyText = bodyText
        self.stage = stage
        self.officeID = officeID
        self.formCode = formCode
        self.filedMonth = filedMonth
        self.status = status
        self.heldReason = heldReason
        self.isFAQ = isFAQ
        self.createdAt = createdAt
        self.editedAt = editedAt
        self.helpfulCommentID = helpfulCommentID
        self.upvoteCount = upvoteCount
        self.author = author
    }

    var liveComments: [Comment] { comments.filter { $0.status == "live" } }
}

final class Comment: Identifiable {
    var id: UUID
    var bodyText: String
    var createdAt: Date
    var status: String
    var parentID: UUID?
    var upvoteCount: Int
    weak var post: Post?
    weak var author: Member?

    init(
        id: UUID = UUID(),
        bodyText: String,
        createdAt: Date = .now,
        status: String = "live",
        parentID: UUID? = nil,
        upvoteCount: Int = 0,
        post: Post? = nil,
        author: Member? = nil
    ) {
        self.id = id
        self.bodyText = bodyText
        self.createdAt = createdAt
        self.status = status
        self.parentID = parentID
        self.upvoteCount = upvoteCount
        self.post = post
        self.author = author
    }
}

final class PostImage: Identifiable {
    var id: UUID
    var data: Data
    var sortIndex: Int
    weak var post: Post?

    init(id: UUID = UUID(), data: Data, sortIndex: Int, post: Post? = nil) {
        self.id = id
        self.data = data
        self.sortIndex = sortIndex
        self.post = post
    }
}

final class Vote: Identifiable {
    var id: UUID
    var targetID: UUID
    var targetType: String
    weak var voter: Member?

    init(id: UUID = UUID(), targetID: UUID, targetType: String, voter: Member? = nil) {
        self.id = id
        self.targetID = targetID
        self.targetType = targetType
        self.voter = voter
    }
}

final class Bookmark: Identifiable {
    var id: UUID
    var postID: UUID
    var createdAt: Date
    weak var member: Member?

    init(id: UUID = UUID(), postID: UUID, createdAt: Date = .now, member: Member? = nil) {
        self.id = id
        self.postID = postID
        self.createdAt = createdAt
        self.member = member
    }
}

final class ReportItem: Identifiable {
    var id: UUID
    var reporterID: UUID
    var targetType: String
    var targetID: UUID
    var reason: String
    var state: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        reporterID: UUID,
        targetType: String,
        targetID: UUID,
        reason: String,
        state: String = "open",
        createdAt: Date = .now
    ) {
        self.id = id
        self.reporterID = reporterID
        self.targetType = targetType
        self.targetID = targetID
        self.reason = reason
        self.state = state
        self.createdAt = createdAt
    }
}

final class UserBlock: Identifiable {
    var id: UUID
    var blockerID: UUID
    var blockedID: UUID
    var createdAt: Date

    init(id: UUID = UUID(), blockerID: UUID, blockedID: UUID, createdAt: Date = .now) {
        self.id = id
        self.blockerID = blockerID
        self.blockedID = blockedID
        self.createdAt = createdAt
    }
}

final class AppNotification: Identifiable {
    var id: UUID
    var kind: String
    var title: String
    var bodyText: String
    var postID: UUID?
    var createdAt: Date
    var isRead: Bool
    weak var member: Member?

    init(
        id: UUID = UUID(),
        kind: String,
        title: String,
        bodyText: String,
        postID: UUID? = nil,
        createdAt: Date = .now,
        isRead: Bool = false,
        member: Member? = nil
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.bodyText = bodyText
        self.postID = postID
        self.createdAt = createdAt
        self.isRead = isRead
        self.member = member
    }
}
