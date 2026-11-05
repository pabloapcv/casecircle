import SwiftUI
import PhotosUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct AskView: View {
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var posts: [Post] { context.posts }
    private var members: [Member] { context.members }

    @State private var step = 0
    @State private var kind: PostKind?
    @State private var spaceIDs: [String] = []
    @State private var title = ""
    @State private var bodyText = ""
    @State private var stage = ""
    @State private var officeID = ""
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var images: [Data] = []
    @State private var imageRejected = false
    @State private var busy = false
    @State private var spaceSearch = ""

    private var me: Member? { members.first { $0.isCurrentUser } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(stepTitle).font(.system(.title2, design: .serif)).fontWeight(.semibold)
                    switch step {
                    case 0: typeStep
                    case 1: spaceStep
                    default: writeStep
                    }
                }
                .padding(16)
            }
            .dismissKeyboardOnScroll()
            .background(Theme.paper)
            .navigationTitle(L10n.s(.tabAsk, lang))
            .safeAreaInset(edge: .bottom) {
                if step > 0 {
                    VStack(spacing: 8) {
                        PrimaryButton(title: step == 2 ? publishTitle : L10n.s(.next, lang), enabled: canAdvance && !busy) {
                            if step == 2 { publish() } else { step += 1 }
                        }
                        Button(L10n.s(.back, lang)) { step = max(0, step - 1) }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 36)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Theme.paper)
                }
            }
        }
        .onChange(of: model.askSpaceID) { _, id in
            guard let id else { return }
            if !spaceIDs.contains(id) {
                spaceIDs.insert(id, at: 0)
            }
            model.askSpaceID = nil
            if kind != nil { step = 2 }
        }
        .onChange(of: pickerItems) { _, items in
            Task { await loadImages(items) }
        }
    }

    private var stepTitle: String {
        switch step {
        case 0: return L10n.s(.askPickType, lang)
        case 1: return L10n.s(.askPickSpace, lang)
        default: return L10n.s(.askWrite, lang)
        }
    }

    private var typeStep: some View {
        VStack(spacing: 10) {
            ForEach(PostKind.allCases) { item in
                Button {
                    kind = item
                    step = spaceIDs.isEmpty ? 1 : 2
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L10n.postKind(item.rawValue, lang)).font(.headline).foregroundStyle(Theme.ink)
                        Text(L10n.postKindHelp(item.rawValue, lang))
                            .font(.subheadline)
                            .foregroundStyle(Theme.secondary)
                            .multilineTextAlignment(.leading)
                    }
                    .cardStyle()
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(kind == item ? Theme.teal : Color.clear, lineWidth: 2)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ask.type.\(item.rawValue)")
            }
        }
    }

    private var spaceStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField(L10n.s(.searchSpaces, lang), text: $spaceSearch)
                .textFieldStyle(.roundedBorder)
            ForEach(Taxonomy.searchSpaces(spaceSearch)) { space in
                Button {
                    spaceIDs = [space.id]
                    step = 2
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(space.name(lang)).font(.headline).foregroundStyle(Theme.ink)
                            Text(space.primaryForm).font(.caption).foregroundStyle(Theme.secondary)
                        }
                        Spacer()
                        if spaceIDs.first == space.id {
                            Image(systemName: "checkmark").foregroundStyle(Theme.teal)
                        }
                    }
                    .cardStyle()
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ask.space.\(space.id)")
            }
        }
    }

    private var writeStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let kind {
                Text(L10n.postKind(kind.rawValue, lang)).font(.caption.weight(.semibold)).foregroundStyle(Theme.teal)
            }
            if kind == .timeline {
                Text(L10n.s(.timelineNote, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            }
            FieldHeader(title: L10n.s(.titleLabel, lang))
            TextField(L10n.s(.titlePlaceholder, lang), text: $title)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("ask.title")
                .onChange(of: title) { _, new in
                    if new.count > 140 { title = String(new.prefix(140)) }
                }
            FieldHeader(title: L10n.s(.bodyLabel, lang))
            TextField(L10n.s(.bodyPlaceholder, lang), text: $bodyText, axis: .vertical)
                .lineLimit(5...10)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("ask.body")
                .onChange(of: bodyText) { _, new in
                    if new.count > 5000 { bodyText = String(new.prefix(5000)) }
                }
            if let message = L10n.safetyMessage(verdict, lang) {
                SafetyNote(text: message, held: verdict == .hold(.scam))
            } else if !title.isEmpty && title.trimmingCharacters(in: .whitespaces).count < 8 {
                Text(L10n.s(.titleTooShort, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            } else if !bodyText.isEmpty && bodyText.trimmingCharacters(in: .whitespaces).count < 20 {
                Text(L10n.s(.bodyTooShort, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            }
            if kind == .question { similarBlock }
            stageMenu
            officeMenu
            extraSpaces
            photoRow
        }
    }

    private var similarBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.s(.similarTitle, lang)).font(.headline)
            if similar.isEmpty {
                Text(L10n.s(.searchPrompt, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            } else {
                ForEach(similar, id: \.id) { post in
                    NavigationLink {
                        PostDetailView(postID: post.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(post.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text(post.bodyText).font(.caption).foregroundStyle(Theme.secondary).lineLimit(2)
                        }
                        .cardStyle()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var similar: [Post] {
        guard let spaceID = spaceIDs.first, kind == .question else { return [] }
        let documents = posts.filter { $0.status == "live" && $0.spaceIDs.contains(spaceID) }.map {
            (id: $0.id.uuidString, text: $0.title + " " + $0.bodyText)
        }
        let ranked = SimilarText.rank(query: title + " " + bodyText, documents: documents)
        return ranked.compactMap { item in posts.first { $0.id.uuidString == item.id } }
    }

    private var stageMenu: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldHeader(title: L10n.s(.stageLabel, lang))
            Menu {
                Button(L10n.s(.choose, lang)) { stage = "" }
                ForEach(Stage.allCases) { item in
                    Button(L10n.stage(item.rawValue, lang)) { stage = item.rawValue }
                }
            } label: {
                menuLabel(stage.isEmpty ? L10n.s(.choose, lang) : L10n.stage(stage, lang))
            }
        }
    }

    private var officeMenu: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldHeader(title: L10n.s(.officeLabel, lang))
            Menu {
                Button(L10n.s(.choose, lang)) { officeID = "" }
                ForEach(Taxonomy.offices.filter { $0.type != .unsure }) { office in
                    Button(office.name(lang)) { officeID = office.id }
                }
            } label: {
                menuLabel(Taxonomy.office(officeID)?.name(lang) ?? L10n.s(.choose, lang))
            }
        }
    }

    private var extraSpaces: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldHeader(title: L10n.s(.alsoShowIn, lang))
            Text(L10n.s(.upToThreeSpaces, lang)).font(.caption).foregroundStyle(Theme.secondary)
            FlowChoices(spaces: extraChoices, selected: spaceIDs) { id in
                toggleExtra(id)
            }
        }
    }

    private var extraChoices: [SpaceDef] {
        let joined = Set(me?.memberships.map(\.spaceID) ?? [])
        return Taxonomy.spaces.filter { space in
            space.id != spaceIDs.first && (space.isLaunch || joined.contains(space.id))
        }
    }

    private func toggleExtra(_ id: String) {
        if spaceIDs.contains(id) {
            spaceIDs.removeAll { $0 == id }
        } else if spaceIDs.count < 3 {
            spaceIDs.append(id)
        }
    }

    private var photoRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            PhotosPicker(selection: $pickerItems, maxSelectionCount: 4, matching: .images) {
                Label(L10n.s(.addPhotos, lang), systemImage: "photo")
                    .font(.subheadline.weight(.semibold))
            }
            Text(L10n.s(.photoRule, lang)).font(.caption).foregroundStyle(Theme.secondary)
            if imageRejected {
                SafetyNote(text: L10n.s(.safetyDocument, lang))
            }
            if !images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(images.enumerated()), id: \.offset) { _, data in
                            PhotoView(data: data)
                        }
                    }
                }
            }
        }
    }

    private func menuLabel(_ value: String) -> some View {
        HStack {
            Text(value).foregroundStyle(Theme.ink)
            Spacer()
            Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(Theme.secondary)
        }
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }

    private var verdict: SafetyVerdict {
        let text = title + "\n" + bodyText
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return .allow }
        return SafetyFilter.evaluate(text)
    }

    private var publishTitle: String {
        verdict == .hold(.scam) ? L10n.s(.submitForReview, lang) : L10n.s(.publish, lang)
    }

    private var canAdvance: Bool {
        if step == 1 { return !spaceIDs.isEmpty }
        if step == 2 {
            let titleOK = title.trimmingCharacters(in: .whitespacesAndNewlines).count >= 8
            let bodyOK = bodyText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 20
            let stageOK = (kind != .timeline && kind != .interview) || !stage.isEmpty
            if case .block = verdict { return false }
            return titleOK && bodyOK && stageOK && !spaceIDs.isEmpty
        }
        return true
    }

    private func loadImages(_ items: [PhotosPickerItem]) async {
        var next: [Data] = []
        var rejected = false
        for item in items.prefix(4) {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            switch await ImageSafety.prepare(data) {
            case .success(let jpeg): next.append(jpeg)
            case .failure: rejected = true
            }
        }
        images = next
        imageRejected = rejected
    }

    private func publish() {
        guard let me, let kind else { return }
        busy = true
        let draft = NewPostDraft(
            spaceIDs: spaceIDs,
            type: kind.rawValue,
            title: title,
            body: bodyText,
            stage: stage,
            officeID: officeID,
            formCode: Taxonomy.space(spaceIDs[0])?.primaryForm ?? "",
            filedMonth: me.profiles.first { $0.spaceID == spaceIDs[0] }?.filedMonth,
            images: images
        )
        do {
            let post = try CommunityActions.publish(draft, author: me, database: context)
            Haptics.tap()
            model.toast = post.status == "held" ? L10n.s(.heldToast, lang) : L10n.s(.postedToast, lang)
            reset()
            model.pendingPostID = post.id
            model.selectedTab = .home
        } catch let error as ActionError {
            model.toast = message(for: error)
        } catch {
            model.toast = L10n.s(.couldNotSignIn, lang)
        }
        busy = false
    }

    private func message(for error: ActionError) -> String {
        switch error {
        case .blocked(let reason):
            return L10n.safetyMessage(.block(reason), lang) ?? L10n.s(.safetyAbusive, lang)
        case .tooShort: return L10n.s(.bodyTooShort, lang)
        case .editExpired: return L10n.s(.editWindow, lang)
        case .alreadyReported: return L10n.s(.alreadyReported, lang)
        case .notAllowed: return L10n.s(.couldNotSignIn, lang)
        case .rateLimited: return L10n.s(.slowDown, lang)
        }
    }

    private func reset() {
        step = 0
        kind = nil
        spaceIDs = []
        title = ""
        bodyText = ""
        stage = ""
        officeID = ""
        images = []
        pickerItems = []
        imageRejected = false
    }
}

private struct FlowChoices: View {
    var spaces: [SpaceDef]
    var selected: [String]
    var toggle: (String) -> Void
    @Environment(\.appLanguage) private var lang

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(spaces) { space in
                    let on = selected.contains(space.id)
                    Button(space.name(lang)) { toggle(space.id) }
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .foregroundStyle(on ? Color.white : Theme.ink)
                        .background(on ? Theme.teal : Theme.card)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.line, lineWidth: on ? 0 : 1))
                        .buttonStyle(.plain)
                }
            }
        }
    }
}
