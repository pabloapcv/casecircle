import { evaluate, spaceById } from "./logic.js";

const feesUrl = "https://www.uscis.gov/forms/filing-fees";
export const FEE_SCHEDULE_URL = "https://www.uscis.gov/g-1055";
const consularUrl = "https://travel.state.gov/content/travel/en/us-visas/immigrate/the-immigrant-visa-process.html";
const legalUrl = "https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/legal-services";

const text = {
  prepare: ["Prepare", "Preparar"],
  newPost: ["New post", "Nueva publicación"],
  folderKicker: ["Filing folder", "Carpeta de presentación"],
  folderLead: ["Build the paper folder for one form. The guide walks the packet in order and tells you what is still missing. It does not fill out the form, does not file it, and does not decide the case.", "Arma la carpeta de un formulario. La guía recorre el paquete en orden y dice qué falta. No llena el formulario, no lo presenta y no decide el caso."],
  noPromise: ["A complete, consistent, truthful packet is easier to review. Checklist progress is not an approval and not a judgment of your case. CaseCircle is not a law firm, not a paralegal you hired, and not part of USCIS.", "Un paquete completo, consistente y veraz es más fácil de revisar. El avance de la lista no es una aprobación ni un juicio de tu caso. CaseCircle no es un bufete, no es un paralegal contratado y no es parte de USCIS."],
  pickForm: ["Which folder are you building?", "¿Qué carpeta estás armando?"],
  openFolder: ["Open folder", "Abrir carpeta"],
  ready: ["In the folder", "En la carpeta"],
  need: ["Still need", "Todavía falta"],
  na: ["Does not apply", "No aplica"],
  progress: ["In the folder", "En la carpeta"],
  guide: ["Guide", "Guía"],
  guideHelp: ["Ask what to gather next. Do not type a receipt number, A-number, Social Security number, or passport number.", "Pregunta qué reunir ahora. No escribas un número de recibo, un número A, un Seguro Social ni un pasaporte."],
  askGuide: ["Ask the guide", "Preguntar a la guía"],
  guidePlaceholder: ["What should I put in this folder?", "¿Qué pongo en esta carpeta?"],
  officialForm: ["Current form and instructions", "Formulario e instrucciones vigentes"],
  feePage: ["USCIS filing fees", "Tarifas de USCIS"],
  legalHelp: ["Find a lawyer or accredited representative", "Buscar un abogado o representante acreditado"],
  allSet: ["The checklist is marked", "La lista está marcada"],
  allSetBody: ["Every line is either in the folder or marked as not applicable. Read the current instructions once more, confirm the fee and the mailing or e-file address on uscis.gov, and keep a full copy. This is not a decision and not a filing.", "Cada línea está en la carpeta o marcada como no aplicable. Lee otra vez las instrucciones vigentes, confirma la tarifa y la dirección en uscis.gov, y guarda una copia completa. Esto no es una decisión ni una presentación."],
  stopFraudTitle: ["Do not invent evidence", "No inventes pruebas"],
  stopFraudBody: ["The folder has to match the facts. Do not create, alter, or hide documents, and do not pay someone who promises an approval. If the history is complicated, take it to a lawyer or an accredited representative.", "La carpeta tiene que coincidir con los hechos. No crees, alteres ni escondas documentos, y no pagues a quien prometa una aprobación. Si la historia es complicada, llévala a un abogado o a un representante acreditado."],
  stopIdTitle: ["Leave identifiers out of this site", "Deja los identificadores fuera de este sitio"],
  stopIdBody: ["Keep receipt numbers, A-numbers, Social Security numbers, and passport numbers on the paper copies in your own folder. Do not type them here.", "Guarda los números de recibo, números A, Seguro Social y pasaporte en las copias de tu carpeta. No los escribas aquí."],
  yourFolder: ["Your folder", "Tu carpeta"],
  stillOpen: ["still to gather", "por reunir"],
  community: ["Community", "Comunidad"],
  featureFolder: ["A folder for the form", "Una carpeta para el formulario"],
  featureFolderBody: ["Walk the packet section by section. Mark what you have. The guide names the next gap and links to the current official instructions.", "Recorre el paquete sección por sección. Marca lo que ya tienes. La guía señala el siguiente hueco y enlaza las instrucciones oficiales vigentes."],
  featureCommunity: ["Notes from the same form", "Notas del mismo formulario"],
  featureCommunityBody: ["Each community is one form. The posts listed there are public titles from r/USCIS and r/USCIS_FORUM.", "Cada comunidad es un formulario. Las publicaciones que aparecen son títulos públicos de r/USCIS y r/USCIS_FORUM."],
  featureTime: ["Your own clock", "Tu propio reloj"],
  featureTimeBody: ["The timeline counts months from your filing month. Benchmarks stay hidden until enough people share a stage change.", "El tiempo cuenta los meses desde tu mes de presentación. Los puntos de referencia quedan ocultos hasta que bastantes personas comparten un cambio de etapa."],
  backToForms: ["All folders", "Todas las carpetas"],
  chatTitle: ["Folder chat", "Chat de la carpeta"],
  chatLead: [
    "Ask about what to gather for this form. The chat organizes and explains checklist labels — it does not judge your case or predict an approval. Papers stay on this device.",
    "Pregunta qué reunir para este formulario. El chat organiza y explica las etiquetas de la lista — no juzga tu caso ni predice una aprobación. Los papeles se quedan en este dispositivo."
  ],
  chatLocal: ["On-device next item (not an AI answer)", "Siguiente dato en este dispositivo (no es una respuesta de IA)"],
  chatConsent: [
    "I agree to send this form’s checklist labels, their status, and my question to the language model. I will not send documents, receipt numbers, A-numbers, Social Security numbers, or passport numbers.",
    "Acepto enviar las etiquetas de esta lista, su estado y mi pregunta al modelo de lenguaje. No enviaré documentos, números de recibo, números A, Seguro Social ni pasaportes."
  ],
  chatPlaceholder: ["Ask what to put in this folder…", "Pregunta qué poner en esta carpeta…"],
  chatSend: ["Send to the language model", "Enviar al modelo de lenguaje"],
  chatCancel: ["Cancel", "Cancelar"],
  chatRetry: ["Retry", "Reintentar"],
  chatUnavailable: ["Language-model chat is unavailable", "El chat con modelo de lenguaje no está disponible"],
  chatUnavailableBody: [
    "The local server has no language-model key. This is not a generated answer. Checklist marks stay on this device. Configure CASECIRCLE_LLM_API_KEY on the server, then restart python3 serve.py.",
    "El servidor local no tiene clave de modelo de lenguaje. Esto no es una respuesta generada. Las marcas de la carpeta se quedan en este dispositivo. Configura CASECIRCLE_LLM_API_KEY en el servidor y vuelve a iniciar python3 serve.py."
  ],
  chatLoading: ["Waiting for the language model…", "Esperando al modelo de lenguaje…"],
  chatEmpty: ["Ask a follow-up about this packet. Checklist progress is not an approval or a judgment.", "Haz una pregunta sobre este paquete. El avance de la lista no es una aprobación ni un juicio."],
  chatAskLabel: ["Ask what to put in this folder", "Pregunta qué poner en esta carpeta"],
  chatFollowLabel: ["Ask a follow-up about this packet", "Haz otra pregunta sobre este paquete"],
  chatHint: ["Don't type receipt, A-, Social Security, or passport numbers. Checklist progress is not an approval or a judgment.", "No escribas números de recibo, A, Seguro Social ni pasaporte. El avance de la lista no es una aprobación ni un juicio."],
  chatError: ["The language model did not respond. You can retry. Nothing was filed.", "El modelo de lenguaje no respondió. Puedes reintentar. No se presentó nada."],
  chatBlocked: ["That question cannot be sent. Leave identifiers out.", "Esa pregunta no se puede enviar. Deja los identificadores fuera."],
  chatMockNote: ["Test-only mock reply. This is not a language-model answer.", "Respuesta de prueba solamente. No es una respuesta de un modelo de lenguaje."],
  chatLegal: [
    "This chat organizes and explains checklist labels. It does not judge your case, decide eligibility, file a form, or predict an approval. Verify current instructions on uscis.gov. For denials, notices of intent to deny, or legal eligibility, talk to a lawyer or accredited representative.",
    "Este chat organiza y explica las etiquetas de la lista. No juzga tu caso, no decide elegibilidad, no presenta un formulario y no predice una aprobación. Verifica las instrucciones vigentes en uscis.gov. Para negaciones, avisos de intención de negar o elegibilidad legal, habla con un abogado o representante acreditado."
  ],
  checklistProgress: ["Checklist progress", "Avance de la lista"],
  checklistProgressHint: ["Marked items on this form’s list. Progress is organization only — not a score of your case.", "Ítems marcados en la lista de este formulario. El avance es solo organización — no es un puntaje de tu caso."],
  chatYou: ["You", "Tú"],
  chatAssistant: ["Language model", "Modelo de lenguaje"]
};

const fraud = /\b(fake|forged?|forge|falsif\w*|lie|lying|lies|pretend|notario|guaranteed|gift cards?|whatsapp|mentira|mentir|falso|fals\w*|esconder|garantizad\w*|invent\w*)\b/i;

function line(id, en, es) {
  return { id, en, es };
}

function section(id, en, es, items) {
  return { id, en, es, items };
}

function base(form, url, extra) {
  return {
    form,
    url,
    sections: [
      section("forms", "Form, fee, and edition", "Formulario, tarifa y edición", [
        line("edition", `Download ${form} and its instructions from the official form page. Use that edition, not a copy saved from a blog or a chat.`, `Descarga el ${form} y sus instrucciones de la página oficial. Usa esa edición, no una copia de un blog o un chat.`),
        line("fee", "Check the current fee on the USCIS fee page the same day you file. Fees change, and a wrong fee can get a packet rejected. If you mail it, pay with Form G-1450 (card) or Form G-1650 (U.S. bank account). USCIS no longer takes checks or money orders unless you qualify for Form G-1651.", "Revisa la tarifa vigente en la página de USCIS el mismo día que presentes. Las tarifas cambian, y una tarifa incorrecta puede rechazar el paquete. Si lo envías por correo, paga con el G-1450 (tarjeta) o el G-1650 (cuenta bancaria de EE. UU.). USCIS ya no acepta cheques ni giros, salvo que califiques para el G-1651."),
        line("blanks", "Answer every question on the form. If a question does not apply, follow the instructions for that blank. Do not leave out a fact to make the case look simpler.", "Responde cada pregunta. Si una no aplica, sigue las instrucciones para ese espacio. No omitas un hecho para que el caso parezca más simple."),
        line("sign", "Sign where the form asks, with the date. An unsigned form is a common reason a packet comes back.", "Firma donde el formulario lo pide, con la fecha. Un formulario sin firma es una razón común de devolución.")
      ]),
      ...extra,
      section("copies", "Translations and your copy", "Traducciones y tu copia", [
        line("translate", "Every document that is not in English needs a full English translation and a certification from the translator. The translation sits with the original copy.", "Todo documento que no esté en inglés necesita una traducción completa al inglés y una certificación del traductor. La traducción va junto a la copia original."),
        line("names", "The names and dates on the documents should match the form. If a spelling differs, include the document that explains the difference. Do not alter the original.", "Los nombres y las fechas de los documentos deben coincidir con el formulario. Si una ortografía difiere, incluye el documento que lo explica. No alteres el original."),
        line("copy", "Keep a complete copy of everything you send, in the same order. Your CaseCircle folder is only a checklist. The papers stay with you.", "Guarda una copia completa de todo lo que envías, en el mismo orden. Tu carpeta de CaseCircle es solo una lista. Los papeles se quedan contigo."),
        line("address", "Mail or e-file only to the address in the current instructions. Ignore addresses from text messages, social media, or anyone calling themselves a notario.", "Envía solo a la dirección de las instrucciones vigentes. Ignora direcciones de mensajes, redes sociales o de quien se llame notario.")
      ])
    ]
  };
}

const packets = {
  "n-400": base("N-400", "https://www.uscis.gov/n-400", [
    section("eligibility", "Residence and the form questions", "Residencia y las preguntas del formulario", [
      line("green", "A copy of the front and back of your green card goes in the paper folder. Do not type the A-number into CaseCircle.", "Una copia del frente y dorso de tu tarjeta va en la carpeta de papel. No escribas el número A en CaseCircle."),
      line("trips", "Make a list of trips outside the United States with the dates you actually traveled. The list has to match your records.", "Haz una lista de viajes fuera de Estados Unidos con las fechas reales. La lista tiene que coincidir con tus registros."),
      line("taxes", "Gather tax transcripts or returns for the years the instructions ask about. If you owe taxes, a lawyer should look at that before you file.", "Reúne transcripciones o declaraciones de impuestos de los años que piden las instrucciones. Si debes impuestos, un abogado debería verlo antes de presentar."),
      line("history", "Read the questions about arrests, citations, and immigration history slowly. Answer with the facts. Hiding an incident is worse than disclosing it.", "Lee despacio las preguntas sobre arrestos, citaciones e historial migratorio. Responde con los hechos. Esconder un incidente es peor que revelarlo.")
    ]),
    section("study", "The interview", "La entrevista", [
      line("civics", "Study the civics and English materials published for the naturalization test. The test is public. A memorized story about your life is not a strategy.", "Estudia los materiales de civismo e inglés publicados para el examen de naturalización. El examen es público. Una historia memorizada de tu vida no es una estrategia."),
      line("id", "Bring the photo identification and the documents the appointment notice lists. Read that notice when it arrives. Do not post a photo of it here.", "Lleva la identificación con foto y los documentos que lista el aviso de cita. Lee ese aviso cuando llegue. No publiques una foto aquí."),
      line("oath", "The oath is a later ceremony. An interview date is not the oath and not an approval.", "El juramento es una ceremonia posterior. Una fecha de entrevista no es el juramento ni una aprobación.")
    ])
  ]),
  "i-751": base("I-751", "https://www.uscis.gov/i-751", [
    section("status", "The conditional card", "La tarjeta condicional", [
      line("card", "Copy the front and back of the conditional green card into the paper folder. Leave the A-number off this website.", "Copia el frente y dorso de la tarjeta condicional en la carpeta de papel. Deja el número A fuera de este sitio."),
      line("window", "Read the filing window in the current instructions and compare it with the card's expiration. Filing late has its own rules. If you are outside the window, talk to a lawyer before you guess.", "Lee el plazo en las instrucciones vigentes y compáralo con el vencimiento de la tarjeta. Presentar tarde tiene reglas propias. Si estás fuera del plazo, habla con un abogado antes de adivinar."),
      line("basis", "A joint filing and a waiver are different filings. The basis you choose has to be the true one. A waiver is a lawyer conversation if you are not filing with your spouse.", "Una presentación conjunta y un perdón son trámites distintos. La base que elijas tiene que ser la verdadera. Un perdón es una conversación con un abogado si no presentas con tu esposo o esposa.")
    ]),
    section("marriage", "Evidence the marriage is real", "Pruebas de que el matrimonio es real", [
      line("joint", "Collect documents that show a shared life across the two years: leases, mortgages, bank or insurance records, taxes filed together, children's birth certificates. Use records you already have.", "Reúne documentos de una vida compartida durante los dos años: contratos, hipotecas, bancos o seguros, impuestos juntos, actas de nacimiento de hijos. Usa registros que ya tienes."),
      line("photos", "A few photos over time can support the records. Write the approximate date on the back of your copy. Photos do not replace leases, taxes, or children's documents.", "Unas fotos a lo largo del tiempo pueden apoyar los registros. Anota la fecha aproximada al dorso de tu copia. Las fotos no reemplazan contratos, impuestos o actas."),
      line("true", "Include only documents that are genuine. Do not create a lease, a bank letter, or a photo set to fill a gap.", "Incluye solo documentos genuinos. No crees un contrato, una carta del banco ni un juego de fotos para llenar un hueco.")
    ])
  ]),
  "i-485": base("I-485", "https://www.uscis.gov/i-485", [
    section("basis", "Why you can adjust", "Por qué puedes ajustar", [
      line("underlying", "The folder needs the underlying petition or category the instructions name, such as a copy of the I-130 receipt or approval if that is your basis. Keep the receipt number off this website.", "La carpeta necesita la petición o categoría que nombran las instrucciones, como una copia del recibo o la aprobación del I-130 si esa es tu base. Deja el número de recibo fuera de este sitio."),
      line("i693", "A civil surgeon completes Form I-693, and it is filed with the I-485. If you mail it, keep the envelope sealed. If you file online, USCIS asks you to open it, upload the form, and keep the original and envelope until a decision. Do not upload it to CaseCircle.", "Un médico civil completa el Formulario I-693, y se presenta junto con el I-485. Si lo envías por correo, deja el sobre cerrado. Si presentas en línea, USCIS te pide abrirlo, subir el formulario y guardar el original y el sobre hasta la decisión. No lo subas a CaseCircle."),
      line("i864", "If the category needs an affidavit of support, gather the sponsor's tax transcripts and the household information the I-864 instructions list. The sponsor has to qualify. A letter that invents income does not.", "Si la categoría pide una declaración de apoyo, reúne las transcripciones de impuestos del patrocinador y los datos del hogar que lista el I-864. El patrocinador tiene que calificar. Una carta que invente ingresos no sirve."),
      line("status", "Copy the passport biographic page and the current status documents the instructions ask for. Do not type the passport number here.", "Copia la página biográfica del pasaporte y los documentos de estatus que piden las instrucciones. No escribas el número de pasaporte aquí.")
    ]),
    section("interview", "Before an interview", "Antes de una entrevista", [
      line("consistent", "Bring the originals of what you already filed. The officer compares names, dates, and addresses. Inconsistencies need a true explanation, not a new story.", "Lleva los originales de lo que ya presentaste. El oficial compara nombres, fechas y direcciones. Las inconsistencias necesitan una explicación verdadera, no una historia nueva."),
      line("work", "A work permit or advance parole is not the green card. Travel and work follow the document you actually hold.", "Un permiso de trabajo o de viaje no es la residencia. Trabajar y viajar siguen el documento que realmente tienes.")
    ])
  ]),
  "i-130": base("I-130", "https://www.uscis.gov/i-130", [
    section("relationship", "Proof of the relationship", "Prueba de la relación", [
      line("petitioner", "The petitioner's status document, such as a passport, citizenship certificate, or green card copy, goes in the paper folder. Do not type document numbers here.", "El documento de estatus del peticionario, como pasaporte, certificado de ciudadanía o copia de la residencia, va en la carpeta de papel. No escribas números de documentos aquí."),
      line("civil", "The marriage certificate, birth certificate, or other civil record that proves the relationship, plus a divorce or death record for any prior marriage the form asks about.", "El acta de matrimonio, nacimiento u otro registro civil que pruebe la relación, más el divorcio o defunción de cualquier matrimonio anterior que el formulario pregunte."),
      line("bona", "For a spouse, add evidence of a real marriage: joint records and photos over time. The evidence has to be genuine.", "Para un esposo o esposa, agrega pruebas de un matrimonio real: registros conjuntos y fotos a lo largo del tiempo. Las pruebas tienen que ser genuinas."),
      line("beneficiary", "A copy of the beneficiary's passport biographic page, if you have it. The passport number stays out of CaseCircle.", "Una copia de la página biográfica del pasaporte del beneficiario, si la tienes. El número de pasaporte se queda fuera de CaseCircle.")
    ])
  ]),
  "i-765": base("I-765", "https://www.uscis.gov/i-765", [
    section("category", "The eligibility category", "La categoría de elegibilidad", [
      line("code", "The category on the form has to be the one you actually qualify for. Read that section of the instructions. A category copied from someone else's filing is a mistake.", "La categoría del formulario tiene que ser la que realmente te corresponde. Lee esa sección de las instrucciones. Una categoría copiada de otra persona es un error."),
      line("pending", "If you are filing with a pending application, include the copy of that receipt or approval the instructions name. Keep the receipt number out of this website.", "Si presentas con una solicitud pendiente, incluye la copia del recibo o la aprobación que nombran las instrucciones. Deja el número de recibo fuera de este sitio."),
      line("photosid", "Follow the current photo and identity rules in the instructions. Photo rules change. Do not rely on an old checklist.", "Sigue las reglas vigentes de fotos e identidad en las instrucciones. Las reglas de fotos cambian. No te fíes de una lista vieja.")
    ])
  ]),
  "i-131": base("I-131", "https://www.uscis.gov/i-131", [
    section("travel", "Travel document", "Documento de viaje", [
      line("which", "Advance parole, a reentry permit, and a refugee travel document are different. Pick the one the instructions say matches your status. The wrong one does not become the right one at the airport.", "El advance parole, el permiso de reingreso y el documento de viaje de refugiado son distintos. Elige el que las instrucciones indican para tu estatus. El equivocado no se convierte en el correcto en el aeropuerto."),
      line("wait", "Do not travel on a pending advance parole unless a lawyer has told you that your specific status allows it. Leaving can abandon some applications.", "No viajes con un advance parole pendiente a menos que un abogado te haya dicho que tu estatus específico lo permite. Salir puede abandonar algunas solicitudes."),
      line("purpose", "Explain the travel with the facts. A document is not a green card and it is not a promise that you can reenter.", "Explica el viaje con los hechos. Un documento no es la residencia y no es una promesa de que puedes volver a entrar."),
      line("hr1", "Some travel and parole documents carry an extra H.R. 1 parole fee that is due when parole is approved and cannot be waived. Read the I-131 rows of Form G-1055 for your document before you file.", "Algunos documentos de viaje y de parole tienen una tarifa extra de H.R. 1 que se paga al aprobarse y no se puede exonerar. Lee las filas del I-131 en el G-1055 para tu documento antes de presentar.")
    ])
  ])
};

const topics = [
  { test: /translat|traduc/i, title: { en: "Translations", es: "Traducciones" }, body: { en: "Put a full English translation with every document that is not in English, and a signed certificate from the translator. The translator does not have to be a lawyer. The translation has to be complete.", es: "Pon una traducción completa al inglés con cada documento que no esté en inglés, y un certificado firmado del traductor. El traductor no tiene que ser abogado. La traducción tiene que estar completa." } },
  { test: /fee|tarifa|pago|payment/i, title: { en: "The fee", es: "La tarifa" }, body: { en: "Use the fee on the official fee page on the day you file. Do not send a fee you saw in a group chat. A fee waiver, if you qualify, is a separate form with its own evidence. By mail, pay with Form G-1450 (card) or G-1650 (U.S. bank account); checks and money orders need a Form G-1651 exemption.", es: "Usa la tarifa de la página oficial el día que presentes. No envíes una tarifa que viste en un chat. Una exención, si calificas, es otro formulario con sus propias pruebas. Por correo, paga con el G-1450 (tarjeta) o el G-1650 (cuenta bancaria de EE. UU.); los cheques y giros requieren la exención del G-1651." }, href: feesUrl, link: { en: "USCIS filing fees", es: "Tarifas de USCIS" } },
  { test: /lawyer|attorney|abogad|acreditad|representative/i, title: { en: "When to get a lawyer", es: "Cuándo buscar un abogado" }, body: { en: "Get a lawyer or an accredited representative if you have a prior removal, a criminal record, a missed deadline, a waiver, or any fact you do not know how to disclose. CaseCircle cannot review your file.", es: "Busca un abogado o un representante acreditado si tienes una deportación previa, un récord penal, un plazo vencido, un perdón, o un hecho que no sabes cómo revelar. CaseCircle no puede revisar tu expediente." }, href: legalUrl, link: { en: "Find legal services", es: "Buscar servicios legales" } },
  { test: /rfe|evidence request|pedido de evidencia/i, title: { en: "A request for evidence", es: "Un pedido de evidencia" }, body: { en: "Read the notice for the deadline and the exact documents it names. Answer that list. Do not send a new theory of the case. Keep a copy, and do not post the notice here.", es: "Lee el aviso: el plazo y los documentos exactos que nombra. Responde esa lista. No envíes una teoría nueva del caso. Guarda una copia y no publiques el aviso aquí." } },
  { test: /interview|entrevista|civics|civic/i, title: { en: "The interview", es: "La entrevista" }, body: { en: "Bring originals that match what you filed. Answer with what happened. Study the public civics materials if the form has a civics test. Do not memorize a script that is not true.", es: "Lleva originales que coincidan con lo que presentaste. Responde con lo que pasó. Estudia los materiales públicos de civismo si el formulario tiene examen. No memorices un guion que no sea cierto." } }
];

export function prepareText(lang, key) {
  const pair = text[key];
  if (!pair) return key;
  return lang === "es" ? pair[1] : pair[0];
}

export function packetFor(spaceId) {
  if (packets[spaceId]) return packets[spaceId];
  const space = spaceById(spaceId);
  const form = space?.forms[0] || "the form";
  const slug = String(form).toLowerCase();
  // The DS-260 is a State Department form; uscis.gov/ds-260 does not exist.
  const url = spaceId === "consular" ? consularUrl : `https://www.uscis.gov/${slug}`;
  return base(form, url, [
    section("evidence", "What the instructions ask for", "Lo que piden las instrucciones", [
      line("list", "Read the evidence list in the current instructions and make one paper tab for each required item. This checklist is a starting order, not a substitute for that list.", "Lee la lista de pruebas en las instrucciones vigentes y haz una pestaña de papel por cada requisito. Esta lista es un orden inicial, no un reemplazo de esa lista."),
      line("identity", "Include the identity and status copies the instructions name. Keep document numbers out of CaseCircle.", "Incluye las copias de identidad y estatus que nombran las instrucciones. Deja los números de documentos fuera de CaseCircle."),
      line("truth", "Every document in the folder has to be a real one. If you do not have something, mark it as still needed. Do not create a replacement.", "Cada documento de la carpeta tiene que ser real. Si no tienes algo, márcalo como pendiente. No crees un reemplazo.")
    ])
  ]);
}

export function blankFolder(spaceId) {
  const packet = packetFor(spaceId);
  return { marks: {}, focus: packet.sections[0].id };
}

export function tally(packet, folder) {
  const marks = folder?.marks || {};
  let ready = 0;
  let need = 0;
  let na = 0;
  const items = packet.sections.flatMap((section) => section.items);
  for (const item of items) {
    const mark = marks[item.id] || "need";
    if (mark === "ready") ready += 1;
    else if (mark === "na") na += 1;
    else need += 1;
  }
  return { ready, need, na, total: items.length };
}

export function nextGap(packet, folder) {
  const marks = folder?.marks || {};
  for (const section of packet.sections) {
    for (const item of section.items) {
      if ((marks[item.id] || "need") === "need") return { section, item };
    }
  }
  return null;
}

export function guideReply(lang, packet, folder, question) {
  const asked = String(question || "").trim();
  if (asked) {
    const safety = evaluate(asked);
    if (safety.verdict === "block") {
      return { title: prepareText(lang, "stopIdTitle"), body: prepareText(lang, "stopIdBody"), href: legalUrl, link: prepareText(lang, "legalHelp") };
    }
    if (fraud.test(asked)) {
      return { title: prepareText(lang, "stopFraudTitle"), body: prepareText(lang, "stopFraudBody"), href: legalUrl, link: prepareText(lang, "legalHelp") };
    }
    const topic = topics.find((item) => item.test.test(asked));
    if (topic) {
      return {
        title: lang === "es" ? topic.title.es : topic.title.en,
        body: lang === "es" ? topic.body.es : topic.body.en,
        href: topic.href || packet.url,
        link: topic.link ? (lang === "es" ? topic.link.es : topic.link.en) : prepareText(lang, "officialForm")
      };
    }
  }
  const gap = nextGap(packet, folder);
  if (!gap) {
    return { title: prepareText(lang, "allSet"), body: prepareText(lang, "allSetBody"), href: packet.url, link: prepareText(lang, "officialForm") };
  }
  const sectionName = lang === "es" ? gap.section.es : gap.section.en;
  const itemName = lang === "es" ? gap.item.es : gap.item.en;
  const intro = lang === "es"
    ? `Siguiente en ${sectionName}. Cuando el documento esté en tu carpeta de papel, márcalo.`
    : `Next in ${sectionName}. When the document is in your paper folder, mark it.`;
  return { title: itemName, body: intro, href: packet.url, link: prepareText(lang, "officialForm") };
}

export function calculateScore(packet, folder) {
  const counts = tally(packet, folder);
  return Math.round((counts.ready / Math.max(counts.total, 1)) * 100);
}

export function calculateRiskFlags(lang, profile, folder) {
  const flags = [];
  const now = new Date();
  
  if (profile.filed) {
    const filed = new Date(profile.filed);
    const monthsSinceFiling = Math.round((now - filed) / (30 * 24 * 60 * 60 * 1000));
    
    // No I-693 countdown: an I-693 signed on or after Nov. 1, 2023 stays valid while the application it was filed
    // with is pending (USCIS Policy Manual Vol. 8, Part B, Ch. 4). Only older exams have a 2-year window.
    if (monthsSinceFiling > 18 && profile.stage !== "approved" && profile.stage !== "oath") {
      flags.push({
        type: "warning",
        message: lang === "es"
          ? "Considera contactar a USCIS o a tu congresista sobre el tiempo de espera"
          : "Consider contacting USCIS or your congressperson about wait time"
      });
    }
  }
  
  const marks = folder?.marks || {};
  const needCount = Object.values(marks).filter(m => m === "need").length;
  const readyCount = Object.values(marks).filter(m => m === "ready").length;
  
  if (readyCount > 0 && needCount === 0) {
    flags.push({
      type: "success",
      message: lang === "es"
        ? "Lista completa. Revisa las instrucciones oficiales antes de enviar."
        : "Checklist complete. Review official instructions before sending."
    });
  }
  
  return flags;
}

export function parseRFE(lang, text) {
  if (!text || text.length < 20) {
    return null;
  }
  
  const safety = evaluate(text);
  if (safety.verdict === "block") {
    return { items: [{ text: lang === "es" ? "Por favor remueve identificadores del texto" : "Please remove identifiers from the text", required: true, hint: "" }] };
  }
  
  const items = [];
  
  const evidencePatterns = [
    { pattern: /birth certificate/i, text: { en: "Birth certificate", es: "Acta de nacimiento" }, required: true },
    { pattern: /marriage certificate/i, text: { en: "Marriage certificate", es: "Acta de matrimonio" }, required: true },
    { pattern: /divorce (decree|certificate)/i, text: { en: "Divorce decree/certificate", es: "Decreto/certificado de divorcio" }, required: true },
    { pattern: /passport/i, text: { en: "Passport copy", es: "Copia de pasaporte" }, required: true },
    { pattern: /photo(graph)?s?/i, text: { en: "Photographs", es: "Fotografías" }, required: false },
    { pattern: /tax (return|transcript)/i, text: { en: "Tax returns/transcripts", es: "Declaraciones/transcripciones de impuestos" }, required: true },
    { pattern: /employment (letter|verification)/i, text: { en: "Employment letter", es: "Carta de empleo" }, required: true },
    { pattern: /i-?864/i, text: { en: "Affidavit of Support (I-864)", es: "Declaración de apoyo (I-864)" }, required: true },
    { pattern: /i-?693|medical exam/i, text: { en: "Medical exam (I-693)", es: "Examen médico (I-693)" }, required: true },
    { pattern: /translat/i, text: { en: "Certified translation", es: "Traducción certificada" }, required: true },
    { pattern: /evidence of.*relationship|bona fide/i, text: { en: "Evidence of bona fide relationship", es: "Evidencia de relación genuina" }, required: true },
    { pattern: /joint (bank|account)/i, text: { en: "Joint bank account statements", es: "Estados de cuenta bancaria conjunta" }, required: false },
    { pattern: /lease|mortgage/i, text: { en: "Joint lease or mortgage", es: "Contrato de arrendamiento o hipoteca conjunta" }, required: false },
    { pattern: /insurance/i, text: { en: "Insurance documents", es: "Documentos de seguro" }, required: false },
    { pattern: /affidavit/i, text: { en: "Affidavits from friends/family", es: "Declaraciones juradas de amigos/familia" }, required: false },
    { pattern: /police (clearance|certificate)/i, text: { en: "Police clearance certificate", es: "Certificado de antecedentes policiales" }, required: true },
    { pattern: /court (record|document)/i, text: { en: "Court records/documents", es: "Registros/documentos judiciales" }, required: true },
    { pattern: /vaccination/i, text: { en: "Vaccination records", es: "Registros de vacunación" }, required: false }
  ];
  
  for (const pattern of evidencePatterns) {
    if (pattern.pattern.test(text)) {
      items.push({
        text: lang === "es" ? pattern.text.es : pattern.text.en,
        required: pattern.required,
        hint: ""
      });
    }
  }
  
  if (items.length === 0) {
    items.push({
      text: lang === "es" ? "Revisa el RFE cuidadosamente para identificar los documentos específicos solicitados" : "Review the RFE carefully to identify specific documents requested",
      required: true,
      hint: lang === "es" ? "Consulta con un abogado si no estás seguro" : "Consult with an attorney if unsure"
    });
  }
  
  items.push({
    text: lang === "es" ? "Carta de respuesta explicando los documentos incluidos" : "Cover letter explaining enclosed documents",
    required: true,
    hint: lang === "es" ? "Lista cada documento adjunto" : "List each enclosed document"
  });
  
  items.push({
    text: lang === "es" ? "Copia del aviso de RFE" : "Copy of RFE notice",
    required: true,
    hint: lang === "es" ? "Incluir como página superior del paquete" : "Include as top page of packet"
  });
  
  return { items };
}

export const formChecklists = {
  "i-485": {
    required: [
      { id: "i485-form", en: "Form I-485 completed and signed", es: "Formulario I-485 completado y firmado" },
      { id: "i485-fee", en: "Filing fee or fee waiver", es: "Tarifa de presentación o exención" },
      { id: "i485-photos", en: "2 passport-style photos", es: "2 fotos tamaño pasaporte" },
      { id: "i485-passport", en: "Passport copy (bio page)", es: "Copia de pasaporte (página biográfica)" },
      { id: "i485-birth", en: "Birth certificate + translation", es: "Acta de nacimiento + traducción" },
      { id: "i485-i94", en: "I-94 arrival record", es: "Registro de llegada I-94" },
      { id: "i485-i693", en: "I-693 medical (sealed if mailing, uploaded if filing online)", es: "I-693 médico (sellado si lo envías por correo, subido si presentas en línea)" }
    ],
    conditional: [
      { id: "i485-i130", en: "I-130 approval or receipt (family-based)", es: "Aprobación o recibo de I-130 (basado en familia)", condition: "family" },
      { id: "i485-i140", en: "I-140 approval (employment-based)", es: "Aprobación de I-140 (basado en empleo)", condition: "employment" },
      { id: "i485-marriage", en: "Marriage certificate + translation", es: "Acta de matrimonio + traducción", condition: "marriage" },
      { id: "i485-i864", en: "I-864 Affidavit of Support", es: "Declaración de apoyo I-864", condition: "family" },
      { id: "i485-divorce", en: "Divorce decrees for prior marriages", es: "Decretos de divorcio de matrimonios previos", condition: "marriage" }
    ],
    optional: [
      { id: "i485-evidence", en: "Additional bona fide evidence", es: "Evidencia adicional de buena fe" },
      { id: "i485-travel", en: "Travel history", es: "Historial de viajes" }
    ]
  },
  "i-765": {
    required: [
      { id: "i765-form", en: "Form I-765 completed and signed", es: "Formulario I-765 completado y firmado" },
      { id: "i765-fee", en: "Filing fee from the current USCIS fee schedule. If your I-485 was filed on or after Apr. 1, 2024, the I-765 has its own fee. It is not included.", es: "Tarifa según la tabla vigente de USCIS. Si tu I-485 se presentó desde el 1 de abril de 2024, el I-765 tiene su propia tarifa. No está incluida." },
      { id: "i765-photos", en: "2 passport-style photos", es: "2 fotos tamaño pasaporte" },
      { id: "i765-id", en: "Copy of ID document", es: "Copia de documento de identidad" }
    ],
    conditional: [
      { id: "i765-i94", en: "I-94 (if applying based on status)", es: "I-94 (si aplica basado en estatus)", condition: "status" },
      { id: "i765-pending", en: "Receipt of pending application", es: "Recibo de solicitud pendiente", condition: "pending" }
    ],
    optional: []
  },
  "n-400": {
    required: [
      { id: "n400-form", en: "Form N-400 completed and signed", es: "Formulario N-400 completado y firmado" },
      { id: "n400-fee", en: "Filing fee", es: "Tarifa de presentación" },
      { id: "n400-gc", en: "Copy of green card (front and back)", es: "Copia de tarjeta verde (frente y dorso)" }
    ],
    conditional: [
      { id: "n400-trips", en: "List of trips outside US", es: "Lista de viajes fuera de EEUU", condition: "travel" },
      { id: "n400-taxes", en: "IRS tax transcripts (3-year path, trips over 6 months, or taxes owed)", es: "Transcripciones de impuestos del IRS (vía de 3 años, viajes de más de 6 meses o impuestos adeudados)", condition: "taxes" },
      { id: "n400-marital", en: "Marriage certificate and proof that any prior marriage ended (if you are or were married)", es: "Acta de matrimonio y prueba de que terminó cualquier matrimonio anterior (si estás o estuviste casado)", condition: "marital" },
      { id: "n400-arrest", en: "Court records if any arrests", es: "Registros judiciales si hay arrestos", condition: "arrests" }
    ],
    optional: [
      { id: "n400-photos", en: "2 passport-style photos, only if you live outside the U.S. (see the N-400 instructions)", es: "2 fotos tamaño pasaporte, solo si vives fuera de EE. UU. (ver las instrucciones del N-400)" },
      { id: "n400-civics", en: "Civics study materials", es: "Materiales de estudio de civismo" }
    ]
  },
  "i-130": {
    required: [
      { id: "i130-form", en: "Form I-130 completed and signed", es: "Formulario I-130 completado y firmado" },
      { id: "i130-fee", en: "Filing fee", es: "Tarifa de presentación" },
      { id: "i130-petitioner", en: "Proof of petitioner's status (passport/certificate)", es: "Prueba de estatus del peticionario" },
      { id: "i130-relationship", en: "Proof of relationship", es: "Prueba de la relación" }
    ],
    conditional: [
      { id: "i130-marriage", en: "Marriage certificate + translation", es: "Acta de matrimonio + traducción", condition: "spouse" },
      { id: "i130-birth", en: "Birth certificate of beneficiary", es: "Acta de nacimiento del beneficiario", condition: "family" },
      { id: "i130-evidence", en: "Bona fide marriage evidence", es: "Evidencia de matrimonio genuino", condition: "spouse" }
    ],
    optional: [
      { id: "i130-photos", en: "Photos together over time", es: "Fotos juntos a través del tiempo" }
    ]
  },
  "i-751": {
    required: [
      { id: "i751-form", en: "Form I-751 completed and signed by both spouses (joint filing)", es: "Formulario I-751 completado y firmado por ambos cónyuges (presentación conjunta)" },
      { id: "i751-fee", en: "Filing fee", es: "Tarifa de presentación" },
      { id: "i751-card", en: "Copy of the conditional green card (front and back)", es: "Copia de la tarjeta condicional (frente y dorso)" },
      { id: "i751-joint", en: "Joint records across the two years (lease or mortgage, bank, insurance, taxes)", es: "Registros conjuntos de los dos años (contrato o hipoteca, banco, seguro, impuestos)" }
    ],
    conditional: [
      { id: "i751-children", en: "Birth certificates of children born to the marriage", es: "Actas de nacimiento de hijos del matrimonio", condition: "children" },
      { id: "i751-waiver", en: "Waiver basis evidence (divorce decree, death certificate, or abuse evidence)", es: "Pruebas de la base del perdón (divorcio, defunción o pruebas de abuso)", condition: "waiver" },
      { id: "i751-court", en: "Certified court records for any arrest or citation", es: "Registros judiciales certificados de cualquier arresto o citación", condition: "arrests" }
    ],
    optional: [
      { id: "i751-affidavits", en: "Affidavits from people who know you as a couple", es: "Declaraciones de personas que los conocen como pareja" },
      { id: "i751-photos", en: "Photos together over time", es: "Fotos juntos a través del tiempo" }
    ]
  },
  "i-131": {
    required: [
      { id: "i131-form", en: "Form I-131 completed and signed", es: "Formulario I-131 completado y firmado" },
      { id: "i131-fee", en: "Filing fee from the current fee schedule. A pending I-485 filed on or after Apr. 1, 2024 does not cover the I-131. It has its own fee.", es: "Tarifa según la tabla vigente. Un I-485 pendiente presentado desde el 1 de abril de 2024 no cubre el I-131. Tiene su propia tarifa." },
      { id: "i131-id", en: "Copy of a government photo ID", es: "Copia de una identificación con foto" }
    ],
    conditional: [
      { id: "i131-photos", en: "2 passport-style photos (advance parole or TPS travel authorization from inside the U.S.)", es: "2 fotos tamaño pasaporte (advance parole o autorización de viaje de TPS desde EE. UU.)", condition: "parole" },
      { id: "i131-pending", en: "Receipt notice of the pending I-485", es: "Recibo del I-485 pendiente", condition: "pending" },
      { id: "i131-gc", en: "Copy of the green card (reentry permit)", es: "Copia de la tarjeta de residencia (permiso de reingreso)", condition: "reentry" },
      { id: "i131-refugee", en: "Proof of refugee or asylee status", es: "Prueba de estatus de refugiado o asilado", condition: "refugee" }
    ],
    optional: [
      { id: "i131-purpose", en: "Short explanation of the trip and its dates", es: "Explicación breve del viaje y sus fechas" }
    ]
  }
};
