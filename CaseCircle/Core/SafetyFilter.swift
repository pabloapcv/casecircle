import Foundation

public enum SafetyBlock: String, Equatable {
    case receiptNumber
    case aNumber
    case ssn
    case passport
    case abusiveLanguage
}

public enum SafetyHold: String, Equatable {
    case scam
}

public enum SafetyVerdict: Equatable {
    case allow
    case block(SafetyBlock)
    case hold(SafetyHold)
}

public enum SafetyFilter {
    public static func evaluate(_ text: String) -> SafetyVerdict {
        let folded = text.folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )

        if matchesReceipt(in: text) || matchesReceipt(in: folded) {
            return .block(.receiptNumber)
        }
        if matchesANumber(in: text) || matchesANumber(in: folded) {
            return .block(.aNumber)
        }
        if matchesSSN(in: text) || matchesSSN(in: folded) {
            return .block(.ssn)
        }
        if matchesPassport(in: text) || matchesPassport(in: folded) {
            return .block(.passport)
        }
        if matchesAbuse(in: folded) {
            return .block(.abusiveLanguage)
        }
        if scamPhrases.contains(where: { folded.contains($0) }) {
            return .hold(.scam)
        }
        return .allow
    }

    private static func matchesReceipt(in text: String) -> Bool {
        matches("(?i)\\b[a-z]{3}(?:[-\\s]*\\d){10}\\b", in: text)
    }

    private static func matchesANumber(in text: String) -> Bool {
        matches("(?i)\\b(?:a[-\\s]?number|alien\\s+number|a#)\\b[-\\s:]*\\d{7,9}\\b", in: text)
            || matches("\\bA[-\\s]?\\d{8,9}\\b", in: text)
    }

    private static func matchesSSN(in text: String) -> Bool {
        matches("\\b\\d{3}[-\\s]\\d{2}[-\\s]\\d{4}\\b", in: text)
            || matches("(?i)\\b(?:ssn|social\\s+security)\\b(?:\\s*(?:number|no\\.?|#))?\\s*[:#]?\\s*\\d{3}-?\\d{2}-?\\d{4}\\b", in: text)
    }

    private static func matchesPassport(in text: String) -> Bool {
        matches("(?i)\\b(?:passport|pasaporte)\\b(?:\\s*(?:number|no\\.?|num(?:ero)?|#))?\\s*[:#-]?\\s*(?=[a-z0-9]*\\d)[a-z0-9]{6,12}\\b", in: text)
    }

    private static func matches(_ pattern: String, in text: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, range: range) != nil
    }

    private static func matchesAbuse(in text: String) -> Bool {
        if text.contains("kill yourself") { return true }
        for word in abusiveWords {
            let pattern = "\\b\(NSRegularExpression.escapedPattern(for: word))\\b"
            if text.range(of: pattern, options: .regularExpression) != nil {
                return true
            }
        }
        return false
    }

    private static let scamPhrases = [
        "pay to expedite",
        "pay me to expedite",
        "expedite fee",
        "gift card",
        "whatsapp me",
        "message me on whatsapp",
        "text me on whatsapp",
        "wa.me",
        "notario",
        "guaranteed approval",
        "western union",
        "moneygram",
        "zelle me",
        "cash app me",
        "venmo me",
        "wire transfer",
        "i prepare forms for",
        "we prepare your forms for",
        "form preparation for $",
        "dm me for a fee",
        "send bitcoin",
        "crypto payment"
    ]

    /// Blocklist for App Store user-generated-content filtering. Matched on word boundaries.
    private static let abusiveWords = [
        "fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "asshole",
        "cunt", "nigger", "nigga", "faggot", "retard", "slut", "whore",
        "puta", "puto", "mierda", "cabron", "maricon", "pendejo", "gilipollas", "kys"
    ]
}

public enum DocumentText {
    public static func looksLikeDocument(_ text: String) -> Bool {
        let folded = text.folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        let markers = [
            "notice of action",
            "i-797",
            "permanent resident",
            "employment authorization",
            "social security administration",
            "certificate of naturalization"
        ]
        return markers.contains(where: { folded.contains($0) })
    }
}
