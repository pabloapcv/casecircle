import SwiftUI
import AuthenticationServices
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct OnboardingView: View {
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }

    @State private var step = 0
    @State private var appleID = ""
    @State private var email = ""
    @State private var emailDraft = ""
    @State private var showEmail = false
    @State private var username = ""
    @State private var selected: [String] = []
    @State private var search = ""
    @State private var agreeRules = false
    @State private var agreeDisclaimer = false
    @State private var draft = ProfileDraft.fresh(spaceID: "i-751")
    @State private var working = false

    init(startingStep: Int = 0) {
        _step = State(initialValue: startingStep)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                switch step {
                case 0: welcome
                case 1: usernameStep
                case 2: spacesStep
                case 3: rulesStep
                default: profileStep
                }
            }
            .padding(20)
        }
        .dismissKeyboardOnScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .background(Theme.paper)
        .sheet(isPresented: $showEmail) { emailSheet }
    }

    private var header: some View {
        HStack(spacing: 10) {
            MarkView(size: 32)
            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.s(.appName, lang)).font(.headline)
                Text(L10n.s(.notAffiliated, lang)).font(.caption).foregroundStyle(Theme.secondary)
            }
            Spacer()
            if step > 0 {
                Button(L10n.s(.skipSetup, lang)) { skipSetup() }
                    .font(.caption.weight(.semibold))
                    .disabled(working)
            }
            Text("\(step + 1)/5")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondary)
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.s(.welcomeTitle, lang))
                .font(.system(.largeTitle, design: .serif))
                .fontWeight(.semibold)
            Text(L10n.s(.pitch, lang))
                .font(.body)
                .foregroundStyle(Theme.secondary)
            DisclaimerBanner()
            languagePicker
            SignInWithAppleButton(.continue) { request in
                request.requestedScopes = []
            } onCompletion: { result in
                switch result {
                case .success(let authorization):
                    if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                        appleID = credential.user
                        step = 1
                    }
                case .failure(let error):
                    let code = (error as NSError).code
                    if code == ASAuthorizationError.canceled.rawValue { return }
                    model.toast = L10n.s(.couldNotSignIn, lang)
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            SecondaryButton(title: L10n.s(.continueEmail, lang)) { showEmail = true }
            VStack(alignment: .leading, spacing: 4) {
                Button(L10n.s(.reviewerDemo, lang)) { enterDemo() }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("onboarding.demo")
                Text(L10n.s(.reviewerDemoHelp, lang))
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
            .padding(.top, 8)
            Link(L10n.s(.contactFooter, lang), destination: Links.supportMail)
                .font(.footnote)
        }
    }

    private var languagePicker: some View {
        HStack(spacing: 8) {
            languageButton("en", L10n.s(.english, lang))
            languageButton("es", L10n.s(.spanish, lang))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.s(.languageLabel, lang))
    }

    private func languageButton(_ code: String, _ title: String) -> some View {
        Button {
            model.language = code
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(minHeight: 40)
                .foregroundStyle(model.language == code ? Color.white : Theme.ink)
                .background(model.language == code ? Theme.teal : Theme.card)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(model.language == code ? .isSelected : [])
    }

    private var emailSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(L10n.s(.emailHelp, lang))
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondary)
                TextField(L10n.s(.emailPlaceholder, lang), text: $emailDraft)
                    .textFieldStyle(.roundedBorder)
                    .noAutoCap()
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    #endif
                if !emailDraft.isEmpty && !EmailRules.isValid(emailDraft) {
                    Text(L10n.s(.emailInvalid, lang)).font(.footnote).foregroundStyle(Theme.coral)
                }
                PrimaryButton(title: L10n.s(.useEmail, lang), enabled: EmailRules.isValid(emailDraft)) {
                    email = emailDraft.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    showEmail = false
                    step = 1
                }
                Spacer()
            }
            .padding(20)
            .background(Theme.paper)
            .navigationTitle(L10n.s(.emailTitle, lang))
            .navInline()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.s(.cancel, lang)) { showEmail = false }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium])
        #endif
    }

    private var usernameStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.s(.usernameTitle, lang)).font(.system(.title, design: .serif)).fontWeight(.semibold)
            Text(L10n.s(.usernameHelp, lang)).foregroundStyle(Theme.secondary)
            TextField(L10n.s(.usernamePlaceholder, lang), text: $username)
                .textFieldStyle(.roundedBorder)
                .noAutoCap()
                .accessibilityIdentifier("onboarding.username")
            if let issue = usernameIssue, !username.isEmpty {
                Text(usernameMessage(issue)).font(.footnote).foregroundStyle(Theme.coral)
            }
        }
    }

    private var spacesStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.s(.spacesTitle, lang)).font(.system(.title, design: .serif)).fontWeight(.semibold)
            Text(L10n.s(.spacesHint, lang)).foregroundStyle(Theme.secondary)
            TextField(L10n.s(.searchSpaces, lang), text: $search)
                .textFieldStyle(.roundedBorder)
            Text(L10n.s(.selectedCount, lang, selected.count))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondary)
            ForEach(Taxonomy.searchSpaces(search)) { space in
                spaceToggle(space)
            }
        }
    }

    private func spaceToggle(_ space: SpaceDef) -> some View {
        let on = selected.contains(space.id)
        return Button {
            if on {
                selected.removeAll { $0 == space.id }
            } else {
                selected.append(space.id)
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(space.name(lang)).font(.headline).foregroundStyle(Theme.ink)
                        Pill(text: space.isLaunch ? L10n.s(.activeSpace, lang) : L10n.s(.newSpace, lang), tint: space.isLaunch ? Theme.teal : Theme.secondary)
                    }
                    Text(space.forms.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.secondary)
                    if let category = Taxonomy.category(space.categoryId) {
                        Text(category.name(lang)).font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
                Spacer()
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(on ? Theme.teal : Theme.secondary)
            }
            .cardStyle()
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var rulesStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L10n.s(.rulesTitle, lang)).font(.system(.title, design: .serif)).fontWeight(.semibold)
            Text(L10n.s(.rulesBody, lang))
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
            Toggle(L10n.s(.agreeRules, lang), isOn: $agreeRules)
            Toggle(L10n.s(.agreeNotAdvice, lang), isOn: $agreeDisclaimer)
            if !agreeRules || !agreeDisclaimer {
                Text(L10n.s(.acceptToContinue, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            }
        }
    }

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.s(.profileStepTitle, lang)).font(.system(.title, design: .serif)).fontWeight(.semibold)
            Text(L10n.s(.profileStepHelp, lang)).foregroundStyle(Theme.secondary)
            CaseProfileEditor(draft: $draft)
        }
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if step > 0 {
                PrimaryButton(title: primaryTitle, enabled: (step == 4 || canContinue) && !working) { advance() }
                if step == 4 {
                    SecondaryButton(title: L10n.s(.skipForNow, lang)) { finish(includeProfile: false) }
                }
                Button(L10n.s(.back, lang)) { step = max(0, step - 1) }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(Theme.paper)
    }

    private var primaryTitle: String {
        if step == 4 { return L10n.s(.saveProfile, lang) }
        if step == 3 { return L10n.s(.continueAction, lang) }
        return L10n.s(.next, lang)
    }

    private var canContinue: Bool {
        switch step {
        case 1: return usernameIssue == nil && !username.trimmingCharacters(in: .whitespaces).isEmpty
        case 2: return !selected.isEmpty
        case 3: return agreeRules && agreeDisclaimer
        case 4: return !draft.currentStage.isEmpty
        default: return true
        }
    }

    private var usernameIssue: UsernameIssue? {
        let taken = Set(members.map { $0.username.lowercased() })
        return UsernameRules.issue(for: username, taken: taken)
    }

    private func usernameMessage(_ issue: UsernameIssue) -> String {
        switch issue {
        case .tooShort: return L10n.s(.usernameTooShort, lang)
        case .tooLong: return L10n.s(.usernameTooLong, lang)
        case .invalidCharacters: return L10n.s(.usernameChars, lang)
        case .reserved: return L10n.s(.usernameReserved, lang)
        case .taken: return L10n.s(.usernameTaken, lang)
        }
    }

    private func advance() {
        if step == 2 {
            draft = ProfileDraft.fresh(spaceID: selected[0])
        }
        if step == 4 {
            guard !draft.currentStage.isEmpty else {
                model.toast = L10n.s(.chooseStage, lang)
                return
            }
            finish(includeProfile: true)
            return
        }
        if step == 3 {
            step = 4
            return
        }
        step += 1
    }

    private func skipSetup() {
        if username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || usernameIssue != nil {
            let taken = Set(members.map { $0.username.lowercased() })
            var guest = "member_" + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(6)).lowercased()
            while UsernameRules.issue(for: guest, taken: taken) != nil {
                guest = "member_" + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(6)).lowercased()
            }
            username = guest
        }
        if selected.isEmpty { selected = ["i-485"] }
        finish(includeProfile: false)
    }

    private func finish(includeProfile: Bool) {
        working = true
        do {
            _ = try CommunityActions.createAccount(
                username: username,
                locale: lang,
                appleUserID: appleID,
                email: email,
                spaceIDs: selected,
                profile: includeProfile ? draft : nil,
                database: context
            )
            model.screenEpoch += 1
            model.selectedTab = .home
            Haptics.tap()
        } catch {
            model.toast = L10n.s(.couldNotSignIn, lang)
            working = false
        }
    }

    private func enterDemo() {
        working = true
        do {
            try Bootstrap.enterDemo(context, language: lang)
            model.screenEpoch += 1
            model.selectedTab = .home
        } catch {
            model.toast = L10n.s(.couldNotSignIn, lang)
            working = false
        }
    }
}
