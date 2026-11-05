import Foundation

public enum SimilarText {
    public static func tokens(_ text: String) -> Set<String> {
        let folded = text.folding(
            options: [.diacriticInsensitive, .caseInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        let parts = folded.split { !$0.isLetter && !$0.isNumber }
        return Set(parts.map(String.init).filter { $0.count >= 3 && !stopWords.contains($0) })
    }

    public static func rank(
        query: String,
        documents: [(id: String, text: String)],
        limit: Int = 3
    ) -> [(id: String, score: Int)] {
        let queryTokens = tokens(query)
        guard !queryTokens.isEmpty else { return [] }
        let ranked = documents.compactMap { document -> (id: String, score: Int)? in
            let score = tokens(document.text).intersection(queryTokens).count
            guard score >= 2 else { return nil }
            return (document.id, score)
        }
        return ranked
            .sorted { lhs, rhs in
                if lhs.score != rhs.score { return lhs.score > rhs.score }
                return lhs.id < rhs.id
            }
            .prefix(limit)
            .map { $0 }
    }

    private static let stopWords: Set<String> = [
        "the", "and", "for", "you", "your", "this", "that", "with", "have", "has",
        "was", "are", "but", "not", "just", "from", "what", "when", "how", "who",
        "any", "can", "about", "after", "before", "they", "them", "his", "her",
        "she", "him", "our", "out", "get", "got", "did", "does", "into", "over",
        "under", "than", "then", "too", "very", "also", "porque", "para", "como",
        "que", "los", "las", "una", "uno", "con", "por", "del", "esta", "este",
        "eso", "esa", "mis", "sus", "hay", "son", "fue", "mas", "pero", "una",
        "people", "someone", "anyone", "here", "there", "been", "were", "will"
    ]
}
