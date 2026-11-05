import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct HomeView: View {
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }
    private var blocks: [UserBlock] { context.blocks }
    @AppStorage(AppModel.sampleNoteKey) private var hideSampleNote = false

    @State private var sort = FeedSort.new
    @State private var kind: String?
    @State private var stage: String?
    @State private var officeID: String?
    @State private var openedPost: UUID?

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(L10n.s(.notAffiliated, lang))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.secondary)
                    if me?.profiles.isEmpty == true {
                        EmptyState(
                            title: L10n.s(.addFirstCase, lang),
                            message: L10n.s(.addFirstCaseBody, lang),
                            actionTitle: L10n.s(.addCaseCTA, lang),
                            action: { model.selectedTab = .timelines }
                        )
                    }
                    tools
                    sortPicker
                    filters
                    if !hideSampleNote {
                        sampleNote
                    }
                    if visible.isEmpty {
                        EmptyState(
                            title: emptyTitle,
                            message: emptyMessage,
                            actionTitle: L10n.s(.emptyFeedCTAAsk, lang),
                            action: { model.selectedTab = .ask }
                        )
                        Button(L10n.s(.emptyFeedCTAJoin, lang)) { model.selectedTab = .spaces }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                    } else {
                        ForEach(visible, id: \.id) { post in
                            NavigationLink {
                                PostDetailView(postID: post.id)
                            } label: {
                                PostCard(post: post)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text(L10n.s(.feedDisclaimer, lang))
                        .font(.caption)
                        .foregroundStyle(Theme.secondary)
                        .padding(.top, 8)
                }
                .padding(16)
            }
            .dismissKeyboardOnScroll()
            .background(Theme.paper)
            .navigationTitle(L10n.s(.tabHome, lang))
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    NavigationLink {
                        NotificationsView()
                    } label: {
                        Image(systemName: "bell")
                    }
                    .accessibilityLabel(L10n.s(.notifications, lang))
                }
                ToolbarItem(placement: .automatic) {
                    NavigationLink {
                        SearchView()
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .accessibilityLabel(L10n.s(.search, lang))
                }
            }
            .navigationDestination(item: $openedPost) { id in
                PostDetailView(postID: id)
            }
        }
        .onChange(of: model.pendingPostID) { _, id in
            guard let id else { return }
            openedPost = id
            model.pendingPostID = nil
        }
    }

    private var visible: [Post] {
        guard let me else { return [] }
        let joined = Set(me.memberships.map(\.spaceID))
        let blocked = FeedQuery.blockedIDs(for: me.id, blocks: blocks)
        return FeedQuery.posts(
            from: posts,
            joined: joined,
            blocked: blocked,
            sort: sort,
            kind: kind,
            stage: stage,
            officeID: officeID
        )
    }

    private var emptyTitle: String {
        if sort == .top { return L10n.s(.topEmpty, lang) }
        if sort == .unanswered { return L10n.s(.unansweredEmpty, lang) }
        return L10n.s(.emptyFeedTitle, lang)
    }

    private var emptyMessage: String {
        if sort == .new { return L10n.s(.emptyFeedBody, lang) }
        return L10n.s(.feedDisclaimer, lang)
    }

    private var sortPicker: some View {
        Picker(L10n.s(.sortNew, lang), selection: $sort) {
            Text(L10n.s(.sortNew, lang)).tag(FeedSort.new)
            Text(L10n.s(.sortTop, lang)).tag(FeedSort.top)
            Text(L10n.s(.sortUnanswered, lang)).tag(FeedSort.unanswered)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .accessibilityLabel(L10n.s(.sortNew, lang))
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip(L10n.s(.allTypes, lang), on: kind == nil) { kind = nil }
                    ForEach(PostKind.allCases) { item in
                        chip(L10n.postKind(item.rawValue, lang), on: kind == item.rawValue) {
                            kind = kind == item.rawValue ? nil : item.rawValue
                        }
                    }
                }
            }
            HStack {
                Menu {
                    Button(L10n.s(.allStages, lang)) { stage = nil }
                    ForEach(Stage.allCases) { item in
                        Button(L10n.stage(item.rawValue, lang)) { stage = item.rawValue }
                    }
                } label: {
                    filterLabel(stage.map { L10n.stage($0, lang) } ?? L10n.s(.allStages, lang))
                }
                Menu {
                    Button(L10n.s(.allOffices, lang)) { officeID = nil }
                    ForEach(Taxonomy.offices.filter { $0.type != .unsure }) { office in
                        Button(office.name(lang)) { officeID = office.id }
                    }
                } label: {
                    filterLabel(officeID.flatMap { Taxonomy.office($0)?.code } ?? L10n.s(.allOffices, lang))
                }
            }
        }
    }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(on ? Color.white : Theme.ink)
                .padding(.horizontal, 12)
                .frame(minHeight: 32)
                .background(on ? Theme.teal : Theme.card)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.line, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func filterLabel(_ title: String) -> some View {
        HStack(spacing: 4) {
            Text(title).font(.caption.weight(.semibold))
            Image(systemName: "chevron.down").font(.caption2)
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 12)
        .frame(minHeight: 32)
        .background(Theme.card)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
    }

    private var tools: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L10n.s(.toolsTitle, lang))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                Button { model.selectedTab = .timelines } label: {
                    PainPointCard(icon: "clock", title: L10n.s(.painWaitTitle, lang), bodyText: L10n.s(.painWaitBody, lang))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    InterviewPrepView(spaceID: me?.profiles.first?.spaceID ?? me?.memberships.first?.spaceID ?? "i-485")
                } label: {
                    PainPointCard(icon: "person.2.wave.2", title: L10n.s(.painInterviewTitle, lang), bodyText: L10n.s(.painInterviewBody, lang))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    PrepareView(initialSpaceID: "i-765")
                } label: {
                    PainPointCard(icon: "briefcase", title: L10n.s(.painEADTitle, lang), bodyText: L10n.s(.painEADBody, lang))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    PrepareView()
                } label: {
                    PainPointCard(icon: "doc.text.magnifyingglass", title: L10n.s(.painRFETitle, lang), bodyText: L10n.s(.painRFEBody, lang))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    InterviewPrepView(spaceID: "i-485")
                } label: {
                    PainPointCard(icon: "heart", title: L10n.s(.painEvidenceTitle, lang), bodyText: L10n.s(.painEvidenceBody, lang))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    PrepareView()
                } label: {
                    PainPointCard(icon: "folder", title: L10n.s(.painFolderTitle, lang), bodyText: L10n.s(.painFolderBody, lang))
                }
                .buttonStyle(.plain)
            }
            LegalNotice()
        }
    }

    private var sampleNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.s(.sampleNote, lang))
                .font(.footnote)
                .foregroundStyle(Theme.ink)
            Button(L10n.s(.dismiss, lang)) { hideSampleNote = true }
                .font(.caption.weight(.semibold))
        }
        .cardStyle()
    }
}

struct SearchView: View {
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }
    private var blocks: [UserBlock] { context.blocks }
    @State private var query = ""
    @State private var spaceID: String?
    @State private var kind: String?

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                TextField(L10n.s(.searchPrompt, lang), text: $query)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("search.field")
                HStack {
                    Menu {
                        Button(L10n.s(.tabSpaces, lang)) { spaceID = nil }
                        ForEach(Taxonomy.spaces) { space in
                            Button(space.name(lang)) { spaceID = space.id }
                        }
                    } label: {
                        Text(spaceID.flatMap { Taxonomy.space($0)?.name(lang) } ?? L10n.s(.tabSpaces, lang))
                            .font(.caption.weight(.semibold))
                    }
                    Menu {
                        Button(L10n.s(.allTypes, lang)) { kind = nil }
                        ForEach(PostKind.allCases) { item in
                            Button(L10n.postKind(item.rawValue, lang)) { kind = item.rawValue }
                        }
                    } label: {
                        Text(kind.map { L10n.postKind($0, lang) } ?? L10n.s(.allTypes, lang))
                            .font(.caption.weight(.semibold))
                    }
                }
                if query.trimmingCharacters(in: .whitespaces).isEmpty {
                    EmptyState(title: L10n.s(.search, lang), message: L10n.s(.searchPrompt, lang))
                } else if results.isEmpty {
                    EmptyState(title: L10n.s(.noSearchResults, lang), message: L10n.s(.feedDisclaimer, lang))
                } else {
                    ForEach(results, id: \.id) { post in
                        NavigationLink {
                            PostDetailView(postID: post.id)
                        } label: {
                            PostCard(post: post)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(L10n.s(.search, lang))
        .navInline()
    }

    private var results: [Post] {
        guard let me else { return [] }
        return FeedQuery.search(
            posts,
            query: query,
            spaceID: spaceID,
            kind: kind,
            blocked: FeedQuery.blockedIDs(for: me.id, blocks: blocks)
        )
    }
}
