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

final class FolderScoringTests: XCTestCase {
    func testEmptyFolderScoresZero() {
        let items = FormChecklists.items(for: "i-485")
        XCTAssertFalse(items.isEmpty)
        XCTAssertEqual(FormChecklists.score(items: items, marks: [:]), 0)
    }

    func testReadyMarksRaiseScore() {
        let items = FormChecklists.items(for: "i-485")
        var marks: [String: String] = [:]
        marks[items[0].id] = FolderMark.ready.rawValue
        let score = FormChecklists.score(items: items, marks: marks)
        XCTAssertGreaterThan(score, 0)
        XCTAssertLessThan(score, 100)
    }

    func testCompleteFolderScoresOneHundred() {
        let items = FormChecklists.items(for: "n-400")
        let marks = Dictionary(uniqueKeysWithValues: items.map { ($0.id, FolderMark.ready.rawValue) })
        XCTAssertEqual(FormChecklists.score(items: items, marks: marks), 100)
    }

    func testFeaturedFormsHaveChecklists() {
        for spaceId in FormChecklists.featuredSpaceIDs {
            XCTAssertGreaterThan(FormChecklists.items(for: spaceId).count, 3, spaceId)
        }
        XCTAssertEqual(FormChecklists.featuredSpaceIDs, ["i-485", "i-765", "n-400", "i-130"])
        XCTAssertEqual(StatsMath.minimumSample, 20)
    }
}

final class RFEParserTests: XCTestCase {
    func testParsesCommonEvidence() {
        let items = RFEParser.parse("Please send your birth certificate, marriage certificate, and a copy of your passport. Include tax transcripts.")
        XCTAssertNotNil(items)
        let labels = items!.map(\.en).joined(separator: " ").lowercased()
        XCTAssertTrue(labels.contains("birth certificate"))
        XCTAssertTrue(labels.contains("marriage certificate"))
        XCTAssertTrue(labels.contains("passport"))
        XCTAssertTrue(labels.contains("tax"))
    }

    func testBlocksIdentifiers() {
        let items = RFEParser.parse("Respond with receipt IOE1234567890 and your birth certificate.")
        XCTAssertEqual(items?.count, 1)
        XCTAssertTrue(items?.first?.en.lowercased().contains("identifier") == true)
    }

    func testShortTextReturnsNil() {
        XCTAssertNil(RFEParser.parse("too short"))
    }
}

final class RiskAndWaitTests: XCTestCase {
    func testI693ExpiryFlag() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = calendar.date(from: DateComponents(year: 2026, month: 11, day: 1))!
        let filed = calendar.date(from: DateComponents(year: 2024, month: 8, day: 1))!
        let flags = RiskFlags.flags(spaceId: "i-485", stage: "filed", filed: filed, marks: [:], now: now, calendar: calendar)
        XCTAssertTrue(flags.contains { $0.kind == "i693" && $0.level == "error" })
    }

    func testTranslationAndPassportFlags() {
        let flags = RiskFlags.flags(
            spaceId: "i-485",
            stage: "biometrics",
            filed: nil,
            marks: [
                "i485-passport": FolderMark.need.rawValue,
                "i485-translate": FolderMark.need.rawValue
            ]
        )
        XCTAssertTrue(flags.contains { $0.kind == "passport" })
        XCTAssertTrue(flags.contains { $0.kind == "translation" })
    }

    func testWaitPercentileHiddenBelowTwenty() {
        let now = Date()
        let filed = now
        let mine = WaitInput(spaceId: "i-485", officeId: "nyc", filedMonth: filed, isSample: false)
        let hidden = (0..<19).map { _ in mine }
        let hiddenResult = WaitEngine.comparison(mine: mine, cohort: hidden, now: now)
        XCTAssertFalse(hiddenResult.isPublishable)
        XCTAssertNil(hiddenResult.percentile)
        let visible = (0..<20).map { _ in mine }
        let visibleResult = WaitEngine.comparison(mine: mine, cohort: visible, now: now)
        XCTAssertTrue(visibleResult.isPublishable)
        XCTAssertNotNil(visibleResult.percentile)
    }

    func testSamplesDoNotCountTowardThreshold() {
        let now = Date()
        let mine = WaitInput(spaceId: "i-485", officeId: "nyc", filedMonth: now, isSample: false)
        let samples = (0..<20).map { _ in WaitInput(spaceId: "i-485", officeId: "nyc", filedMonth: now, isSample: true) }
        let result = WaitEngine.comparison(mine: mine, cohort: samples + [mine], now: now)
        XCTAssertFalse(result.isPublishable)
    }

    func testStatusDecoderAndEvidenceScore() {
        XCTAssertNotNil(StatusDecoder.explain("rfe"))
        XCTAssertNil(StatusDecoder.explain("not-a-stage"))
        XCTAssertEqual(InterviewGuide.evidenceScore(checked: []), 0)
        XCTAssertEqual(InterviewGuide.evidenceScore(checked: Set(InterviewGuide.marriageEvidence.map(\.id))), 100)
    }
}
