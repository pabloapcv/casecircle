import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct InterviewPrepView: View {
    var spaceID: String = "i-485"
    @Environment(Database.self) private var context
    @Environment(\.appLanguage) private var lang
    private var members: [Member] { context.members }

    private var me: Member? {
        _ = context.revision
        return members.first { $0.isCurrentUser }
    }
    private var tips: [InterviewTip] { InterviewGuide.tips(for: spaceID) }
    private var showMarriage: Bool { spaceID == "i-485" || spaceID == "i-130" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(Taxonomy.space(spaceID)?.name(lang) ?? spaceID)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.teal)
                Text(L10n.s(.interviewPrepLead, lang))
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondary)
                Text(L10n.s(.generalTips, lang))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                ForEach(tips) { tip in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tip.title(lang)).font(.subheadline.weight(.semibold))
                        Text(tip.body(lang)).font(.subheadline).foregroundStyle(Theme.secondary)
                    }
                    .cardStyle()
                    .accessibilityElement(children: .combine)
                }
                if showMarriage {
                    marriageBlock
                }
                LegalNotice()
            }
            .padding(16)
        }
        .background(Theme.paper)
        .navigationTitle(L10n.s(.interviewPrep, lang))
        .navInline()
    }

    private var marriageBlock: some View {
        let checked = Set((me?.evidenceMarks ?? [:]).filter(\.value).map(\.key))
        let score = InterviewGuide.evidenceScore(checked: checked)
        return VStack(alignment: .leading, spacing: 12) {
            Text(L10n.s(.marriageEvidenceTitle, lang))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            ScoreMeter(title: L10n.s(.evidenceStrength, lang), score: score)
            ForEach(InterviewGuide.marriageEvidence) { item in
                let on = me?.evidenceMarks[item.id] == true
                Button {
                    guard let me else { return }
                    me.evidenceMarks[item.id] = !on
                    context.save()
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: on ? "checkmark.square.fill" : "square")
                            .foregroundStyle(on ? Theme.teal : Theme.secondary)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title(lang)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            if item.required {
                                Pill(text: L10n.s(.requiredLabel, lang), tint: Theme.coral)
                            }
                        }
                        Spacer()
                    }
                    .cardStyle()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.title(lang))
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
            }
            Text(L10n.s(.moreEvidenceNote, lang))
                .font(.footnote)
                .foregroundStyle(Theme.secondary)
        }
    }
}

struct WaitCalculatorCard: View {
    var profile: CaseProfile
    var cohort: [WaitInput]
    @Environment(\.appLanguage) private var lang

    var body: some View {
        let mine = WaitInput(
            spaceId: profile.spaceID,
            officeId: profile.officeID,
            filedMonth: profile.filedMonth,
            isSample: profile.isSample || profile.member?.isSample == true
        )
        let comparison = WaitEngine.comparison(mine: mine, cohort: cohort)
        let labeledSample = mine.isSample
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(L10n.s(.waitNormalTitle, lang))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if labeledSample {
                    Pill(text: L10n.s(.sample, lang), tint: Theme.amber)
                }
            }
            if comparison.isPublishable, let percentile = comparison.percentile {
                Text("\(percentile)%")
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(percentile > 75 ? Theme.coral : percentile > 50 ? Theme.amber : Theme.good)
                    .accessibilityLabel("\(percentile) percent")
                Text(percentile > 75 ? L10n.s(.waitLonger, lang) : percentile > 50 ? L10n.s(.waitMiddle, lang) : L10n.s(.waitShorter, lang))
                    .font(.subheadline.weight(.semibold))
                Text(L10n.s(.waitOfPeople, lang, comparison.count))
                    .font(.footnote)
                    .foregroundStyle(Theme.secondary)
            } else {
                Text(L10n.s(.notEnoughTitle, lang)).font(.subheadline.weight(.semibold))
                Text(L10n.s(.waitPrivacyNote, lang)).font(.footnote).foregroundStyle(Theme.secondary)
            }
            Text("\(Taxonomy.space(profile.spaceID)?.name(lang) ?? profile.formCode) · \(BadgeText.make(form: profile.formCode, officeID: profile.officeID, filed: profile.filedMonth, stage: profile.currentStage, lang: lang)) · \(Formatters.wait(since: profile.filedMonth, lang))")
                .font(.footnote)
                .foregroundStyle(Theme.secondary)
            if labeledSample {
                Text(L10n.s(.exampleBody, lang))
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
        }
        .cardStyle()
        .accessibilityElement(children: .combine)
    }
}

struct StatusDecoderCard: View {
    var stage: String
    @Environment(\.appLanguage) private var lang

    var body: some View {
        if let decoded = StatusDecoder.explain(stage) {
            VStack(alignment: .leading, spacing: 6) {
                Text(L10n.s(.statusMeansTitle, lang))
                    .font(.subheadline.weight(.semibold))
                Text(decoded.text(lang))
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.tealSoft)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }
}
