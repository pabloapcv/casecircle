import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct MarkView: View {
    var size: CGFloat = 36

    var body: some View {
        ZStack {
            Circle().fill(Theme.teal)
            Circle()
                .stroke(Theme.paper, lineWidth: size * 0.07)
                .padding(size * 0.22)
            Circle()
                .fill(Theme.amber)
                .frame(width: size * 0.22, height: size * 0.22)
                .offset(x: size * 0.16, y: size * 0.1)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct PrimaryButton: View {
    var title: String
    var enabled: Bool = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body.weight(.semibold))
                .foregroundStyle(enabled ? Color.white : Theme.secondary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 52)
                .background(enabled ? Theme.teal : Theme.line)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(PressButtonStyle())
        .disabled(!enabled)
    }
}

struct SecondaryButton: View {
    var title: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.teal)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 48)
                .background(Theme.tealSoft)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(PressButtonStyle())
    }
}

struct PressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}

struct DisclaimerBanner: View {
    @Environment(\.appLanguage) private var lang

    var body: some View {
        Text(L10n.s(.feedDisclaimer, lang))
            .font(.footnote)
            .foregroundStyle(Theme.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.tealSoft)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityAddTraits(.isStaticText)
    }
}

struct EmptyState: View {
    var title: String
    var message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MarkView(size: 28)
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(Theme.secondary)
        }
        .cardStyle()
        .accessibilityElement(children: .combine)
    }
}

struct Pill: View {
    var text: String
    var tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.14))
            .clipShape(Capsule())
    }
}

struct PostCard: View {
    var post: Post
    @Environment(\.appLanguage) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Pill(text: L10n.postKind(post.type, lang), tint: Theme.kind(post.type))
                if post.isFAQ { Pill(text: L10n.s(.pinned, lang), tint: Theme.secondary) }
                if post.author?.isSample == true { Pill(text: L10n.s(.sample, lang), tint: Theme.amber) }
                Spacer(minLength: 8)
                Text(Formatters.relative(post.createdAt, lang))
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
            Text(post.title)
                .font(.headline)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.leading)
            Text(post.bodyText)
                .font(.subheadline)
                .foregroundStyle(Theme.secondary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
            let badge = BadgeText.make(form: post.formCode, officeID: post.officeID, filed: post.filedMonth, stage: post.stage, lang: lang)
            if !badge.isEmpty {
                Text(badge)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.teal)
                    .multilineTextAlignment(.leading)
            }
            HStack(spacing: 14) {
                Label("\(post.upvoteCount)", systemImage: "arrow.up")
                Label(L10n.replies(post.liveComments.count, lang), systemImage: "text.bubble")
                if post.helpfulCommentID != nil {
                    Label(L10n.s(.solved, lang), systemImage: "checkmark.circle.fill")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.secondary)
            .labelStyle(.titleAndIcon)
        }
        .cardStyle()
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Theme.kind(post.type))
                .frame(width: 4)
                .padding(.vertical, 16)
                .padding(.leading, 1)
        }
        .accessibilityElement(children: .combine)
    }
}

struct AuthorLine: View {
    var member: Member?
    var spaceIDs: [String]
    @Environment(\.appLanguage) private var lang

    var body: some View {
        HStack(spacing: 6) {
            Text(member?.username ?? L10n.s(.deletedMember, lang))
                .font(.subheadline.weight(.semibold))
            if let badge {
                Pill(text: badge, tint: member?.role == "verified_pro" ? Theme.teal : Theme.secondary)
            }
            if member?.isSample == true {
                Pill(text: L10n.s(.sample, lang), tint: Theme.amber)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var badge: String? {
        guard let member else { return nil }
        if member.role == "verified_pro" { return L10n.s(.roleVerified, lang) }
        if member.role == "mod" { return L10n.s(.roleMod, lang) }
        if member.role == "helper" { return L10n.s(.roleHelper, lang) }
        if !Set(member.completedSpaceIDs).isDisjoint(with: spaceIDs) {
            return L10n.s(.finishedProcess, lang)
        }
        return nil
    }
}

struct SafetyNote: View {
    var text: String
    var held: Bool = false

    var body: some View {
        Label(text, systemImage: held ? "eye" : "exclamationmark.triangle")
            .font(.footnote.weight(.medium))
            .foregroundStyle(held ? Theme.ink : Theme.coral)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background((held ? Theme.amber : Theme.coral).opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct PhotoView: View {
    var data: Data

    var body: some View {
        Group {
            #if canImport(UIKit)
            if let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            }
            #elseif canImport(AppKit)
            if let image = NSImage(data: data) {
                Image(nsImage: image).resizable().scaledToFill()
            }
            #endif
        }
        .frame(width: 140, height: 140)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityLabel("Photo")
    }
}

struct OfficialTimesLink: View {
    @Environment(\.appLanguage) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Link(destination: Links.processingTimes) {
                Label(L10n.s(.officialTimes, lang), systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold))
            }
            Text(L10n.s(.officialNote, lang))
                .font(.caption)
                .foregroundStyle(Theme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct BenchmarkCard: View {
    var cell: BenchmarkCell
    var example: Bool
    @Environment(\.appLanguage) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(Taxonomy.office(cell.officeId)?.name(lang) ?? cell.officeId)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if example { Pill(text: L10n.s(.sample, lang), tint: Theme.amber) }
            }
            Text("\(L10n.stage(cell.fromStage, lang)) → \(L10n.stage(cell.toStage, lang))")
                .font(.body.weight(.medium))
            Text(L10n.s(.medianLabel, lang, cell.median))
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.teal)
            Text(L10n.s(.rangeLabel, lang, cell.p25, cell.p75))
                .font(.subheadline)
                .foregroundStyle(Theme.secondary)
            Text(L10n.people(cell.count, lang))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondary)
        }
        .cardStyle()
        .accessibilityElement(children: .combine)
    }
}

struct FieldHeader: View {
    var title: String
    var body: some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Theme.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
