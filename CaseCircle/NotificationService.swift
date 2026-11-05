import Foundation
import UserNotifications
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum NotificationService {
    static func isQuiet(_ date: Date = .now) -> Bool {
        let hour = Calendar.current.component(.hour, from: date)
        return hour >= 22 || hour < 8
    }

    static func requestAccess() async -> Bool {
        let center = UNUserNotificationCenter.current()
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func scheduleDigest(language: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["casecircle.digest"])
        let content = UNMutableNotificationContent()
        content.title = L10n.s(.digestHeader, language)
        content.body = L10n.s(.welcomeNoteBody, language)
        var date = DateComponents()
        date.weekday = 1
        date.hour = 9
        date.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
        let request = UNNotificationRequest(identifier: "casecircle.digest", content: content, trigger: trigger)
        center.add(request)
    }

    static func cancelDigest() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["casecircle.digest"])
    }

    @MainActor
    static func record(
        member: Member,
        kind: String,
        title: String,
        body: String,
        postID: UUID?,
        database: Database,
        push: Bool
    ) {
        guard allows(kind, member) else { return }
        let note = AppNotification(kind: kind, title: title, bodyText: body, postID: postID, member: member)
        database.add(note)
        if push, !(member.quietHours && isQuiet()) {
            pushNow(title: title, body: body)
        }
        database.save()
    }

    private static func allows(_ kind: String, _ member: Member) -> Bool {
        switch kind {
        case "reply_post": return member.notifyRepliesToPost
        case "reply_comment": return member.notifyRepliesToComment
        case "helpful": return member.notifySolved
        case "followed": return member.notifyFollowed
        case "digest": return member.notifyDigest
        default: return true
        }
    }

    private static func pushNow(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            )
            center.add(request)
        }
    }
}
