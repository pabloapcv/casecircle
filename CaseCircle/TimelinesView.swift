import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct TimelinesView: View {
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }
    private var profiles: [CaseProfile] { context.allProfiles }

    private var me: Member? { members.first { $0.isCurrentUser } }
    private var mine: [CaseProfile] { me?.profiles.sorted { $0.filedMonth > $1.filedMonth } ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(L10n.s(.notAffiliated, lang))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.secondary)
                    if let first = mine.first {
                        WaitCalculatorCard(profile: first, cohort: waitCohort)
                    } else {
                        EmptyState(
                            title: L10n.s(.waitNormalTitle, lang),
                            message: L10n.s(.addFirstCaseBody, lang)
                        )
                        NavigationLink {
                            ProfileEditorScreen(existing: nil, preferredSpaceID: me?.memberships.first?.spaceID)
                        } label: {
                            Text(L10n.s(.addCaseCTA, lang))
                                .font(.subheadline.weight(.semibold))
                                .frame(minHeight: 44)
                        }
                        .accessibilityLabel(L10n.s(.addCaseCTA, lang))
                    }
                    Text(L10n.s(.yourCases, lang)).font(.headline)
                    if mine.isEmpty {
                        EmptyState(title: L10n.s(.noCaseYet, lang), message: L10n.s(.profileStepHelp, lang))
                    } else {
                        ForEach(mine, id: \.id) { profile in
                            NavigationLink {
                                ProfileEditorScreen(existing: profile)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(Taxonomy.space(profile.spaceID)?.name(lang) ?? profile.formCode)
                                        .font(.headline)
                                        .foregroundStyle(Theme.ink)
                                    Text(BadgeText.make(
                                        form: profile.formCode,
                                        officeID: profile.officeID,
                                        filed: profile.filedMonth,
                                        stage: profile.currentStage,
                                        lang: lang
                                    ))
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.teal)
                                    Text(Formatters.wait(since: profile.filedMonth, lang))
                                        .font(.subheadline.weight(.semibold))
                                }
                                .cardStyle()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if let me, let first = me.memberships.first?.spaceID {
                        NavigationLink {
                            ProfileEditorScreen(existing: nil, preferredSpaceID: first)
                        } label: {
                            Text(L10n.s(.addCaseProfile, lang)).font(.subheadline.weight(.semibold))
                                .frame(minHeight: 44)
                        }
                    }
                    NavigationLink {
                        PrepareView()
                    } label: {
                        Text(L10n.s(.prepareTitle, lang)).font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                    benchmarkBlock
                    OfficialTimesLink().padding(.top, 8)
                    LegalNotice()
                }
                .padding(16)
            }
            .background(Theme.paper)
            .navigationTitle(L10n.s(.tabTimelines, lang))
        }
    }

    private var waitCohort: [WaitInput] {
        members.flatMap { member in
            member.profiles.map { profile in
                member.waitInput(from: profile)
            }
        }
    }

    private var benchmarkBlock: some View {
        let snapshots = profiles.map { $0.snapshot() }
        let real = BenchmarkEngine.cells(from: snapshots, includeSample: false).filter(\.isPublishable)
        let examples = BenchmarkEngine.cells(from: snapshots, includeSample: true).filter(\.isPublishable)
        return VStack(alignment: .leading, spacing: 12) {
            if real.isEmpty {
                Text(L10n.s(.notEnoughTitle, lang)).font(.headline)
                Text(L10n.s(.notEnoughBody, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            } else {
                Text(L10n.s(.realTitle, lang)).font(.headline)
                Text(L10n.s(.realBody, lang)).font(.footnote).foregroundStyle(Theme.secondary)
                ForEach(real) { cell in BenchmarkCard(cell: cell, example: false) }
            }
            Text(L10n.s(.exampleTitle, lang)).font(.headline).padding(.top, 8)
            Text(L10n.s(.exampleBody, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            ForEach(Array(examples.prefix(4))) { cell in
                BenchmarkCard(cell: cell, example: true)
            }
        }
    }
}

struct ProfileEditorScreen: View {
    var existing: CaseProfile?
    var preferredSpaceID: String?
    @Environment(Database.self) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }
    @State private var draft = ProfileDraft.fresh(spaceID: "i-751")
    @State private var spaceID = "i-751"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if existing == nil {
                    Menu {
                        ForEach(Taxonomy.spaces) { space in
                            Button(space.name(lang)) {
                                spaceID = space.id
                                draft = ProfileDraft.fresh(spaceID: space.id)
                            }
                        }
                    } label: {
                        Text(Taxonomy.space(spaceID)?.name(lang) ?? L10n.s(.choose, lang))
                            .font(.headline)
                    }
                }
                CaseProfileEditor(draft: $draft)
                PrimaryButton(title: L10n.s(.saveProfile, lang), enabled: !draft.currentStage.isEmpty) {
                    guard let me = members.first(where: { $0.isCurrentUser }) else { return }
                    draft.spaceID = spaceID
                    do {
                        try CommunityActions.saveProfile(draft, member: me, database: context)
                        model.toast = L10n.s(.profileSaved, lang)
                        dismiss()
                    } catch {
                        model.toast = L10n.s(.bodyTooShort, lang)
                    }
                }
                if existing != nil {
                    Button(L10n.s(.delete, lang), role: .destructive) {
                        if let existing, let me = members.first(where: { $0.isCurrentUser }) {
                            try? CommunityActions.deleteProfile(existing, member: me, database: context)
                            dismiss()
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(existing == nil ? L10n.s(.addCaseProfile, lang) : L10n.s(.editCaseProfile, lang))
        .navInline()
        .onAppear {
            if let existing {
                spaceID = existing.spaceID
                draft = ProfileDraft(
                    spaceID: existing.spaceID,
                    formCode: existing.formCode,
                    basedOn: existing.basedOn,
                    filedMonth: existing.filedMonth,
                    officeID: existing.officeID,
                    filingMethod: existing.filingMethod,
                    currentStage: existing.currentStage,
                    stageDates: existing.stageDates,
                    completed: members.first { $0.isCurrentUser }?.completedSpaceIDs.contains(existing.spaceID) ?? false
                )
            } else if let preferredSpaceID {
                spaceID = preferredSpaceID
                draft = ProfileDraft.fresh(spaceID: preferredSpaceID)
            }
        }
    }
}
