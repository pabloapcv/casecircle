import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct ProfileView: View {
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }
    private var posts: [Post] { context.posts }
    @State private var confirmDelete = false

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let me {
                    VStack(alignment: .leading, spacing: 16) {
                        header(me)
                        if me.username == "app_review" {
                            NavigationLink { ModQueueView() } label: {
                                noteCard(L10n.s(.reviewerNotesTitle, lang), L10n.s(.reviewerNotesBody, lang))
                            }
                            .buttonStyle(.plain)
                        }
                        sectionTitle(L10n.s(.caseProfiles, lang))
                        if me.profiles.isEmpty {
                            Text(L10n.s(.noCaseYet, lang)).font(.subheadline).foregroundStyle(Theme.secondary)
                        }
                        ForEach(me.profiles, id: \.id) { profile in
                            NavigationLink {
                                ProfileEditorScreen(existing: profile)
                            } label: {
                                Text(BadgeText.make(form: profile.formCode, officeID: profile.officeID, filed: profile.filedMonth, stage: profile.currentStage, lang: lang))
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Theme.ink)
                                    .cardStyle()
                            }
                            .buttonStyle(.plain)
                        }
                        NavigationLink {
                            ProfileEditorScreen(existing: nil, preferredSpaceID: me.memberships.first?.spaceID)
                        } label: {
                            Text(L10n.s(.addCaseProfile, lang)).font(.subheadline.weight(.semibold))
                        }
                        sectionTitle(L10n.s(.yourPosts, lang))
                        postLinks(posts.filter { $0.author?.id == me.id })
                        sectionTitle(L10n.s(.bookmarksTitle, lang))
                        let saved = posts.filter { post in me.bookmarks.contains { $0.postID == post.id } }
                        if saved.isEmpty {
                            Text(L10n.s(.noBookmarks, lang)).font(.subheadline).foregroundStyle(Theme.secondary)
                        } else {
                            postLinks(saved)
                        }
                        sectionTitle(L10n.s(.joinedSpaces, lang))
                        ForEach(me.memberships, id: \.id) { membership in
                            if let space = Taxonomy.space(membership.spaceID) {
                                NavigationLink {
                                    SpaceDetailView(spaceID: space.id)
                                } label: {
                                    Text(space.name(lang)).frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        sectionTitle(L10n.s(.settings, lang))
                        NavigationLink(L10n.s(.notifications, lang)) { NotificationsView() }
                        languageRow
                        NavigationLink(L10n.s(.rulesSetting, lang)) { TextPage(title: L10n.s(.rulesTitle, lang), bodyText: L10n.s(.rulesBody, lang)) }
                        NavigationLink(L10n.s(.privacySetting, lang)) { TextPage(title: L10n.s(.privacyTitle, lang), bodyText: L10n.s(.privacyBody, lang)) }
                        NavigationLink(L10n.s(.contactSetting, lang)) { ContactScreen() }
                        NavigationLink(L10n.s(.blockedSetting, lang)) { BlockedScreen() }
                        NavigationLink(L10n.s(.aboutSetting, lang)) { AboutScreen() }
                        if me.role == "mod" {
                            NavigationLink(L10n.s(.modQueue, lang)) { ModQueueView() }
                        }
                        Text(me.appleUserID.isEmpty ? (me.email.isEmpty ? "" : L10n.s(.signedInEmail, lang)) : L10n.s(.signedInApple, lang))
                            .font(.footnote)
                            .foregroundStyle(Theme.secondary)
                        if !me.email.isEmpty {
                            Text(me.email).font(.footnote)
                            Text(L10n.s(.emailPrivate, lang)).font(.caption).foregroundStyle(Theme.secondary)
                        }
                        Text(L10n.s(.verifiedFootnote, lang)).font(.caption).foregroundStyle(Theme.secondary)
                        Button(L10n.s(.deleteAccount, lang), role: .destructive) { confirmDelete = true }
                            .frame(minHeight: 44)
                    }
                    .padding(16)
                }
            }
            .background(Theme.paper)
            .navigationTitle(L10n.s(.tabYou, lang))
            .confirmationDialog(L10n.s(.deleteAccount, lang), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(L10n.s(.deleteAccountConfirm, lang), role: .destructive) {
                    if let me {
                        try? CommunityActions.deleteAccount(me, database: context)
                        model.toast = L10n.s(.accountDeleted, lang)
                    }
                }
                Button(L10n.s(.cancel, lang), role: .cancel) {}
            } message: {
                Text(L10n.s(.deleteAccountBody, lang))
            }
        }
    }

    private func header(_ me: Member) -> some View {
        HStack(spacing: 12) {
            MarkView(size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(me.username).font(.title3.weight(.semibold))
                Text(L10n.level(for: me.reputation, lang))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.teal)
                Text("\(L10n.s(.reputationLabel, lang)) \(me.reputation)")
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title).font(.headline).padding(.top, 6)
    }

    private func postLinks(_ items: [Post]) -> some View {
        ForEach(items.sorted { $0.createdAt > $1.createdAt }, id: \.id) { post in
            NavigationLink {
                PostDetailView(postID: post.id)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(post.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                    if post.status != "live" {
                        Text(post.status == "held" ? L10n.s(.statusHeld, lang) : L10n.s(.statusRemoved, lang))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.coral)
                    }
                }
                .cardStyle()
            }
            .buttonStyle(.plain)
        }
    }

    private func noteCard(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline).foregroundStyle(Theme.ink)
            Text(body).font(.footnote).foregroundStyle(Theme.secondary).lineLimit(4)
        }
        .cardStyle()
    }

    private var languageRow: some View {
        HStack {
            Text(L10n.s(.languageSetting, lang))
            Spacer()
            Button(L10n.s(.english, lang)) { setLanguage("en") }
                .fontWeight(model.language == "en" ? .bold : .regular)
            Button(L10n.s(.spanish, lang)) { setLanguage("es") }
                .fontWeight(model.language == "es" ? .bold : .regular)
        }
        .frame(minHeight: 44)
    }

    private func setLanguage(_ code: String) {
        model.language = code
        if let me { me.locale = code; context.save() }
    }
}

struct NotificationsView: View {
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        List {
            if let me {
                if me.notifyDigest {
                    Section(L10n.s(.digestHeader, lang)) {
                        let recent = weekCount(me)
                        Text(recent == 0 ? L10n.s(.digestEmpty, lang) : L10n.s(.newPostsCount, lang, recent))
                    }
                }
                if me.quietHours && NotificationService.isQuiet() {
                    Text(L10n.s(.quietPaused, lang)).font(.footnote)
                }
                Section {
                    ForEach(me.notifications.sorted { $0.createdAt > $1.createdAt }, id: \.id) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.title).font(.subheadline.weight(.semibold))
                            Text(note.bodyText).font(.footnote).foregroundStyle(Theme.secondary)
                            Text(Formatters.relative(note.createdAt, lang)).font(.caption2).foregroundStyle(Theme.secondary)
                        }
                        .opacity(note.isRead ? 0.6 : 1)
                    }
                }
                Section(L10n.s(.notifications, lang)) {
                    toggle(L10n.s(.notifyRepliesPost, lang), me.notifyRepliesToPost) { me.notifyRepliesToPost = $0 }
                    toggle(L10n.s(.notifyRepliesComment, lang), me.notifyRepliesToComment) { me.notifyRepliesToComment = $0 }
                    toggle(L10n.s(.notifySolved, lang), me.notifySolved) { me.notifySolved = $0 }
                    toggle(L10n.s(.notifyFollowed, lang), me.notifyFollowed) { me.notifyFollowed = $0 }
                    Toggle(L10n.s(.notifyDigest, lang), isOn: digestBinding(me))
                    Toggle(L10n.s(.quietHours, lang), isOn: quietBinding(me))
                    Text(L10n.s(.quietHoursDetail, lang)).font(.caption).foregroundStyle(Theme.secondary)
                }
                Button(L10n.s(.markAllRead, lang)) {
                    me.notifications.forEach { $0.isRead = true }
                    context.save()
                }
            }
        }
        .navigationTitle(L10n.s(.notifications, lang))
        .navInline()
        .onAppear {
            me?.notifications.forEach { $0.isRead = true }
            context.save()
        }
    }

    private func weekCount(_ me: Member) -> Int {
        let joined = Set(me.memberships.map(\.spaceID))
        let cutoff = Date().addingTimeInterval(-7 * 86_400)
        return posts.filter { $0.status == "live" && $0.createdAt >= cutoff && !joined.isDisjoint(with: Set($0.spaceIDs)) }.count
    }

    private func toggle(_ title: String, _ value: Bool, set: @escaping (Bool) -> Void) -> some View {
        Toggle(title, isOn: Binding(get: { value }, set: { newValue in
            set(newValue)
            context.save()
        }))
    }

    private func digestBinding(_ me: Member) -> Binding<Bool> {
        Binding(get: { me.notifyDigest }, set: { newValue in
            me.notifyDigest = newValue
            context.save()
            if newValue {
                Task {
                    if await NotificationService.requestAccess() {
                        NotificationService.scheduleDigest(language: lang)
                    }
                }
            } else {
                NotificationService.cancelDigest()
            }
        })
    }

    private func quietBinding(_ me: Member) -> Binding<Bool> {
        Binding(get: { me.quietHours }, set: { me.quietHours = $0; context.save() })
    }
}

struct TextPage: View {
    var title: String
    var bodyText: String

    var body: some View {
        ScrollView {
            Text(bodyText)
                .font(.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .textSelection(.enabled)
        }
        .background(Theme.paper)
        .navigationTitle(title)
        .navInline()
    }
}

struct ContactScreen: View {
    @Environment(\.appLanguage) private var lang

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.s(.contactBody, lang))
            Link(Links.supportEmail, destination: Links.supportMail)
                .font(.headline)
            Text(L10n.s(.feedDisclaimer, lang))
                .font(.footnote)
                .foregroundStyle(Theme.secondary)
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.paper)
        .navigationTitle(L10n.s(.contactTitle, lang))
        .navInline()
    }
}

struct AboutScreen: View {
    @Environment(\.appLanguage) private var lang

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.s(.versionLabel, lang, Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"))
                    .font(.subheadline.weight(.semibold))
                Text(L10n.s(.aboutBody, lang))
                Text(L10n.s(.verifiedFootnote, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            }
            .padding(20)
        }
        .background(Theme.paper)
        .navigationTitle(L10n.s(.aboutTitle, lang))
        .navInline()
    }
}

struct BlockedScreen: View {
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }
    private var blocks: [UserBlock] { context.blocks }

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        List {
            let mine = blocks.filter { $0.blockerID == me?.id }
            if mine.isEmpty {
                Text(L10n.s(.noBlocked, lang)).foregroundStyle(Theme.secondary)
            }
            ForEach(mine, id: \.id) { block in
                HStack {
                    Text(members.first { $0.id == block.blockedID }?.username ?? L10n.s(.deletedMember, lang))
                    Spacer()
                    Button(L10n.s(.unblock, lang)) {
                        if let me { try? CommunityActions.unblock(block.blockedID, blocker: me, database: context) }
                    }
                }
            }
        }
        .navigationTitle(L10n.s(.blockedSetting, lang))
        .navInline()
    }
}

struct ModQueueView: View {
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var reports: [ReportItem] { context.reports }
    private var members: [Member] { context.members }

    private var queued: [Post] {
        let open = Set(reports.filter { $0.state == "open" }.map(\.targetID))
        return posts.filter { $0.status == "held" || $0.status == "removed" || open.contains($0.id) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        List {
            if members.first(where: { $0.isCurrentUser })?.username == "app_review" {
                Section(L10n.s(.reviewerNotesTitle, lang)) {
                    Text(L10n.s(.reviewerNotesBody, lang)).font(.footnote)
                }
            }
            if queued.isEmpty {
                Text(L10n.s(.modEmpty, lang))
            }
            ForEach(queued, id: \.id) { post in
                VStack(alignment: .leading, spacing: 8) {
                    Text(post.title).font(.headline)
                    Text(post.bodyText).font(.footnote).lineLimit(3).foregroundStyle(Theme.secondary)
                    Text(statusLine(post)).font(.caption.weight(.semibold))
                    HStack {
                        Button(L10n.s(.restore, lang)) { try? CommunityActions.restore(post: post, database: context) }
                        Button(L10n.s(.removeContent, lang), role: .destructive) {
                            try? CommunityActions.remove(post: post, database: context)
                        }
                        Button(L10n.s(.dismissReport, lang)) {
                            try? CommunityActions.dismissReports(for: post.id, database: context)
                        }
                    }
                    .font(.caption.weight(.semibold))
                    NavigationLink(L10n.s(.openPost, lang)) { PostDetailView(postID: post.id) }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle(L10n.s(.modQueue, lang))
        .navInline()
    }

    private func statusLine(_ post: Post) -> String {
        let count = reports.filter { $0.targetID == post.id && $0.state == "open" }.count
        let status = post.status == "held" ? L10n.s(.statusHeld, lang) : (post.status == "removed" ? L10n.s(.statusRemoved, lang) : L10n.s(.statusLive, lang))
        return "\(status) · \(L10n.s(.reportCount, lang, count))"
    }
}
