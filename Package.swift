// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CaseCircle",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CaseCircleMac", targets: ["CaseCircleMac"])
    ],
    targets: [
        .target(
            name: "CaseCircleCore",
            path: "CaseCircle/Core",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .executableTarget(
            name: "CaseCircleMac",
            dependencies: ["CaseCircleCore"],
            path: "CaseCircle",
            exclude: [
                "Core",
                "Assets.xcassets",
                "PrivacyInfo.xcprivacy",
                "CaseCircle.entitlements",
                "Info.plist"
            ],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .executableTarget(
            name: "CaseCircleChecks",
            dependencies: ["CaseCircleCore"],
            path: "Checks",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
