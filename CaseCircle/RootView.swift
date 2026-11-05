import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct RootView: View {
    @Environment(Database.self) private var context
    @Environment(AppModel.self) private var model
    @State private var ready = false
    @State private var bootError: String?

    private var signedIn: Bool { context.members.contains { $0.isCurrentUser } }

    var body: some View {
        let _ = context.revision
        let _ = model.screenEpoch
        Group {
            if let bootError {
                VStack(spacing: 12) {
                    Text(bootError).font(.footnote)
                    Button(L10n.s(.retry, model.language)) { self.bootError = nil; ready = false }
                }
                .padding()
            } else if !ready {
                VStack(spacing: 16) {
                    MarkView(size: 56)
                    Text(L10n.s(.appName, model.language)).font(.system(.title, design: .serif)).fontWeight(.semibold)
                    Text(L10n.s(.notAffiliated, model.language)).font(.footnote).foregroundStyle(Theme.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.paper)
            } else if signedIn {
                MainShell()
            } else {
                OnboardingView()
            }
        }
        .environment(\.appLanguage, model.language)
        .tint(Theme.teal)
        .foregroundStyle(Theme.ink)
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                Text(toast)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.paper)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.ink)
                    .clipShape(Capsule())
                    .padding(.bottom, 28)
                    .accessibilityAddTraits(.isStaticText)
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(2.4))
                        if model.toast == toast { model.toast = nil }
                    }
            }
        }
        .task {
            guard !ready else { return }
            do {
                if CommandLine.arguments.contains("-demo") {
                    try Bootstrap.enterDemo(context, language: "en")
                } else {
                    try Bootstrap.run(context)
                }
                ready = true
            } catch {
                bootError = error.localizedDescription
            }
        }
    }
}

struct MainShell: View {
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang

    var body: some View {
        ZStack {
            tab(.home) { HomeView() }
            tab(.spaces) { SpacesView() }
            tab(.ask) { AskView() }
            tab(.timelines) { TimelinesView() }
            tab(.you) { ProfileView() }
        }
        .background(Theme.paper)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            CaseTabBar()
        }
    }

    private func tab<Content: View>(_ tab: AppTab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(model.selectedTab == tab ? 1 : 0)
            .allowsHitTesting(model.selectedTab == tab)
            .accessibilityHidden(model.selectedTab != tab)
            .zIndex(model.selectedTab == tab ? 1 : 0)
    }
}

struct CaseTabBar: View {
    @Environment(AppModel.self) private var model
    @Environment(\.appLanguage) private var lang

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            item(.home, "house", "house.fill", .tabHome)
            item(.spaces, "square.grid.2x2", "square.grid.2x2.fill", .tabSpaces)
            askButton
            item(.timelines, "chart.xyaxis.line", "chart.bar.fill", .tabTimelines)
            item(.you, "person.crop.circle", "person.crop.circle.fill", .tabYou)
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(Theme.paper)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func item(_ tab: AppTab, _ symbol: String, _ selectedSymbol: String, _ key: LKey) -> some View {
        let selected = model.selectedTab == tab
        return Button {
            model.selectedTab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: selected ? selectedSymbol : symbol)
                    .font(.body)
                    .frame(height: 22)
                Text(L10n.s(key, lang))
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(selected ? Theme.teal : Theme.secondary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.s(key, lang))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var askButton: some View {
        let selected = model.selectedTab == .ask
        return Button {
            Haptics.tap()
            model.selectedTab = .ask
        } label: {
            VStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.body.weight(.bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .background(Theme.teal)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(selected ? Theme.ink : Color.clear, lineWidth: 2))
                Text(L10n.s(.tabAsk, lang))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(selected ? Theme.teal : Theme.secondary)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.s(.tabAsk, lang))
        .accessibilityIdentifier("tab.ask")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
