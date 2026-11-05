import Foundation
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

@MainActor
enum Bootstrap {
    static func run(_ database: Database) throws {
        if database.members.contains(where: { $0.isSample }) { return }
        try Seed.insert(into: database)
        database.save()
    }

    static func enterDemo(_ database: Database, language: String) throws {
        try run(database)
        if let demo = database.members.first(where: { $0.username == "app_review" }) {
            for member in database.members { member.isCurrentUser = member.id == demo.id }
            demo.role = "mod"
            demo.locale = language
            database.save()
            return
        }
        for member in database.members { member.isCurrentUser = false }
        let demo = Member(username: "app_review", locale: language, role: "mod", isCurrentUser: true)
        database.add(demo)
        for spaceID in Taxonomy.launchIDs.sorted() {
            database.add(Membership(spaceID: spaceID, member: demo))
        }
        let filed = Formatters.monthStart(Calendar.current.date(byAdding: .month, value: -14, to: .now) ?? .now)
        let biometrics = Calendar.current.date(byAdding: .day, value: 40, to: filed) ?? filed
        database.add(CaseProfile(
            spaceID: "i-751",
            formCode: "I-751",
            basedOn: BasedOn.marriage.rawValue,
            filedMonth: filed,
            officeID: "vsc",
            filingMethod: FilingMethod.paper.rawValue,
            currentStage: Stage.biometrics.rawValue,
            stageDates: ["filed": filed, "biometrics": biometrics],
            member: demo
        ))
        database.add(AppNotification(
            kind: "welcome",
            title: L10n.s(.welcomeNoteTitle, language),
            bodyText: L10n.s(.welcomeNoteBody, language),
            member: demo
        ))
        database.save()
    }
}

@MainActor
private enum Seed {
    static func insert(into database: Database) throws {
        var people: [String: Member] = [:]
        @discardableResult
        func person(
            _ name: String,
            role: String = "member",
            reputation: Int,
            locale: String = "en",
            completed: [String] = [],
            spaces: [String]
        ) -> Member {
            let member = Member(
                username: name,
                locale: locale,
                reputation: reputation,
                role: role,
                isSample: true,
                completedSpaceIDs: completed
            )
            database.add(member)
            for space in spaces {
                database.add(Membership(spaceID: space, member: member))
            }
            people[name] = member
            return member
        }

        person("mesa_waiting", reputation: 12, spaces: ["i-751", "i-765"])
        person("civic_oak", role: "helper", reputation: 160, completed: ["n-400"], spaces: ["n-400"])
        person("bridge_notes", reputation: 40, spaces: ["i-751", "i-130"])
        person("quiet_filing", reputation: 8, spaces: ["i-485", "n-400"])
        person("harbor_light", role: "helper", reputation: 120, completed: ["i-751"], spaces: ["i-751"])
        person("paper_path", reputation: 22, spaces: ["n-400", "i-765"])
        person("north_stamp", reputation: 30, spaces: ["n-400"])
        person("luna_steps", reputation: 55, locale: "es", spaces: ["i-751", "i-131"])
        person("field_day", reputation: 48, spaces: ["n-400", "i-485"])
        person("kind_queue", reputation: 36, spaces: ["i-130", "i-485"])
        person("atlas_row", reputation: 18, spaces: ["i-485"])
        person("sol_review", role: "verified_pro", reputation: 210, spaces: ["i-131", "n-400", "i-751"])
        person("mod_cedar", role: "mod", reputation: 80, spaces: ["n-400", "i-751", "i-485", "i-130", "i-765", "i-131"])
        person("rush_fee", reputation: 0, spaces: ["i-485"])

        func ago(_ days: Int) -> Date { Date().addingTimeInterval(TimeInterval(-days * 86_400)) }
        func month(_ year: Int, _ value: Int) -> Date {
            Calendar.current.date(from: DateComponents(year: year, month: value, day: 1)) ?? .now
        }

        @discardableResult
        func post(
            _ author: String,
            _ spaces: [String],
            _ type: PostKind,
            _ title: String,
            _ body: String,
            stage: String = "",
            office: String = "",
            form: String = "",
            filed: Date? = nil,
            faq: Bool = false,
            votes: Int = 0,
            days: Int = 1,
            replies: [(String, String, Int)] = [],
            helpful: String? = nil,
            status: String = "live",
            held: String = ""
        ) -> Post {
            let item = Post(
                spaceIDs: spaces,
                type: type.rawValue,
                title: title,
                bodyText: body,
                stage: stage,
                officeID: office,
                formCode: form,
                filedMonth: filed,
                status: status,
                heldReason: held,
                isFAQ: faq,
                createdAt: ago(days),
                upvoteCount: votes,
                author: people[author]
            )
            database.add(item)
            var made: [String: Comment] = [:]
            for (index, reply) in replies.enumerated() {
                let comment = Comment(
                    bodyText: reply.1,
                    createdAt: ago(max(days - index - 1, 0)),
                    upvoteCount: reply.2,
                    post: item,
                    author: people[reply.0]
                )
                database.add(comment)
                made[reply.0] = comment
            }
            if let helpful, let comment = made[helpful] {
                item.helpfulCommentID = comment.id
            }
            return item
        }

        post("civic_oak", ["n-400"], .tip,
             "What the N-400 path usually looks like, from filing to the oath",
             "People on this space usually talk about six markers: filed, biometrics, interview scheduled, interview done, a decision, and the oath. The field office and whether you filed online change the pace. This is a community map, not an official timeline and not legal advice. For the government's posted times, use the USCIS processing times page.",
             faq: true, votes: 34, days: 40)

        post("paper_path", ["n-400"], .question,
             "N-400 interview in three weeks at the New York office. What did they actually ask?",
             "I filed online. Biometrics were reused. The interview is in New York. I studied the civics questions from the official study materials. If you interviewed there recently, which part took the most time: the yes/no questions, civics, or the English reading? I want experiences, not a guess about my eligibility.",
             stage: Stage.interviewScheduled.rawValue, office: "nyc", form: "N-400", filed: month(2025, 11),
             votes: 18, days: 6,
             replies: [
                ("civic_oak", "I interviewed in New York last spring. Most of the appointment was the officer going through the form line by line. Civics was a short set of questions, then one sentence to read and one to write. I brought the appointment notice and my ID. That was my day, not a prediction of yours.", 11),
                ("sol_review", "General information only: I am a licensed attorney and I am not your lawyer. Officers usually cover identity, the application, English, and civics. Some people are told a supervisor still has to review the file. That is a description of the process, not a prediction, and not legal advice.", 7)
             ],
             helpful: "civic_oak")

        post("field_day", ["n-400"], .interview,
             "Boston field office interview, marriage-based N-400",
             "The interview was about 25 minutes. Civics came first, then the form. I was asked about trips I had listed. I answered only what I remembered and did not guess dates. I was approved the same day and put in line for an oath notice. One office, one morning. Please do not treat this as how your interview will go.",
             stage: Stage.interviewDone.rawValue, office: "boston", form: "N-400", filed: month(2025, 4),
             votes: 15, days: 18)

        post("north_stamp", ["n-400"], .timeline,
             "Timeline: online N-400 in Chicago, filed October 2024, oath in July 2026",
             "Filed online in October 2024. Biometrics were reused that November. The interview was scheduled in May 2026, the interview was in June, and the oath was in July. Chicago field office. I am posting the dates so other Chicago filings have something to set beside. One case is not a median.",
             stage: Stage.oath.rawValue, office: "chicago", form: "N-400", filed: month(2024, 10),
             votes: 21, days: 12)

        let vent = post("quiet_filing", ["n-400"], .vent,
             "Still waiting for a decision three weeks after my Miami interview",
             "The interview felt calm, and I was not told yes or no at the desk. It has been three weeks with no notice. I know some people hear the same day and some wait longer. I am posting because the quiet is hard, not because I want anyone to guess the result.",
             stage: Stage.interviewDone.rawValue, office: "miami", form: "N-400", filed: month(2025, 6),
             votes: 4, days: 3)

        post("harbor_light", ["i-751"], .tip,
             "I-751 stages people compare here",
             "Removal of conditions conversations usually sort into filed, biometrics or a reuse notice, a request for evidence, and approval. A long pause after biometrics comes up often. The pause itself is not a decision. Compare the office, the filing month, and whether the filing was joint. These are community stories, not USCIS processing times, and not legal advice.",
             faq: true, votes: 29, days: 36)

        post("mesa_waiting", ["i-751"], .question,
             "I-751 at Vermont, biometrics reused, still quiet after many months",
             "Paper filing, marriage-based, Vermont Service Center. Biometrics were reused. The status has not moved. If you filed around early 2025 at Vermont, how many months sat between biometrics and the next notice? I want ranges from people who already got a next step, not a prediction.",
             stage: Stage.biometrics.rawValue, office: "vsc", form: "I-751", filed: month(2025, 3),
             votes: 16, days: 4,
             replies: [
                ("harbor_light", "Mine was also Vermont, paper, and marriage-based. Biometrics were reused. Approval came a bit past 15 months from filing, with no interview. That was my case across 2024 and 2025. Yours can differ. I would not read a quiet status as a yes or a no.", 9),
                ("luna_steps", "En el mío, Vermont también, la biometría se reutilizó y no tuve entrevista. Entre la biometría y la aprobación pasaron muchos meses. No es asesoría, solo mi tiempo.", 6),
                ("kind_queue", "I received a request for evidence around month 11, then an approval later. Different facts, same office. The wait by itself did not tell me which way it would go.", 4)
             ])

        post("harbor_light", ["i-751"], .timeline,
             "Timeline update: I-751 at Vermont approved without an interview",
             "Filed by paper in June 2024. Biometrics were reused. There was no interview. The approval came in September 2025. It was a joint filing with my spouse. I am posting the dates so people at Vermont can compare. One approval is not a pattern.",
             stage: Stage.approved.rawValue, office: "vsc", form: "I-751", filed: month(2024, 6),
             votes: 24, days: 20)

        post("bridge_notes", ["i-751"], .question,
             "Request for evidence on a joint I-751. What kinds of documents did you send?",
             "The notice asked for more evidence that the marriage is shared. I will not post the notice. I am looking for categories people actually sent, such as a lease, joint taxes, or insurance, and what they left out. Please do not send photos of your documents.",
             stage: Stage.rfe.rawValue, office: "vsc", form: "I-751", filed: month(2025, 1),
             votes: 11, days: 9,
             replies: [
                ("harbor_light", "I sent categories, not a pile: a lease with both names, a joint tax transcript, and insurance. I redacted account numbers. My case was approved afterward. That selection fit my notice. Read your own notice, and skip posting scans here.", 8)
             ])

        post("atlas_row", ["i-485"], .tip,
             "Adjustment of status, the stages this space talks about",
             "When people here say adjustment, they usually mean the I-485: filing, biometrics, then either an interview or a long wait for a decision. Work permits and travel documents are related, and they have their own spaces. A combo card is not the green card. Compare notes from the same office. This is not legal advice and not an official clock.",
             faq: true, votes: 19, days: 28)

        post("quiet_filing", ["i-485"], .question,
             "Marriage-based I-485 at the National Benefits Center. How long from biometrics to an interview notice?",
             "I filed the petition, the adjustment, and the work permit together. Biometrics are done. The status still shows that step. If you were marriage-based through the National Benefits Center, what was the gap from biometrics to an interview notice, and which field office did you eventually get?",
             stage: Stage.biometrics.rawValue, office: "nbc", form: "I-485", filed: month(2026, 1),
             votes: 13, days: 8,
             replies: [
                ("kind_queue", "National Benefits Center, then an interview in Chicago about eight months after biometrics. Marriage-based. The work permit was approved in between. One path, not a schedule.", 6),
                ("field_day", "Mine went quiet and then a notice appeared. The field office mattered more than the month I filed. I would compare the office, not only the center that took the filing.", 3)
             ])

        post("field_day", ["i-485"], .interview,
             "Chicago adjustment interview, what the morning was like",
             "There was security, a wait, and then about half an hour with an officer. We were asked how we met and about dates on the forms. We brought originals and copies. We were approved, pending the card. This is a description of one morning, not a script.",
             stage: Stage.interviewDone.rawValue, office: "chicago", form: "I-485", filed: month(2025, 5),
             votes: 14, days: 15)

        post("kind_queue", ["i-130"], .tip,
             "This space is the relative petition, not the whole green card",
             "An I-130 is the petition. Adjustment inside the United States and the consular stage are different spaces. You can cross-post to up to three spaces when a question really spans them. People usually say whether they filed the petition alone or together with adjustment. Still not legal advice.",
             faq: true, votes: 17, days: 30)

        post("bridge_notes", ["i-130"], .timeline,
             "Timeline: standalone I-130 for my spouse, then the case left USCIS",
             "I filed online. The petition was approved, and the next messages were about the consular stage, which I will ask about in that space. I am posting only the petition portion here. The service center was Nebraska. One petition, not a forecast.",
             stage: Stage.approved.rawValue, office: "nsc", form: "I-130", filed: month(2025, 2),
             votes: 12, days: 11)

        post("paper_path", ["i-765"], .tip,
             "Work permit questions belong here. An eligibility code is not advice.",
             "People usually name the category they already filed under, such as c9 while an adjustment is pending. Naming a code is a label, not a suggestion that someone else qualifies. Say whether you mean a first card or a renewal, because those waits get mixed together. Not legal advice.",
             faq: true, votes: 16, days: 22)

        post("mesa_waiting", ["i-765"], .question,
             "First c9 work permit, pending for several months. What waits did you see?",
             "Filed with adjustment, category c9. I did not request an expedite. I am looking for recent waits from filing to approval for a first card, not a renewal. National Benefits Center. Please do not post photos of the card.",
             stage: Stage.filed.rawValue, office: "nbc", form: "I-765", filed: month(2026, 3),
             votes: 9, days: 5,
             replies: [
                ("paper_path", "First c9, filed with adjustment, approved a little after five months. A later renewal was a different wait. I did not expedite. One card, one year.", 5)
             ])

        post("sol_review", ["i-131"], .tip,
             "Keep advance parole conversations careful",
             "A travel document is not a promise about being allowed to return, and people with a pending case often talk to a lawyer or an accredited representative before they travel. This space is for experiences and process questions. Do not post the document. I am a licensed attorney. Nothing in this space is legal advice or a consultation.",
             faq: true, votes: 27, days: 25)

        post("luna_steps", ["i-131"], .question,
             "¿Alguien viajó con la tarjeta combo y contó cómo fue el regreso?",
             "Tengo la tarjeta combo por un ajuste pendiente. Quiero experiencias de un viaje que ya hicieron, no una recomendación sobre si yo debo viajar. Si saliste y regresaste, ¿te preguntaron algo más de lo habitual? No publiques fotos del documento.",
             stage: Stage.approved.rawValue, office: "nbc", form: "I-131", filed: month(2025, 9),
             votes: 8, days: 7,
             replies: [
                ("sol_review", "Comparto información general, no asesoría, y no soy tu abogada. En este espacio conviene distinguir entre contar un viaje ya hecho y pedir permiso para viajar. Un relato no dice si tu salida es segura. Si necesitas una respuesta sobre tu caso, habla con un abogado o con un representante acreditado.", 4)
             ])

        post("luna_steps", ["i-751"], .tip,
             "Lo que me pidieron en biometría, en español",
             "Fue corto: la cita, una identificación y las huellas. No me pidieron otra vez el paquete del caso. Comparto cómo fue el trámite, no una lista para copiar. Si tu cita dice otra cosa, sigue tu cita.",
             stage: Stage.biometrics.rawValue, office: "vsc", form: "I-751", filed: month(2025, 4),
             votes: 10, days: 14)

        post("rush_fee", ["i-485"], .question,
             "I can expedite any case this week",
             "Pay to expedite your case. WhatsApp me and gift cards are fine. Guaranteed approval.",
             days: 1, status: "held", held: SafetyHold.scam.rawValue)

        if let civic = people["civic_oak"], let harbor = people["harbor_light"] {
            database.add(ReportItem(reporterID: civic.id, targetType: "post", targetID: vent.id, reason: "misinformation"))
            database.add(ReportItem(reporterID: harbor.id, targetType: "post", targetID: vent.id, reason: "other"))
        }

        var serial = 0
        func sampleProfile(space: String, form: String, office: String, current: String, dates: [String: Date]) {
            serial += 1
            let member = Member(username: String(format: "path_%04d", serial), isSample: true)
            database.add(member)
            database.add(CaseProfile(
                spaceID: space,
                formCode: form,
                basedOn: BasedOn.marriage.rawValue,
                filedMonth: dates["filed"] ?? .now,
                officeID: office,
                filingMethod: FilingMethod.paper.rawValue,
                currentStage: current,
                stageDates: dates,
                isSample: true,
                member: member
            ))
        }

        let anchor = BenchmarkEngine.calendar.date(from: DateComponents(year: 2024, month: 3, day: 1)) ?? .now
        func shift(_ days: Int) -> Date {
            BenchmarkEngine.calendar.date(byAdding: .day, value: days, to: anchor) ?? anchor
        }

        let i751 = [392, 401, 410, 418, 425, 430, 433, 438, 440, 445, 448, 452, 460, 466, 470, 475, 480, 488, 495, 502, 510, 515, 428, 436]
        for (offset, days) in i751.enumerated() {
            let filed = shift(offset % 20)
            sampleProfile(
                space: "i-751", form: "I-751", office: "vsc", current: Stage.approved.rawValue,
                dates: ["filed": filed, "biometrics": shift(offset % 20 + 50), "approved": BenchmarkEngine.calendar.date(byAdding: .day, value: days, to: filed) ?? filed]
            )
        }

        let n400 = [188, 196, 205, 214, 220, 228, 236, 241, 248, 255, 260, 268, 274, 281, 290, 298, 305, 312, 320, 328, 336, 244]
        for days in n400 {
            sampleProfile(
                space: "n-400", form: "N-400", office: "nyc", current: Stage.interviewScheduled.rawValue,
                dates: ["filed": anchor, "biometrics": shift(35), "interview_scheduled": shift(days)]
            )
        }

        let i485 = [28, 32, 35, 38, 41, 44, 47, 49, 52, 55, 58, 61, 64, 68, 71, 74, 78, 82, 86, 90, 43]
        for days in i485 {
            sampleProfile(
                space: "i-485", form: "I-485", office: "nbc", current: Stage.biometrics.rawValue,
                dates: ["filed": anchor, "biometrics": shift(days)]
            )
        }

        let i765 = [92, 98, 105, 112, 118, 124, 130, 136, 142, 148, 154, 160, 166, 172, 178, 184, 110, 128, 151, 139]
        for days in i765 {
            sampleProfile(
                space: "i-765", form: "I-765", office: "nbc", current: Stage.approved.rawValue,
                dates: ["filed": anchor, "approved": shift(days)]
            )
        }
    }
}
