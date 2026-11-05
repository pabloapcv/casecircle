import CaseCircleCore
import Foundation

var failures = 0

func check(_ condition: Bool, _ message: String) {
    if condition { return }
    failures += 1
    fputs("FAIL \(message)\n", stderr)
}

func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String) {
    check(actual == expected, "\(message) — got \(actual), expected \(expected)")
}

checkEqual(SafetyFilter.evaluate("My biometrics were reused at VSC and I have been waiting 14 months."), .allow, "ordinary")
checkEqual(SafetyFilter.evaluate("The USCIS contact center phone is 800-375-5283."), .allow, "phone")
checkEqual(SafetyFilter.evaluate("My passport appointment is next week."), .allow, "passport appointment")
checkEqual(SafetyFilter.evaluate("My receipt is IOE1234567890"), .block(.receiptNumber), "receipt compact")
checkEqual(SafetyFilter.evaluate("receipt MSC2190123456"), .block(.receiptNumber), "receipt prefix")
checkEqual(SafetyFilter.evaluate("IOE 1234567890"), .block(.receiptNumber), "receipt spaced")
checkEqual(SafetyFilter.evaluate("EAC-12-345-67890"), .block(.receiptNumber), "receipt dashed")
checkEqual(SafetyFilter.evaluate("A-number A123456789"), .block(.aNumber), "a-number label")
checkEqual(SafetyFilter.evaluate("alien number 012345678"), .block(.aNumber), "alien phrase")
checkEqual(SafetyFilter.evaluate("A012345678"), .block(.aNumber), "compact a-number")
checkEqual(SafetyFilter.evaluate("SSN 123-45-6789"), .block(.ssn), "ssn")
checkEqual(SafetyFilter.evaluate("passport number X1234567"), .block(.passport), "passport")
checkEqual(SafetyFilter.evaluate("pasaporte AB123456"), .block(.passport), "pasaporte")
checkEqual(
    SafetyFilter.evaluate("Pay to expedite your case. WhatsApp me and gift cards are fine. Guaranteed approval."),
    .hold(.scam),
    "scam"
)
checkEqual(SafetyFilter.evaluate("Please avoid notarios"), .hold(.scam), "notario")
checkEqual(SafetyFilter.evaluate("you are a bitch"), .block(.abusiveLanguage), "abuse")
checkEqual(SafetyFilter.evaluate("this class was long"), .allow, "class")
check(DocumentText.looksLikeDocument("USCIS I-797 Notice of Action"), "document marker")
check(!DocumentText.looksLikeDocument("I waited at the field office"), "not a document")

check(UsernameRules.issue(for: "quiet_filing", taken: []) == nil, "username ok")
check(UsernameRules.issue(for: "justice_path", taken: []) == nil, "justice ok")
checkEqual(UsernameRules.issue(for: "ab", taken: []), .tooShort, "short")
checkEqual(UsernameRules.issue(for: "has space", taken: []), .invalidCharacters, "space")
checkEqual(UsernameRules.issue(for: "uscis_fan", taken: []), .reserved, "reserved")
checkEqual(UsernameRules.issue(for: "Quiet_Filing", taken: ["quiet_filing"]), .taken, "taken")
check(EmailRules.isValid("ada@example.com"), "email")
check(!EmailRules.isValid("ada@example"), "bad email")

let documents = [
    (id: "1", text: "I-751 Vermont biometrics waiting many months"),
    (id: "2", text: "N-400 civics interview in Boston")
]
checkEqual(SimilarText.rank(query: "How long are I-751 biometrics at Vermont", documents: documents).first?.id, "1", "similar")
checkEqual(StatsMath.median(Array(1...20)), 11, "median")
checkEqual(StatsMath.percentile(Array(1...20), 0.25), 6, "p25")

func profiles(count: Int, sample: Bool) -> [ProfileSnapshot] {
    let start = BenchmarkEngine.calendar.date(from: DateComponents(year: 2024, month: 1, day: 1))!
    return (1...count).map { day in
        let end = BenchmarkEngine.calendar.date(byAdding: .day, value: day, to: start)!
        return ProfileSnapshot(spaceId: "i-751", officeId: "vsc", isSample: sample, stageDates: ["filed": start, "approved": end])
    }
}

let hidden = BenchmarkEngine.cells(from: profiles(count: 19, sample: false), includeSample: false)
checkEqual(hidden.count, 1, "hidden count")
check(!hidden[0].isPublishable, "n=19 hidden")
let visible = BenchmarkEngine.cells(from: profiles(count: 20, sample: false), includeSample: false)
check(visible[0].isPublishable, "n=20 visible")
checkEqual(visible[0].median, 11, "benchmark median")
check(BenchmarkEngine.cells(from: profiles(count: 20, sample: true), includeSample: false).isEmpty, "samples excluded")
checkEqual(BenchmarkEngine.cells(from: profiles(count: 20, sample: true), includeSample: true).count, 1, "samples included")

checkEqual(Taxonomy.spaces.count, 24, "spaces")
checkEqual(Taxonomy.categories.count, 10, "categories")
checkEqual(Taxonomy.spaces.filter(\.isLaunch).map(\.id).sorted(), ["i-130", "i-131", "i-485", "i-751", "i-765", "n-400"], "launch")
check(Taxonomy.spaces.allSatisfy { Taxonomy.category($0.categoryId) != nil && !$0.forms.isEmpty }, "taxonomy links")
checkEqual(Taxonomy.searchSpaces("I-751").first?.id, "i-751", "search form")
checkEqual(Taxonomy.searchSpaces("permiso de trabajo").first?.id, "i-765", "search spanish")
checkEqual(Taxonomy.searchSpaces("ciudadania").first?.id, "n-400", "search folded")
checkEqual(Taxonomy.searchSpaces("ds-260").first?.id, "consular", "search consular")
checkEqual(Taxonomy.searchSpaces("h-1b").first?.id, "i-129", "search h1b")
checkEqual(L10n.s(.notAffiliated, "es"), "Sin afiliación con USCIS", "spanish chrome")
checkEqual(L10n.stage("biometrics", "es"), "Biometría", "spanish stage")

if failures == 0 {
    print("All checks passed")
} else {
    fputs("\(failures) checks failed\n", stderr)
    exit(1)
}
