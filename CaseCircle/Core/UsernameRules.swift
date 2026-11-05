import Foundation

public enum UsernameIssue: Equatable {
    case tooShort
    case tooLong
    case invalidCharacters
    case reserved
    case taken
}

public enum UsernameRules {
    public static func issue(for raw: String, taken: Set<String>) -> UsernameIssue? {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.count < 3 { return .tooShort }
        if name.count > 20 { return .tooLong }
        let allowed = name.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
        if !allowed || name.contains(" ") { return .invalidCharacters }
        let lower = name.lowercased()
        let parts = lower.split(separator: "_").map(String.init)
        if reserved.contains(lower) || parts.contains(where: { reserved.contains($0) }) {
            return .reserved
        }
        if taken.contains(lower) { return .taken }
        return nil
    }

    private static let reserved: Set<String> = [
        "uscis", "dhs", "ice", "cbp", "official", "admin", "moderator",
        "notario", "casecircle", "support", "deleted", "apple", "google"
    ]
}

public enum EmailRules {
    public static func isValid(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let parts = value.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count >= 1, parts[1].contains(".") else { return false }
        return !value.contains(" ") && value.count <= 80
    }
}
