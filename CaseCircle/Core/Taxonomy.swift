import Foundation

public enum OfficeType: String, Equatable {
    case serviceCenter
    case fieldOffice
    case nbc
    case unsure
}

public struct CategoryDef: Identifiable, Equatable {
    public let id: String
    public let nameEn: String
    public let nameEs: String
    public let sort: Int

    public func name(_ lang: String) -> String { lang == "es" ? nameEs : nameEn }
}

public struct SpaceDef: Identifiable, Equatable {
    public let id: String
    public let categoryId: String
    public let nameEn: String
    public let nameEs: String
    public let forms: [String]
    public let blurbEn: String
    public let blurbEs: String
    public let synonyms: [String]

    public var isLaunch: Bool { Taxonomy.launchIDs.contains(id) }
    public var primaryForm: String { forms[0] }
    public func name(_ lang: String) -> String { lang == "es" ? nameEs : nameEn }
    public func blurb(_ lang: String) -> String { lang == "es" ? blurbEs : blurbEn }
}

public struct OfficeDef: Identifiable, Equatable {
    public let id: String
    public let type: OfficeType
    public let code: String
    public let nameEn: String
    public let nameEs: String
    public let state: String

    public func name(_ lang: String) -> String { lang == "es" ? nameEs : nameEn }
}

public enum Stage: String, CaseIterable, Identifiable {
    case filed
    case biometrics
    case rfe
    case interviewScheduled = "interview_scheduled"
    case interviewDone = "interview_done"
    case approved
    case denied
    case oath

    public var id: String { rawValue }
}

public enum PostKind: String, CaseIterable, Identifiable {
    case question
    case timeline
    case interview
    case tip
    case vent

    public var id: String { rawValue }
}

public enum BasedOn: String, CaseIterable, Identifiable {
    case marriage
    case parent
    case child
    case sibling
    case employment
    case asylum
    case refugee
    case diversity
    case fiance
    case other

    public var id: String { rawValue }
}

public enum FilingMethod: String, CaseIterable, Identifiable {
    case online
    case paper

    public var id: String { rawValue }
}

public enum Taxonomy {
    public static let launchIDs: Set<String> = ["n-400", "i-751", "i-485", "i-130", "i-765", "i-131"]

    public static let categories: [CategoryDef] = [
        CategoryDef(id: "citizenship", nameEn: "Citizenship", nameEs: "Ciudadanía", sort: 0),
        CategoryDef(id: "family", nameEn: "Family green card", nameEs: "Residencia familiar", sort: 1),
        CategoryDef(id: "greencard", nameEn: "Green card", nameEs: "Tarjeta de residencia", sort: 2),
        CategoryDef(id: "employment", nameEn: "Employment", nameEs: "Empleo", sort: 3),
        CategoryDef(id: "worktravel", nameEn: "Work and travel", nameEs: "Trabajo y viaje", sort: 4),
        CategoryDef(id: "nonimmigrant", nameEn: "Nonimmigrant status", nameEs: "Estatus de no inmigrante", sort: 5),
        CategoryDef(id: "humanitarian", nameEn: "Humanitarian", nameEs: "Humanitario", sort: 6),
        CategoryDef(id: "waivers", nameEn: "Waivers", nameEs: "Perdones", sort: 7),
        CategoryDef(id: "adoption", nameEn: "Adoption", nameEs: "Adopción", sort: 8),
        CategoryDef(id: "cross", nameEn: "Cross-cutting", nameEs: "Temas generales", sort: 9)
    ]

    public static let spaces: [SpaceDef] = [
        space("n-400", "citizenship", "Naturalization", "Naturalización", ["N-400", "N-648", "N-336", "N-470"], "Citizenship interviews, civics, and oath timelines.", "Entrevistas de ciudadanía, civismo y juramento.", ["citizenship", "naturalization", "ciudadania", "naturalizacion", "oath", "civics"]),
        space("n-600", "citizenship", "Certificate of citizenship", "Certificado de ciudadanía", ["N-600", "N-600K", "N-565"], "Certificates and replacements.", "Certificados y reposiciones.", ["certificate", "certificado", "n600"]),
        space("i-130", "family", "Petition for a relative", "Petición de familiar", ["I-130", "I-130A"], "Petitions for a spouse, parent, child, or sibling.", "Peticiones para esposo, padre, hijo o hermano.", ["relative", "spouse", "petition", "familiar", "esposo", "esposa", "i130"]),
        space("i-129f", "family", "Fiancé(e) visa", "Visa de prometido(a)", ["I-129F"], "K-1 fiancé petitions.", "Peticiones K-1 de prometidos.", ["fiance", "fiancee", "prometido", "k1", "k-1"]),
        space("widow", "family", "Widow(er) and special immigrant", "Viudo(a) e inmigrante especial", ["I-360"], "Widow(er) petitions on form I-360.", "Peticiones de viudo(a) con el I-360.", ["widow", "widower", "viudo", "viuda"]),
        space("i-485", "greencard", "Adjustment of status", "Ajuste de estatus", ["I-485", "I-693", "I-864"], "Adjustment of status inside the United States.", "Ajuste de estatus dentro de Estados Unidos.", ["adjustment", "aos", "green card", "ajuste", "residencia", "i485"]),
        space("i-751", "greencard", "Removal of conditions", "Remoción de condiciones", ["I-751"], "Removal of conditions after a marriage green card.", "Quitar las condiciones de una residencia por matrimonio.", ["removal of conditions", "roc", "condiciones", "i751"]),
        space("i-90", "greencard", "Renewal and replacement", "Renovación y reemplazo", ["I-90"], "Renewing or replacing a green card.", "Renovar o reponer la tarjeta de residencia.", ["renewal", "replacement", "renovacion", "i90"]),
        space("returning-resident", "greencard", "Returning resident", "Residente que regresa", ["I-131", "I-407"], "Reentry permits and abandonment questions.", "Permisos de reingreso y abandono de residencia.", ["reentry", "abandonment", "i-407", "returning resident"]),
        space("i-140", "employment", "Immigrant worker petition", "Petición de trabajador inmigrante", ["I-140"], "EB-1, EB-2, EB-3, and national interest waiver petitions.", "Peticiones EB-1, EB-2, EB-3 y de interés nacional.", ["eb1", "eb-1", "eb2", "eb-2", "eb3", "niw", "perm", "i140"]),
        space("i-129", "employment", "Nonimmigrant worker", "Trabajador no inmigrante", ["I-129"], "H-1B, L-1, O-1, and similar petitions.", "Peticiones H-1B, L-1, O-1 y parecidas.", ["h1b", "h-1b", "l1", "l-1", "o1", "o-1", "i129"]),
        space("i-526", "employment", "Investor", "Inversionista", ["I-526", "I-526E", "I-829"], "EB-5 investor petitions and removal of conditions.", "Peticiones de inversionista EB-5.", ["eb5", "eb-5", "investor", "inversionista", "i829"]),
        space("i-765", "worktravel", "Work permit", "Permiso de trabajo", ["I-765"], "Employment authorization, including cards filed with adjustment.", "Permisos de trabajo, incluso con un ajuste pendiente.", ["ead", "work permit", "permiso de trabajo", "c9", "c09", "i765"]),
        space("i-131", "worktravel", "Advance parole and travel", "Permiso de viaje", ["I-131"], "Advance parole, combo cards, and travel documents.", "Advance parole, tarjeta combo y documentos de viaje.", ["advance parole", "travel document", "combo card", "permiso de viaje", "i131"]),
        space("i-539", "nonimmigrant", "Extend or change status", "Extender o cambiar estatus", ["I-539"], "Extensions and changes of nonimmigrant status.", "Extensiones y cambios de estatus.", ["extend status", "change of status", "b2", "f1", "i539"]),
        space("i-589", "humanitarian", "Asylum", "Asilo", ["I-589"], "Affirmative asylum filings.", "Solicitudes afirmativas de asilo.", ["asylum", "asilo", "affirmative", "i589"]),
        space("i-730", "humanitarian", "Refugee or asylee relative", "Familiar de refugiado o asilado", ["I-730"], "Follow-to-join petitions for relatives.", "Peticiones de familiares que se unen después.", ["refugee", "asylee", "i730"]),
        space("i-821", "humanitarian", "TPS", "TPS", ["I-821"], "Temporary Protected Status.", "Estatus de protección temporal.", ["tps", "temporary protected", "i821"]),
        space("i-821d", "humanitarian", "DACA", "DACA", ["I-821D"], "Deferred Action for Childhood Arrivals.", "Acción diferida para llegados en la infancia.", ["daca", "i821d"]),
        space("u-t-vawa", "humanitarian", "U visa, T visa, and VAWA", "Visa U, visa T y VAWA", ["I-918", "I-914", "I-360"], "Humanitarian visas and VAWA self-petitions.", "Visas humanitarias y autopeticiones VAWA.", ["u visa", "t visa", "vawa", "i-918", "i-914"]),
        space("i-601", "waivers", "Inadmissibility waivers", "Perdones de inadmisibilidad", ["I-601", "I-601A", "I-212"], "Waiver filings and experiences.", "Perdones y experiencias de presentación.", ["waiver", "perdon", "unlawful presence", "i-601a", "i601"]),
        space("adoption", "adoption", "Intercountry adoption", "Adopción internacional", ["I-600", "I-600A", "I-800", "I-800A"], "Hague and non-Hague adoption filings.", "Adopciones del Convenio de La Haya y las demás.", ["adoption", "adopcion", "hague"]),
        space("fees-and-tools", "cross", "Fees, biometrics, and records", "Tarifas, biometría y registros", ["I-912", "G-639", "I-907"], "Fee waivers, FOIA, biometrics, and premium processing.", "Exención de tarifas, FOIA, biometría y procesamiento premium.", ["biometrics", "fees", "foia", "premium", "i-907", "g-639", "online account"]),
        space("consular", "cross", "Consular stage", "Etapa consular", ["DS-260"], "National Visa Center and embassy steps after a petition.", "Centro Nacional de Visas y la embajada, después de la petición.", ["nvc", "ds-260", "ds260", "embassy", "consular", "visa bulletin"])
    ]

    public static let offices: [OfficeDef] = serviceCenters + [nbc] + fieldOffices + [unsure]

    public static func category(_ id: String) -> CategoryDef? {
        categories.first { $0.id == id }
    }

    public static func space(_ id: String) -> SpaceDef? {
        spaces.first { $0.id == id }
    }

    public static func office(_ id: String) -> OfficeDef? {
        offices.first { $0.id == id }
    }

    public static func searchSpaces(_ query: String) -> [SpaceDef] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let foldedQuery = fold(trimmed)
        let matches = spaces.filter { space in
            guard !foldedQuery.isEmpty else { return true }
            let category = category(space.categoryId)
            let haystack = fold(
                ([space.nameEn, space.nameEs, space.id, space.blurbEn, space.blurbEs]
                    + space.forms
                    + space.synonyms
                    + [category?.nameEn ?? "", category?.nameEs ?? ""]
                ).joined(separator: " ")
            )
            return haystack.contains(foldedQuery)
        }
        return sorted(matches, lang: "en")
    }

    public static func sorted(_ spaces: [SpaceDef], lang: String) -> [SpaceDef] {
        spaces.sorted { lhs, rhs in
            if lhs.isLaunch != rhs.isLaunch { return lhs.isLaunch && !rhs.isLaunch }
            let order = lhs.name(lang).localizedCaseInsensitiveCompare(rhs.name(lang))
            if order != .orderedSame { return order == .orderedAscending }
            return lhs.id < rhs.id
        }
    }

    public static func spaces(in categoryId: String) -> [SpaceDef] {
        sorted(spaces.filter { $0.categoryId == categoryId }, lang: "en")
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    }

    private static func space(
        _ id: String,
        _ categoryId: String,
        _ nameEn: String,
        _ nameEs: String,
        _ forms: [String],
        _ blurbEn: String,
        _ blurbEs: String,
        _ synonyms: [String]
    ) -> SpaceDef {
        SpaceDef(
            id: id,
            categoryId: categoryId,
            nameEn: nameEn,
            nameEs: nameEs,
            forms: forms,
            blurbEn: blurbEn,
            blurbEs: blurbEs,
            synonyms: synonyms
        )
    }

    private static let serviceCenters: [OfficeDef] = [
        OfficeDef(id: "vsc", type: .serviceCenter, code: "VSC", nameEn: "Vermont Service Center", nameEs: "Centro de Servicio de Vermont", state: "VT"),
        OfficeDef(id: "csc", type: .serviceCenter, code: "CSC", nameEn: "California Service Center", nameEs: "Centro de Servicio de California", state: "CA"),
        OfficeDef(id: "nsc", type: .serviceCenter, code: "NSC", nameEn: "Nebraska Service Center", nameEs: "Centro de Servicio de Nebraska", state: "NE"),
        OfficeDef(id: "tsc", type: .serviceCenter, code: "TSC", nameEn: "Texas Service Center", nameEs: "Centro de Servicio de Texas", state: "TX"),
        OfficeDef(id: "psc", type: .serviceCenter, code: "PSC", nameEn: "Potomac Service Center", nameEs: "Centro de Servicio de Potomac", state: "VA")
    ]

    private static let nbc = OfficeDef(
        id: "nbc",
        type: .nbc,
        code: "NBC",
        nameEn: "National Benefits Center",
        nameEs: "Centro Nacional de Beneficios",
        state: "MO"
    )

    private static let fieldOffices: [OfficeDef] = [
        field("nyc", "NYC", "New York, NY", "Nueva York, NY", "NY"),
        field("los-angeles", "LAX", "Los Angeles, CA", "Los Ángeles, CA", "CA"),
        field("miami", "MIA", "Miami, FL", "Miami, FL", "FL"),
        field("chicago", "CHI", "Chicago, IL", "Chicago, IL", "IL"),
        field("houston", "HOU", "Houston, TX", "Houston, TX", "TX"),
        field("san-francisco", "SFO", "San Francisco, CA", "San Francisco, CA", "CA"),
        field("dallas", "DAL", "Dallas, TX", "Dallas, TX", "TX"),
        field("atlanta", "ATL", "Atlanta, GA", "Atlanta, GA", "GA"),
        field("boston", "BOS", "Boston, MA", "Boston, MA", "MA"),
        field("seattle", "SEA", "Seattle, WA", "Seattle, WA", "WA"),
        field("newark", "EWR", "Newark, NJ", "Newark, NJ", "NJ"),
        field("phoenix", "PHX", "Phoenix, AZ", "Phoenix, AZ", "AZ"),
        field("san-diego", "SAN", "San Diego, CA", "San Diego, CA", "CA"),
        field("washington", "DCA", "Washington, DC", "Washington, DC", "DC"),
        field("orlando", "MCO", "Orlando, FL", "Orlando, FL", "FL"),
        field("denver", "DEN", "Denver, CO", "Denver, CO", "CO"),
        field("philadelphia", "PHL", "Philadelphia, PA", "Filadelfia, PA", "PA"),
        field("san-antonio", "SAT", "San Antonio, TX", "San Antonio, TX", "TX"),
        field("charlotte", "CLT", "Charlotte, NC", "Charlotte, NC", "NC"),
        field("detroit", "DTW", "Detroit, MI", "Detroit, MI", "MI"),
        field("minneapolis", "MSP", "Minneapolis, MN", "Mineápolis, MN", "MN"),
        field("portland", "PDX", "Portland, OR", "Portland, OR", "OR")
    ]

    private static let unsure = OfficeDef(
        id: "unsure",
        type: .unsure,
        code: "",
        nameEn: "Not sure yet",
        nameEs: "Aún no lo sé",
        state: ""
    )

    private static func field(_ id: String, _ code: String, _ en: String, _ es: String, _ state: String) -> OfficeDef {
        OfficeDef(id: id, type: .fieldOffice, code: code, nameEn: en, nameEs: es, state: state)
    }
}
