import SwiftUI
#if os(macOS)
import AppKit
#endif

@main
enum CaseCircleMain {
    static func main() {
        #if os(macOS)
        if CommandLine.arguments.contains("-render") {
            RenderHarness.run()
        }
        NSApplication.shared.setActivationPolicy(.regular)
        #endif
        CaseCircleApp.main()
    }
}

struct CaseCircleApp: App {
    @State private var model = AppModel()
    @State private var database = Database()

    var body: some Scene {
        WindowGroup {
            #if os(iOS)
            RootView()
                .environment(model)
                .environment(database)
            #else
            ZStack {
                Color.black
                RootView()
                    .environment(model)
                    .environment(database)
                    .frame(width: 390, height: 844)
                    .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            }
            .frame(minWidth: 450, minHeight: 920)
            #endif
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 450, height: 940)
        #endif
    }
}
