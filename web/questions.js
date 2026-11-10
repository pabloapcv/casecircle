const copy = {
  questions: ["Questions", "Preguntas"],
  waits: ["Waits", "Esperas"],
  waitsLead: [
    "The months below are yours. Next to them is what people keep asking about your form, and the official clock. A quiet status is not a decision.",
    "Los meses de abajo son tuyos. Al lado está lo que la gente sigue preguntando de tu formulario, y el reloj oficial. Un estatus quieto no es una decisión."
  ],
  questionsLead: [
    "These are the questions people ask over and over while a case sits still. The answers are orientation. They are not a prediction, not legal advice, and not a USCIS status.",
    "Estas son las preguntas que la gente repite mientras un caso sigue quieto. Las respuestas orientan. No son una predicción, no son asesoría legal y no son un estatus de USCIS."
  ],
  questionsSource: [
    "These answers follow questions that kept showing up in 33,922 public posts on r/USCIS and r/USCIS_FORUM, November 3, 2025 through November 3, 2026. The answers are written here. The posts are not copied.",
    "Estas respuestas siguen preguntas que volvían en 33,922 publicaciones públicas de r/USCIS y r/USCIS_FORUM, del 3 de noviembre de 2025 al 3 de noviembre de 2026. Las respuestas están escritas aquí. Las publicaciones no están copiadas."
  ],
  quiet: ["The quiet", "El silencio"],
  papers: ["Papers that are not the decision", "Papeles que no son la decisión"],
  askPerson: ["When to ask a person", "Cuándo preguntar a una persona"],
  otherClocks: ["The other clocks", "Los otros relojes"],
  statuses: ["What the status line usually means", "Qué suele significar la línea de estatus"],
  yourWait: ["What people ask about this form", "Lo que la gente pregunta de este formulario"],
  ifQuiet: ["If nothing is moving", "Si nada se mueve"],
  askedFirst: ["Asked first", "Lo primero que preguntan"],
  askAbout: ["Ask about a Reddit topic", "Pregunta sobre un tema de Reddit"],
  askAboutLead: ["These are questions people already posted on r/USCIS and r/USCIS_FORUM. Ask your own version here. The posts are not copied.", "Estas son preguntas que la gente ya publicó en r/USCIS y r/USCIS_FORUM. Pregunta tu versión aquí. Las publicaciones no están copiadas."],
  askThis: ["Ask", "Preguntar"],
  askAboutBody: ["Ask your version of a question people already posted.", "Pregunta tu versión de algo que la gente ya publicó."],
  sayingTitle: ["What people are saying", "Lo que la gente está diciendo"],
  sayingLead: ["Public posts from r/USCIS and r/USCIS_FORUM, November 3, 2025 to November 3, 2026. Up to 100 posts a day from each community. The counts, dates, scores, and titles below are from those posts.", "Publicaciones públicas de r/USCIS y r/USCIS_FORUM, del 3 de noviembre de 2025 al 3 de noviembre de 2026. Hasta 100 publicaciones por día de cada comunidad. Los conteos, las fechas, los puntos y los títulos de abajo salen de esas publicaciones."],
  dataPosts: ["Posts counted", "Publicaciones contadas"],
  dataQuestions: ["Titles with a question", "Títulos con una pregunta"],
  dataByMonth: ["Posts by month", "Publicaciones por mes"],
  dataByTopic: ["Posts by topic", "Publicaciones por tema"],
  dataWords: ["Words that show up most in titles", "Palabras que más aparecen en los títulos"],
  dataTitles: ["Public titles", "Títulos públicos"],
  dataListed: ["public titles are listed with the date, score, and comment count.", "títulos públicos están listados con la fecha, los puntos y los comentarios."],
  dataPoints: ["points", "puntos"],
  dataComments: ["comments", "comentarios"],
  dataMore: ["Show more titles", "Ver más títulos"],
  dataOnForm: ["Public posts about this form", "Publicaciones públicas sobre este formulario"],
  dataMention: ["posts in the count mentioned this topic", "publicaciones del conteo mencionan este tema"],
  openPost: ["Open the post", "Abrir la publicación"],
  today: ["Today", "Hoy"],
  myFolder: ["My folder", "Mi carpeta"],
  myWait: ["My wait", "Mi espera"],
  doNext: ["Do this next", "Haz esto ahora"],
  folderDone: ["Your folder is marked", "Tu carpeta está marcada"],
  folderDoneBody: ["Read the current instructions once more before you file. A finished list is not an approval.", "Lee las instrucciones vigentes otra vez antes de presentar. Una lista completa no es una aprobación."],
  reviewFolder: ["Review folder", "Revisar carpeta"],
  addForm: ["Add the form you filed", "Agrega el formulario que presentaste"],
  addFormBody: ["One form is enough to start. You can add another later.", "Un formulario basta para empezar. Puedes agregar otro después."],
  seeStories: ["Stories on your form", "Historias de tu formulario"],
  writeNote: ["Write a note", "Escribir una nota"],
  browseForms: ["All forms", "Todos los formularios"],
  showAllForms: ["Show every form", "Ver todos los formularios"],
  showFewer: ["Just the common forms", "Solo los formularios comunes"],
  startForm: ["Start with my form", "Empezar con mi formulario"],
  pathFolder: ["Gather papers", "Reunir papeles"],
  pathFolderBody: ["Mark what is already in the folder.", "Marca lo que ya está en la carpeta."],
  pathWait: ["Check the wait", "Ver la espera"],
  pathWaitBody: ["Your months, and what to do if it is quiet.", "Tus meses, y qué hacer si está quieto."],
  pathQuestions: ["Read a question", "Leer una pregunta"],
  pathQuestionsBody: ["Plain answers for the status line.", "Respuestas claras para la línea de estatus."],
  botNav: ["Answers", "Respuestas"],
  botTitle: ["Ask the posts", "Pregunta a las publicaciones"],
  botLead: ["Ask about a form, a status, or a wait. The reply uses the public posts counted here, from November 3, 2025 to November 3, 2026. It stays in this browser. It is not a decision on your case.", "Pregunta por un formulario, un estatus o una espera. La respuesta usa las publicaciones públicas contadas aquí, del 3 de noviembre de 2025 al 3 de noviembre de 2026. Se queda en este navegador. No es una decisión sobre tu caso."],
  botAsk: ["Ask", "Preguntar"],
  botTry: ["Or start with one of these", "O empieza con una de estas"],
  botSources: ["Titles that match", "Títulos que coinciden"],
  botCountLine: ["In the count", "En el conteo"]
};

const groups = [
  {
    id: "quiet",
    title: copy.quiet,
    items: [
      {
        id: "after-biometrics",
        q: ["Nothing has changed since biometrics. Is the case in trouble?", "No cambia nada desde la biometría. ¿El caso está en problemas?"],
        a: ["Biometrics, or a notice that old biometrics were reused, is an identity step. It is not a decision, and USCIS does not publish a separate clock that starts that day. A quiet page after that step is the question people ask most. Compare your filing month with the current processing time for your form and office. Someone else's approval is not your schedule.", "La biometría, o un aviso de que reutilizaron las huellas anteriores, es un paso de identidad. No es una decisión, y USCIS no publica un reloj aparte que empiece ese día. Una página quieta después de ese paso es la pregunta más común. Compara tu mes de presentación con el tiempo vigente de tu formulario y tu oficina. La aprobación de otra persona no es tu calendario."]
      },
      {
        id: "actively-reviewed",
        q: ["What does “actively being reviewed” mean?", "¿Qué significa “en revisión activa”?"],
        a: ["It means the case is in the system they use for review. People report that same sentence for months with no other change. It does not mean an officer is reading the file today, and it does not mean the file was lost.", "Significa que el caso está en el sistema que usan para revisar. La gente reporta esa misma frase durante meses sin otro cambio. No significa que un oficial esté leyendo el expediente hoy, ni que el expediente se haya perdido."]
      },
      {
        id: "faster-neighbor",
        q: ["Someone who filed the same month is already approved.", "Alguien que presentó el mismo mes ya fue aprobado."],
        a: ["Same form and same month are not the same case. Office, category, an interview, an evidence request, and background checks pull cases apart. Read those stories as company, not as a forecast. The published clock is the processing-times page.", "El mismo formulario y el mismo mes no son el mismo caso. La oficina, la categoría, una entrevista, un pedido de evidencia y las revisiones de fondo separan los casos. Lee esas historias como compañía, no como pronóstico. El reloj publicado es la página de tiempos de procesamiento."]
      },
      {
        id: "after-interview",
        q: ["The interview was weeks ago and the status looks the same.", "La entrevista fue hace semanas y el estatus se ve igual."],
        a: ["An interview is not the decision, and the decision is not the card in the mail. People describe long quiet stretches after an interview, including checks that never appear as a new status. If the processing-times page says an inquiry is allowed, use the official request. Do not post the appointment notice here.", "Una entrevista no es la decisión, y la decisión no es la tarjeta en el correo. La gente describe silencios largos después de una entrevista, incluso revisiones que nunca aparecen como un estatus nuevo. Si la página de tiempos dice que ya puedes hacer una consulta, usa la solicitud oficial. No publiques el aviso de cita aquí."]
      }
    ]
  },
  {
    id: "papers",
    title: copy.papers,
    items: [
      {
        id: "ead-separate",
        q: ["The interview is scheduled, but I still cannot work.", "La entrevista está programada, pero todavía no puedo trabajar."],
        a: ["The work permit, the travel document, and the green card are different forms, even when they were mailed together. An interview on the adjustment does not approve the work permit. A work permit is not the green card. The wait to work is its own pain, and it is one of the most common ones in these forums.", "El permiso de trabajo, el documento de viaje y la residencia son formularios distintos, aunque se hayan enviado juntos. Una entrevista del ajuste no aprueba el permiso de trabajo. Un permiso de trabajo no es la residencia. La espera para trabajar es un problema aparte, y es de los más comunes en estos foros."]
      },
      {
        id: "rfe-not-denial",
        q: ["I received a request for evidence. Is that a denial?", "Recibí un pedido de evidencia. ¿Es una negación?"],
        a: ["No. Read the notice for the deadline and the documents it names. Send that list, with a full English translation where the instructions require one. A request is not a new story about the case, and it is not a denial. Keep the notice in your paper folder. Do not upload it here.", "No. Lee el aviso: el plazo y los documentos que nombra. Envía esa lista, con una traducción completa al inglés cuando las instrucciones la piden. Un pedido no es una historia nueva del caso, ni una negación. Guarda el aviso en tu carpeta de papel. No lo subas aquí."]
      },
      {
        id: "i751-quiet",
        q: ["I filed to remove conditions and then only got biometrics and an extension letter.", "Presenté para quitar las condiciones y luego solo llegaron la biometría y la carta de extensión."],
        a: ["That quiet stretch is the story people tell about Form I-751. The receipt can extend a conditional card while the petition is pending. Read the current receipt for how long that extension lasts. Reused biometrics do not make the rest faster. A still status is not a decision.", "Ese silencio es la historia que la gente cuenta del I-751. El recibo puede extender una tarjeta condicional mientras la petición está pendiente. Lee el recibo vigente para ver cuánto dura esa extensión. Reutilizar la biometría no acelera el resto. Un estatus quieto no es una decisión."]
      }
    ]
  },
  {
    id: "ask",
    title: copy.askPerson,
    items: [
      {
        id: "when-to-inquire",
        q: ["When is it reasonable to ask USCIS, instead of refreshing the page?", "¿Cuándo tiene sentido preguntar a USCIS, en vez de actualizar la página?"],
        a: ["Read the processing time for your form and office first. If your receipt date is still inside that range, another refresh will not create news. If the page says you are outside normal processing time, the next step is an official inquiry. A congressional office can also ask for a status. An inquiry is not an approval.", "Primero lee el tiempo de procesamiento de tu formulario y tu oficina. Si la fecha de tu recibo sigue dentro de ese rango, actualizar otra vez no crea noticias. Si la página dice que estás fuera del tiempo normal, el siguiente paso es una consulta oficial. La oficina de un congresista también puede pedir un estatus. Una consulta no es una aprobación."]
      },
      {
        id: "whatsapp",
        q: ["Someone in a chat says they can expedite the case.", "Alguien en un chat dice que puede acelerar el caso."],
        a: ["Treat that as a scam. USCIS does not sell a faster decision in a private chat. An expedite, when one exists, goes through the official request and needs a real reason with evidence. Paying a stranger does not create a decision.", "Trátalo como una estafa. USCIS no vende una decisión más rápida en un chat privado. Un trámite acelerado, cuando existe, pasa por la solicitud oficial y necesita una razón real con pruebas. Pagarle a un desconocido no crea una decisión."]
      },
      {
        id: "cannot-work",
        q: ["I cannot start the job until the work card arrives.", "No puedo empezar el trabajo hasta que llegue la tarjeta de empleo."],
        a: ["The category on the work-permit form has to be one you actually qualify for. A job offer does not by itself approve the card. If you ask for an expedite, use the reasons on the official page and keep the evidence. The card, if it is approved, is permission to work. It is not the residence.", "La categoría del permiso de trabajo tiene que ser una para la que realmente calificas. Una oferta de empleo no aprueba la tarjeta por sí sola. Si pides un trámite acelerado, usa las razones de la página oficial y guarda las pruebas. La tarjeta, si la aprueban, es permiso para trabajar. No es la residencia."]
      }
    ]
  },
  {
    id: "clocks",
    title: copy.otherClocks,
    items: [
      {
        id: "card-not-approval",
        q: ["It says approved, but I do not have the card.", "Dice aprobado, pero no tengo la tarjeta."],
        a: ["Approval, card production, and the card in the mail are three different events. People celebrate the approval and then wait again for the plastic. The approval is not the card in your hand. Do not post the notice.", "La aprobación, la producción de la tarjeta y la tarjeta en el correo son tres hechos distintos. La gente celebra la aprobación y luego vuelve a esperar el plástico. La aprobación no es la tarjeta en la mano. No publiques el aviso."]
      },
      {
        id: "case-transferred",
        q: ["My case was transferred. Did something go wrong?", "Transfirieron mi caso. ¿Pasó algo malo?"],
        a: ["A transfer moves the file to another office. It is not a denial and it does not start a new filing date. The status can sit still while the file moves. Read the processing time for the office that has it now.", "Una transferencia mueve el expediente a otra oficina. No es una negación y no empieza una fecha nueva de presentación. El estatus puede quedarse quieto mientras el expediente se mueve. Lee el tiempo de procesamiento de la oficina que lo tiene ahora."]
      },
      {
        id: "petition-not-visa",
        q: ["The relative petition was approved. Is the visa next?", "Aprobaron la petición del familiar. ¿Sigue la visa?"],
        a: ["A petition approval is not a visa and not a green card. If the relative finishes at a consulate, the next office is usually the National Visa Center, then an embassy. Those are different clocks. Do not post the approval notice.", "La aprobación de una petición no es una visa ni la residencia. Si el familiar termina en un consulado, la siguiente oficina suele ser el Centro Nacional de Visas y después una embajada. Son relojes distintos. No publiques el aviso de aprobación."]
      },
      {
        id: "n400-oath",
        q: ["I passed the naturalization interview. Am I a citizen?", "Pasé la entrevista de naturalización. ¿Ya soy ciudadano?"],
        a: ["The interview, the English and civics test, the decision, and the oath are different steps. Passing the interview is not the oath. One office's same-day oath is not a schedule for yours.", "La entrevista, el examen de inglés y civismo, la decisión y el juramento son pasos distintos. Pasar la entrevista no es el juramento. El juramento el mismo día en una oficina no es el calendario de la tuya."]
      },
      {
        id: "medical-expiration",
        q: ["How long is the immigration medical exam good for?", "¿Cuánto tiempo vale el examen médico de inmigración?"],
        a: ["Per the USCIS Policy Manual (Vol. 8, Part B, Ch. 4), an I-693 signed by the civil surgeon on or after Nov. 1, 2023 stays valid for as long as the application it was filed with is pending; a later application needs a new exam. An exam signed before Nov. 1, 2023 is valid for 2 years from the signature. By mail, keep the envelope sealed; if you file the I-485 online, USCIS asks you to open it, upload the form, and keep the original and envelope. Check uscis.gov/i-693 before you file.", "Según el Manual de Políticas de USCIS (Vol. 8, Parte B, Cap. 4), un I-693 firmado por el médico civil desde el 1 de noviembre de 2023 vale mientras siga pendiente la solicitud con la que se presentó; una solicitud posterior necesita un examen nuevo. Un examen firmado antes del 1 de noviembre de 2023 vale 2 años desde la firma. Por correo, deja el sobre cerrado; si presentas el I-485 en línea, USCIS te pide abrirlo, subir el formulario y guardar el original y el sobre. Revisa uscis.gov/i-693 antes de presentar."]
      },
      {
        id: "premium-not-adjustment",
        q: ["Can I pay for premium processing on the green card?", "¿Puedo pagar procesamiento premium para la residencia?"],
        a: ["Premium processing is a paid clock on specific forms, often an employer petition. It is not a way to buy a faster adjustment, a faster interview, or a faster oath. If your form is not on the current premium list, paying will not move it.", "El procesamiento premium es un reloj de pago en formularios específicos, a menudo una petición del empleador. No es una forma de comprar un ajuste más rápido, una entrevista más rápida o un juramento más rápido. Si tu formulario no está en la lista vigente, pagarlo no lo mueve."]
      },
      {
        id: "travel-pending",
        q: ["Can I leave the country while the case is pending?", "¿Puedo salir del país mientras el caso está pendiente?"],
        a: ["Some pending applications are abandoned if you travel. A travel document, when one exists, is a separate form, and it is not a promise that you can return. Read the instructions for your status before you book a ticket. If you are not sure, ask a lawyer. Do not travel on a stranger's story.", "Algunos trámites pendientes se abandonan si viajas. Un documento de viaje, cuando existe, es un formulario aparte, y no es una promesa de que puedes regresar. Lee las instrucciones de tu estatus antes de comprar un pasaje. Si no estás seguro, pregunta a un abogado. No viajes con la historia de un desconocido."]
      },
      {
        id: "rejection-not-denial",
        q: ["The packet came back. Is that a denial?", "El paquete regresó. ¿Es una negación?"],
        a: ["A rejection often means the packet was not accepted: the fee, a missing signature, or an old form edition. A denial is a decision on a case they accepted. Read the notice for which one it is, fix what it names, and keep it in your paper folder. Do not upload it here.", "Un rechazo a menudo significa que no aceptaron el paquete: la tarifa, una firma que falta o una edición vieja del formulario. Una negación es una decisión sobre un caso que sí aceptaron. Lee el aviso para saber cuál es, corrige lo que nombra y guárdalo en tu carpeta de papel. No lo subas aquí."]
      },
      {
        id: "i140-not-greencard",
        q: ["My employer petition was approved. Do I have a green card?", "Aprobaron la petición de mi empleador. ¿Ya tengo la residencia?"],
        a: ["An approved immigrant-worker petition is not a green card, and it does not by itself let you work or travel. The adjustment, or the visa at a consulate, is a later case with its own wait. A premium clock on the petition, when one applies, does not decide that later case.", "Una petición aprobada de trabajador inmigrante no es la residencia, y por sí sola no permite trabajar ni viajar. El ajuste, o la visa en un consulado, es un caso posterior con su propia espera. Un reloj premium de la petición, cuando aplica, no decide ese caso posterior."]
      },
      {
        id: "mail-card",
        q: ["The card was mailed and the tracking stopped.", "Enviaron la tarjeta y el rastreo se detuvo."],
        a: ["Production and mailing are not the same day. A pause on a tracker is a mail event, not a new decision. Give the mail the window the notice describes. Do not post your address or a tracking number. If the notice says the card was returned, read the current instructions for a replacement.", "La producción y el envío no son el mismo día. Una pausa en el rastreo es un hecho del correo, no una decisión nueva. Dale al correo el plazo que dice el aviso. No publiques tu dirección ni un número de rastreo. Si el aviso dice que devolvieron la tarjeta, lee las instrucciones vigentes para un reemplazo."]
      }
    ]
  }
];

const statuses = [
  ["received", "Case was received", "Caso recibido", "The file is in the system. It is not a review and it is not a finding that anything is late.", "El expediente está en el sistema. No es una revisión y no es un hallazgo de que algo esté tarde."],
  ["reviewed", "Actively being reviewed", "En revisión activa", "A label people stare at for months. It does not mean someone opened the file today.", "Una etiqueta que la gente mira durante meses. No significa que alguien abrió el expediente hoy."],
  ["bios", "Biometrics reused or completed", "Biometría reutilizada o hecha", "An identity step. It does not start a shorter clock for the rest of the case.", "Un paso de identidad. No empieza un reloj más corto para el resto del caso."],
  ["rfe", "Request for evidence", "Pedido de evidencia", "A deadline and a list. It is not a denial.", "Un plazo y una lista. No es una negación."],
  ["interview", "Interview scheduled", "Entrevista programada", "Bring originals that match what you filed. It is not an approval.", "Lleva originales que coincidan con lo que presentaste. No es una aprobación."],
  ["approved", "Approved, card not here yet", "Aprobado, la tarjeta aún no llega", "The decision and the plastic in the mail are different events.", "La decisión y el plástico en el correo son hechos distintos."]
];

const steps = [
  ["times", "Read the processing time", "Lee el tiempo de procesamiento", "Use the official page for your form and office. If your receipt date is inside that range, the quiet is what that page already describes.", "Usa la página oficial de tu formulario y tu oficina. Si la fecha de tu recibo está dentro de ese rango, el silencio es lo que esa página ya describe.", "https://egov.uscis.gov/processing-times/", "USCIS processing times", "Tiempos de procesamiento de USCIS"],
  ["inquiry", "Ask only when the page allows it", "Pregunta solo cuando la página lo permite", "Outside normal processing time, send an official inquiry. Do not invent a new story of the case in that form.", "Fuera del tiempo normal, envía una consulta oficial. No inventes una historia nueva del caso en ese formulario.", "https://egov.uscis.gov/e-request/Intro.do", "USCIS e-Request", "e-Request de USCIS"],
  ["expedite", "Expedite with a real reason", "Acelerar con una razón real", "The official page lists the reasons. A job, a medical emergency, or a nonprofit request needs evidence. A chat message is not a reason.", "La página oficial lista las razones. Un empleo, una emergencia médica o una solicitud de una organización necesitan pruebas. Un mensaje de chat no es una razón.", "https://www.uscis.gov/forms/filing-guidance/how-to-make-an-expedite-request", "How to ask for an expedite", "Cómo pedir un trámite acelerado"],
  ["congress", "A congressional office can ask for a status", "La oficina de un congresista puede pedir un estatus", "That request is an inquiry. It does not order an approval. Use your representative or your senators.", "Esa solicitud es una consulta. No ordena una aprobación. Usa tu representante o tus senadores.", "https://www.house.gov/representatives/find-your-representative", "Find your representative", "Encuentra tu representante"]
];

const waits = {
  "i-485": ["Adjustment", "Ajuste", "People filing the green card from inside the United States ask about three different clocks at once: the adjustment, the work permit, and the travel document. Silence after biometrics, and silence after the interview, are the two waits they describe most. Neither one is a decision.", "Quien pide la residencia desde dentro de Estados Unidos pregunta por tres relojes a la vez: el ajuste, el permiso de trabajo y el documento de viaje. El silencio después de la biometría, y el silencio después de la entrevista, son las dos esperas que más describen. Ninguna es una decisión."],
  "i-130": ["A petition for a relative", "Una petición de familiar", "The long “case was received” line is the common complaint, especially when the relative will finish the process at a consulate. A petition approval is not a visa and not a green card.", "La línea larga de “caso recibido” es la queja común, sobre todo cuando el familiar termina el proceso en un consulado. La aprobación de la petición no es una visa ni la residencia."],
  "i-751": ["Removal of conditions", "Quitar condiciones", "The usual mail is a receipt that extends the conditional card, and often a biometrics reuse notice. Then the status sits. People treat that quiet as the normal shape of this form, not as a sign the petition was refused. Read the current receipt for the length of the extension.", "El correo habitual es un recibo que extiende la tarjeta condicional, y a menudo un aviso de reutilizar la biometría. Luego el estatus se queda quieto. La gente trata ese silencio como la forma normal de este formulario, no como una señal de que negaron la petición. Lee el recibo vigente para la duración de la extensión."],
  "i-765": ["Work permit", "Permiso de trabajo", "This wait is about being allowed to work, not about the green card. People compare premium-processing clocks and expedite requests. The clock, the fee refund if a deadline is missed, and the category you qualify for are on the current form pages. A card is not the residence.", "Esta espera es sobre poder trabajar, no sobre la residencia. La gente compara los relojes del procesamiento premium y las solicitudes de acelerar. El reloj, la devolución de la tarifa si se vence un plazo, y la categoría para la que calificas están en las páginas vigentes del formulario. Una tarjeta no es la residencia."],
  "n-400": ["Naturalization", "Naturalización", "The questions cluster around the interview, the English and civics test, and the oath as a later ceremony. An interview date is not the oath and not an approval.", "Las preguntas se juntan alrededor de la entrevista, el examen de inglés y civismo, y el juramento como una ceremonia posterior. Una fecha de entrevista no es el juramento ni una aprobación."],
  "i-131": ["Travel document", "Documento de viaje", "People ask whether they can leave while this is pending. Do not travel on a hope. Some pending applications are abandoned by travel. Read the instructions for your status, and ask a lawyer if you are not sure.", "La gente pregunta si puede salir mientras esto está pendiente. No viajes con una esperanza. Algunos trámites pendientes se abandonan al viajar. Lee las instrucciones de tu estatus, y pregunta a un abogado si no estás seguro."]
};

export function questionText(lang, key) {
  const pair = copy[key];
  if (!pair) return key;
  return lang === "es" ? pair[1] : pair[0];
}

export function questionGroups(lang) {
  const es = lang === "es";
  return groups.map((group) => ({
    id: group.id,
    title: es ? group.title[1] : group.title[0],
    items: group.items.map((item) => ({ id: item.id, q: es ? item.q[1] : item.q[0], a: es ? item.a[1] : item.a[0] }))
  }));
}

export function statusLines(lang) {
  const es = lang === "es";
  return statuses.map((row) => ({ id: row[0], name: es ? row[2] : row[1], body: es ? row[4] : row[3] }));
}

export function quietSteps(lang) {
  const es = lang === "es";
  return steps.map((row) => ({ id: row[0], title: es ? row[2] : row[1], body: es ? row[4] : row[3], href: row[5], link: es ? row[7] : row[6] }));
}

export function waitNote(lang, spaceId) {
  const row = waits[spaceId];
  if (!row) return null;
  const es = lang === "es";
  return { title: es ? row[1] : row[0], body: es ? row[3] : row[2] };
}

export function leadQuestions(lang) {
  return questionGroups(lang).flatMap((group) => group.items).slice(0, 4);
}

const home = {
  homeTitle: ["The calm, bilingual companion for the USCIS wait.", "El acompañante bilingüe y tranquilo para la espera de USCIS."],
  homeLede: [
    "Compare your USCIS wait with people like you, get your papers in order, and learn from people who have been there, in English or Spanish, without handing over your documents.",
    "Compara tu espera de USCIS con personas como tú, organiza tus papeles y aprende de quienes ya pasaron por esto, en español o inglés, sin entregar tus documentos."
  ],
  homeTrust: [
    "Not USCIS. Not legal advice. Community experiences, checklists, and plain-language explanations. Your papers stay on this device.",
    "No es USCIS. No es asesoría legal. Experiencias de la comunidad, listas y explicaciones claras. Tus papeles se quedan en este dispositivo."
  ],
  metaTitle: ["CaseCircle — calm, bilingual companion for the USCIS wait", "CaseCircle — acompañante bilingüe y tranquilo para la espera de USCIS"],
  metaDesc: [
    "Free bilingual community and case companion for the USCIS wait. Check the wait, gather papers on your device, prepare for interviews, and avoid scams. Not affiliated with USCIS.",
    "Comunidad bilingüe gratuita y compañero de caso para la espera de USCIS. Revisa la espera, reúne papeles en tu dispositivo, prepárate para entrevistas y evita estafas. Sin afiliación con USCIS."
  ],
  homePreviewKicker: ["In Adjustment of status", "En Ajuste de estatus"],
  homePreviewStatus: ["Nothing has changed since biometrics. Is the case in trouble?", "No cambia nada desde la biometría. ¿El caso está en problemas?"],
  homePreview1: ["Biometrics checks identity. A quiet page after that is not a decision.", "La biometría comprueba la identidad. Una página quieta después no es una decisión."],
  homePreview2: ["A public post title from r/USCIS. The rest of the post stays on Reddit.", "Un título público de r/USCIS. El resto de la publicación se queda en Reddit."],
  homePreview3: ["Leave receipt numbers out of the conversation.", "Deja los números de recibo fuera de la conversación."],
  whatTitle: ["What CaseCircle helps with", "En qué te ayuda CaseCircle"],
  whatLead: [
    "Built around the waits people actually ask about — not a filing service and not the government.",
    "Hecho alrededor de las esperas que la gente realmente pregunta — no es un servicio de presentación ni el gobierno."
  ],
  whatFolderTitle: ["Gather papers + private case folder", "Reunir papeles + carpeta privada"],
  whatFolderBody: [
    "Know what goes in your folder, form by form. Your papers never leave your phone.",
    "Sabe qué va en tu carpeta, formulario por formulario. Tus papeles nunca salen de tu teléfono."
  ],
  whatAnswersTitle: ["Common questions", "Preguntas comunes"],
  whatAnswersBody: [
    "Plain answers for every status line, with sources when we use public posts.",
    "Respuestas claras para cada línea de estatus, con fuentes cuando usamos publicaciones públicas."
  ],
  whatClockTitle: ["Check the wait", "Ver la espera"],
  whatClockBody: [
    "See if your wait is normal for people like you.",
    "Mira si tu espera es normal para personas como tú."
  ],
  whatInterviewTitle: ["Interview prep", "Preparar la entrevista"],
  whatInterviewBody: [
    "Walk in knowing what people were asked at field offices like yours.",
    "Llega sabiendo qué les preguntaron a otros en oficinas como la tuya."
  ],
  whatCommunityTitle: ["Moderated community", "Comunidad moderada"],
  whatCommunityBody: [
    "No one here sells shortcuts. Learn the red flags for notarios and scams.",
    "Aquí nadie vende atajos. Aprende las señales de alerta de notarios y estafas."
  ],
  painsTitle: ["What the wait feels like", "Cómo se siente la espera"],
  painsLead: [
    "For people with family-based and naturalization cases who feel alone and confused while they wait.",
    "Para personas con casos familiares y de naturalización que se sienten solas y confundidas mientras esperan."
  ],
  howTitle: ["How it works", "Cómo funciona"],
  howLead: [
    "Start free. Keep documents on the device. Never acts as a lawyer or as the government.",
    "Empieza gratis. Los documentos se quedan en el dispositivo. Nunca actúa como abogado ni como el gobierno."
  ],
  willNotTitle: ["What this site will not do", "Lo que este sitio no hace"],
  homeNavWhat: ["Features", "Funciones"],
  homeNavPain: ["The wait", "La espera"],
  homeNavPains: ["The waits", "Las esperas"],
  homeNavHow: ["How it works", "Cómo funciona"],
  homeNavCompare: ["Compare", "Comparar"],
  homeNavPricing: ["Pricing", "Precios"],
  homeNavHelp: ["Find real help", "Ayuda real"],
  footBlurb: [
    "The calm, bilingual companion for the USCIS wait. Not affiliated with USCIS.",
    "El acompañante bilingüe y tranquilo para la espera de USCIS. Sin afiliación con USCIS."
  ],
  footSite: ["On this site", "En este sitio"],
  footRead: ["Read", "Leer"],
  footOfficial: ["Official pages", "Páginas oficiales"],
  footTimes: ["USCIS processing times", "Tiempos de procesamiento de USCIS"],
  footInquiry: ["USCIS e-Request", "e-Request de USCIS"],
  footContact: ["USCIS contact center", "Centro de contacto de USCIS"],
  again: ["Join the community", "Únete a la comunidad"],
  // Kept for old callers; the signed-in nav now uses the nav* keys below.
  feed: ["Feed", "Inicio"],
  communities: ["Case groups", "Grupos de caso"],
  allCommunities: ["Browse all groups", "Ver todos los grupos"],
  shareThought: ["Ask a question or share an update…", "Haz una pregunta o cuenta una novedad…"],
  addons: ["Tools", "Herramientas"],
  joinSpaces: ["Pick the case groups you want in your feed. You can add more later.", "Elige los grupos de caso que quieres en tu inicio. Puedes agregar más después."],
  navMain: ["Main", "Principal"],
  navFeed: ["Feed", "Inicio"],
  navAnswers: ["Answers", "Respuestas"],
  navWaitShort: ["Wait", "Espera"],
  navPapersShort: ["Papers", "Papeles"],
  openFeed: ["Go to your feed", "Ir a tu inicio"],
  newPost: ["New post", "Publicar"],
  skipToContent: ["Skip to content", "Saltar al contenido"],
  accountMenu: ["Account menu", "Menú de cuenta"],
  menuProfile: ["Profile, cases & saved", "Perfil, casos y guardados"],
  menuGroups: ["Your case groups", "Tus grupos de caso"],
  groupsLabel: ["Case groups", "Grupos de caso"],
  allMyGroups: ["All my groups", "Todos mis grupos"],
  browseGroups: ["Browse groups", "Ver grupos"],
  sortLabel: ["Sort posts", "Ordenar publicaciones"],
  postTypeLabel: ["Post type", "Tipo de publicación"],
  answersAsk: ["Ask the posts", "Pregunta a las publicaciones"],
  answersFaq: ["Common questions", "Preguntas comunes"],
  answersBody: ["Ask the public posts, or read the common questions.", "Pregunta a las publicaciones públicas o lee las preguntas comunes."],
  interviewPrep: ["Interview prep", "Preparar la entrevista"],
  interviewPrepBody: ["Tips and what people saw at their field office.", "Consejos y lo que la gente vio en su oficina."],
  emptyFeedBody: ["Post the first question, or join another case group.", "Publica la primera pregunta o únete a otro grupo de caso."],
  sidebarLabel: ["Your case and saved posts", "Tu caso y publicaciones guardadas"],
  yourCase: ["Your case", "Tu caso"],
  monthsSinceFiling: ["months since filing", "meses desde la presentación"],
  monthSinceFiling: ["month since filing", "mes desde la presentación"],
  filedThisMonth: ["Filed this month", "Presentado este mes"],
  waitLonger: ["Longer than {p}% of {n} similar timelines on CaseCircle.", "Más larga que el {p}% de {n} tiempos parecidos en CaseCircle."],
  waitNoCompare: ["Not enough similar timelines to compare yet.", "Aún no hay suficientes tiempos parecidos para comparar."],
  moreCases: ["+{n} more in Check the wait", "+{n} más en Revisa la espera"],
  caseEmptyTitle: ["No case added yet", "Aún no agregas un caso"],
  caseEmptyBody: ["Add your form, filing month and stage to see your months since filing here. Saved to your account when you're signed in, otherwise only in this browser.", "Agrega tu formulario, mes de presentación y etapa para ver aquí tus meses desde la presentación. Se guarda en tu cuenta si iniciaste sesión; si no, solo en este navegador."],
  savedTitle: ["Saved posts", "Publicaciones guardadas"],
  savedSeeAll: ["See all saved ({n})", "Ver todo lo guardado ({n})"],
  savedEmptyBody: ["Tap Save on a post to keep it here.", "Toca Guardar en una publicación para tenerla aquí."],
  rulesLinkBody: ["Be kind, and never post receipt numbers or other ID numbers.", "Sé amable y nunca publiques números de recibo ni otros identificadores."],
  postMissingBody: ["This thread was removed or the link is out of date.", "Esta conversación se eliminó o el enlace ya no sirve."],
  backToFeed: ["Back to Feed", "Volver al inicio"],
  groupEmptyBody: ["Be the first to ask a question in {g}.", "Sé la primera persona en preguntar en {g}."],
  langSwitch: ["Language", "Idioma"]
};

const painRows = [
  ["Processing-time anxiety", "See if your wait is normal for people like you — Check the wait.", "Ansiedad por el tiempo de procesamiento", "Mira si tu espera es normal para personas como tú — Ver la espera.", "waiting"],
  ["Document confusion", "Know what goes in your folder, form by form — Gather papers and a private case folder.", "Confusión con documentos", "Sabe qué va en tu carpeta, formulario por formulario — Reunir papeles y carpeta privada.", "folder"],
  ["Interview nerves", "Walk in knowing what people were asked — Interview prep.", "Nervios por la entrevista", "Llega sabiendo qué les preguntaron a otros — Preparar la entrevista.", "interview"],
  ["Notarios and scams", "No one here sells shortcuts. Learn the red flags — Moderated community and rules.", "Notarios y estafas", "Aquí nadie vende atajos. Aprende las señales de alerta — Comunidad moderada y reglas.", "scams"],
  ["Opaque status lines", "Plain answers for every status line — Common questions.", "Líneas de estatus opacas", "Respuestas claras para cada línea de estatus — Preguntas comunes.", "status"],
  ["Language barriers", "Your case, in your language — Full English/Spanish app.", "Barreras de idioma", "Tu caso, en tu idioma — App completa en inglés y español.", "language"]
];

const howRows = [
  ["Join free", "Pick your form group. Read people on the same path. Start without paying.", "Únete gratis", "Elige tu grupo de formulario. Lee a personas en el mismo camino. Empieza sin pagar."],
  ["Check the wait and gather papers", "Compare months with similar cases. Mark your private checklist. Papers stay on this device.", "Revisa la espera y reúne papeles", "Compara meses con casos parecidos. Marca tu lista privada. Los papeles se quedan en este dispositivo."],
  ["Prep and stay safe", "Interview tips from field-office stories. Moderated rules. No notario shortcuts.", "Prepárate y cuídate", "Consejos de entrevista de historias de oficinas. Reglas moderadas. Sin atajos de notarios."]
];

const limitRows = [
  ["It will not file a form or promise an approval.", "No presenta un formulario ni promete una aprobación."],
  ["It is not USCIS, not a lawyer, and not a paralegal you hired.", "No es USCIS, no es un abogado y no es un paralegal que hayas contratado."],
  ["It will not take a receipt number, an A-number, a Social Security number, or a passport number.", "No pide un número de recibo, un número A, un Seguro Social ni un pasaporte."],
  ["It does not publish your notes to other people.", "No publica tus notas para otras personas."]
];

function pair(lang, key) {
  const row = home[key];
  return lang === "es" ? row[1] : row[0];
}

export function homeText(lang, key) {
  return pair(lang === "es" ? "es" : "en", key);
}

export function homePains(lang) {
  const es = lang === "es";
  return painRows.map((row) => ({ id: row[4] || "", title: es ? row[2] : row[0], body: es ? row[3] : row[1] }));
}

export function homeSteps(lang) {
  const es = lang === "es";
  return howRows.map((row) => ({ title: es ? row[2] : row[0], body: es ? row[3] : row[1] }));
}

export function homeLimits(lang) {
  const es = lang === "es";
  return limitRows.map((row) => (es ? row[1] : row[0]));
}


const compareRows = [
  ["Case trackers", "Status updates only. They tell you what changed, not what to gather next or what is normal for people like you.", "Rastreadores de caso", "Solo actualizaciones de estatus. Te dicen qué cambió, no qué reunir después ni qué es normal para personas como tú."],
  ["Paid prep services", "Guided forms and filings for a fee. Useful for some people, but they stop at filing and are not a free place to wait.", "Servicios de preparación de pago", "Formularios guiados y presentaciones por una tarifa. Útiles para algunos, pero terminan al presentar y no son un lugar gratuito para esperar."],
  ["Public chat groups", "Free forums and social groups. Hard to search, often English-only or mixed with unverified advice and scam offers.", "Grupos de chat públicos", "Foros y grupos sociales gratis. Difíciles de buscar, a menudo solo en inglés o mezclados con consejos no verificados y ofertas de estafa."]
];

const pricingCopy = {
  pricingTitle: ["Pricing", "Precios"],
  pricingLead: [
    "The free core stays free. Case Pass is a one-time purchase for one case, for twelve months.",
    "El núcleo gratis sigue gratis. Case Pass es una compra única por un caso, por doce meses."
  ],
  freeTitle: ["Free", "Gratis"],
  freePrice: ["$0", "$0"],
  freeBody: [
    "Folder builder, Check the wait, the community, common questions, general interview tips, and a small monthly allowance of Ask-the-posts questions.",
    "Armador de carpetas, Ver la espera, la comunidad, preguntas comunes, consejos generales de entrevista y un cupo mensual pequeño de Pregunta a las publicaciones."
  ],
  passTitle: ["Case Pass", "Case Pass"],
  passBody: [
    "One-time, per case, for 12 months: Interview practice, Civics practice, unlimited folder chat, printable bilingual checklist, and wait alerts.",
    "Una sola vez, por caso, por 12 meses: práctica de entrevista, práctica de educación cívica, chat de carpeta ilimitado, lista bilingüe imprimible y alertas de espera."
  ],
  passComing: ["Coming soon — Join the waitlist", "Próximamente — Únete a la lista de espera"],
  waitlistHelp: ["No checkout yet. Leave your email and we will write once when Case Pass is ready. We never charge you from this page.", "Aún no hay pago. Deja tu correo y te escribiremos una vez cuando Case Pass esté listo. Nunca te cobramos desde esta página."],
  waitlistSaved: ["You're on the waitlist. We'll email you once when Case Pass is ready — no charge.", "Estás en la lista de espera. Te escribiremos una vez cuando Case Pass esté listo, sin cobro."],
  waitlistMailto: ["Or email support@casecircle.app to join the waitlist", "O escribe a support@casecircle.app para unirte a la lista"],
  abNote: ["Price shown is the A/B test amount configured for this build.", "El precio mostrado es el monto de la prueba A/B configurado en esta versión."]
};

const helpCopy = {
  findHelpTitle: ["Find real help", "Encuentra ayuda real"],
  findHelpLead: [
    "CaseCircle is not a lawyer and does not sell attorney leads. If you need advice on your facts, use free or low-cost legal help.",
    "CaseCircle no es un abogado y no vende leads de abogados. Si necesitas consejo sobre tus hechos, usa ayuda legal gratuita o de bajo costo."
  ],
  notarioTitle: ["Notarios are not immigration lawyers", "Los notarios no son abogados de inmigración"],
  notarioBody: [
    "In the United States, a notario or notary public cannot give immigration advice. Do not pay for expedites in WhatsApp chats, gift cards, or anyone who guarantees an approval.",
    "En Estados Unidos, un notario no puede dar asesoría de inmigración. No pagues por aceleraciones en chats de WhatsApp, tarjetas de regalo, ni a quien garantice una aprobación."
  ],
  dojLabel: ["DOJ Recognition & Accreditation program", "Programa de Reconocimiento y Acreditación del DOJ"],
  ailaLabel: ["AILA immigration lawyer search", "Búsqueda de abogados de inmigración de AILA"],
  ianLabel: ["Immigration Advocates Network legal directory", "Directorio legal de Immigration Advocates Network"],
  uscisLegalLabel: ["USCIS: find legal services", "USCIS: encontrar servicios legales"],
  ftcLabel: ["FTC: how to avoid immigration scams", "FTC: cómo evitar estafas de inmigración"],
  uscisScamLabel: ["USCIS: avoid scams", "USCIS: evita estafas"]
};

const formSeo = {
  formsTitle: ["Forms people wait on", "Formularios en los que la gente espera"],
  formsLead: [
    "Shareable pages for the forms CaseCircle focuses on. Plain language in English and Spanish.",
    "Páginas para compartir de los formularios en los que se centra CaseCircle. Lenguaje claro en inglés y español."
  ]
};

const stageExplanations = {
  filed: {
    en: "Your application has been received. USCIS will review it for completeness and send a receipt notice. This is the start of the process.",
    es: "Tu solicitud ha sido recibida. USCIS la revisará para verificar que esté completa y enviará un aviso de recibo. Este es el inicio del proceso."
  },
  biometrics: {
    en: "Biometrics (fingerprints) confirm your identity. After this, the case returns to a queue. A quiet status after biometrics is common and does not mean there's a problem.",
    es: "La biometría (huellas dactilares) confirma tu identidad. Después de esto, el caso vuelve a una cola. Un estatus quieto después de la biometría es común y no significa que haya un problema."
  },
  rfe: {
    en: "USCIS needs additional evidence. Read the notice carefully for the exact documents requested and the deadline. An RFE is not a denial—it's a chance to provide more information.",
    es: "USCIS necesita evidencia adicional. Lee el aviso con cuidado para ver los documentos exactos y el plazo. Un RFE no es una negación—es una oportunidad de dar más información."
  },
  interview_scheduled: {
    en: "An interview has been scheduled. Bring original documents, dress appropriately, and arrive early. Review your application to answer questions consistently.",
    es: "Una entrevista ha sido programada. Lleva documentos originales, vístete apropiadamente y llega temprano. Revisa tu solicitud para responder las preguntas de manera consistente."
  },
  interview_done: {
    en: "The interview is complete. Decisions can take days to months. A quiet status after an interview is common while background checks complete.",
    es: "La entrevista está completa. Las decisiones pueden tomar días o meses. Un estatus quieto después de la entrevista es común mientras se completan las verificaciones de fondo."
  },
  approved: {
    en: "Your case has been approved. If a card is being produced, you'll receive it by mail. For naturalization, you'll be scheduled for an oath ceremony.",
    es: "Tu caso ha sido aprobado. Si se está produciendo una tarjeta, la recibirás por correo. Para naturalización, se programará una ceremonia de juramento."
  },
  denied: {
    en: "The case was denied. The notice explains the reason and your options, which may include an appeal, motion to reopen, or refiling. Consider consulting an attorney.",
    es: "El caso fue negado. El aviso explica el motivo y tus opciones, que pueden incluir una apelación, moción de reapertura, o volver a presentar. Considera consultar a un abogado."
  },
  oath: {
    en: "You're scheduled for the oath ceremony to complete naturalization. Bring the oath notice and any required documents. After the ceremony, you're a U.S. citizen.",
    es: "Estás programado para la ceremonia de juramento para completar la naturalización. Lleva el aviso del juramento y los documentos requeridos. Después de la ceremonia, eres ciudadano estadounidense."
  }
};

export function homeCompare(lang) {
  const es = lang === "es";
  return compareRows.map((row) => ({ title: es ? row[2] : row[0], body: es ? row[3] : row[1] }));
}

export function pricingText(lang, key) {
  const row = pricingCopy[key];
  if (!row) return key;
  return lang === "es" ? row[1] : row[0];
}

export function helpText(lang, key) {
  const row = helpCopy[key];
  if (!row) return key;
  return lang === "es" ? row[1] : row[0];
}

export function formSeoText(lang, key) {
  const row = formSeo[key];
  if (!row) return key;
  return lang === "es" ? row[1] : row[0];
}

export function statusDecoder(lang, stage) {
  const explanation = stageExplanations[stage];
  if (!explanation) return null;
  return {
    stage,
    explanation: lang === "es" ? explanation.es : explanation.en
  };
}

const interviewTipsData = {
  "i-485": [
    {
      en: { title: "Bring originals of everything you filed", body: "The officer will compare names, dates, and addresses. Bring your passport, birth certificate, marriage certificate, and supporting documents." },
      es: { title: "Lleva originales de todo lo que presentaste", body: "El oficial comparará nombres, fechas y direcciones. Lleva tu pasaporte, acta de nacimiento, acta de matrimonio y documentos de apoyo." }
    },
    {
      en: { title: "Answer truthfully and concisely", body: "Listen to the question, answer it directly, and stop. Don't volunteer extra information. If you don't understand, ask for clarification." },
      es: { title: "Responde con la verdad y de manera concisa", body: "Escucha la pregunta, respóndela directamente y detente. No ofrezcas información extra. Si no entiendes, pide aclaración." }
    },
    {
      en: { title: "Family-based: the petitioner usually comes too", body: "USCIS generally requires the I-130 petitioner to appear with the applicant at a family-based adjustment interview (USCIS Policy Manual, Vol. 7, Part A, Ch. 5). The officer checks that you understood the questions on your forms and lets you correct answers that were wrong or have changed." },
      es: { title: "Por familia: el peticionario suele asistir", body: "USCIS generalmente requiere que el peticionario del I-130 se presente con el solicitante en la entrevista de ajuste por familia (Manual de Políticas de USCIS, Vol. 7, Parte A, Cap. 5). El oficial verifica que entendiste las preguntas de tus formularios y te deja corregir respuestas equivocadas o que cambiaron." }
    },
    {
      en: { title: "Dress professionally", body: "Business casual is appropriate. You don't need a suit, but avoid very casual clothing. This shows respect for the process." },
      es: { title: "Vístete profesionalmente", body: "Ropa de negocios casual es apropiada. No necesitas traje, pero evita ropa muy casual. Esto muestra respeto por el proceso." }
    }
  ],
  "n-400": [
    {
      en: { title: "Study the civics test materials", body: "If you filed on or after Oct. 20, 2025, the officer asks up to 20 questions from the 128-question list, and you pass with 12 correct. If you filed before that date, it is up to 10 questions from the 100-question list, and 6 correct passes. USCIS publishes both lists." },
      es: { title: "Estudia los materiales del examen de civismo", body: "Si presentaste el 20 de octubre de 2025 o después, el oficial hace hasta 20 preguntas de la lista de 128 y apruebas con 12 correctas. Si presentaste antes, son hasta 10 de la lista de 100 y apruebas con 6. USCIS publica ambas listas." }
    },
    {
      en: { title: "Bring your green card and ID", body: "You'll need your green card, state ID or driver's license, and any travel documents. Bring your passport if you have one." },
      es: { title: "Lleva tu tarjeta verde e identificación", body: "Necesitarás tu tarjeta verde, identificación estatal o licencia, y documentos de viaje. Lleva tu pasaporte si tienes uno." }
    },
    {
      en: { title: "Know your application", body: "Review your N-400 before the interview. Be ready to explain any trips abroad, address history, and answer questions about arrests or tax issues." },
      es: { title: "Conoce tu solicitud", body: "Revisa tu N-400 antes de la entrevista. Prepárate para explicar viajes al extranjero, historial de direcciones, y responder preguntas sobre arrestos o impuestos." }
    },
    {
      en: { title: "English reading and writing test", body: "You'll read a sentence aloud and write a sentence dictated by the officer. Practice with the USCIS reading and writing vocabulary." },
      es: { title: "Examen de lectura y escritura en inglés", body: "Leerás una oración en voz alta y escribirás una oración dictada por el oficial. Practica con el vocabulario de USCIS." }
    }
  ],
  "i-130": [
    {
      en: { title: "Prove the relationship is real", body: "Bring joint financial records, photos over time, lease agreements, and affidavits from people who know your relationship." },
      es: { title: "Prueba que la relación es real", body: "Lleva registros financieros conjuntos, fotos a lo largo del tiempo, contratos de arrendamiento, y declaraciones juradas de personas que conocen su relación." }
    },
    {
      en: { title: "Know the details of your relationship", body: "When did you meet? How did you get engaged? What are your daily routines? Be ready to answer these naturally." },
      es: { title: "Conoce los detalles de tu relación", body: "¿Cuándo se conocieron? ¿Cómo se comprometieron? ¿Cuáles son sus rutinas diarias? Prepárate para responder naturalmente." }
    },
    {
      en: { title: "If previously married, bring divorce decrees", body: "You need to prove all prior marriages ended legally before the current marriage." },
      es: { title: "Si estuvieron casados antes, lleven decretos de divorcio", body: "Necesitan probar que todos los matrimonios anteriores terminaron legalmente antes del matrimonio actual." }
    }
  ],
  default: [
    {
      en: { title: "Arrive early", body: "Plan to arrive 15-30 minutes before your appointment. Check in at the window and wait to be called." },
      es: { title: "Llega temprano", body: "Planea llegar 15-30 minutos antes de tu cita. Regístrate en la ventana y espera a que te llamen." }
    },
    {
      en: { title: "Bring original documents", body: "Have originals of everything you submitted, plus any additional evidence. Keep copies for yourself." },
      es: { title: "Lleva documentos originales", body: "Ten originales de todo lo que presentaste, más cualquier evidencia adicional. Guarda copias para ti." }
    },
    {
      en: { title: "Answer only what is asked", body: "Listen carefully, answer truthfully, and don't elaborate unnecessarily. If you don't know, say so." },
      es: { title: "Responde solo lo que te preguntan", body: "Escucha con cuidado, responde con la verdad, y no elabores innecesariamente. Si no sabes, dilo." }
    }
  ]
};

export function interviewTips(lang, spaceId) {
  const tips = interviewTipsData[spaceId] || interviewTipsData.default;
  return tips.map(tip => ({
    title: lang === "es" ? tip.es.title : tip.en.title,
    body: lang === "es" ? tip.es.body : tip.en.body
  }));
}
