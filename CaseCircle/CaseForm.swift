import SwiftUI
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

struct CaseProfileEditor: View {
    @Binding var draft: ProfileDraft
    @Environment(\.appLanguage) private var lang

    private var space: SpaceDef? { Taxonomy.space(draft.spaceID) }
    private var years: [Int] {
        let year = Calendar.current.component(.year, from: .now)
        return Array((year - 12)...year).reversed()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let space {
                Text(space.name(lang)).font(.headline)
                Text(space.forms.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondary)
            }
            menu(L10n.s(.formLabel, lang), value: draft.formCode) {
                ForEach(space?.forms ?? [], id: \.self) { form in
                    Button(form) { draft.formCode = form }
                }
            }
            menu(L10n.s(.basedOnLabel, lang), value: L10n.basedOn(draft.basedOn, lang)) {
                ForEach(BasedOn.allCases) { item in
                    Button(L10n.basedOn(item.rawValue, lang)) { draft.basedOn = item.rawValue }
                }
            }
            monthRow
            menu(L10n.s(.officeLabel, lang), value: Taxonomy.office(draft.officeID)?.name(lang) ?? L10n.s(.choose, lang)) {
                officeButtons
            }
            menu(L10n.s(.methodLabel, lang), value: L10n.filingMethod(draft.filingMethod, lang)) {
                ForEach(FilingMethod.allCases) { method in
                    Button(L10n.filingMethod(method.rawValue, lang)) { draft.filingMethod = method.rawValue }
                }
            }
            menu(L10n.s(.stageLabel, lang), value: draft.currentStage.isEmpty ? L10n.s(.choose, lang) : L10n.stage(draft.currentStage, lang)) {
                ForEach(Stage.allCases) { stage in
                    Button(L10n.stage(stage.rawValue, lang)) { draft.currentStage = stage.rawValue }
                }
            }
            if draft.currentStage == Stage.approved.rawValue || draft.currentStage == Stage.oath.rawValue {
                Toggle(isOn: $draft.completed) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.s(.selfAttested, lang))
                        Text(L10n.s(.selfAttestedHelp, lang))
                            .font(.caption)
                            .foregroundStyle(Theme.secondary)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                FieldHeader(title: L10n.s(.badgePreview, lang))
                Text(badge.isEmpty ? L10n.s(.choose, lang) : badge)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.teal)
                Text(L10n.s(.badgePreviewHelp, lang))
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
            .cardStyle()
        }
    }

    private var badge: String {
        BadgeText.make(
            form: draft.formCode,
            officeID: draft.officeID,
            filed: draft.filedMonth,
            stage: draft.currentStage,
            lang: lang
        )
    }

    private var monthRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldHeader(title: L10n.s(.filingMonth, lang))
            HStack {
                Menu {
                    ForEach(1...12, id: \.self) { month in
                        Button(monthName(month)) { setMonth(month) }
                    }
                } label: {
                    menuLabel(monthName(Calendar.current.component(.month, from: draft.filedMonth)))
                }
                Menu {
                    ForEach(years, id: \.self) { year in
                        Button(String(year)) { setYear(year) }
                    }
                } label: {
                    menuLabel(String(Calendar.current.component(.year, from: draft.filedMonth)))
                }
            }
        }
    }

    private var officeButtons: some View {
        let centers = Taxonomy.offices.filter { $0.type == .serviceCenter || $0.type == .nbc }
        let fields = Taxonomy.offices.filter { $0.type == .fieldOffice }
        return Group {
            Section(L10n.s(.officeServiceCenter, lang)) {
                ForEach(centers) { office in
                    Button(office.name(lang)) { draft.officeID = office.id }
                }
            }
            Section(L10n.s(.officeField, lang)) {
                ForEach(fields) { office in
                    Button(office.name(lang)) { draft.officeID = office.id }
                }
            }
            if let unsure = Taxonomy.office("unsure") {
                Button(unsure.name(lang)) { draft.officeID = unsure.id }
            }
        }
    }

    private func menu(_ title: String, value: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldHeader(title: title)
            Menu { content() } label: { menuLabel(value) }
        }
    }

    private func menuLabel(_ value: String) -> some View {
        HStack {
            Text(value).foregroundStyle(Theme.ink)
            Spacer()
            Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(Theme.secondary)
        }
        .padding(12)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }

    private func monthName(_ month: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: lang == "es" ? "es" : "en")
        return formatter.monthSymbols[month - 1].capitalized
    }

    private func setMonth(_ month: Int) {
        var parts = Calendar.current.dateComponents([.year, .month], from: draft.filedMonth)
        parts.month = month
        draft.filedMonth = clamped(parts)
    }

    private func setYear(_ year: Int) {
        var parts = Calendar.current.dateComponents([.year, .month], from: draft.filedMonth)
        parts.year = year
        draft.filedMonth = clamped(parts)
    }

    private func clamped(_ parts: DateComponents) -> Date {
        let date = Calendar.current.date(from: parts) ?? draft.filedMonth
        let start = Formatters.monthStart(date)
        if start > Formatters.monthStart(.now) { return Formatters.monthStart(.now) }
        return start
    }
}
