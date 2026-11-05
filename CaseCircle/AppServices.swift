import Foundation
import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum AppTab: Hashable {
    case home, spaces, ask, timelines, you
}

@Observable
final class AppModel {
    var language: String {
        didSet { UserDefaults.standard.set(language, forKey: Self.languageKey) }
    }
    var selectedTab: AppTab = .home
    var askSpaceID: String?
    var pendingPostID: UUID?
    var toast: String?
    var screenEpoch = 0

    static let languageKey = "casecircle.language"
    static let sampleNoteKey = "casecircle.sampleNoteDismissed"

    init() {
        if CommandLine.arguments.contains("-demo") {
            language = "en"
        } else if let saved = UserDefaults.standard.string(forKey: Self.languageKey), saved == "en" || saved == "es" {
            language = saved
        } else {
            let code = Locale.current.language.languageCode?.identifier ?? "en"
            language = code.hasPrefix("es") ? "es" : "en"
        }
    }
}

private struct AppLanguageKey: EnvironmentKey {
    static let defaultValue = "en"
}

extension EnvironmentValues {
    var appLanguage: String {
        get { self[AppLanguageKey.self] }
        set { self[AppLanguageKey.self] = newValue }
    }
}

enum FeedSort: String, CaseIterable, Identifiable {
    case new, top, unanswered
    var id: String { rawValue }
}

enum FeedQuery {
    static func blockedIDs(for userID: UUID, blocks: [UserBlock]) -> Set<UUID> {
        var ids = Set<UUID>()
        for block in blocks {
            if block.blockerID == userID { ids.insert(block.blockedID) }
            if block.blockedID == userID { ids.insert(block.blockerID) }
        }
        return ids
    }

    static func posts(
        from posts: [Post],
        joined: Set<String>,
        blocked: Set<UUID>,
        sort: FeedSort,
        kind: String?,
        stage: String?,
        officeID: String?,
        spaceID: String? = nil,
        faqOnly: Bool = false,
        pinFAQ: Bool = false
    ) -> [Post] {
        let weekAgo = Date().addingTimeInterval(-7 * 86_400)
        let filtered = posts.filter { post in
            guard post.status == "live" else { return false }
            if let authorID = post.author?.id, blocked.contains(authorID) { return false }
            if faqOnly && !post.isFAQ { return false }
            if let spaceID {
                guard post.spaceIDs.contains(spaceID) else { return false }
            } else if joined.isDisjoint(with: Set(post.spaceIDs)) {
                return false
            }
            if let kind, post.type != kind { return false }
            if let stage, !stage.isEmpty, post.stage != stage { return false }
            if let officeID, !officeID.isEmpty, post.officeID != officeID { return false }
            if sort == .top, post.createdAt < weekAgo { return false }
            if sort == .unanswered {
                if post.type != PostKind.question.rawValue { return false }
                if post.helpfulCommentID != nil { return false }
                if post.comments.contains(where: { $0.status == "live" }) { return false }
            }
            return true
        }
        return filtered.sorted { lhs, rhs in
            if pinFAQ, lhs.isFAQ != rhs.isFAQ { return lhs.isFAQ && !rhs.isFAQ }
            switch sort {
            case .top:
                if lhs.upvoteCount != rhs.upvoteCount { return lhs.upvoteCount > rhs.upvoteCount }
                return lhs.createdAt > rhs.createdAt
            case .new, .unanswered:
                return lhs.createdAt > rhs.createdAt
            }
        }
    }

    static func search(
        _ posts: [Post],
        query: String,
        spaceID: String?,
        kind: String?,
        blocked: Set<UUID>
    ) -> [Post] {
        let foldedQuery = fold(query)
        guard !foldedQuery.isEmpty else { return [] }
        return posts.filter { post in
            guard post.status == "live" else { return false }
            if let authorID = post.author?.id, blocked.contains(authorID) { return false }
            if let spaceID, !post.spaceIDs.contains(spaceID) { return false }
            if let kind, post.type != kind { return false }
            return fold(post.title + " " + post.bodyText).contains(foldedQuery)
        }
        .sorted { $0.createdAt > $1.createdAt }
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum Formatters {
    static func month(_ date: Date, _ lang: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: lang == "es" ? "es" : "en")
        formatter.setLocalizedDateFormatFromTemplate("MMMy")
        return formatter.string(from: date)
    }

    static func relative(_ date: Date, _ lang: String) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: lang == "es" ? "es" : "en")
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: .now)
    }

    static func wait(since date: Date, _ lang: String) -> String {
        let months = Calendar.current.dateComponents([.month], from: date, to: .now).month ?? 0
        if months <= 0 {
            let days = Calendar.current.dateComponents([.day], from: date, to: .now).day ?? 0
            return L10n.s(.aboutDays, lang, max(days, 0))
        }
        if months == 1 { return L10n.s(.oneMonth, lang) }
        return L10n.s(.aboutMonths, lang, months)
    }

    static func monthStart(_ date: Date) -> Date {
        let parts = Calendar.current.dateComponents([.year, .month], from: date)
        return Calendar.current.date(from: parts) ?? date
    }
}

enum BadgeText {
    static func make(form: String, officeID: String, filed: Date?, stage: String, lang: String) -> String {
        var parts: [String] = []
        if !form.isEmpty { parts.append(form) }
        if let office = Taxonomy.office(officeID), !office.code.isEmpty {
            parts.append(office.code)
        }
        if let filed {
            parts.append(L10n.s(.filedShort, lang, Formatters.month(filed, lang)))
        }
        if !stage.isEmpty {
            parts.append(L10n.stage(stage, lang))
        }
        return parts.joined(separator: " · ")
    }
}

struct ProfileDraft: Equatable {
    var spaceID: String
    var formCode: String
    var basedOn: String
    var filedMonth: Date
    var officeID: String
    var filingMethod: String
    var currentStage: String
    var stageDates: [String: Date]
    var completed: Bool

    static func fresh(spaceID: String) -> ProfileDraft {
        let form = Taxonomy.space(spaceID)?.primaryForm ?? ""
        return ProfileDraft(
            spaceID: spaceID,
            formCode: form,
            basedOn: BasedOn.marriage.rawValue,
            filedMonth: Formatters.monthStart(.now),
            officeID: "unsure",
            filingMethod: FilingMethod.online.rawValue,
            currentStage: "",
            stageDates: [:],
            completed: false
        )
    }
}

struct NewPostDraft {
    var spaceIDs: [String]
    var type: String
    var title: String
    var body: String
    var stage: String
    var officeID: String
    var formCode: String
    var filedMonth: Date?
    var images: [Data]
}

enum ActionError: Error {
    case blocked(SafetyBlock)
    case tooShort
    case editExpired
    case alreadyReported
    case notAllowed
    case rateLimited
}

enum RateLimit {
    static let post: TimeInterval = 30
    static let comment: TimeInterval = 8
    static let vote: TimeInterval = 0.8
}
