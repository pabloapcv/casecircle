import XCTest
@testable import CaseCircleCore

final class SafetyFilterTests: XCTestCase {
    func testOrdinaryTimelineIsAllowed() {
        let text = "My biometrics were reused at VSC and I have been waiting 14 months."
        XCTAssertEqual(SafetyFilter.evaluate(text), .allow)
    }

    func testPublicUSCISPhoneIsAllowed() {
        let text = "The USCIS contact center phone is 800-375-5283."
        XCTAssertEqual(SafetyFilter.evaluate(text), .allow)
    }

    func testPassportAppointmentIsAllowed() {
        XCTAssertEqual(SafetyFilter.evaluate("My passport appointment is next week."), .allow)
    }

    func testReceiptNumbersAreBlocked() {
        XCTAssertEqual(SafetyFilter.evaluate("My receipt is IOE1234567890"), .block(.receiptNumber))
        XCTAssertEqual(SafetyFilter.evaluate("receipt MSC2190123456"), .block(.receiptNumber))
        XCTAssertEqual(SafetyFilter.evaluate("IOE 1234567890"), .block(.receiptNumber))
        XCTAssertEqual(SafetyFilter.evaluate("EAC-12-345-67890"), .block(.receiptNumber))
    }

    func testANumbersAreBlocked() {
        XCTAssertEqual(SafetyFilter.evaluate("A-number A123456789"), .block(.aNumber))
        XCTAssertEqual(SafetyFilter.evaluate("alien number 012345678"), .block(.aNumber))
        XCTAssertEqual(SafetyFilter.evaluate("A012345678"), .block(.aNumber))
    }

    func testSSNAndPassportAreBlocked() {
        XCTAssertEqual(SafetyFilter.evaluate("SSN 123-45-6789"), .block(.ssn))
        XCTAssertEqual(SafetyFilter.evaluate("passport number X1234567"), .block(.passport))
        XCTAssertEqual(SafetyFilter.evaluate("pasaporte AB123456"), .block(.passport))
    }

    func testScamIsHeld() {
        let text = "Pay to expedite your case. WhatsApp me and gift cards are fine. Guaranteed approval."
        XCTAssertEqual(SafetyFilter.evaluate(text), .hold(.scam))
        XCTAssertEqual(SafetyFilter.evaluate("Please avoid notarios"), .hold(.scam))
    }

    func testAbusiveLanguageIsBlocked() {
        XCTAssertEqual(SafetyFilter.evaluate("you are a bitch"), .block(.abusiveLanguage))
        XCTAssertEqual(SafetyFilter.evaluate("this class was long"), .allow)
    }

    func testDocumentMarkers() {
        XCTAssertTrue(DocumentText.looksLikeDocument("USCIS I-797 Notice of Action"))
        XCTAssertFalse(DocumentText.looksLikeDocument("I waited at the field office"))
    }
}

final class UsernameRulesTests: XCTestCase {
    func testValidNames() {
        XCTAssertNil(UsernameRules.issue(for: "quiet_filing", taken: []))
        XCTAssertNil(UsernameRules.issue(for: "justice_path", taken: []))
    }

    func testRejections() {
        XCTAssertEqual(UsernameRules.issue(for: "ab", taken: []), .tooShort)
        XCTAssertEqual(UsernameRules.issue(for: "has space", taken: []), .invalidCharacters)
        XCTAssertEqual(UsernameRules.issue(for: "uscis_fan", taken: []), .reserved)
        XCTAssertEqual(UsernameRules.issue(for: "official", taken: []), .reserved)
        XCTAssertEqual(UsernameRules.issue(for: "Quiet_Filing", taken: ["quiet_filing"]), .taken)
    }

    func testEmail() {
        XCTAssertTrue(EmailRules.isValid("ada@example.com"))
        XCTAssertFalse(EmailRules.isValid("ada"))
        XCTAssertFalse(EmailRules.isValid("ada@example"))
    }
}

final class SimilarAndStatsTests: XCTestCase {
    func testSimilarRanksTheMatchingStory() {
        let documents = [
            (id: "1", text: "I-751 Vermont biometrics waiting many months"),
            (id: "2", text: "N-400 civics interview in Boston")
        ]
        let hits = SimilarText.rank(query: "How long are I-751 biometrics at Vermont", documents: documents)
        XCTAssertEqual(hits.first?.id, "1")
    }

    func testMedianAndHiddenSamples() {
        XCTAssertEqual(StatsMath.median(Array(1...20)), 11)
        XCTAssertEqual(StatsMath.percentile(Array(1...20), 0.25), 6)
        let hidden = profiles(count: 19, sample: false)
        XCTAssertFalse(BenchmarkEngine.cells(from: hidden, includeSample: false)[0].isPublishable)
        let visible = profiles(count: 20, sample: false)
        let cell = BenchmarkEngine.cells(from: visible, includeSample: false)[0]
        XCTAssertTrue(cell.isPublishable)
        XCTAssertEqual(cell.median, 11)
        let samples = profiles(count: 20, sample: true)
        XCTAssertTrue(BenchmarkEngine.cells(from: samples, includeSample: false).isEmpty)
        XCTAssertEqual(BenchmarkEngine.cells(from: samples, includeSample: true).count, 1)
    }

    private func profiles(count: Int, sample: Bool) -> [ProfileSnapshot] {
        let start = BenchmarkEngine.calendar.date(from: DateComponents(year: 2024, month: 1, day: 1))!
        return (1...count).map { day in
            let end = BenchmarkEngine.calendar.date(byAdding: .day, value: day, to: start)!
            return ProfileSnapshot(
                spaceId: "i-751",
                officeId: "vsc",
                isSample: sample,
                stageDates: ["filed": start, "approved": end]
            )
        }
    }
}

final class TaxonomyTests: XCTestCase {
    func testTaxonomyMatchesTheProductOutline() {
        XCTAssertEqual(Taxonomy.spaces.count, 24)
        XCTAssertEqual(Taxonomy.categories.count, 10)
        XCTAssertEqual(Taxonomy.spaces.filter(\.isLaunch).map(\.id).sorted(), ["i-130", "i-131", "i-485", "i-751", "i-765", "n-400"])
        for space in Taxonomy.spaces {
            XCTAssertNotNil(Taxonomy.category(space.categoryId))
            XCTAssertFalse(space.forms.isEmpty)
        }
    }

    func testSearchFindsFormsInBothLanguages() {
        XCTAssertEqual(Taxonomy.searchSpaces("I-751").first?.id, "i-751")
        XCTAssertEqual(Taxonomy.searchSpaces("permiso de trabajo").first?.id, "i-765")
        XCTAssertEqual(Taxonomy.searchSpaces("ciudadania").first?.id, "n-400")
        XCTAssertEqual(Taxonomy.searchSpaces("ds-260").first?.id, "consular")
        XCTAssertEqual(Taxonomy.searchSpaces("h-1b").first?.id, "i-129")
    }
}
