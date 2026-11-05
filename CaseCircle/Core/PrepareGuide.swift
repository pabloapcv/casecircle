import Foundation

public struct ChecklistItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var en: String
    public var es: String
    public var required: Bool
    public var kind: String

    public init(id: String, en: String, es: String, required: Bool, kind: String = "required") {
        self.id = id
        self.en = en
        self.es = es
        self.required = required
        self.kind = kind
    }

    public func title(_ lang: String) -> String { lang == "es" ? es : en }
}

public struct FolderTally: Equatable, Sendable {
    public var ready: Int
    public var need: Int
    public var na: Int
    public var total: Int

    public var score: Int {
        Int((Double(ready) / Double(max(total, 1)) * 100).rounded())
    }
}

public enum FolderMark: String, Equatable, Sendable {
    case ready, need, na
}

public struct RiskFlag: Equatable, Identifiable, Sendable {
    public var id: String { "\(kind)-\(level)-\(en)" }
    public var level: String
    public var kind: String
    public var en: String
    public var es: String

    public func text(_ lang: String) -> String { lang == "es" ? es : en }
}

public struct RFEItem: Equatable, Identifiable, Sendable {
    public var id: String
    public var en: String
    public var es: String
    public var required: Bool
    public var hintEn: String
    public var hintEs: String

    public func title(_ lang: String) -> String { lang == "es" ? es : en }
    public func hint(_ lang: String) -> String { lang == "es" ? hintEs : hintEn }
}

public struct StatusExplain: Equatable, Sendable {
    public var stage: String
    public var en: String
    public var es: String
    public func text(_ lang: String) -> String { lang == "es" ? es : en }
}

public struct InterviewTip: Equatable, Identifiable, Sendable {
    public var id: String
    public var enTitle: String
    public var esTitle: String
    public var enBody: String
    public var esBody: String
    public func title(_ lang: String) -> String { lang == "es" ? esTitle : enTitle }
    public func body(_ lang: String) -> String { lang == "es" ? esBody : enBody }
}

public struct MarriageEvidenceItem: Equatable, Identifiable, Sendable {
    public var id: String
    public var en: String
    public var es: String
    public var required: Bool
    public func title(_ lang: String) -> String { lang == "es" ? es : en }
}

public struct WaitInput: Equatable, Sendable {
    public var spaceId: String
    public var officeId: String
    public var filedMonth: Date
    public var isSample: Bool

    public init(spaceId: String, officeId: String, filedMonth: Date, isSample: Bool) {
        self.spaceId = spaceId
        self.officeId = officeId
        self.filedMonth = filedMonth
        self.isSample = isSample
    }
}

public struct WaitComparison: Equatable, Sendable {
    public var count: Int
    public var mineMonths: Int
    public var percentile: Int?
    public var isPublishable: Bool
}

public enum FormChecklists {
    public static let featuredSpaceIDs = ["i-485", "i-765", "n-400", "i-130"]

    public static func items(for spaceId: String) -> [ChecklistItem] {
        switch spaceId {
        case "i-485": return i485
        case "i-765": return i765
        case "n-400": return n400
        case "i-130": return i130
        case "i-751": return i751
        case "i-131": return i131
        default: return generic
        }
    }

    public static func tally(items: [ChecklistItem], marks: [String: String]) -> FolderTally {
        var ready = 0
        var need = 0
        var na = 0
        for item in items {
            switch FolderMark(rawValue: marks[item.id] ?? "need") ?? .need {
            case .ready: ready += 1
            case .na: na += 1
            case .need: need += 1
            }
        }
        return FolderTally(ready: ready, need: need, na: na, total: items.count)
    }

    public static func score(items: [ChecklistItem], marks: [String: String]) -> Int {
        tally(items: items, marks: marks).score
    }

    public static func markKey(spaceId: String, itemId: String) -> String {
        "\(spaceId)|\(itemId)"
    }

    public static func resolve(_ marks: [String: String], spaceId: String, itemId: String) -> String {
        marks[markKey(spaceId: spaceId, itemId: itemId)] ?? marks[itemId] ?? FolderMark.need.rawValue
    }

    public static func tally(spaceId: String, marks: [String: String]) -> FolderTally {
        let list = items(for: spaceId)
        let mapped = Dictionary(uniqueKeysWithValues: list.map { ($0.id, resolve(marks, spaceId: spaceId, itemId: $0.id)) })
        return tally(items: list, marks: mapped)
    }

    private static let i485: [ChecklistItem] = [
        item("i485-form", "Form I-485 completed and signed", "Formulario I-485 completado y firmado", true, "required"),
        item("i485-fee", "Filing fee or fee waiver", "Tarifa de presentación o exención", true, "required"),
        item("i485-photos", "2 passport-style photos", "2 fotos tamaño pasaporte", true, "required"),
        item("i485-passport", "Passport copy (bio page)", "Copia de pasaporte (página biográfica)", true, "required"),
        item("i485-birth", "Birth certificate + translation", "Acta de nacimiento + traducción", true, "required"),
        item("i485-i94", "I-94 arrival record", "Registro de llegada I-94", true, "required"),
        item("i485-i693", "I-693 medical (sealed)", "I-693 médico (sellado)", true, "required"),
        item("i485-i130", "I-130 approval or receipt (family-based)", "Aprobación o recibo de I-130 (basado en familia)", false, "conditional"),
        item("i485-marriage", "Marriage certificate + translation", "Acta de matrimonio + traducción", false, "conditional"),
        item("i485-i864", "I-864 Affidavit of Support", "Declaración de apoyo I-864", false, "conditional"),
        item("i485-translate", "Certified translations for non-English documents", "Traducciones certificadas de documentos que no están en inglés", true, "required")
    ]

    private static let i765: [ChecklistItem] = [
        item("i765-form", "Form I-765 completed and signed", "Formulario I-765 completado y firmado", true, "required"),
        item("i765-fee", "Filing fee or included with I-485", "Tarifa o incluido con I-485", true, "required"),
        item("i765-photos", "2 passport-style photos", "2 fotos tamaño pasaporte", true, "required"),
        item("i765-id", "Copy of ID document", "Copia de documento de identidad", true, "required"),
        item("i765-passport", "Passport bio page if you have one", "Página biográfica del pasaporte si la tienes", false, "optional"),
        item("i765-pending", "Receipt of pending application", "Recibo de solicitud pendiente", false, "conditional")
    ]

    private static let n400: [ChecklistItem] = [
        item("n400-form", "Form N-400 completed and signed", "Formulario N-400 completado y firmado", true, "required"),
        item("n400-fee", "Filing fee", "Tarifa de presentación", true, "required"),
        item("n400-photos", "2 passport-style photos", "2 fotos tamaño pasaporte", true, "required"),
        item("n400-gc", "Copy of green card (front and back)", "Copia de tarjeta verde (frente y dorso)", true, "required"),
        item("n400-trips", "List of trips outside the US", "Lista de viajes fuera de EEUU", false, "conditional"),
        item("n400-taxes", "Tax transcripts for required years", "Transcripciones de impuestos de años requeridos", false, "conditional"),
        item("n400-translate", "Certified translations if any documents are not in English", "Traducciones certificadas si algún documento no está en inglés", false, "conditional")
    ]

    private static let i130: [ChecklistItem] = [
        item("i130-form", "Form I-130 completed and signed", "Formulario I-130 completado y firmado", true, "required"),
        item("i130-fee", "Filing fee", "Tarifa de presentación", true, "required"),
        item("i130-petitioner", "Proof of petitioner's status (passport/certificate)", "Prueba de estatus del peticionario", true, "required"),
        item("i130-relationship", "Proof of relationship", "Prueba de la relación", true, "required"),
        item("i130-marriage", "Marriage certificate + translation", "Acta de matrimonio + traducción", false, "conditional"),
        item("i130-passport", "Beneficiary passport bio page", "Página biográfica del pasaporte del beneficiario", false, "optional"),
        item("i130-translate", "Certified translations for non-English civil records", "Traducciones certificadas de actas que no están en inglés", true, "required")
    ]

    private static let i751: [ChecklistItem] = [
        item("i751-form", "Form I-751 completed and signed", "Formulario I-751 completado y firmado", true, "required"),
        item("i751-card", "Copy of conditional green card", "Copia de la tarjeta condicional", true, "required"),
        item("i751-joint", "Joint life evidence over two years", "Pruebas de vida conjunta de dos años", true, "required"),
        item("i751-translate", "Certified translations", "Traducciones certificadas", false, "conditional")
    ]

    private static let i131: [ChecklistItem] = [
        item("i131-form", "Form I-131 completed and signed", "Formulario I-131 completado y firmado", true, "required"),
        item("i131-passport", "Passport bio page", "Página biográfica del pasaporte", true, "required"),
        item("i131-photos", "Passport-style photos if required", "Fotos tamaño pasaporte si se piden", true, "required"),
        item("i131-pending", "Copy of pending application if required", "Copia de la solicitud pendiente si se pide", false, "conditional")
    ]

    private static let generic: [ChecklistItem] = [
        item("generic-form", "Current form, signed", "Formulario vigente, firmado", true, "required"),
        item("generic-fee", "Current filing fee", "Tarifa vigente", true, "required"),
        item("generic-id", "Identity copies named in the instructions", "Copias de identidad que nombran las instrucciones", true, "required"),
        item("generic-translate", "Certified translations for non-English documents", "Traducciones certificadas de documentos que no están en inglés", false, "conditional")
    ]

    private static func item(_ id: String, _ en: String, _ es: String, _ required: Bool, _ kind: String) -> ChecklistItem {
        ChecklistItem(id: id, en: en, es: es, required: required, kind: kind)
    }
}

public enum RiskFlags {
    public static func flags(
        spaceId: String,
        stage: String,
        filed: Date?,
        marks: [String: String],
        now: Date = Date(),
        calendar: Calendar = WaitEngine.calendar
    ) -> [RiskFlag] {
        var result: [RiskFlag] = []
        let items = FormChecklists.items(for: spaceId)
        let itemMarks: [String: FolderMark] = Dictionary(uniqueKeysWithValues: items.map { item in
            let raw = FormChecklists.resolve(marks, spaceId: spaceId, itemId: item.id)
            return (item.id, FolderMark(rawValue: raw) ?? .need)
        })

        if let filed {
            let months = WaitEngine.monthsSince(filed, now: now, calendar: calendar)
            if spaceId == "i-485" && months > 6 && stage == "filed" {
                let remaining = 24 - months
                if remaining <= 0 {
                    result.append(RiskFlag(
                        level: "error",
                        kind: "i693",
                        en: "Your I-693 medical may have expired if it was done at filing. You may need another exam.",
                        es: "Tu I-693 médico puede haber expirado si se hizo al presentar. Puede necesitar otro examen."
                    ))
                } else if remaining <= 6 {
                    result.append(RiskFlag(
                        level: "warning",
                        kind: "i693",
                        en: "Your I-693 medical may expire in about \(remaining) months if it was done at filing.",
                        es: "Tu I-693 médico puede expirar en unos \(remaining) meses si se hizo al presentar."
                    ))
                }
            }
            if months >= 12 && stage != "approved" && stage != "oath" {
                result.append(RiskFlag(
                    level: "warning",
                    kind: "passport",
                    en: "Check that the passport used for identity is still valid. An expired passport can delay interviews and travel documents.",
                    es: "Revisa que el pasaporte usado para identidad siga vigente. Un pasaporte vencido puede retrasar entrevistas y documentos de viaje."
                ))
            }
        }

        if items.contains(where: { $0.id.contains("passport") && itemMarks[$0.id] == .need }) {
            result.append(RiskFlag(
                level: "warning",
                kind: "passport",
                en: "A passport bio page is still marked as needed. Confirm the passport has not expired before you copy it.",
                es: "La página del pasaporte sigue marcada como pendiente. Confirma que el pasaporte no haya vencido antes de copiarlo."
            ))
        }

        if items.contains(where: { $0.id.contains("translate") && itemMarks[$0.id] == .need }) {
            result.append(RiskFlag(
                level: "warning",
                kind: "translation",
                en: "Civil records that are not in English need a full certified translation. Missing translations are a common RFE.",
                es: "Las actas que no están en inglés necesitan una traducción certificada completa. Faltar traducciones es un RFE común."
            ))
        }

        let tally = FormChecklists.tally(spaceId: spaceId, marks: marks)
        if tally.ready > 0 && tally.need == 0 {
            result.append(RiskFlag(
                level: "success",
                kind: "complete",
                en: "Checklist complete. Read the current official instructions before you send anything.",
                es: "Lista completa. Lee las instrucciones oficiales vigentes antes de enviar nada."
            ))
        }
        return result
    }
}

public enum RFEParser {
    public static func parse(_ raw: String, now: Date = Date()) -> [RFEItem]? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.count < 20 { return nil }
        if case .block = SafetyFilter.evaluate(text) {
            return [
                RFEItem(
                    id: "pii",
                    en: "Please remove identifiers from the text",
                    es: "Por favor remueve identificadores del texto",
                    required: true,
                    hintEn: "",
                    hintEs: ""
                )
            ]
        }

        var items: [RFEItem] = []
        let patterns: [(String, String, String, Bool)] = [
            ("birth certificate", "Birth certificate", "Acta de nacimiento", true),
            ("marriage certificate", "Marriage certificate", "Acta de matrimonio", true),
            ("divorce (decree|certificate)", "Divorce decree/certificate", "Decreto/certificado de divorcio", true),
            ("passport", "Passport copy", "Copia de pasaporte", true),
            ("photo(graph)?s?", "Photographs", "Fotografías", false),
            ("tax (return|transcript)", "Tax returns/transcripts", "Declaraciones/transcripciones de impuestos", true),
            ("employment (letter|verification)", "Employment letter", "Carta de empleo", true),
            ("i-?864", "Affidavit of Support (I-864)", "Declaración de apoyo (I-864)", true),
            ("i-?693|medical exam", "Medical exam (I-693)", "Examen médico (I-693)", true),
            ("translat", "Certified translation", "Traducción certificada", true),
            ("evidence of.*relationship|bona fide", "Evidence of bona fide relationship", "Evidencia de relación genuina", true),
            ("joint (bank|account)", "Joint bank account statements", "Estados de cuenta bancaria conjunta", false),
            ("lease|mortgage", "Joint lease or mortgage", "Contrato de arrendamiento o hipoteca conjunta", false),
            ("insurance", "Insurance documents", "Documentos de seguro", false),
            ("affidavit", "Affidavits from friends/family", "Declaraciones juradas de amigos/familia", false),
            ("police (clearance|certificate)", "Police clearance certificate", "Certificado de antecedentes policiales", true),
            ("court (record|document)", "Court records/documents", "Registros/documentos judiciales", true),
            ("vaccination", "Vaccination records", "Registros de vacunación", false)
        ]
        for (index, row) in patterns.enumerated() {
            if text.range(of: row.0, options: [.regularExpression, .caseInsensitive]) != nil {
                items.append(RFEItem(id: "p\(index)", en: row.1, es: row.2, required: row.3, hintEn: "", hintEs: ""))
            }
        }
        if items.isEmpty {
            items.append(RFEItem(
                id: "review",
                en: "Review the RFE carefully to identify specific documents requested",
                es: "Revisa el RFE con cuidado para identificar los documentos específicos",
                required: true,
                hintEn: "Consult with an attorney if unsure",
                hintEs: "Consulta con un abogado si no estás seguro"
            ))
        }
        items.append(RFEItem(
            id: "cover",
            en: "Cover letter explaining enclosed documents",
            es: "Carta de respuesta explicando los documentos incluidos",
            required: true,
            hintEn: "List each enclosed document",
            hintEs: "Lista cada documento adjunto"
        ))
        items.append(RFEItem(
            id: "notice",
            en: "Copy of RFE notice",
            es: "Copia del aviso de RFE",
            required: true,
            hintEn: "Include as top page of packet",
            hintEs: "Incluir como página superior del paquete"
        ))
        _ = now
        return items
    }
}

public enum StatusDecoder {
    public static func explain(_ stage: String) -> StatusExplain? {
        explanations[stage]
    }

    private static let explanations: [String: StatusExplain] = [
        "filed": StatusExplain(
            stage: "filed",
            en: "Your application has been received. USCIS will review it for completeness and send a receipt notice. This is the start of the process.",
            es: "Tu solicitud ha sido recibida. USCIS la revisará para verificar que esté completa y enviará un aviso de recibo. Este es el inicio del proceso."
        ),
        "biometrics": StatusExplain(
            stage: "biometrics",
            en: "Biometrics (fingerprints) confirm your identity. After this, the case returns to a queue. A quiet status after biometrics is common and does not mean there is a problem.",
            es: "La biometría (huellas) confirma tu identidad. Después, el caso vuelve a una cola. Un estatus quieto después de la biometría es común y no significa que haya un problema."
        ),
        "rfe": StatusExplain(
            stage: "rfe",
            en: "USCIS needs additional evidence. Read the notice for the exact documents and the deadline. An RFE is not a denial.",
            es: "USCIS necesita evidencia adicional. Lee el aviso para ver los documentos exactos y el plazo. Un RFE no es una negación."
        ),
        "interview_scheduled": StatusExplain(
            stage: "interview_scheduled",
            en: "An interview has been scheduled. Bring original documents, dress appropriately, and arrive early. Review your application so answers stay consistent.",
            es: "Una entrevista ha sido programada. Lleva documentos originales, vístete apropiadamente y llega temprano. Revisa tu solicitud para responder de manera consistente."
        ),
        "interview_done": StatusExplain(
            stage: "interview_done",
            en: "The interview is complete. Decisions can take days to months. A quiet status after an interview is common while background checks finish.",
            es: "La entrevista está completa. Las decisiones pueden tomar días o meses. Un estatus quieto después de la entrevista es común mientras terminan las verificaciones de fondo."
        ),
        "approved": StatusExplain(
            stage: "approved",
            en: "Your case has been approved. If a card is being produced, you will receive it by mail. For naturalization, an oath ceremony is scheduled next.",
            es: "Tu caso ha sido aprobado. Si se está produciendo una tarjeta, la recibirás por correo. Para naturalización, sigue la ceremonia de juramento."
        ),
        "denied": StatusExplain(
            stage: "denied",
            en: "The case was denied. The notice explains the reason and your options, which may include an appeal, a motion, or refiling. Consider consulting an attorney.",
            es: "El caso fue negado. El aviso explica el motivo y tus opciones, que pueden incluir apelación, moción o volver a presentar. Considera consultar a un abogado."
        ),
        "oath": StatusExplain(
            stage: "oath",
            en: "You are scheduled for the oath ceremony to complete naturalization. Bring the oath notice and any required documents.",
            es: "Estás programado para la ceremonia de juramento para completar la naturalización. Lleva el aviso y los documentos requeridos."
        )
    ]
}

public enum InterviewGuide {
    public static func tips(for spaceId: String) -> [InterviewTip] {
        switch spaceId {
        case "i-485": return i485
        case "n-400": return n400
        case "i-130": return i130
        default: return general
        }
    }

    public static let marriageEvidence: [MarriageEvidenceItem] = [
        MarriageEvidenceItem(id: "marriage-cert", en: "Marriage certificate", es: "Acta de matrimonio", required: true),
        MarriageEvidenceItem(id: "joint-taxes", en: "Joint tax returns", es: "Declaración de impuestos conjunta", required: false),
        MarriageEvidenceItem(id: "joint-bank", en: "Joint bank accounts", es: "Cuentas bancarias conjuntas", required: false),
        MarriageEvidenceItem(id: "lease-deed", en: "Joint lease or deed", es: "Contrato de arrendamiento o escritura conjunta", required: false),
        MarriageEvidenceItem(id: "insurance", en: "Insurance policies listing spouse", es: "Pólizas de seguro con el cónyuge", required: false),
        MarriageEvidenceItem(id: "photos", en: "Photos together over time", es: "Fotos juntos a través del tiempo", required: false),
        MarriageEvidenceItem(id: "affidavits", en: "Affidavits from family/friends", es: "Declaraciones juradas de familia/amigos", required: false),
        MarriageEvidenceItem(id: "birth-cert-kids", en: "Birth certificates of children (if applicable)", es: "Actas de nacimiento de hijos (si aplica)", required: false),
        MarriageEvidenceItem(id: "correspondence", en: "Mail addressed to both", es: "Correspondencia con ambos nombres", required: false)
    ]

    public static func evidenceScore(checked: Set<String>) -> Int {
        let total = max(marriageEvidence.count, 1)
        return Int((Double(checked.count) / Double(total) * 100).rounded())
    }

    private static let i485: [InterviewTip] = [
        tip("orig", "Bring originals of everything you filed", "Lleva originales de todo lo que presentaste", "The officer will compare names, dates, and addresses. Bring your passport, birth certificate, marriage certificate, and supporting documents.", "El oficial comparará nombres, fechas y direcciones. Lleva pasaporte, acta de nacimiento, acta de matrimonio y documentos de apoyo."),
        tip("truth", "Answer truthfully and concisely", "Responde con la verdad y de manera concisa", "Listen to the question, answer it directly, and stop. If you do not understand, ask for clarification.", "Escucha la pregunta, respóndela directamente y detente. Si no entiendes, pide aclaración."),
        tip("both", "If married, both spouses usually attend", "Si están casados, ambos esposos usualmente asisten", "For marriage-based cases, expect questions about how you met, daily life, finances, and future plans.", "En casos por matrimonio, espera preguntas sobre cómo se conocieron, la vida diaria, las finanzas y los planes."),
        tip("dress", "Dress professionally", "Vístete profesionalmente", "Business casual is appropriate. This shows respect for the process.", "Ropa de negocios casual es apropiada. Muestra respeto por el proceso.")
    ]

    private static let n400: [InterviewTip] = [
        tip("civics", "Study the civics test materials", "Estudia los materiales del examen de civismo", "You will be asked up to 10 civics questions and need to answer 6 correctly. USCIS publishes the exact questions.", "Te harán hasta 10 preguntas de civismo y necesitas responder 6 correctamente. USCIS publica las preguntas exactas."),
        tip("id", "Bring your green card and ID", "Lleva tu tarjeta verde e identificación", "Bring your green card, state ID, and any travel documents.", "Lleva tu tarjeta verde, identificación estatal y documentos de viaje."),
        tip("app", "Know your application", "Conoce tu solicitud", "Review your N-400 before the interview. Be ready to explain trips abroad, address history, and any arrests or tax issues.", "Revisa tu N-400. Prepárate para explicar viajes, direcciones, arrestos o impuestos."),
        tip("english", "English reading and writing test", "Examen de lectura y escritura en inglés", "You will read a sentence aloud and write a sentence dictated by the officer.", "Leerás una oración en voz alta y escribirás una oración dictada por el oficial.")
    ]

    private static let i130: [InterviewTip] = [
        tip("real", "Prove the relationship is real", "Prueba que la relación es real", "Bring joint financial records, photos over time, lease agreements, and affidavits from people who know you.", "Lleva registros financieros conjuntos, fotos a lo largo del tiempo, contratos y declaraciones juradas."),
        tip("details", "Know the details of your relationship", "Conoce los detalles de tu relación", "When did you meet? How did you get engaged? What are your daily routines?", "¿Cuándo se conocieron? ¿Cómo se comprometieron? ¿Cuáles son sus rutinas diarias?"),
        tip("prior", "If previously married, bring divorce decrees", "Si estuvieron casados antes, lleven decretos de divorcio", "You need to prove all prior marriages ended legally before the current marriage.", "Hay que probar que los matrimonios anteriores terminaron legalmente.")
    ]

    private static let general: [InterviewTip] = [
        tip("early", "Arrive early", "Llega temprano", "Plan to arrive 15–30 minutes before your appointment.", "Planea llegar 15–30 minutos antes de tu cita."),
        tip("orig", "Bring original documents", "Lleva documentos originales", "Have originals of everything you submitted, plus any additional evidence.", "Ten originales de todo lo que presentaste, más evidencia adicional."),
        tip("ask", "Answer only what is asked", "Responde solo lo que te preguntan", "Listen carefully, answer truthfully, and do not elaborate unnecessarily.", "Escucha con cuidado, responde con la verdad y no elabores de más.")
    ]

    private static func tip(_ id: String, _ enTitle: String, _ esTitle: String, _ enBody: String, _ esBody: String) -> InterviewTip {
        InterviewTip(id: id, enTitle: enTitle, esTitle: esTitle, enBody: enBody, esBody: esBody)
    }
}

public enum WaitEngine {
    public static var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }()

    public static func monthsSince(_ date: Date, now: Date = Date(), calendar: Calendar = calendar) -> Int {
        let start = calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
        let end = calendar.date(from: calendar.dateComponents([.year, .month], from: now)) ?? now
        return max(0, calendar.dateComponents([.month], from: start, to: end).month ?? 0)
    }

    public static func comparison(mine: WaitInput, cohort: [WaitInput], now: Date = Date(), calendar: Calendar = calendar) -> WaitComparison {
        let waits = cohort
            .filter { !$0.isSample && $0.spaceId == mine.spaceId && (mine.officeId == "unsure" || mine.officeId.isEmpty || $0.officeId == mine.officeId) }
            .map { monthsSince($0.filedMonth, now: now, calendar: calendar) }
            .sorted()
        let mineMonths = monthsSince(mine.filedMonth, now: now, calendar: calendar)
        let publishable = waits.count >= StatsMath.minimumSample
        let below = waits.filter { $0 < mineMonths }.count
        let percentile: Int? = publishable && !waits.isEmpty
            ? Int((Double(below) / Double(waits.count) * 100).rounded())
            : nil
        return WaitComparison(count: waits.count, mineMonths: mineMonths, percentile: percentile, isPublishable: publishable)
    }
}
