import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct SpacesView: View {
    @Environment(\.appLanguage) private var lang
    @Environment(Database.self) private var context
    private var members: [Member] { context.members }
    private var memberships: [Membership] { context.members.flatMap(\.memberships) }
    @State private var search = ""

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    TextField(L10n.s(.searchSpaces, lang), text: $search)
                        .textFieldStyle(.roundedBorder)
                    if search.trimmingCharacters(in: .whitespaces).isEmpty {
                        Text(L10n.s(.startHere, lang)).font(.headline)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(Taxonomy.spaces.filter(\.isLaunch)) { space in
                                    NavigationLink {
                                        SpaceDetailView(spaceID: space.id)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(space.primaryForm).font(.caption.weight(.bold)).foregroundStyle(Theme.teal)
                                            Text(space.name(lang)).font(.headline).foregroundStyle(Theme.ink)
                                            Text(L10n.members(count(space.id), lang))
                                                .font(.caption)
                                                .foregroundStyle(Theme.secondary)
                                        }
                                        .frame(width: 180, alignment: .leading)
                                        .cardStyle()
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    let groups = search.trimmingCharacters(in: .whitespaces).isEmpty ? Taxonomy.categories : []
                    if groups.isEmpty {
                        ForEach(Taxonomy.searchSpaces(search)) { space in
                            spaceLink(space)
                        }
                    } else {
                        ForEach(groups) { category in
                            Text(category.name(lang)).font(.headline).padding(.top, 4)
                            ForEach(Taxonomy.spaces(in: category.id)) { space in
                                spaceLink(space)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.paper)
            .navigationTitle(L10n.s(.tabSpaces, lang))
        }
    }

    private func count(_ spaceID: String) -> Int {
        memberships.filter { $0.spaceID == spaceID }.count
    }

    private func spaceLink(_ space: SpaceDef) -> some View {
        NavigationLink {
            SpaceDetailView(spaceID: space.id)
        } label: {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(space.name(lang)).font(.headline).foregroundStyle(Theme.ink)
                        Pill(
                            text: space.isLaunch ? L10n.s(.activeSpace, lang) : L10n.s(.newSpace, lang),
                            tint: space.isLaunch ? Theme.teal : Theme.secondary
                        )
                    }
                    Text(space.forms.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.secondary)
                    Text(L10n.members(count(space.id), lang))
                        .font(.caption)
                        .foregroundStyle(Theme.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
            }
            .cardStyle()
        }
        .buttonStyle(.plain)
    }
}

struct SpaceDetailView: View {
    var spaceID: String
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }
    private var blocks: [UserBlock] { context.blocks }
    private var profiles: [CaseProfile] { context.allProfiles }
    @State private var section = 0
    @State private var confirmLeave = false

    private var space: SpaceDef? { Taxonomy.space(spaceID) }
    private var me: Member? { members.first { $0.isCurrentUser } }
    private var joined: Bool { me?.memberships.contains { $0.spaceID == spaceID } ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let space {
                    Text(space.forms.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.teal)
                    Text(space.blurb(lang))
                        .font(.subheadline)
                        .foregroundStyle(Theme.secondary)
                    HStack {
                        if let category = Taxonomy.category(space.categoryId) {
                            Text(category.name(lang))
                        }
                        Text("·")
                        Text(L10n.members(me == nil ? 0 : membershipCount, lang))
                        Pill(text: space.isLaunch ? L10n.s(.activeSpace, lang) : L10n.s(.newSpace, lang), tint: Theme.teal)
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
                    DisclaimerBanner()
                    HStack {
                        if joined {
                            Button(L10n.s(.askInSpace, lang)) {
                                model.askSpaceID = spaceID
                                model.selectedTab = .ask
                            }
                            .font(.subheadline.weight(.semibold))
                            Button(L10n.s(.leaveSpace, lang), role: .destructive) { confirmLeave = true }
                                .font(.subheadline)
                        } else if let me {
                            Button(L10n.s(.join, lang)) {
                                try? CommunityActions.join(spaceID, member: me, database: context)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    HStack {
                        NavigationLink {
                            PrepareView(initialSpaceID: spaceID)
                        } label: {
                            Text(L10n.s(.openFolder, lang)).font(.subheadline.weight(.semibold))
                        }
                        NavigationLink {
                            InterviewPrepView(spaceID: spaceID)
                        } label: {
                            Text(L10n.s(.interviewPrep, lang)).font(.subheadline.weight(.semibold))
                        }
                    }
                    .frame(minHeight: 44)
                    Picker("", selection: $section) {
                        Text(L10n.s(.feedTab, lang)).tag(0)
                        Text(L10n.s(.statsTab, lang)).tag(1)
                        Text(L10n.s(.faqTab, lang)).tag(2)
                    }
                    .pickerStyle(.segmented)
                    if section == 1 {
                        stats
                    } else if feed.isEmpty {
                        EmptyState(
                            title: section == 2 ? L10n.s(.faqTab, lang) : L10n.s(.emptySpaceTitle, lang),
                            message: L10n.s(.emptySpaceBody, lang),
                            actionTitle: L10n.s(.askInSpace, lang),
                            action: {
                                model.askSpaceID = spaceID
                                model.selectedTab = .ask
                            }
                        )
                    } else {
                        ForEach(feed, id: \.id) { post in
                            NavigationLink {
                                PostDetailView(postID: post.id)
                            } label: {
                                PostCard(post: post)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(space?.name(lang) ?? "")
        .navInline()
        .confirmationDialog(L10n.s(.leaveSpace, lang), isPresented: $confirmLeave, titleVisibility: .visible) {
            Button(L10n.s(.leaveSpace, lang), role: .destructive) {
                if let me { try? CommunityActions.leave(spaceID, member: me, database: context) }
            }
            Button(L10n.s(.cancel, lang), role: .cancel) {}
        } message: {
            Text(L10n.s(.leaveSpaceBody, lang))
        }
    }

    private var membershipCount: Int {
        members.reduce(0) { count, member in
            count + (member.memberships.contains { $0.spaceID == spaceID } ? 1 : 0)
        }
    }

    private var feed: [Post] {
        guard let me else { return [] }
        return FeedQuery.posts(
            from: posts,
            joined: [spaceID],
            blocked: FeedQuery.blockedIDs(for: me.id, blocks: blocks),
            sort: .new,
            kind: nil,
            stage: nil,
            officeID: nil,
            spaceID: spaceID,
            faqOnly: section == 2,
            pinFAQ: section == 0
        )
    }

    private var stats: some View {
        let snapshots = profiles.map { $0.snapshot() }
        let real = BenchmarkEngine.cells(from: snapshots, includeSample: false)
            .filter { $0.spaceId == spaceID && $0.isPublishable }
        let examples = BenchmarkEngine.cells(from: snapshots, includeSample: true)
            .filter { $0.spaceId == spaceID && $0.isPublishable }
        return VStack(alignment: .leading, spacing: 12) {
            if real.isEmpty {
                EmptyState(title: L10n.s(.notEnoughTitle, lang), message: L10n.s(.notEnoughBody, lang))
            } else {
                Text(L10n.s(.realBody, lang)).font(.footnote).foregroundStyle(Theme.secondary)
                ForEach(real) { cell in BenchmarkCard(cell: cell, example: false) }
            }
            Text(L10n.s(.exampleTitle, lang)).font(.headline)
            Text(L10n.s(.exampleBody, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            ForEach(Array(examples.prefix(3))) { cell in
                BenchmarkCard(cell: cell, example: true)
            }
            OfficialTimesLink()
        }
    }
}
