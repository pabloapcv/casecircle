import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum Theme {
    static let paper = adaptive(light: (0.969, 0.953, 0.933), dark: (0.082, 0.075, 0.067))
    static let card = adaptive(light: (1, 1, 1), dark: (0.149, 0.137, 0.122))
    static let ink = adaptive(light: (0.110, 0.098, 0.090), dark: (0.957, 0.937, 0.910))
    static let secondary = adaptive(light: (0.420, 0.392, 0.361), dark: (0.733, 0.702, 0.663))
    static let teal = adaptive(light: (0.059, 0.431, 0.420), dark: (0.365, 0.745, 0.722))
    static let tealSoft = adaptive(light: (0.906, 0.949, 0.945), dark: (0.110, 0.188, 0.180))
    static let amber = Color(red: 0.910, green: 0.620, blue: 0.180)
    static let coral = adaptive(light: (0.710, 0.275, 0.200), dark: (0.890, 0.510, 0.420))
    static let line = adaptive(light: (0.878, 0.855, 0.824), dark: (0.239, 0.216, 0.192))
    static let good = adaptive(light: (0.165, 0.455, 0.290), dark: (0.478, 0.760, 0.565))

    static func kind(_ type: String) -> Color {
        switch type {
        case PostKind.question.rawValue: return teal
        case PostKind.timeline.rawValue: return amber
        case PostKind.interview.rawValue: return Color(red: 0.33, green: 0.38, blue: 0.66)
        case PostKind.tip.rawValue: return good
        default: return secondary
        }
    }

    private static func adaptive(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
        })
        #elseif canImport(AppKit)
        return Color(nsColor: NSColor(name: nil) { appearance in
            let darkMode = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let rgb = darkMode ? dark : light
            return NSColor(srgbRed: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
        })
        #else
        return Color(red: light.0, green: light.1, blue: light.2)
        #endif
    }
}

enum Haptics {
    static func tap() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
    }
}

extension View {
    @ViewBuilder func navInline() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    @ViewBuilder func dismissKeyboardOnScroll() -> some View {
        #if os(iOS)
        self.scrollDismissesKeyboard(.interactively)
        #else
        self
        #endif
    }

    @ViewBuilder func noAutoCap() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        self
        #endif
    }

    func cardStyle() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}
