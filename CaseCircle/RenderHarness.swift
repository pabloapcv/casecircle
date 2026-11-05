#if os(macOS)
import AppKit
import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum RenderHarness {
    static func run() -> Never {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        DispatchQueue.main.async {
            execute()
            exit(0)
        }
        app.run()
        exit(0)
    }

    @MainActor
    private static func execute() {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "-render"), index + 1 < arguments.count else { return }
        let directory = URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        UserDefaults.standard.set(false, forKey: AppModel.sampleNoteKey)

        let database = Database()
        let model = AppModel()
        model.language = "en"
        var lines: [String] = []

        shot(OnboardingView(), model: model, database: database, name: "01-onboarding-en", directory: directory)
        model.language = "es"
        shot(OnboardingView(), model: model, database: database, name: "02-onboarding-es", directory: directory)
        model.language = "en"

        do {
            try Bootstrap.enterDemo(database, language: "en")
            lines.append("demo-user=\(database.members.first { $0.isCurrentUser }?.username ?? "missing")")
            lines.append("demo-role=\(database.members.first { $0.isCurrentUser }?.role ?? "missing")")
        } catch {
            lines.append("demo-failed=\(error)")
        }

        let live = database.posts.filter { $0.status == "live" }
        let held = database.posts.filter { $0.status == "held" }
        let samplePosts = live.filter { $0.author?.isSample == true }
        lines.append("live=\(live.count) held=\(held.count) sample-live=\(samplePosts.count)")

        let snapshots = database.allProfiles.map { $0.snapshot() }
        let real = BenchmarkEngine.cells(from: snapshots, includeSample: false).filter(\.isPublishable)
        let examples = BenchmarkEngine.cells(from: snapshots, includeSample: true).filter(\.isPublishable)
        lines.append("real-benchmarks=\(real.count) example-benchmarks=\(examples.count)")

        if let me = database.members.first(where: { $0.isCurrentUser }) {
            let draft = NewPostDraft(
                spaceIDs: ["i-751"],
                type: PostKind.question.rawValue,
                title: "Where is my receipt",
                body: "My receipt number is IOE1234567890 and I am waiting on biometrics.",
                stage: "",
                officeID: "",
                formCode: "",
                filedMonth: nil,
                images: []
            )
            do {
                _ = try CommunityActions.publish(draft, author: me, database: database)
                lines.append("receipt-post=unexpectedly-allowed")
            } catch let error as ActionError {
                lines.append("receipt-post=blocked \(error)")
            } catch {
                lines.append("receipt-post=error \(error)")
            }
        }

        shot(HomeView(), model: model, database: database, name: "03-home-en", directory: directory)
        shot(MainShell(), model: model, database: database, name: "12-shell-light", directory: directory, appearance: .aqua)
        shot(SpacesView(), model: model, database: database, name: "04-spaces", directory: directory)
        shot(SpaceDetailView(spaceID: "n-400"), model: model, database: database, name: "05-space-n400", directory: directory)
        shot(TimelinesView(), model: model, database: database, name: "06-timelines", directory: directory)
        shot(PrepareView(), model: model, database: database, name: "14-prepare", directory: directory)
        shot(InterviewPrepView(spaceID: "i-485"), model: model, database: database, name: "15-interview", directory: directory)
        shot(OnboardingView(), model: model, database: database, name: "16-onboarding-pains", directory: directory)
        shot(HomeView(), model: model, database: database, name: "17-home-dark", directory: directory, appearance: .darkAqua)
        shot(PrepareView(), model: model, database: database, name: "18-prepare-dark", directory: directory, appearance: .darkAqua)
        shot(AskView(), model: model, database: database, name: "07-ask", directory: directory)
        shot(ProfileView(), model: model, database: database, name: "08-profile", directory: directory)
        if let post = live.first {
            shot(PostDetailView(postID: post.id), model: model, database: database, name: "09-post", directory: directory)
        }
        shot(ModQueueView(), model: model, database: database, name: "10-mod-queue", directory: directory)
        shot(OnboardingView(startingStep: 4), model: model, database: database, name: "13-profile-step", directory: directory, appearance: .aqua)
        probeSignIn(directory: directory, lines: &lines)
        model.language = "es"
        shot(HomeView(), model: model, database: database, name: "11-home-es", directory: directory)

        let report = lines.joined(separator: "\n") + "\n"
        try? report.write(to: directory.appendingPathComponent("report.txt"), atomically: true, encoding: .utf8)
        fputs(report, stderr)
    }

    @MainActor
    private static func shot<V: View>(
        _ view: V,
        model: AppModel,
        database: Database,
        name: String,
        directory: URL,
        appearance: NSAppearance.Name? = nil
    ) {
        let content = view
            .environment(model)
            .environment(database)
            .environment(\.appLanguage, model.language)
            .preferredColorScheme(appearance == .aqua ? .light : (appearance == .darkAqua ? .dark : nil))
            .frame(width: 390, height: 844)
            .background(Theme.paper)
        let host = NSHostingView(rootView: content)
        host.frame = NSRect(x: 0, y: 0, width: 390, height: 844)
        let window = NSWindow(
            contentRect: host.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.contentView = host
        if let appearance {
            window.appearance = NSAppearance(named: appearance)
        }
        window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        window.orderFrontRegardless()
        host.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
        host.cacheDisplay(in: host.bounds, to: rep)
        guard let data = rep.representation(using: .png, properties: [:]) else { return }
        try? data.write(to: directory.appendingPathComponent("\(name).png"))
        window.orderOut(nil)
    }

    @MainActor
    private static func probeSignIn(directory: URL, lines: inout [String]) {
        let database = Database()
        let model = AppModel()
        model.language = "en"
        let host = NSHostingView(rootView:
            RootView()
                .environment(model)
                .environment(database)
                .frame(width: 390, height: 844)
        )
        host.frame = NSRect(x: 0, y: 0, width: 390, height: 844)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        window.orderFrontRegardless()
        RunLoop.current.run(until: Date().addingTimeInterval(1.2))
        write(host, name: "14-before-save", directory: directory)
        var profile = ProfileDraft.fresh(spaceID: "i-751")
        profile.currentStage = Stage.biometrics.rawValue
        do {
            _ = try CommunityActions.createAccount(
                username: "river_wait",
                locale: "en",
                appleUserID: "",
                email: "river@example.com",
                spaceIDs: ["i-751"],
                profile: profile,
                database: database
            )
            model.screenEpoch += 1
            lines.append("probe-save=ok")
        } catch {
            lines.append("probe-save=failed \(error)")
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        write(host, name: "15-after-save", directory: directory)
        window.orderOut(nil)
    }

    @MainActor
    private static func write(_ host: NSView, name: String, directory: URL) {
        host.layoutSubtreeIfNeeded()
        guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
        host.cacheDisplay(in: host.bounds, to: rep)
        guard let data = rep.representation(using: .png, properties: [:]) else { return }
        try? data.write(to: directory.appendingPathComponent("\(name).png"))
    }
}
#endif
