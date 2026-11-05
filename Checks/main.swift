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
checkEqual(L10n.s(.skipSetup, "en"), "Skip setup", "skip setup")
checkEqual(L10n.s(.painWaitTitle, "es"), "¿Mi espera es normal?", "pain wait es")
checkEqual(FormChecklists.featuredSpaceIDs, ["i-485", "i-765", "n-400", "i-130"], "featured folders")
checkEqual(StatsMath.minimumSample, 20, "privacy threshold")
check(!L10n.s(.waitPrivacyNote, "en").isEmpty, "wait privacy note")

let i485Items = FormChecklists.items(for: "i-485")
check(!i485Items.isEmpty, "i-485 checklist")
checkEqual(FormChecklists.score(items: i485Items, marks: [:]), 0, "empty score")
var oneReady: [String: String] = [:]
oneReady[i485Items[0].id] = FolderMark.ready.rawValue
check(FormChecklists.score(items: i485Items, marks: oneReady) > 0, "partial score")
let allReady = Dictionary(uniqueKeysWithValues: FormChecklists.items(for: "n-400").map { ($0.id, FolderMark.ready.rawValue) })
checkEqual(FormChecklists.score(items: FormChecklists.items(for: "n-400"), marks: allReady), 100, "complete score")

let parsed = RFEParser.parse("Please send your birth certificate, marriage certificate, and a copy of your passport. Include tax transcripts.")
check(parsed != nil && parsed!.count >= 4, "rfe parse")
let rfeLabels = parsed!.map(\.en).joined(separator: " ").lowercased()
check(rfeLabels.contains("birth certificate") && rfeLabels.contains("passport"), "rfe labels")
let blockedRFE = RFEParser.parse("Respond with receipt IOE1234567890 and your birth certificate.")
checkEqual(blockedRFE?.count ?? 0, 1, "rfe pii")
check(RFEParser.parse("too short") == nil, "rfe short")

var riskCalendar = Calendar(identifier: .gregorian)
riskCalendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
let riskNow = riskCalendar.date(from: DateComponents(year: 2026, month: 11, day: 1))!
let riskFiled = riskCalendar.date(from: DateComponents(year: 2024, month: 8, day: 1))!
let i693Flags = RiskFlags.flags(spaceId: "i-485", stage: "filed", filed: riskFiled, marks: [:], now: riskNow, calendar: riskCalendar)
check(i693Flags.contains { $0.kind == "i693" && $0.level == "error" }, "i693 expired")
let mixFlags = RiskFlags.flags(spaceId: "i-485", stage: "biometrics", filed: nil, marks: [
    "i485-passport": FolderMark.need.rawValue,
    "i485-translate": FolderMark.need.rawValue
])
check(mixFlags.contains { $0.kind == "passport" }, "passport flag")
check(mixFlags.contains { $0.kind == "translation" }, "translation flag")

let waitMine = WaitInput(spaceId: "i-485", officeId: "nyc", filedMonth: Date(), isSample: false)
let waitHidden = WaitEngine.comparison(mine: waitMine, cohort: Array(repeating: waitMine, count: 19))
check(!waitHidden.isPublishable && waitHidden.percentile == nil, "wait n=19 hidden")
let waitVisible = WaitEngine.comparison(mine: waitMine, cohort: Array(repeating: waitMine, count: 20))
check(waitVisible.isPublishable && waitVisible.percentile != nil, "wait n=20 visible")
let waitSamples = (0..<20).map { _ in WaitInput(spaceId: "i-485", officeId: "nyc", filedMonth: Date(), isSample: true) }
let waitSampleResult = WaitEngine.comparison(mine: waitMine, cohort: waitSamples + [waitMine])
check(!waitSampleResult.isPublishable, "samples excluded from wait")
check(StatusDecoder.explain("rfe") != nil, "status rfe")
check(StatusDecoder.explain("missing") == nil, "status missing")
checkEqual(InterviewGuide.evidenceScore(checked: []), 0, "evidence empty")
checkEqual(InterviewGuide.evidenceScore(checked: Set(InterviewGuide.marriageEvidence.map(\.id))), 100, "evidence full")

if failures == 0 {
    print("All checks passed")
} else {
    fputs("\(failures) checks failed\n", stderr)
    exit(1)
}
