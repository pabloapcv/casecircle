import Foundation

public struct ProfileSnapshot: Equatable {
    public var spaceId: String
    public var officeId: String
    public var isSample: Bool
    public var stageDates: [String: Date]

    public init(spaceId: String, officeId: String, isSample: Bool, stageDates: [String: Date]) {
        self.spaceId = spaceId
        self.officeId = officeId
        self.isSample = isSample
        self.stageDates = stageDates
    }
}

public struct BenchmarkCell: Identifiable, Equatable {
    public var spaceId: String
    public var officeId: String
    public var fromStage: String
    public var toStage: String
    public var days: [Int]

    public var id: String { "\(spaceId)|\(officeId)|\(fromStage)|\(toStage)" }
    public var count: Int { days.count }
    public var isPublishable: Bool { days.count >= StatsMath.minimumSample }
    public var median: Int { StatsMath.median(days) }
    public var p25: Int { StatsMath.percentile(days, 0.25) }
    public var p75: Int { StatsMath.percentile(days, 0.75) }

    public init(spaceId: String, officeId: String, fromStage: String, toStage: String, days: [Int]) {
        self.spaceId = spaceId
        self.officeId = officeId
        self.fromStage = fromStage
        self.toStage = toStage
        self.days = days
    }
}

public enum StatsMath {
    public static let minimumSample = 20

    public static func median(_ values: [Int]) -> Int {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return 0 }
        if sorted.count % 2 == 1 {
            return sorted[sorted.count / 2]
        }
        let left = Double(sorted[sorted.count / 2 - 1])
        let right = Double(sorted[sorted.count / 2])
        return Int(((left + right) / 2).rounded())
    }

    public static func percentile(_ values: [Int], _ p: Double) -> Int {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return 0 }
        let rank = Int((Double(sorted.count - 1) * p).rounded())
        return sorted[min(max(rank, 0), sorted.count - 1)]
    }
}

public enum BenchmarkEngine {
    public static let pairs: [(String, String)] = [
        ("filed", "biometrics"),
        ("biometrics", "rfe"),
        ("biometrics", "interview_scheduled"),
        ("interview_scheduled", "interview_done"),
        ("interview_done", "approved"),
        ("filed", "approved"),
        ("approved", "oath"),
        ("filed", "oath")
    ]

    public static func cells(from profiles: [ProfileSnapshot], includeSample: Bool) -> [BenchmarkCell] {
        let source = profiles.filter { includeSample || !$0.isSample }
        var buckets: [String: [Int]] = [:]
        var meta: [String: (String, String, String, String)] = [:]
        for profile in source {
            for pair in pairs {
                guard
                    let start = profile.stageDates[pair.0],
                    let end = profile.stageDates[pair.1]
                else { continue }
                let startDay = calendar.startOfDay(for: start)
                let endDay = calendar.startOfDay(for: end)
                guard endDay >= startDay else { continue }
                let days = calendar.dateComponents([.day], from: startDay, to: endDay).day ?? 0
                guard days >= 0 else { continue }
                let key = "\(profile.spaceId)|\(profile.officeId)|\(pair.0)|\(pair.1)"
                buckets[key, default: []].append(days)
                meta[key] = (profile.spaceId, profile.officeId, pair.0, pair.1)
            }
        }
        return buckets.compactMap { key, days in
            guard let info = meta[key] else { return nil }
            return BenchmarkCell(
                spaceId: info.0,
                officeId: info.1,
                fromStage: info.2,
                toStage: info.3,
                days: days
            )
        }
        .sorted { lhs, rhs in
            if lhs.count != rhs.count { return lhs.count > rhs.count }
            return lhs.id < rhs.id
        }
    }

    public static var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }()
}
