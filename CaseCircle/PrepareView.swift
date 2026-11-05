import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct PrepareView: View {
    var initialSpaceID: String? = nil
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }
    @State private var spaceID: String?
    @State private var rfeText = ""
    @State private var rfeItems: [RFEItem]?
    @State private var rfeChecked: Set<String> = []

    private var me: Member? {
        _ = context.revision
        return members.first { $0.isCurrentUser }
    }
    private var choices: [String] {
        let joined = me?.memberships.map(\.spaceID) ?? []
        var seen = Set<String>()
        return (joined + FormChecklists.featuredSpaceIDs + ["i-751", "i-131"]).filter { seen.insert($0).inserted }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let spaceID {
                    folder(spaceID)
                } else {
                    picker
                    rfeHelper
                    LegalNotice()
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(L10n.s(.prepareTitle, lang))
        .navInline()
        .onAppear {
            if spaceID == nil { spaceID = initialSpaceID }
        }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.s(.prepareLead, lang))
                .font(.subheadline)
                .foregroundStyle(Theme.secondary)
            Text(L10n.s(.pickFolder, lang))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            ForEach(choices, id: \.self) { id in
                let space = Taxonomy.space(id)
                let tally = FormChecklists.tally(spaceId: id, marks: me?.folderMarks ?? [:])
                Button {
                    spaceID = id
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(space?.primaryForm ?? id)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.teal)
                        Text(space?.name(lang) ?? id)
                            .font(.headline)
                            .foregroundStyle(Theme.ink)
                        ScoreMeter(title: L10n.s(.completenessScore, lang), score: tally.score)
                        Text("\(tally.ready)/\(tally.total) \(L10n.s(.folderReady, lang))")
                            .font(.caption)
                            .foregroundStyle(Theme.secondary)
                    }
                    .cardStyle()
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(space?.name(lang) ?? id), \(tally.score) percent complete")
            }
        }
    }

    private func folder(_ spaceID: String) -> some View {
        let items = FormChecklists.items(for: spaceID)
        let tally = FormChecklists.tally(spaceId: spaceID, marks: me?.folderMarks ?? [:])
        let profile = me?.profiles.first { $0.spaceID == spaceID }
        let flags = RiskFlags.flags(
            spaceId: spaceID,
            stage: profile?.currentStage ?? "",
            filed: profile?.filedMonth,
            marks: me?.folderMarks ?? [:]
        )
        return VStack(alignment: .leading, spacing: 14) {
            Button(L10n.s(.backToFolders, lang)) { self.spaceID = nil }
                .font(.subheadline.weight(.semibold))
                .frame(minHeight: 44)
            Text(Taxonomy.space(spaceID)?.name(lang) ?? spaceID)
                .font(.title2.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            Text(L10n.s(.prepareLead, lang))
                .font(.subheadline)
                .foregroundStyle(Theme.secondary)
            ScoreMeter(title: L10n.s(.completenessScore, lang), score: tally.score)
            ForEach(flags) { flag in
                Label(flag.text(lang), systemImage: flag.level == "error" ? "exclamationmark.triangle.fill" : flag.level == "success" ? "checkmark.circle.fill" : "clock")
                    .font(.footnote)
                    .foregroundStyle(flag.level == "error" ? Theme.coral : flag.level == "success" ? Theme.good : Theme.amber)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(flag.text(lang))
            }
            ForEach(items) { item in
                folderRow(spaceID: spaceID, item: item)
            }
            LegalNotice()
        }
    }

    private func folderRow(spaceID: String, item: ChecklistItem) -> some View {
        let key = FormChecklists.markKey(spaceId: spaceID, itemId: item.id)
        let mark = FolderMark(rawValue: FormChecklists.resolve(me?.folderMarks ?? [:], spaceId: spaceID, itemId: item.id)) ?? .need
        return VStack(alignment: .leading, spacing: 8) {
            Text(item.title(lang))
                .font(.subheadline.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                markChip(L10n.s(.folderReady, lang), on: mark == .ready) { setMark(key, .ready) }
                markChip(L10n.s(.folderNeed, lang), on: mark == .need) { setMark(key, .need) }
                markChip(L10n.s(.folderNA, lang), on: mark == .na) { setMark(key, .na) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(item.title(lang))
        }
        .cardStyle()
    }

    private func markChip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(on ? Color.white : Theme.ink)
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .background(on ? Theme.teal : Theme.card)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.line, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func setMark(_ key: String, _ mark: FolderMark) {
        guard let me else { return }
        me.folderMarks[key] = mark.rawValue
        context.save()
    }

    private var rfeHelper: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L10n.s(.rfeHelperTitle, lang))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(L10n.s(.rfeHelperLead, lang))
                .font(.footnote)
                .foregroundStyle(Theme.secondary)
            TextField(L10n.s(.rfePlaceholder, lang), text: $rfeText, axis: .vertical)
                .lineLimit(6, reservesSpace: true)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel(L10n.s(.rfeHelperTitle, lang))
            PrimaryButton(title: L10n.s(.generateChecklist, lang)) {
                if let parsed = RFEParser.parse(rfeText) {
                    rfeItems = parsed
                } else {
                    rfeItems = []
                }
            }
            if let rfeItems {
                if rfeItems.isEmpty {
                    Text(L10n.s(.rfeTooShort, lang)).font(.footnote).foregroundStyle(Theme.secondary)
                } else {
                    Text(L10n.s(.requestedItems, lang)).font(.subheadline.weight(.semibold))
                    ForEach(rfeItems) { item in
                        let on = rfeChecked.contains(item.id)
                        Button {
                            if on { rfeChecked.remove(item.id) } else { rfeChecked.insert(item.id) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: on ? "checkmark.square.fill" : "square")
                                    .foregroundStyle(on ? Theme.teal : Theme.secondary)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title(lang)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                                    if !item.hint(lang).isEmpty {
                                        Text(item.hint(lang)).font(.caption).foregroundStyle(Theme.secondary)
                                    }
                                    Pill(text: item.required ? L10n.s(.requiredLabel, lang) : L10n.s(.ifApplicable, lang), tint: item.required ? Theme.coral : Theme.secondary)
                                }
                                Spacer()
                            }
                            .cardStyle()
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                    }
                }
            }
        }
    }
}
