import Foundation

public enum LKey: String {
    case appName, notAffiliated, pitch, contactFooter
    case welcomeTitle, languageLabel, english, spanish
    case continueApple, continueEmail, emailTitle, emailHelp, emailPlaceholder, emailInvalid, useEmail
    case reviewerDemo, reviewerDemoHelp, orWord
    case usernameTitle, usernameHelp, usernamePlaceholder
    case usernameTooShort, usernameTooLong, usernameChars, usernameReserved, usernameTaken
    case spacesTitle, spacesHint, searchSpaces, startHere, activeSpace, newSpace, pickAtLeastOne, selectedCount
    case rulesTitle, rulesBody, agreeRules, agreeNotAdvice, acceptToContinue
    case profileStepTitle, profileStepHelp, chooseStage, skipForNow, saveProfile
    case back, next, continueAction, cancel, save, done, delete, edit, close, search
    case tabHome, tabSpaces, tabAsk, tabTimelines, tabYou
    case sortNew, sortTop, sortUnanswered, allTypes, allStages, allOffices
    case emptyFeedTitle, emptyFeedBody, sampleNote, feedDisclaimer, noSearchResults, searchPrompt
    case topEmpty, unansweredEmpty
    case typeQuestion, typeTimeline, typeInterview, typeTip, typeVent
    case typeQuestionHelp, typeTimelineHelp, typeInterviewHelp, typeTipHelp, typeVentHelp
    case stageFiled, stageBiometrics, stageRFE, stageInterviewScheduled, stageInterviewDone
    case stageApproved, stageDenied, stageOath
    case basedMarriage, basedParent, basedChild, basedSibling, basedEmployment
    case basedAsylum, basedRefugee, basedDiversity, basedFiance, basedOther
    case methodOnline, methodPaper
    case officeServiceCenter, officeField, officeNBC
    case sample, solved, oneReply, manyReplies, oneMember, manyMembers, deletedMember
    case helpful, markHelpful, bookmark, bookmarked, report, blockUser, share, editedLabel, pinned
    case notLegalShort, communityBanner, heldBanner, removedBanner
    case editWindow, deletePostTitle, deletePostBody, deleteCommentTitle
    case similarTitle, writeReply, commentPlaceholder, cancelReply, replyTo
    case safetyReceipt, safetyANumber, safetySSN, safetyPassport, safetyAbusive, safetyScam, safetyDocument
    case askPickType, askPickSpace, askWrite, alsoShowIn, upToThreeSpaces
    case titleLabel, titlePlaceholder, bodyLabel, bodyPlaceholder, addPhotos, photoRule, maxPhotos
    case publish, submitForReview, titleTooShort, bodyTooShort, timelineNote, postedToast, heldToast, imageRejected
    case caseProfile, addCaseProfile, editCaseProfile, formLabel, basedOnLabel, filingMonth
    case officeLabel, methodLabel, stageLabel, stageDates, stageDatesHelp
    case selfAttested, selfAttestedHelp, badgePreview, badgePreviewHelp, profileSaved
    case yourCases, noCaseYet, aboutMonths, aboutDays, oneMonth, filedShort
    case exampleTitle, exampleBody, realTitle, realBody, notEnoughTitle, notEnoughBody
    case medianLabel, rangeLabel, peopleCount, onePerson, officialTimes, officialNote
    case feedTab, statsTab, faqTab, emptySpaceTitle, emptySpaceBody, askInSpace
    case join, joined, leaveSpace, leaveSpaceBody
    case levelNewcomer, levelNeighbor, levelGuide, levelHelperLevel, levelMentor
    case roleHelper, roleMod, roleVerified, finishedProcess, reputationLabel
    case yourPosts, noPostsYet, bookmarksTitle, noBookmarks, joinedSpaces
    case notifications, languageSetting, rulesSetting, privacySetting, contactSetting
    case blockedSetting, aboutSetting, deleteAccount, deleteAccountBody, deleteAccountConfirm
    case signedInApple, signedInEmail, emailPrivate, noBlocked, unblock, accountDeleted
    case notifyRepliesPost, notifyRepliesComment, notifySolved, notifyFollowed, notifyDigest
    case quietHours, quietHoursDetail, quietPaused, digestHeader, digestEmpty
    case markAllRead, noNotifications, welcomeNoteTitle, welcomeNoteBody
    case privacyTitle, privacyBody, contactTitle, contactBody, aboutTitle, aboutBody, versionLabel
    case moderation, modQueue, modEmpty, reviewerNotesTitle, reviewerNotesBody
    case restore, removeContent, dismissReport, reportCount, heldLabel
    case reportTitle, reportThanks, alreadyReported
    case reportSpam, reportIdentifiers, reportHarassment, reportMisinfo, reportSolicitation, reportOther
    case blockTitle, blockConfirm, blockedToast
    case verifiedFootnote, threeReportNote, statusHeld, statusRemoved, statusLive
    case thisWeek, newPostsCount, dismiss, choose, commentHeld, saved
    case couldNotSignIn, moreActions, upvote, statusWord, retry, reply, sendReply
    case caseProfiles, settings, openPost
}

public enum L10n {
    public static func s(_ key: LKey, _ lang: String, _ args: CVarArg...) -> String {
        let (english, spanish) = pair(key)
        let value = lang == "es" ? spanish : english
        guard !args.isEmpty else { return value }
        return String(
            format: value,
            locale: Locale(identifier: lang == "es" ? "es" : "en"),
            arguments: args
        )
    }

    public static func stage(_ raw: String, _ lang: String) -> String {
        switch raw {
        case Stage.filed.rawValue: return s(.stageFiled, lang)
        case Stage.biometrics.rawValue: return s(.stageBiometrics, lang)
        case Stage.rfe.rawValue: return s(.stageRFE, lang)
        case Stage.interviewScheduled.rawValue: return s(.stageInterviewScheduled, lang)
        case Stage.interviewDone.rawValue: return s(.stageInterviewDone, lang)
        case Stage.approved.rawValue: return s(.stageApproved, lang)
        case Stage.denied.rawValue: return s(.stageDenied, lang)
        case Stage.oath.rawValue: return s(.stageOath, lang)
        default: return raw
        }
    }

    public static func postKind(_ raw: String, _ lang: String) -> String {
        switch raw {
        case PostKind.question.rawValue: return s(.typeQuestion, lang)
        case PostKind.timeline.rawValue: return s(.typeTimeline, lang)
        case PostKind.interview.rawValue: return s(.typeInterview, lang)
        case PostKind.tip.rawValue: return s(.typeTip, lang)
        case PostKind.vent.rawValue: return s(.typeVent, lang)
        default: return raw
        }
    }

    public static func postKindHelp(_ raw: String, _ lang: String) -> String {
        switch raw {
        case PostKind.question.rawValue: return s(.typeQuestionHelp, lang)
        case PostKind.timeline.rawValue: return s(.typeTimelineHelp, lang)
        case PostKind.interview.rawValue: return s(.typeInterviewHelp, lang)
        case PostKind.tip.rawValue: return s(.typeTipHelp, lang)
        case PostKind.vent.rawValue: return s(.typeVentHelp, lang)
        default: return raw
        }
    }

    public static func basedOn(_ raw: String, _ lang: String) -> String {
        switch raw {
        case BasedOn.marriage.rawValue: return s(.basedMarriage, lang)
        case BasedOn.parent.rawValue: return s(.basedParent, lang)
        case BasedOn.child.rawValue: return s(.basedChild, lang)
        case BasedOn.sibling.rawValue: return s(.basedSibling, lang)
        case BasedOn.employment.rawValue: return s(.basedEmployment, lang)
        case BasedOn.asylum.rawValue: return s(.basedAsylum, lang)
        case BasedOn.refugee.rawValue: return s(.basedRefugee, lang)
        case BasedOn.diversity.rawValue: return s(.basedDiversity, lang)
        case BasedOn.fiance.rawValue: return s(.basedFiance, lang)
        default: return s(.basedOther, lang)
        }
    }

    public static func filingMethod(_ raw: String, _ lang: String) -> String {
        raw == FilingMethod.paper.rawValue ? s(.methodPaper, lang) : s(.methodOnline, lang)
    }

    public static func officeType(_ type: OfficeType, _ lang: String) -> String {
        switch type {
        case .serviceCenter: return s(.officeServiceCenter, lang)
        case .fieldOffice: return s(.officeField, lang)
        case .nbc: return s(.officeNBC, lang)
        case .unsure: return ""
        }
    }

    public static func replies(_ count: Int, _ lang: String) -> String {
        count == 1 ? s(.oneReply, lang) : s(.manyReplies, lang, count)
    }

    public static func members(_ count: Int, _ lang: String) -> String {
        count == 1 ? s(.oneMember, lang) : s(.manyMembers, lang, count)
    }

    public static func people(_ count: Int, _ lang: String) -> String {
        count == 1 ? s(.onePerson, lang) : s(.peopleCount, lang, count)
    }

    public static func level(for reputation: Int, _ lang: String) -> String {
        switch reputation {
        case ..<20: return s(.levelNewcomer, lang)
        case 20..<50: return s(.levelNeighbor, lang)
        case 50..<100: return s(.levelGuide, lang)
        case 100..<250: return s(.levelHelperLevel, lang)
        default: return s(.levelMentor, lang)
        }
    }

    public static func safetyMessage(_ verdict: SafetyVerdict, _ lang: String) -> String? {
        switch verdict {
        case .allow:
            return nil
        case .block(let reason):
            switch reason {
            case .receiptNumber: return s(.safetyReceipt, lang)
            case .aNumber: return s(.safetyANumber, lang)
            case .ssn: return s(.safetySSN, lang)
            case .passport: return s(.safetyPassport, lang)
            case .abusiveLanguage: return s(.safetyAbusive, lang)
            }
        case .hold:
            return s(.safetyScam, lang)
        }
    }

    private static func pair(_ key: LKey) -> (String, String) {
        switch key {
        case .appName: return ("CaseCircle", "CaseCircle")
        case .notAffiliated: return ("Not affiliated with USCIS", "Sin afiliación con USCIS")
        case .pitch: return (
            "Find people on the same immigration path as you, and read what they saw a few steps ahead.",
            "Encuentra personas en el mismo proceso migratorio y lee lo que vieron unos pasos antes."
        )
        case .contactFooter: return ("Contact \(Links.supportEmail)", "Contacto \(Links.supportEmail)")
        case .welcomeTitle: return ("A quieter place to wait together", "Un lugar más tranquilo para esperar juntos")
        case .languageLabel: return ("Language", "Idioma")
        case .english: return ("English", "Inglés")
        case .spanish: return ("Spanish", "Español")
        case .continueApple: return ("Sign in with Apple", "Iniciar sesión con Apple")
        case .continueEmail: return ("Continue with email", "Continuar con correo")
        case .emailTitle: return ("Email", "Correo")
        case .emailHelp: return (
            "Your email stays on this device and is never shown on posts. This version does not send a link.",
            "Tu correo se queda en este dispositivo y no aparece en las publicaciones. Esta versión no envía un enlace."
        )
        case .emailPlaceholder: return ("you@email.com", "tu@correo.com")
        case .emailInvalid: return ("Enter a valid email.", "Escribe un correo válido.")
        case .useEmail: return ("Continue", "Continuar")
        case .reviewerDemo: return ("App Review demo", "Demo de revisión")
        case .reviewerDemoHelp: return (
            "Opens a moderator account with sample spaces.",
            "Abre una cuenta de moderación con espacios de ejemplo."
        )
        case .orWord: return ("or", "o")
        case .usernameTitle: return ("Pick a pseudonym", "Elige un seudónimo")
        case .usernameHelp: return (
            "Use a name that is not your real name. Official-sounding names are blocked.",
            "Usa un nombre que no sea el tuyo. Los nombres que parecen oficiales están bloqueados."
        )
        case .usernamePlaceholder: return ("quiet_filing", "espera_tranquila")
        case .usernameTooShort: return ("Use at least 3 characters.", "Usa al menos 3 caracteres.")
        case .usernameTooLong: return ("Use 20 characters or fewer.", "Usa 20 caracteres o menos.")
        case .usernameChars: return ("Letters, numbers, and underscores only.", "Solo letras, números y guion bajo.")
        case .usernameReserved: return ("That name sounds official. Pick another.", "Ese nombre parece oficial. Elige otro.")
        case .usernameTaken: return ("That name is taken.", "Ese nombre ya existe.")
        case .spacesTitle: return ("Which processes are yours?", "¿Qué procesos son los tuyos?")
        case .spacesHint: return (
            "Your home feed starts with these. You can join more later. Try I-751, citizenship, or work permit.",
            "Tu inicio muestra estos procesos. Puedes unirte a más después. Prueba I-751, ciudadanía o permiso de trabajo."
        )
        case .searchSpaces: return ("Search forms or topics", "Busca formularios o temas")
        case .startHere: return ("Start here", "Empieza aquí")
        case .activeSpace: return ("Active", "Activo")
        case .newSpace: return ("New", "Nuevo")
        case .pickAtLeastOne: return ("Choose at least one process.", "Elige al menos un proceso.")
        case .selectedCount: return ("%d selected", "%d seleccionados")
        case .rulesTitle: return ("Before you post", "Antes de publicar")
        case .rulesBody: return (rulesEN, rulesES)
        case .agreeRules: return ("I agree to the community rules", "Acepto las normas de la comunidad")
        case .agreeNotAdvice: return (
            "I understand CaseCircle is not a law firm and is not part of USCIS or any government agency",
            "Entiendo que CaseCircle no es un bufete y no es parte de USCIS ni de ninguna agencia del gobierno"
        )
        case .acceptToContinue: return ("Accept both to continue.", "Acepta las dos para continuar.")
        case .profileStepTitle: return ("Add a case profile", "Agrega un perfil de caso")
        case .profileStepHelp: return (
            "Only the form, office, filing month, and stage show on your posts. No receipt number.",
            "En tus publicaciones solo se ve el formulario, la oficina, el mes y la etapa. Sin número de recibo."
        )
        case .chooseStage: return (
            "Choose a current stage, then save.",
            "Elige la etapa actual y luego guarda."
        )
        case .skipForNow: return ("Skip for now", "Omitir por ahora")
        case .saveProfile: return ("Save profile", "Guardar perfil")
        case .back: return ("Back", "Atrás")
        case .next: return ("Next", "Siguiente")
        case .continueAction: return ("Continue", "Continuar")
        case .cancel: return ("Cancel", "Cancelar")
        case .save: return ("Save", "Guardar")
        case .done: return ("Done", "Listo")
        case .delete: return ("Delete", "Eliminar")
        case .edit: return ("Edit", "Editar")
        case .close: return ("Close", "Cerrar")
        case .search: return ("Search", "Buscar")
        case .tabHome: return ("Home", "Inicio")
        case .tabSpaces: return ("Spaces", "Espacios")
        case .tabAsk: return ("Ask", "Preguntar")
        case .tabTimelines: return ("Timelines", "Tiempos")
        case .tabYou: return ("You", "Tú")
        case .sortNew: return ("New", "Nuevo")
        case .sortTop: return ("Top", "Destacado")
        case .sortUnanswered: return ("Unanswered", "Sin respuesta")
        case .allTypes: return ("All posts", "Todas")
        case .allStages: return ("All stages", "Todas las etapas")
        case .allOffices: return ("All offices", "Todas las oficinas")
        case .emptyFeedTitle: return ("Nothing here yet", "Todavía no hay nada")
        case .emptyFeedBody: return (
            "Join an active space, or be the first to post a timeline in a new one.",
            "Únete a un espacio activo, o publica el primer tiempo en uno nuevo."
        )
        case .sampleNote: return (
            "Stories marked Sample ship with the app so a space is not empty. They are not live posts from other people, and they are not USCIS data.",
            "Las historias marcadas Ejemplo vienen con la app para que el espacio no esté vacío. No son publicaciones en vivo de otras personas, ni datos de USCIS."
        )
        case .feedDisclaimer: return (
            "Community experiences, not legal advice. CaseCircle is not affiliated with USCIS.",
            "Experiencias de la comunidad, no asesoría legal. CaseCircle no está afiliado a USCIS."
        )
        case .noSearchResults: return ("No posts match that search.", "Ninguna publicación coincide con la búsqueda.")
        case .searchPrompt: return ("Search titles and stories", "Busca títulos e historias")
        case .topEmpty: return ("Nothing from the last 7 days has votes yet.", "Nada de los últimos 7 días tiene votos todavía.")
        case .unansweredEmpty: return ("Every question in your spaces has a reply.", "Cada pregunta en tus espacios tiene respuesta.")
        case .typeQuestion: return ("Question", "Pregunta")
        case .typeTimeline: return ("Timeline", "Tiempo")
        case .typeInterview: return ("Interview", "Entrevista")
        case .typeTip: return ("Tip", "Consejo")
        case .typeVent: return ("Vent", "Desahogo")
        case .typeQuestionHelp: return ("Ask people who have been through this step.", "Pregunta a quien ya pasó por este paso.")
        case .typeTimelineHelp: return ("Share a stage change. It can update your case profile.", "Comparte un cambio de etapa. Puede actualizar tu perfil.")
        case .typeInterviewHelp: return ("Describe one interview you already had.", "Describe una entrevista que ya tuviste.")
        case .typeTipHelp: return ("A practical note other people can reuse.", "Una nota práctica que otras personas pueden usar.")
        case .typeVentHelp: return ("The wait is hard. Be kind, and still skip identifiers.", "La espera es dura. Sé amable, y no pongas identificadores.")
        case .stageFiled: return ("Filed", "Presentado")
        case .stageBiometrics: return ("Biometrics", "Biometría")
        case .stageRFE: return ("Request for evidence", "Pedido de evidencia")
        case .stageInterviewScheduled: return ("Interview scheduled", "Entrevista programada")
        case .stageInterviewDone: return ("Interview done", "Entrevista hecha")
        case .stageApproved: return ("Approved", "Aprobado")
        case .stageDenied: return ("Denied", "Negado")
        case .stageOath: return ("Oath", "Juramento")
        case .basedMarriage: return ("Marriage", "Matrimonio")
        case .basedParent: return ("Parent", "Padre o madre")
        case .basedChild: return ("Child", "Hijo o hija")
        case .basedSibling: return ("Sibling", "Hermano o hermana")
        case .basedEmployment: return ("Employment", "Empleo")
        case .basedAsylum: return ("Asylum", "Asilo")
        case .basedRefugee: return ("Refugee", "Refugio")
        case .basedDiversity: return ("Diversity visa", "Lotería de visas")
        case .basedFiance: return ("Fiancé(e)", "Prometido(a)")
        case .basedOther: return ("Other", "Otro")
        case .methodOnline: return ("Online", "En línea")
        case .methodPaper: return ("Paper", "En papel")
        case .officeServiceCenter: return ("Service center", "Centro de servicio")
        case .officeField: return ("Field office", "Oficina local")
        case .officeNBC: return ("National Benefits Center", "Centro Nacional de Beneficios")
        case .sample: return ("Sample", "Ejemplo")
        case .solved: return ("Helpful answer", "Respuesta útil")
        case .oneReply: return ("1 reply", "1 respuesta")
        case .manyReplies: return ("%d replies", "%d respuestas")
        case .oneMember: return ("1 member", "1 miembro")
        case .manyMembers: return ("%d members", "%d miembros")
        case .deletedMember: return ("Deleted member", "Miembro eliminado")
        case .helpful: return ("Helpful", "Útil")
        case .markHelpful: return ("Mark as helpful", "Marcar como útil")
        case .bookmark: return ("Save", "Guardar")
        case .bookmarked: return ("Saved", "Guardado")
        case .report: return ("Report", "Denunciar")
        case .blockUser: return ("Block", "Bloquear")
        case .share: return ("Share", "Compartir")
        case .editedLabel: return ("Edited", "Editado")
        case .pinned: return ("Pinned", "Fijado")
        case .notLegalShort: return ("Not legal advice. Not USCIS.", "No es asesoría legal. No es USCIS.")
        case .communityBanner: return (
            "Answers are other people's experiences. They are not legal advice and they are not from USCIS.",
            "Las respuestas son experiencias de otras personas. No son asesoría legal ni vienen de USCIS."
        )
        case .heldBanner: return (
            "Held for review. A moderator will look at this before it appears in the feed.",
            "En revisión. Un moderador lo verá antes de que aparezca en el feed."
        )
        case .removedBanner: return (
            "Removed from the feed after reports or a moderator decision.",
            "Quitado del feed tras denuncias o una decisión de moderación."
        )
        case .editWindow: return ("You can edit for 24 hours after posting.", "Puedes editar durante 24 horas después de publicar.")
        case .deletePostTitle: return ("Delete this post?", "¿Eliminar esta publicación?")
        case .deletePostBody: return ("Replies on it will be removed too.", "Las respuestas también se eliminarán.")
        case .deleteCommentTitle: return ("Delete this reply?", "¿Eliminar esta respuesta?")
        case .similarTitle: return ("Similar stories already here", "Historias parecidas que ya están")
        case .writeReply: return ("Write a reply", "Escribe una respuesta")
        case .commentPlaceholder: return ("Your experience, not legal advice", "Tu experiencia, no asesoría legal")
        case .cancelReply: return ("Cancel reply", "Cancelar respuesta")
        case .replyTo: return ("Reply to %@", "Responder a %@")
        case .safetyReceipt: return (
            "Remove the receipt number. Receipt numbers stay off CaseCircle.",
            "Quita el número de recibo. Los números de recibo no se publican en CaseCircle."
        )
        case .safetyANumber: return (
            "Remove the A-number. CaseCircle does not collect alien numbers.",
            "Quita el número A. CaseCircle no guarda números de extranjero."
        )
        case .safetySSN: return (
            "Remove the Social Security number.",
            "Quita el número de Seguro Social."
        )
        case .safetyPassport: return (
            "Remove the passport number.",
            "Quita el número de pasaporte."
        )
        case .safetyAbusive: return (
            "Rewrite without abusive language.",
            "Vuelve a escribirlo sin lenguaje abusivo."
        )
        case .safetyScam: return (
            "This looks like a fee request or off-platform solicitation. It will be held for a moderator instead of published.",
            "Esto parece un cobro o una solicitud fuera de la app. Quedará en revisión en vez de publicarse."
        )
        case .safetyDocument: return (
            "This photo looks like a case document or contains an identifier. Do not upload notices, cards, or passports.",
            "Esta foto parece un documento del caso o tiene un identificador. No subas avisos, tarjetas ni pasaportes."
        )
        case .askPickType: return ("What are you posting?", "¿Qué vas a publicar?")
        case .askPickSpace: return ("Which process?", "¿Qué proceso?")
        case .askWrite: return ("Write it", "Escríbelo")
        case .alsoShowIn: return ("Also show in", "Mostrar también en")
        case .upToThreeSpaces: return ("Up to three processes.", "Hasta tres procesos.")
        case .titleLabel: return ("Title", "Título")
        case .titlePlaceholder: return ("The question in one line", "La pregunta en una línea")
        case .bodyLabel: return ("Details", "Detalles")
        case .bodyPlaceholder: return (
            "Office, filing month, and what you already know. No receipt numbers or document photos.",
            "Oficina, mes de presentación y lo que ya sabes. Sin números de recibo ni fotos de documentos."
        )
        case .addPhotos: return ("Add photos", "Agregar fotos")
        case .photoRule: return ("Up to 4. No documents, IDs, or receipt notices.", "Hasta 4. Sin documentos, identificaciones ni avisos de recibo.")
        case .maxPhotos: return ("You can attach 4 photos.", "Puedes adjuntar 4 fotos.")
        case .publish: return ("Publish", "Publicar")
        case .submitForReview: return ("Submit for review", "Enviar a revisión")
        case .titleTooShort: return ("Write a title of at least 8 characters.", "Escribe un título de al menos 8 caracteres.")
        case .bodyTooShort: return ("Add a little more detail.", "Agrega un poco más de detalle.")
        case .timelineNote: return (
            "A timeline update also moves your case profile to the stage you pick.",
            "Una actualización de tiempo también mueve tu perfil a la etapa que elijas."
        )
        case .postedToast: return ("Posted.", "Publicado.")
        case .heldToast: return ("Held for review.", "En revisión.")
        case .imageRejected: return ("That photo was not attached.", "Esa foto no se adjuntó.")
        case .caseProfile: return ("Case profile", "Perfil del caso")
        case .addCaseProfile: return ("Add a case", "Agregar un caso")
        case .editCaseProfile: return ("Edit case", "Editar caso")
        case .formLabel: return ("Form", "Formulario")
        case .basedOnLabel: return ("Based on", "Basado en")
        case .filingMonth: return ("Filing month", "Mes de presentación")
        case .officeLabel: return ("Office", "Oficina")
        case .methodLabel: return ("How you filed", "Cómo lo presentaste")
        case .stageLabel: return ("Current stage", "Etapa actual")
        case .stageDates: return ("Stage dates you remember", "Fechas de etapa que recuerdas")
        case .stageDatesHelp: return (
            "Month is enough. Leave a stage blank if you do not remember it.",
            "El mes basta. Deja una etapa en blanco si no la recuerdas."
        )
        case .selfAttested: return ("I have finished this process", "Ya terminé este proceso")
        case .selfAttestedHelp: return ("Self-attested. Not checked against any record.", "Declarado por ti. No se verifica con ningún registro.")
        case .badgePreview: return ("What others see", "Lo que ven los demás")
        case .badgePreviewHelp: return (
            "This badge is the only case detail attached to your posts.",
            "Esta etiqueta es el único dato del caso que va en tus publicaciones."
        )
        case .profileSaved: return ("Case profile saved.", "Perfil guardado.")
        case .yourCases: return ("Your cases", "Tus casos")
        case .noCaseYet: return ("Add a case profile to see how long you have been waiting.", "Agrega un perfil para ver cuánto llevas esperando.")
        case .aboutMonths: return ("About %d months since filing", "Unos %d meses desde la presentación")
        case .aboutDays: return ("%d days since filing", "%d días desde la presentación")
        case .oneMonth: return ("About 1 month since filing", "Cerca de 1 mes desde la presentación")
        case .filedShort: return ("filed %@", "presentado %@")
        case .exampleTitle: return ("Example benchmarks", "Tiempos de ejemplo")
        case .exampleBody: return (
            "These figures are sample data so you can see the layout. They are not real waits and they are not USCIS processing times.",
            "Estas cifras son datos de ejemplo para ver el diseño. No son esperas reales ni los tiempos oficiales de USCIS."
        )
        case .realTitle: return ("Community-reported waits", "Esperas reportadas por la comunidad")
        case .realBody: return (
            "Shown only when at least 20 people at the same office shared both stages. Not official.",
            "Solo se muestra cuando al menos 20 personas de la misma oficina compartieron las dos etapas. No es oficial."
        )
        case .notEnoughTitle: return ("Not enough shared timelines yet", "Todavía no hay suficientes tiempos")
        case .notEnoughBody: return (
            "A benchmark appears after 20 people at the same office report a stage change. Smaller groups stay hidden.",
            "Un tiempo aparece cuando 20 personas de la misma oficina reportan un cambio de etapa. Los grupos más pequeños se ocultan."
        )
        case .medianLabel: return ("Median %d days", "Mediana de %d días")
        case .rangeLabel: return ("%1$d–%2$d days", "%1$d–%2$d días")
        case .peopleCount: return ("%d people", "%d personas")
        case .onePerson: return ("1 person", "1 persona")
        case .officialTimes: return ("Official USCIS processing times", "Tiempos oficiales de procesamiento de USCIS")
        case .officialNote: return (
            "Opens the USCIS website. CaseCircle is not affiliated with USCIS.",
            "Abre el sitio de USCIS. CaseCircle no está afiliado a USCIS."
        )
        case .feedTab: return ("Feed", "Feed")
        case .statsTab: return ("Stats", "Datos")
        case .faqTab: return ("FAQ", "FAQ")
        case .emptySpaceTitle: return ("This space is new", "Este espacio es nuevo")
        case .emptySpaceBody: return (
            "Be the first to post a timeline or a question.",
            "Sé la primera persona en publicar un tiempo o una pregunta."
        )
        case .askInSpace: return ("Ask in this space", "Preguntar en este espacio")
        case .join: return ("Join", "Unirme")
        case .joined: return ("Joined", "Unido")
        case .leaveSpace: return ("Leave space", "Salir del espacio")
        case .leaveSpaceBody: return ("It will leave your home feed. Your case profile stays.", "Saldrá de tu inicio. Tu perfil de caso se queda.")
        case .levelNewcomer: return ("Newcomer", "Recién llegado")
        case .levelNeighbor: return ("Neighbor", "Vecino")
        case .levelGuide: return ("Guide", "Guía")
        case .levelHelperLevel: return ("Helper", "Colaborador")
        case .levelMentor: return ("Mentor", "Mentor")
        case .roleHelper: return ("Helper", "Colaborador")
        case .roleMod: return ("Moderator", "Moderación")
        case .roleVerified: return ("Verified professional", "Profesional verificado")
        case .finishedProcess: return ("Finished this process", "Terminó este proceso")
        case .reputationLabel: return ("Reputation", "Reputación")
        case .yourPosts: return ("Your posts", "Tus publicaciones")
        case .noPostsYet: return ("You have not posted yet.", "Todavía no publicas.")
        case .bookmarksTitle: return ("Saved", "Guardados")
        case .noBookmarks: return ("Save a post to find it later.", "Guarda una publicación para verla después.")
        case .joinedSpaces: return ("Your spaces", "Tus espacios")
        case .notifications: return ("Notifications", "Avisos")
        case .languageSetting: return ("Language", "Idioma")
        case .rulesSetting: return ("Community rules", "Normas")
        case .privacySetting: return ("Privacy", "Privacidad")
        case .contactSetting: return ("Contact", "Contacto")
        case .blockedSetting: return ("Blocked people", "Personas bloqueadas")
        case .aboutSetting: return ("About", "Acerca de")
        case .deleteAccount: return ("Delete account", "Eliminar cuenta")
        case .deleteAccountBody: return (
            "Your case profile is removed. Posts you wrote stay, with your name replaced by “Deleted member.” This only affects this device.",
            "Tu perfil de caso se elimina. Las publicaciones se quedan, con tu nombre reemplazado por “Miembro eliminado”. Esto solo afecta este dispositivo."
        )
        case .deleteAccountConfirm: return ("Delete account", "Eliminar cuenta")
        case .signedInApple: return ("Signed in with Apple", "Sesión con Apple")
        case .signedInEmail: return ("Signed in with email", "Sesión con correo")
        case .emailPrivate: return ("Only on this device. Not shown on posts.", "Solo en este dispositivo. No aparece en las publicaciones.")
        case .noBlocked: return ("You have not blocked anyone.", "No has bloqueado a nadie.")
        case .unblock: return ("Unblock", "Desbloquear")
        case .accountDeleted: return ("Account deleted.", "Cuenta eliminada.")
        case .notifyRepliesPost: return ("Replies to my posts", "Respuestas a mis publicaciones")
        case .notifyRepliesComment: return ("Replies to my comments", "Respuestas a mis comentarios")
        case .notifySolved: return ("My reply marked helpful", "Mi respuesta marcada útil")
        case .notifyFollowed: return ("New replies in saved posts", "Respuestas nuevas en guardados")
        case .notifyDigest: return ("Weekly digest", "Resumen semanal")
        case .quietHours: return ("Quiet hours", "Horas de silencio")
        case .quietHoursDetail: return ("Push pauses from 10:00 p.m. to 8:00 a.m.", "Los avisos se pausan de 10:00 p.m. a 8:00 a.m.")
        case .quietPaused: return ("Quiet hours. Push is paused until 8:00 a.m.", "Horas de silencio. Los avisos están en pausa hasta las 8:00 a.m.")
        case .digestHeader: return ("This week in your spaces", "Esta semana en tus espacios")
        case .digestEmpty: return ("No new posts in the last 7 days.", "No hay publicaciones nuevas en los últimos 7 días.")
        case .markAllRead: return ("Mark all read", "Marcar todo leído")
        case .noNotifications: return ("No notifications yet.", "Todavía no hay avisos.")
        case .welcomeNoteTitle: return ("Welcome to CaseCircle", "Te damos la bienvenida a CaseCircle")
        case .welcomeNoteBody: return (
            "Ask in a space, or read a sample story first. Nothing here is legal advice.",
            "Pregunta en un espacio, o lee primero una historia de ejemplo. Nada de esto es asesoría legal."
        )
        case .privacyTitle: return ("Privacy", "Privacidad")
        case .privacyBody: return (privacyEN, privacyES)
        case .contactTitle: return ("Contact", "Contacto")
        case .contactBody: return (
            "For a report, a safety issue, or an App Review question, email us. A person reads it.",
            "Para una denuncia, un problema de seguridad o una pregunta de revisión, escríbenos. Lo lee una persona."
        )
        case .aboutTitle: return ("About CaseCircle", "Acerca de CaseCircle")
        case .aboutBody: return (aboutEN, aboutES)
        case .versionLabel: return ("Version %@", "Versión %@")
        case .moderation: return ("Moderation", "Moderación")
        case .modQueue: return ("Review queue", "Cola de revisión")
        case .modEmpty: return ("The queue is clear.", "La cola está vacía.")
        case .reviewerNotesTitle: return ("Notes for App Review", "Notas para la revisión")
        case .reviewerNotesBody: return (reviewerEN, reviewerES)
        case .restore: return ("Restore", "Restaurar")
        case .removeContent: return ("Remove", "Quitar")
        case .dismissReport: return ("Dismiss reports", "Descartar denuncias")
        case .reportCount: return ("%d open reports", "%d denuncias abiertas")
        case .heldLabel: return ("Held", "En revisión")
        case .reportTitle: return ("Why are you reporting this?", "¿Por qué lo denuncias?")
        case .reportThanks: return (
            "Report received. Three reports hide a post until a moderator reviews it.",
            "Denuncia recibida. Tres denuncias ocultan una publicación hasta que un moderador la revise."
        )
        case .alreadyReported: return ("You already reported this.", "Ya denunciaste esto.")
        case .reportSpam: return ("Spam or scam", "Spam o estafa")
        case .reportIdentifiers: return ("Personal information", "Información personal")
        case .reportHarassment: return ("Harassment", "Acoso")
        case .reportMisinfo: return ("Presented as fact, and it is not", "Se presenta como hecho y no lo es")
        case .reportSolicitation: return ("Paid solicitation or notario", "Cobro o notario")
        case .reportOther: return ("Something else", "Otra cosa")
        case .blockTitle: return ("Block this person?", "¿Bloquear a esta persona?")
        case .blockConfirm: return (
            "You will not see each other's posts or replies.",
            "No verán las publicaciones ni las respuestas del otro."
        )
        case .blockedToast: return ("Blocked.", "Bloqueado.")
        case .verifiedFootnote: return (
            "Verified professional badges are checked manually against bar records. You cannot grant yourself one.",
            "La insignia de profesional verificado se revisa a mano contra el registro del colegio. No puedes dártela tú."
        )
        case .threeReportNote: return (
            "Three reports hide the post until the queue is reviewed.",
            "Tres denuncias ocultan la publicación hasta que se revise la cola."
        )
        case .statusHeld: return ("Held", "En revisión")
        case .statusRemoved: return ("Removed", "Quitado")
        case .statusLive: return ("Live", "Visible")
        case .thisWeek: return ("This week", "Esta semana")
        case .newPostsCount: return ("%d new posts", "%d publicaciones nuevas")
        case .dismiss: return ("Dismiss", "Ocultar")
        case .choose: return ("Choose", "Elegir")
        case .commentHeld: return ("Reply held for review.", "Respuesta en revisión.")
        case .saved: return ("Saved.", "Guardado.")
        case .couldNotSignIn: return ("Could not sign in. Try email or the review demo.", "No se pudo iniciar sesión. Prueba el correo o la demo.")
        case .moreActions: return ("More", "Más")
        case .upvote: return ("Upvote", "Voto")
        case .statusWord: return ("Status", "Estado")
        case .retry: return ("Try again", "Reintentar")
        case .reply: return ("Reply", "Responder")
        case .sendReply: return ("Send", "Enviar")
        case .caseProfiles: return ("Case profiles", "Perfiles de caso")
        case .settings: return ("Settings", "Ajustes")
        case .openPost: return ("Open", "Abrir")
        }
    }
}

private let rulesEN = """
Be kind. People here are waiting on cases that shape their lives.

No receipt numbers, A-numbers, Social Security numbers, passport numbers, home addresses, or photos of documents.

No paid solicitations. Notario offers, form-preparation sales, and “pay me to expedite” messages are removed.

Say when something is only your own case. Do not present a guess as a fact.

Politics belong here only when a policy change affects how cases move.

English and Spanish are both welcome.

CaseCircle is not a law firm and is not affiliated with USCIS, DHS, or any government agency. Nothing here is legal advice.
"""

private let rulesES = """
Sé amable. Las personas aquí esperan casos que cambian su vida.

Nada de números de recibo, números A, números de Seguro Social, números de pasaporte, direcciones ni fotos de documentos.

Nada de cobros. Se eliminan ofertas de notarios, venta de preparación de formularios y mensajes de “págame para acelerar”.

Di cuándo algo es solo tu caso. No presentes una suposición como un hecho.

La política cabe aquí solo cuando un cambio afecta cómo avanzan los casos.

El inglés y el español son bienvenidos.

CaseCircle no es un bufete y no está afiliado a USCIS, DHS ni a ninguna agencia del gobierno. Nada de esto es asesoría legal.
"""

private let privacyEN = """
CaseCircle is pseudonymous. Your username is public on posts. Your real name is not required, and we ask you not to use it.

A case badge can show a form, an office, a filing month, and a stage. It never includes a receipt number, an A-number, a full date of birth, an address, or a document image.

The app blocks receipt numbers, A-numbers, Social Security numbers, and passport numbers before a post is saved. Photos that look like notices or identity documents are rejected.

This version stores your account, posts, and case profile on this device. There is no ad tracking, no precise location, and no access to your contacts.

Email or an Apple sign-in identifier, if you use one, stays on this device and is not shown on posts.

Sample stories and example benchmarks ship with the app. They are not live posts from other people and they are not official processing times.

Deleting your account removes the case profile and replaces your name on old posts with “Deleted member.”

This version has no server to query. If a shared server is added later, the same minimization rules apply, and a transparency report would cover government requests.
"""

private let privacyES = """
CaseCircle es seudónimo. Tu nombre de usuario es público en las publicaciones. No pedimos tu nombre real, y te pedimos que no lo uses.

La etiqueta del caso puede mostrar un formulario, una oficina, un mes y una etapa. Nunca incluye un número de recibo, un número A, una fecha de nacimiento completa, una dirección ni la foto de un documento.

La app bloquea números de recibo, números A, números de Seguro Social y números de pasaporte antes de guardar. Las fotos que parecen avisos o documentos de identidad se rechazan.

Esta versión guarda tu cuenta, tus publicaciones y tu perfil en este dispositivo. No hay rastreo publicitario, ni ubicación precisa, ni acceso a tus contactos.

El correo o el identificador de Apple, si lo usas, se queda en este dispositivo y no aparece en las publicaciones.

Las historias de ejemplo y los tiempos de ejemplo vienen con la app. No son publicaciones en vivo de otras personas ni tiempos oficiales.

Eliminar la cuenta borra el perfil y reemplaza tu nombre en las publicaciones anteriores por “Miembro eliminado”.

Esta versión no tiene un servidor al que consultar. Si más adelante hay un servidor compartido, se aplican las mismas reglas de minimizar datos, y un informe de transparencia cubriría las solicitudes del gobierno.
"""

private let aboutEN = """
CaseCircle is a community for people comparing notes on immigration cases. It is not a law firm, not a form-preparation service, and not affiliated with USCIS or the U.S. government.

A local filter blocks identifiers, a set of scam phrases, and abusive language before something is published. Reports, blocks, and a moderator queue are the rest of the safety net. A server-side classifier is the production version of the language check.

Verified professional badges are added by hand after a bar or accreditation check. Nobody can turn that badge on for themselves.

Example benchmarks are labeled because they are sample numbers. A real cell appears only after 20 non-sample timelines share the same office and stages.
"""

private let aboutES = """
CaseCircle es una comunidad para comparar notas sobre casos de inmigración. No es un bufete, no prepara formularios y no está afiliado a USCIS ni al gobierno de Estados Unidos.

Un filtro local bloquea identificadores, algunas frases de estafa y lenguaje abusivo antes de publicar. Las denuncias, los bloqueos y la cola de moderación completan la seguridad. Un clasificador en el servidor es la versión de producción del filtro de lenguaje.

La insignia de profesional verificado se agrega a mano después de revisar una licencia. Nadie puede activársela solo.

Los tiempos de ejemplo están marcados porque son cifras de muestra. Una cifra real aparece solo cuando 20 tiempos que no son de ejemplo comparten oficina y etapas.
"""

private let reviewerEN = """
This demo account is a moderator. The review queue includes a held solicitation and a sample post with open reports.

Every post and reply can be reported or blocked. Three reports hide a post. Posting a receipt number, A-number, Social Security number, or passport number is blocked. Scam phrases are held.

Account deletion is at the bottom of You. Support email is on the contact page and on the first screen. The app does not use the USCIS name as its own, and it does not display a government seal.
"""

private let reviewerES = """
Esta cuenta de demo es de moderación. La cola incluye una solicitud de cobro en revisión y una publicación de ejemplo con denuncias abiertas.

Cada publicación y respuesta se puede denunciar o bloquear. Tres denuncias ocultan una publicación. Publicar un número de recibo, un número A, un número de Seguro Social o un pasaporte queda bloqueado. Las frases de estafa quedan en revisión.

Eliminar la cuenta está al final de Tú. El correo de soporte está en Contacto y en la primera pantalla. La app no usa el nombre de USCIS como propio y no muestra un sello del gobierno.
"""
