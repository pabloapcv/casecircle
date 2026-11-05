const launchIds = ["n-400", "i-751", "i-485", "i-130", "i-765", "i-131"];

export const categories = [
  ["citizenship", "Citizenship", "Ciudadanía"],
  ["family", "Family green card", "Residencia familiar"],
  ["greencard", "Green card", "Tarjeta de residencia"],
  ["employment", "Employment", "Empleo"],
  ["worktravel", "Work and travel", "Trabajo y viaje"],
  ["nonimmigrant", "Nonimmigrant status", "Estatus de no inmigrante"],
  ["humanitarian", "Humanitarian", "Humanitario"],
  ["waivers", "Waivers", "Perdones"],
  ["adoption", "Adoption", "Adopción"],
  ["cross", "Cross-cutting", "Temas generales"]
].map(([id, en, es]) => ({ id, en, es }));

export const spaces = [
  space("n-400", "citizenship", "Naturalization", "Naturalización", ["N-400", "N-648", "N-336", "N-470"], "Citizenship interviews, civics, and oath timelines.", "Entrevistas de ciudadanía, civismo y juramento."),
  space("n-600", "citizenship", "Certificate of citizenship", "Certificado de ciudadanía", ["N-600", "N-600K", "N-565"], "Certificates and replacements.", "Certificados y reposiciones."),
  space("i-130", "family", "Petition for a relative", "Petición de familiar", ["I-130", "I-130A"], "Petitions for a spouse, parent, child, or sibling.", "Peticiones para esposo, padre, hijo o hermano."),
  space("i-129f", "family", "Fiancé(e) visa", "Visa de prometido(a)", ["I-129F"], "K-1 fiancé petitions.", "Peticiones K-1 de prometidos."),
  space("widow", "family", "Widow(er) and special immigrant", "Viudo(a) e inmigrante especial", ["I-360"], "Widow(er) petitions on form I-360.", "Peticiones de viudo(a) con el I-360."),
  space("i-485", "greencard", "Adjustment of status", "Ajuste de estatus", ["I-485", "I-693", "I-864"], "Adjustment of status inside the United States.", "Ajuste de estatus dentro de Estados Unidos."),
  space("i-751", "greencard", "Removal of conditions", "Remoción de condiciones", ["I-751"], "Removal of conditions after a marriage green card.", "Quitar las condiciones de una residencia por matrimonio."),
  space("i-90", "greencard", "Renewal and replacement", "Renovación y reemplazo", ["I-90"], "Renewing or replacing a green card.", "Renovar o reponer la tarjeta de residencia."),
  space("returning-resident", "greencard", "Returning resident", "Residente que regresa", ["I-131", "I-407"], "Reentry permits and abandonment questions.", "Permisos de reingreso y abandono de residencia."),
  space("i-140", "employment", "Immigrant worker petition", "Petición de trabajador inmigrante", ["I-140"], "EB-1, EB-2, EB-3, and national interest waiver petitions.", "Peticiones EB-1, EB-2, EB-3 y de interés nacional."),
  space("i-129", "employment", "Nonimmigrant worker", "Trabajador no inmigrante", ["I-129"], "H-1B, L-1, O-1, and similar petitions.", "Peticiones H-1B, L-1, O-1 y parecidas."),
  space("i-526", "employment", "Investor", "Inversionista", ["I-526", "I-526E", "I-829"], "EB-5 investor petitions and removal of conditions.", "Peticiones de inversionista EB-5."),
  space("i-765", "worktravel", "Work permit", "Permiso de trabajo", ["I-765"], "Employment authorization, including cards filed with adjustment.", "Permisos de trabajo, incluso con un ajuste pendiente."),
  space("i-131", "worktravel", "Advance parole and travel", "Permiso de viaje", ["I-131"], "Advance parole, combo cards, and travel documents.", "Advance parole, tarjeta combo y documentos de viaje."),
  space("i-539", "nonimmigrant", "Extend or change status", "Extender o cambiar estatus", ["I-539"], "Extensions and changes of nonimmigrant status.", "Extensiones y cambios de estatus."),
  space("i-589", "humanitarian", "Asylum", "Asilo", ["I-589"], "Affirmative asylum filings.", "Solicitudes afirmativas de asilo."),
  space("i-730", "humanitarian", "Refugee or asylee relative", "Familiar de refugiado o asilado", ["I-730"], "Follow-to-join petitions for relatives.", "Peticiones de familiares que se unen después."),
  space("i-821", "humanitarian", "TPS", "TPS", ["I-821"], "Temporary Protected Status.", "Estatus de protección temporal."),
  space("i-821d", "humanitarian", "DACA", "DACA", ["I-821D"], "Deferred Action for Childhood Arrivals.", "Acción diferida para llegados en la infancia."),
  space("u-t-vawa", "humanitarian", "U visa, T visa, and VAWA", "Visa U, visa T y VAWA", ["I-918", "I-914", "I-360"], "Humanitarian visas and VAWA self-petitions.", "Visas humanitarias y autopeticiones VAWA."),
  space("i-601", "waivers", "Inadmissibility waivers", "Perdones de inadmisibilidad", ["I-601", "I-601A", "I-212"], "Waiver filings and experiences.", "Perdones y experiencias de presentación."),
  space("adoption", "adoption", "Intercountry adoption", "Adopción internacional", ["I-600", "I-600A", "I-800", "I-800A"], "Hague and non-Hague adoption filings.", "Adopciones del Convenio de La Haya y las demás."),
  space("fees-and-tools", "cross", "Fees, biometrics, and records", "Tarifas, biometría y registros", ["I-912", "G-639", "I-907"], "Fee waivers, FOIA, biometrics, and premium processing.", "Exención de tarifas, FOIA, biometría y procesamiento premium."),
  space("consular", "cross", "Consular stage", "Etapa consular", ["DS-260"], "National Visa Center and embassy steps after a petition.", "Centro Nacional de Visas y la embajada, después de la petición.")
];

export const offices = [
  office("vsc", "service", "VSC", "Vermont Service Center", "Centro de Servicio de Vermont"),
  office("csc", "service", "CSC", "California Service Center", "Centro de Servicio de California"),
  office("nsc", "service", "NSC", "Nebraska Service Center", "Centro de Servicio de Nebraska"),
  office("tsc", "service", "TSC", "Texas Service Center", "Centro de Servicio de Texas"),
  office("psc", "service", "PSC", "Potomac Service Center", "Centro de Servicio de Potomac"),
  office("nbc", "nbc", "NBC", "National Benefits Center", "Centro Nacional de Beneficios"),
  office("nyc", "field", "NYC", "New York, NY", "Nueva York, NY"),
  office("los-angeles", "field", "LAX", "Los Angeles, CA", "Los Ángeles, CA"),
  office("miami", "field", "MIA", "Miami, FL", "Miami, FL"),
  office("chicago", "field", "CHI", "Chicago, IL", "Chicago, IL"),
  office("houston", "field", "HOU", "Houston, TX", "Houston, TX"),
  office("boston", "field", "BOS", "Boston, MA", "Boston, MA"),
  office("seattle", "field", "SEA", "Seattle, WA", "Seattle, WA"),
  office("atlanta", "field", "ATL", "Atlanta, GA", "Atlanta, GA"),
  office("dallas", "field", "DAL", "Dallas, TX", "Dallas, TX"),
  office("unsure", "unsure", "", "Not sure yet", "Aún no lo sé")
];

export const stages = ["filed", "biometrics", "rfe", "interview_scheduled", "interview_done", "approved", "denied", "oath"];
export const kinds = ["question", "timeline", "interview", "tip", "vent"];
export const basedOn = ["marriage", "parent", "child", "sibling", "employment", "asylum", "refugee", "diversity", "fiance", "other"];

const strings = {
  appName: ["CaseCircle", "CaseCircle"],
  notAffiliated: ["Not affiliated with USCIS", "Sin afiliación con USCIS"],
  pitch: ["Post a question or an experience about a USCIS case.", "Publica una pregunta o una experiencia sobre un caso de USCIS."],
  welcomeTitle: ["A community to share and discuss USCIS cases and processes.", "Una comunidad para compartir y hablar de casos y procesos de USCIS."],
  whatPosting: ["What are you posting?", "¿Qué vas a publicar?"],
  disclaimer: ["Community experiences, not legal advice. CaseCircle is not affiliated with USCIS.", "Experiencias de la comunidad, no asesoría legal. CaseCircle no está afiliado a USCIS."],
  localNote: ["This website keeps your account and your folder checklist in this browser. It does not publish your posts to other people, and it does not send the folder to a server.", "Este sitio guarda tu cuenta y la lista de tu carpeta en este navegador. No publica tus mensajes para otras personas y no envía la carpeta a un servidor."],
  emailHelp: ["The address stays in this browser. This site does not send email.", "La dirección se queda en este navegador. Este sitio no envía correo."],
  continueEmail: ["Continue with email", "Continuar con correo"],
  useEmail: ["Use this email", "Usar este correo"],
  reviewerDemo: ["App Review demo", "Demo de revisión"],
  reviewerDemoHelp: ["Opens a moderator account on the launch communities.", "Abre una cuenta de moderación en las comunidades de inicio."],
  contact: ["Contact support@casecircle.app", "Contacto support@casecircle.app"],
  usernameTitle: ["Choose a public name", "Elige un nombre público"],
  usernameHelp: ["Other people see this name. It is not your legal name.", "Las demás personas ven este nombre. No es tu nombre legal."],
  spacesTitle: ["Which communities do you want?", "¿Qué comunidades quieres?"],
  spacesHint: ["Pick the forms you want on your home feed. You can add more later.", "Elige los formularios que quieres en tu inicio. Puedes agregar más después."],
  rulesTitle: ["Before you post", "Antes de publicar"],
  rulesBody: ["Be kind. Do not post receipt numbers, A-numbers, Social Security numbers, passport numbers, addresses, or photos of notices. CaseCircle is not a law firm and not part of USCIS.", "Sé amable. No publiques números de recibo, números A, números de Seguro Social, pasaportes, direcciones ni fotos de avisos. CaseCircle no es un bufete y no es parte de USCIS."],
  agreeRules: ["I will follow the community rules", "Seguiré las reglas de la comunidad"],
  agreeNotAdvice: ["I understand this is not legal advice and not a government service", "Entiendo que esto no es asesoría legal ni un servicio del gobierno"],
  acceptBoth: ["Accept both to continue.", "Acepta las dos para continuar."],
  profileTitle: ["Add a case profile", "Agrega un perfil de caso"],
  profileHelp: ["Only the form, office, filing month, and stage show on your posts. No receipt number.", "En tus publicaciones solo se ve el formulario, la oficina, el mes y la etapa. Sin número de recibo."],
  saveProfile: ["Save profile", "Guardar perfil"],
  skip: ["Skip for now", "Omitir por ahora"],
  chooseStage: ["Choose a current stage, then save.", "Elige la etapa actual y luego guarda."],
  next: ["Next", "Siguiente"],
  back: ["Back", "Atrás"],
  home: ["Home", "Inicio"],
  spaces: ["Spaces", "Espacios"],
  ask: ["Ask", "Preguntar"],
  timelines: ["Timelines", "Tiempos"],
  you: ["You", "Tú"],
  new: ["New", "Nuevo"],
  top: ["Top", "Destacado"],
  unanswered: ["Unanswered", "Sin respuesta"],
  allPosts: ["All posts", "Todas"],
  sample: ["Sample", "Ejemplo"],
  sampleNote: ["Posts marked Sample come with the site. They are not from other people.", "Las publicaciones marcadas Ejemplo vienen con el sitio. No son de otras personas."],
  dismiss: ["Dismiss", "Ocultar"],
  replies: ["replies", "respuestas"],
  noReplies: ["No replies yet", "Todavía no hay respuestas"],
  writeReply: ["Write a reply", "Escribe una respuesta"],
  reply: ["Reply", "Responder"],
  send: ["Send", "Enviar"],
  save: ["Save", "Guardar"],
  saved: ["Saved", "Guardado"],
  share: ["Share", "Compartir"],
  report: ["Report", "Reportar"],
  block: ["Block", "Bloquear"],
  helpful: ["Helpful", "Útil"],
  commentNote: ["Answers are other people's experiences. They are not legal advice and they are not from USCIS.", "Las respuestas son experiencias de otras personas. No son asesoría legal y no vienen de USCIS."],
  commentPlaceholder: ["Your experience, not legal advice", "Tu experiencia, no asesoría legal"],
  held: ["Held for review", "En revisión"],
  removed: ["Removed", "Eliminada"],
  posted: ["Posted", "Publicado"],
  blockedText: ["That text can't be posted.", "Ese texto no se puede publicar."],
  heldToast: ["Held for a moderator to review.", "Quedó en revisión para un moderador."],
  tooShort: ["Add a little more detail.", "Agrega un poco más de detalle."],
  startHere: ["Start here", "Empieza aquí"],
  active: ["Active", "Activo"],
  newSpace: ["New", "Nuevo"],
  members: ["members", "miembros"],
  join: ["Join space", "Unirme"],
  leave: ["Leave space", "Salir"],
  askHere: ["Ask in this space", "Preguntar aquí"],
  yourCases: ["Your cases", "Tus casos"],
  addCase: ["Add a case", "Agregar un caso"],
  notEnough: ["Not enough shared timelines yet", "Aún no hay suficientes tiempos compartidos"],
  notEnoughBody: ["A benchmark appears after 20 people at the same office report a stage change. Smaller groups stay hidden.", "Un punto de referencia aparece cuando 20 personas en la misma oficina reportan un cambio de etapa. Los grupos más pequeños quedan ocultos."],
  exampleTitle: ["Example benchmarks", "Puntos de referencia de ejemplo"],
  exampleBody: ["These figures are sample data so you can see the layout. They are not real waits and they are not USCIS processing times.", "Estas cifras son datos de ejemplo para ver el diseño. No son esperas reales y no son tiempos de procesamiento de USCIS."],
  people: ["people", "personas"],
  days: ["days", "días"],
  official: ["USCIS processing times", "Tiempos de procesamiento de USCIS"],
  officialNote: ["Opens the government page. CaseCircle is not affiliated with USCIS.", "Abre la página del gobierno. CaseCircle no está afiliado a USCIS."],
  caseProfiles: ["Case profiles", "Perfiles de caso"],
  yourPosts: ["Your posts", "Tus publicaciones"],
  bookmarks: ["Saved", "Guardados"],
  yourSpaces: ["Your spaces", "Tus espacios"],
  settings: ["Settings", "Ajustes"],
  language: ["Language", "Idioma"],
  english: ["English", "Inglés"],
  spanish: ["Spanish", "Español"],
  deleteAccount: ["Delete account", "Eliminar cuenta"],
  deleteHelp: ["Your name becomes Deleted member. This only affects this browser.", "Tu nombre pasa a ser Miembro eliminado. Esto solo afecta este navegador."],
  deletedMember: ["Deleted member", "Miembro eliminado"],
  about: ["About", "Acerca de"],
  privacy: ["Privacy", "Privacidad"],
  rules: ["Community rules", "Reglas"],
  modQueue: ["Review queue", "Cola de revisión"],
  reviewerNotes: ["Notes for App Review", "Notas para App Review"],
  reviewerBody: ["This demo account is a moderator. There is no server. Posts people write stay in this browser.", "Esta cuenta de demostración es moderadora. No hay servidor. Lo que la gente escribe se queda en este navegador."],
  restore: ["Restore", "Restaurar"],
  remove: ["Remove", "Quitar"],
  dismissReports: ["Dismiss reports", "Descartar reportes"],
  title: ["Title", "Título"],
  body: ["What happened", "Qué pasó"],
  publish: ["Publish", "Publicar"],
  postAnyway: ["Post anyway", "Publicar de todos modos"],
  similar: ["Similar threads", "Hilos parecidos"],
  search: ["Search", "Buscar"],
  searchPrompt: ["Search posts", "Buscar publicaciones"],
  form: ["Form", "Formulario"],
  based: ["Based on", "Basado en"],
  month: ["Filing month", "Mes de presentación"],
  year: ["Year", "Año"],
  office: ["Office", "Oficina"],
  method: ["How you filed", "Cómo presentaste"],
  stage: ["Current stage", "Etapa actual"],
  choose: ["Choose", "Elegir"],
  online: ["Online", "En línea"],
  paper: ["Paper", "En papel"],
  filedWord: ["filed", "presentado"],
  aboutBody: ["CaseCircle helps you organize a filing folder and compare notes while you wait. The guide does not fill out government forms, does not file them, and does not predict an approval. It is not a law firm and not part of USCIS or any government agency. This website stores data in your browser only.", "CaseCircle te ayuda a organizar una carpeta de presentación y a comparar notas mientras esperas. La guía no llena formularios del gobierno, no los presenta y no predice una aprobación. No es un bufete y no es parte de USCIS ni de ninguna agencia. Este sitio guarda los datos solo en tu navegador."],
  privacyBody: ["Your username, email, posts, case profile, and folder checklist stay in this browser. There is no CaseCircle server to receive them. Deleting your account replaces your name with Deleted member and removes the folder checklist from this browser.", "Tu nombre de usuario, correo, publicaciones, perfil de caso y lista de la carpeta se quedan en este navegador. No hay un servidor de CaseCircle que los reciba. Eliminar la cuenta reemplaza tu nombre por Miembro eliminado y borra la lista de la carpeta de este navegador."],
  emptySaved: ["Save a post to find it later.", "Guarda una publicación para encontrarla después."],
  noPosts: ["You have not posted yet.", "Todavía no has publicado."],
  pinned: ["Pinned", "Fijada"],
  openReports: ["open reports", "reportes abiertos"],
  couldNot: ["That could not be saved.", "No se pudo guardar."],
  slowDown: ["Wait a moment before doing that again.", "Espera un momento antes de volver a hacerlo."],
  taken: ["That name is taken.", "Ese nombre ya existe."],
  reserved: ["Choose a different name.", "Elige otro nombre."],
  invalidName: ["Use 3 to 20 letters, numbers, or underscores.", "Usa de 3 a 20 letras, números o guiones bajos."],
  emailInvalid: ["Enter an email address.", "Escribe un correo."],
  picked: ["selected", "seleccionados"],
  cancel: ["Cancel", "Cancelar"],
  reportThanks: ["Report received.", "Reporte recibido."],
  alreadyReported: ["You already reported this.", "Ya reportaste esto."],
  blockedToast: ["Blocked.", "Bloqueado."],
  stageRequired: ["Choose the stage this update is about.", "Elige la etapa de esta actualización."],
  crossPost: ["Also show in", "Mostrar también en"],
  sinceFiling: ["since filing", "desde la presentación"],
  months: ["months", "meses"],
  reputation: ["Reputation", "Reputación"],
  signOut: ["Use a different account", "Usar otra cuenta"]
};

const kindCopy = {
  question: ["Question", "Pregunta", "Ask people who have been through this step.", "Pregunta a personas que ya pasaron por este paso."],
  timeline: ["Timeline", "Tiempo", "Share a stage change. It can update your case profile.", "Comparte un cambio de etapa. Puede actualizar tu perfil."],
  interview: ["Interview", "Entrevista", "Describe one interview you already had.", "Describe una entrevista que ya tuviste."],
  tip: ["Tip", "Consejo", "A practical note other people can reuse.", "Una nota práctica que otras personas pueden reutilizar."],
  vent: ["Vent", "Desahogo", "The wait is hard. Be kind, and still skip identifiers.", "La espera es difícil. Sé amable, y no incluyas identificadores."]
};

const stageCopy = {
  filed: ["Filed", "Presentado"],
  biometrics: ["Biometrics", "Biometría"],
  rfe: ["Request for evidence", "Pedido de evidencia"],
  interview_scheduled: ["Interview scheduled", "Entrevista programada"],
  interview_done: ["Interview done", "Entrevista hecha"],
  approved: ["Approved", "Aprobado"],
  denied: ["Denied", "Negado"],
  oath: ["Oath", "Juramento"]
};

const basedCopy = {
  marriage: ["Marriage", "Matrimonio"],
  parent: ["Parent", "Padre o madre"],
  child: ["Child", "Hijo o hija"],
  sibling: ["Sibling", "Hermano o hermana"],
  employment: ["Employment", "Empleo"],
  asylum: ["Asylum", "Asilo"],
  refugee: ["Refugee", "Refugiado"],
  diversity: ["Diversity visa", "Visa de diversidad"],
  fiance: ["Fiancé(e)", "Prometido(a)"],
  other: ["Other", "Otro"]
};

const levelCopy = {
  newcomer: ["Newcomer", "Recién llegado"],
  neighbor: ["Neighbor", "Vecino"],
  guide: ["Guide", "Guía"],
  helper: ["Helper", "Ayuda"],
  mentor: ["Mentor", "Mentor"]
};

export function t(lang, key) {
  const pair = strings[key];
  if (!pair) return key;
  return lang === "es" ? pair[1] : pair[0];
}

export function kindLabel(lang, kind) {
  const row = kindCopy[kind];
  return row ? (lang === "es" ? row[1] : row[0]) : kind;
}

export function kindHelp(lang, kind) {
  const row = kindCopy[kind];
  return row ? (lang === "es" ? row[3] : row[2]) : "";
}

export function stageLabel(lang, stage) {
  const row = stageCopy[stage];
  return row ? (lang === "es" ? row[1] : row[0]) : stage;
}

export function basedLabel(lang, value) {
  const row = basedCopy[value];
  return row ? (lang === "es" ? row[1] : row[0]) : value;
}

export function levelName(lang, reputation) {
  const key = reputation < 20 ? "newcomer" : reputation < 50 ? "neighbor" : reputation < 100 ? "guide" : reputation < 250 ? "helper" : "mentor";
  const row = levelCopy[key];
  return lang === "es" ? row[1] : row[0];
}

export function spaceById(id) {
  return spaces.find((item) => item.id === id);
}

export function officeById(id) {
  return offices.find((item) => item.id === id);
}

export function spaceName(lang, id) {
  const item = spaceById(id);
  if (!item) return id;
  return lang === "es" ? item.es : item.en;
}

export function officeName(lang, id) {
  const item = officeById(id);
  if (!item) return "";
  return lang === "es" ? item.es : item.en;
}

const scamPhrases = [
  "pay to expedite", "pay me to expedite", "expedite fee", "gift card", "whatsapp me",
  "message me on whatsapp", "text me on whatsapp", "wa.me", "notario", "guaranteed approval",
  "western union", "moneygram", "zelle me", "cash app me", "venmo me", "wire transfer",
  "i prepare forms for", "we prepare your forms for", "form preparation for $", "dm me for a fee",
  "send bitcoin", "crypto payment"
];

const abusiveWords = [
  "fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "asshole", "cunt", "nigger", "nigga",
  "faggot", "retard", "slut", "whore", "puta", "puto", "mierda", "cabron", "maricon", "pendejo",
  "gilipollas", "kys"
];

export function evaluate(text) {
  const raw = String(text ?? "");
  const folded = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b[a-z]{3}(?:[-\s]*\d){10}\b/i.test(raw) || /\b[a-z]{3}(?:[-\s]*\d){10}\b/i.test(folded)) return { verdict: "block", reason: "receipt" };
  if (/\b(?:a[-\s]?number|alien\s+number|a#)\b[-\s:]*\d{7,9}\b/i.test(raw) || /\bA[-\s]?\d{8,9}\b/.test(raw)) return { verdict: "block", reason: "a-number" };
  if (/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/.test(raw) || /\b(?:ssn|social\s+security)\b(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*\d{3}-?\d{2}-?\d{4}\b/i.test(raw)) return { verdict: "block", reason: "ssn" };
  if (/\b(?:passport|pasaporte)\b(?:\s*(?:number|no\.?|num(?:ero)?|#))?\s*[:#-]?\s*(?=[a-z0-9]*\d)[a-z0-9]{6,12}\b/i.test(raw)) return { verdict: "block", reason: "passport" };
  if (folded.includes("kill yourself")) return { verdict: "block", reason: "abuse" };
  for (const word of abusiveWords) {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(folded)) return { verdict: "block", reason: "abuse" };
  }
  if (scamPhrases.some((phrase) => folded.includes(phrase))) return { verdict: "hold", reason: "scam" };
  return { verdict: "allow" };
}

export const RATE_WINDOWS = { post: 30_000, comment: 8_000, vote: 800 };

export function rateLimited(user, kind, now = Date.now()) {
  if (!user) return true;
  const windowMs = RATE_WINDOWS[kind];
  if (!windowMs) return false;
  const last = user.rate?.[kind] || 0;
  return now - last < windowMs;
}

export function markRate(user, kind, now = Date.now()) {
  if (!user) return;
  user.rate = user.rate || {};
  user.rate[kind] = now;
}

export function waitComparison(state, profile) {
  const mine = monthsSince(profile?.filed);
  const waits = (state.members || [])
    .filter((person) => !person.sample)
    .flatMap((person) => person.profiles || [])
    .filter((item) => item.spaceId === profile.spaceId && item.filed && (profile.officeId === "unsure" || !profile.officeId || item.officeId === profile.officeId))
    .map((item) => monthsSince(item.filed))
    .sort((a, b) => a - b);
  const publishable = waits.length >= 20;
  const below = waits.filter((value) => value < mine).length;
  return {
    count: waits.length,
    mine,
    percentile: publishable ? Math.round((below / waits.length) * 100) : null,
    publishable
  };
}

const reserved = new Set(["uscis", "dhs", "ice", "cbp", "official", "admin", "moderator", "notario", "casecircle", "support", "deleted", "apple", "google"]);

export function usernameIssue(raw, taken) {
  const name = String(raw ?? "").trim();
  if (name.length < 3 || name.length > 20) return "invalid";
  if (![...name].every((char) => /[A-Za-z0-9_]/.test(char))) return "invalid";
  const lower = name.toLowerCase();
  const parts = lower.split("_");
  if (reserved.has(lower) || parts.some((part) => reserved.has(part))) return "reserved";
  if (taken.has(lower)) return "taken";
  return null;
}

export function emailOk(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  const parts = value.split("@");
  return parts.length === 2 && parts[0].length >= 1 && parts[1].includes(".") && !value.includes(" ") && value.length <= 80;
}

function space(id, categoryId, en, es, forms, blurbEn, blurbEs) {
  return { id, categoryId, en, es, forms, blurbEn, blurbEs, launch: launchIds.includes(id) };
}

function office(id, type, code, en, es) {
  return { id, type, code, en, es };
}

function monthStart(date) {
  const value = new Date(date);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)).toISOString();
}

function addDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

function monthsAgo(count) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count, 1)).toISOString();
}

export function initialState(lang = "en") {
  return { seq: 1, lang, meId: null, members: [], posts: [], reports: [], route: { name: "home" } };
}

function next(db) {
  const id = `id${db.seq}`;
  db.seq += 1;
  return id;
}

export function member(state, id) {
  return state.members.find((item) => item.id === id) || null;
}

export function me(state) {
  return member(state, state.meId);
}

export function badge(lang, profile) {
  if (!profile) return "";
  const office = officeById(profile.officeId);
  const parts = [profile.form];
  if (office && office.code) parts.push(office.code);
  if (profile.filed) parts.push(`${t(lang, "filedWord")} ${monthLabel(lang, profile.filed)}`);
  if (profile.stage) parts.push(stageLabel(lang, profile.stage));
  return parts.join(" · ");
}

export function monthLabel(lang, iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(lang === "es" ? "es" : "en", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function ago(lang, iso) {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 1) return lang === "es" ? "hoy" : "today";
  if (days < 30) return lang === "es" ? `hace ${days} d` : `${days}d ago`;
  const months = Math.round(days / 30);
  return lang === "es" ? `hace ${months} mes` : `${months}mo ago`;
}

export function monthsSince(iso) {
  const date = new Date(iso);
  const now = new Date();
  return Math.max(0, (now.getUTCFullYear() - date.getUTCFullYear()) * 12 + (now.getUTCMonth() - date.getUTCMonth()));
}

const pairs = [
  ["filed", "biometrics"],
  ["biometrics", "rfe"],
  ["biometrics", "interview_scheduled"],
  ["interview_scheduled", "interview_done"],
  ["interview_done", "approved"],
  ["filed", "approved"],
  ["approved", "oath"],
  ["filed", "oath"]
];

export function benchmarkCells(state, includeSample) {
  const profiles = state.members.flatMap((person) => person.profiles.map((profile) => ({ ...profile, sample: person.sample || profile.sample })));
  const source = profiles.filter((profile) => includeSample || !profile.sample);
  const buckets = new Map();
  for (const profile of source) {
    for (const [from, to] of pairs) {
      if (!profile.dates?.[from] || !profile.dates?.[to]) continue;
      const days = Math.round((new Date(profile.dates[to]) - new Date(profile.dates[from])) / 86400000);
      if (days < 0) continue;
      const key = `${profile.spaceId}|${profile.officeId}|${from}|${to}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(days);
    }
  }
  return [...buckets.entries()].map(([key, days]) => {
    const [spaceId, officeId, fromStage, toStage] = key.split("|");
    const sorted = [...days].sort((a, b) => a - b);
    return {
      id: key,
      spaceId,
      officeId,
      fromStage,
      toStage,
      count: sorted.length,
      publishable: sorted.length >= 20,
      median: percentile(sorted, 0.5),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75)
    };
  }).filter((cell) => cell.publishable);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.round((sorted.length - 1) * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function visiblePosts(state, { spaceId = null, sort = "new", kind = "", stage = "", officeId = "", query = "" } = {}) {
  const user = me(state);
  const blocked = new Set();
  if (user) {
    for (const id of user.blocks) blocked.add(id);
    for (const other of state.members) {
      if (other.blocks.includes(user.id)) blocked.add(other.id);
    }
  }
  let posts = state.posts.filter((post) => post.status === "live" && !blocked.has(post.authorId));
  if (spaceId) posts = posts.filter((post) => post.spaceIds.includes(spaceId));
  else if (user) {
    const joined = new Set(user.spaces);
    posts = posts.filter((post) => post.spaceIds.some((id) => joined.has(id)));
  } else posts = [];
  if (kind) posts = posts.filter((post) => post.type === kind);
  if (stage) posts = posts.filter((post) => post.stage === stage);
  if (officeId) posts = posts.filter((post) => post.officeId === officeId);
  if (query) {
    const folded = query.toLowerCase();
    posts = posts.filter((post) => `${post.title} ${post.body}`.toLowerCase().includes(folded));
  }
  if (sort === "unanswered") posts = posts.filter((post) => post.type === "question" && post.comments.filter((comment) => comment.status === "live").length === 0);
  if (sort === "top") {
    const cutoff = Date.now() - 7 * 86400000;
    posts = posts.filter((post) => new Date(post.createdAt).getTime() >= cutoff);
    posts.sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    posts.sort((a, b) => Number(b.faq) - Number(a.faq) || new Date(b.createdAt) - new Date(a.createdAt));
  }
  return posts;
}

export function similarThreads(state, title, body, spaceId) {
  const tokens = new Set(`${title} ${body}`.toLowerCase().split(/[^a-z0-9áéíóúñ]+/i).filter((token) => token.length > 3));
  return state.posts
    .filter((post) => post.status === "live" && post.type === "question" && post.spaceIds.includes(spaceId))
    .map((post) => {
      const words = `${post.title} ${post.body}`.toLowerCase().split(/[^a-z0-9áéíóúñ]+/i);
      const score = words.filter((word) => tokens.has(word)).length;
      return { post, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.post);
}

export function createAccount(state, input) {
  const nextState = clone(state);
  const taken = new Set(nextState.members.map((person) => person.username.toLowerCase()));
  const issue = usernameIssue(input.username, taken);
  if (issue) return { ok: false, error: issue, state };
  if (input.email && !emailOk(input.email)) return { ok: false, error: "email", state };
  const user = {
    id: next(nextState),
    username: input.username.trim(),
    locale: input.locale || nextState.lang,
    reputation: 0,
    role: "member",
    sample: false,
    email: (input.email || "").trim().toLowerCase(),
    spaces: [...new Set(input.spaceIds || [])],
    profiles: [],
    votes: {},
    bookmarks: [],
    blocks: [],
    notes: [{ id: next(nextState), title: nextState.lang === "es" ? "Bienvenida" : "Welcome", body: t(nextState.lang, "localNote"), createdAt: new Date().toISOString() }],
    completed: []
  };
  nextState.members.push(user);
  nextState.meId = user.id;
  nextState.lang = user.locale;
  if (input.profile && input.profile.stage) {
    const saved = saveProfile(nextState, input.profile);
    if (!saved.ok) return saved;
    return saved;
  }
  nextState.route = { name: "home" };
  return { ok: true, state: nextState };
}

export function enterDemo(state) {
  const nextState = clone(state);
  let demo = nextState.members.find((person) => person.username === "app_review");
  if (!demo) {
    const filed = monthsAgo(14);
    demo = {
      id: next(nextState),
      username: "app_review",
      locale: nextState.lang,
      reputation: 0,
      role: "mod",
      sample: false,
      email: "",
      spaces: [...launchIds],
      profiles: [{
        id: next(nextState),
        spaceId: "i-751",
        form: "I-751",
        basedOn: "marriage",
        filed,
        officeId: "vsc",
        method: "paper",
        stage: "biometrics",
        dates: { filed, biometrics: addDays(filed, 40) },
        sample: false
      }],
      votes: {},
      bookmarks: [],
      blocks: [],
      notes: [{ id: next(nextState), title: "Welcome", body: t(nextState.lang, "reviewerBody"), createdAt: new Date().toISOString() }],
      completed: []
    };
    nextState.members.push(demo);
  }
  demo.role = "mod";
  demo.locale = nextState.lang;
  nextState.meId = demo.id;
  nextState.route = { name: "home" };
  return { ok: true, state: nextState };
}

export function saveProfile(state, profile) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user) return { ok: false, error: "auth", state };
  if (!profile.stage || !profile.form) return { ok: false, error: "stage", state: nextState };
  const filed = monthStart(profile.filed || new Date().toISOString());
  const dates = { ...(profile.dates || {}), filed };
  if (!dates[profile.stage]) dates[profile.stage] = monthStart(new Date().toISOString());
  const existing = user.profiles.find((item) => item.spaceId === profile.spaceId);
  if (existing) {
    Object.assign(existing, {
      form: profile.form,
      basedOn: profile.basedOn || "other",
      filed,
      officeId: profile.officeId || "unsure",
      method: profile.method || "online",
      stage: profile.stage,
      dates,
      sample: false
    });
  } else {
    user.profiles.push({
      id: next(nextState),
      spaceId: profile.spaceId,
      form: profile.form,
      basedOn: profile.basedOn || "other",
      filed,
      officeId: profile.officeId || "unsure",
      method: profile.method || "online",
      stage: profile.stage,
      dates,
      sample: false
    });
  }
  if (!user.spaces.includes(profile.spaceId)) user.spaces.push(profile.spaceId);
  const done = profile.completed && (profile.stage === "approved" || profile.stage === "oath");
  user.completed = user.completed.filter((id) => id !== profile.spaceId);
  if (done) user.completed.push(profile.spaceId);
  return { ok: true, state: nextState };
}

export function publish(state, draft) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user) return { ok: false, error: "auth", state };
  if (rateLimited(user, "post")) return { ok: false, error: "rate", state };
  const title = String(draft.title || "").trim();
  const body = String(draft.body || "").trim();
  const spaceIds = [...new Set(draft.spaceIds || [])].slice(0, 3);
  if (title.length < 8 || body.length < 20 || !spaceIds.length) return { ok: false, error: "short", state };
  if ((draft.type === "timeline" || draft.type === "interview") && !draft.stage) return { ok: false, error: "stage", state };
  const verdict = evaluate(`${title}\n${body}`);
  if (verdict.verdict === "block") return { ok: false, error: verdict.reason, state };
  const profile = user.profiles.find((item) => item.spaceId === spaceIds[0]);
  const post = {
    id: next(nextState),
    authorId: user.id,
    spaceIds,
    type: draft.type,
    title,
    body,
    stage: draft.stage || profile?.stage || "",
    officeId: draft.officeId || profile?.officeId || "",
    form: profile?.form || spaceById(spaceIds[0])?.forms[0] || "",
    filed: profile?.filed || null,
    status: verdict.verdict === "hold" ? "held" : "live",
    heldReason: verdict.verdict === "hold" ? "scam" : "",
    faq: false,
    createdAt: new Date().toISOString(),
    votes: 0,
    helpfulCommentId: null,
    comments: []
  };
  nextState.posts.unshift(post);
  markRate(user, "post");
  for (const spaceId of spaceIds) {
    if (!user.spaces.includes(spaceId)) user.spaces.push(spaceId);
  }
  if ((draft.type === "timeline" || draft.type === "interview") && post.stage) {
    const saved = saveProfile(nextState, {
      spaceId: spaceIds[0],
      form: post.form,
      basedOn: profile?.basedOn || "other",
      filed: profile?.filed || new Date().toISOString(),
      officeId: post.officeId || "unsure",
      method: profile?.method || "online",
      stage: post.stage,
      dates: profile?.dates || {},
      completed: user.completed.includes(spaceIds[0])
    });
    if (saved.ok) return { ok: true, state: saved.state, postId: post.id, held: post.status === "held" };
  }
  return { ok: true, state: nextState, postId: post.id, held: post.status === "held" };
}

export function addComment(state, postId, body) {
  const nextState = clone(state);
  const user = me(nextState);
  const post = nextState.posts.find((item) => item.id === postId);
  const text = String(body || "").trim();
  if (!user || !post) return { ok: false, error: "auth", state };
  if (rateLimited(user, "comment")) return { ok: false, error: "rate", state };
  if (text.length < 8) return { ok: false, error: "short", state };
  const verdict = evaluate(text);
  if (verdict.verdict === "block") return { ok: false, error: verdict.reason, state };
  post.comments.push({
    id: next(nextState),
    authorId: user.id,
    body: text,
    createdAt: new Date().toISOString(),
    votes: 0,
    status: verdict.verdict === "hold" ? "held" : "live"
  });
  markRate(user, "comment");
  return { ok: true, state: nextState, held: verdict.verdict === "hold" };
}

export function toggleVote(state, targetId) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user || user.votes[targetId]) {
    if (user?.votes[targetId]) {
      delete user.votes[targetId];
      adjustVotes(nextState, targetId, -1);
    }
    return { ok: true, state: nextState };
  }
  if (rateLimited(user, "vote")) return { ok: false, error: "rate", state };
  const targetAuthor = authorOf(nextState, targetId);
  if (targetAuthor === user.id) return { ok: false, error: "self", state };
  user.votes[targetId] = 1;
  markRate(user, "vote");
  adjustVotes(nextState, targetId, 1);
  return { ok: true, state: nextState };
}

function authorOf(state, targetId) {
  for (const post of state.posts) {
    if (post.id === targetId) return post.authorId;
    const comment = post.comments.find((item) => item.id === targetId);
    if (comment) return comment.authorId;
  }
  return null;
}

function adjustVotes(state, targetId, delta) {
  for (const post of state.posts) {
    if (post.id === targetId) {
      post.votes = Math.max(0, post.votes + delta);
      const author = member(state, post.authorId);
      if (author) author.reputation = Math.max(0, author.reputation + delta);
      return;
    }
    const comment = post.comments.find((item) => item.id === targetId);
    if (comment) {
      comment.votes = Math.max(0, comment.votes + delta);
      const author = member(state, comment.authorId);
      if (author) author.reputation = Math.max(0, author.reputation + delta);
    }
  }
}

export function toggleBookmark(state, postId) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user) return { ok: false, error: "auth", state };
  if (user.bookmarks.includes(postId)) user.bookmarks = user.bookmarks.filter((id) => id !== postId);
  else user.bookmarks.push(postId);
  return { ok: true, state: nextState };
}

export function markHelpful(state, postId, commentId) {
  const nextState = clone(state);
  const user = me(nextState);
  const post = nextState.posts.find((item) => item.id === postId);
  const comment = post?.comments.find((item) => item.id === commentId);
  if (!user || !post || !comment || post.authorId !== user.id || comment.authorId === user.id || post.type !== "question") {
    return { ok: false, error: "auth", state };
  }
  const previous = post.helpfulCommentId;
  if (previous === commentId) {
    post.helpfulCommentId = null;
    const author = member(nextState, comment.authorId);
    if (author) author.reputation = Math.max(0, author.reputation - 10);
  } else {
    if (previous) {
      const old = post.comments.find((item) => item.id === previous);
      const oldAuthor = old ? member(nextState, old.authorId) : null;
      if (oldAuthor) oldAuthor.reputation = Math.max(0, oldAuthor.reputation - 10);
    }
    post.helpfulCommentId = commentId;
    const author = member(nextState, comment.authorId);
    if (author) author.reputation += 10;
  }
  return { ok: true, state: nextState };
}

export function report(state, targetId, reason) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user) return { ok: false, error: "auth", state };
  if (nextState.reports.some((item) => item.reporterId === user.id && item.targetId === targetId && item.state === "open")) {
    return { ok: false, error: "already", state };
  }
  nextState.reports.push({ id: next(nextState), reporterId: user.id, targetId, reason, state: "open" });
  const open = nextState.reports.filter((item) => item.targetId === targetId && item.state === "open").length;
  if (open >= 3) {
    const post = nextState.posts.find((item) => item.id === targetId);
    if (post) post.status = "hidden";
    for (const item of nextState.posts) {
      const comment = item.comments.find((entry) => entry.id === targetId);
      if (comment) comment.status = "hidden";
    }
  }
  return { ok: true, state: nextState };
}

export function blockMember(state, memberId) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user || user.id === memberId) return { ok: false, error: "auth", state };
  if (!user.blocks.includes(memberId)) user.blocks.push(memberId);
  const other = member(nextState, memberId);
  if (other && !other.blocks.includes(user.id)) other.blocks.push(user.id);
  return { ok: true, state: nextState };
}

export function moderate(state, postId, action) {
  const nextState = clone(state);
  const user = me(nextState);
  const post = nextState.posts.find((item) => item.id === postId);
  if (!user || user.role !== "mod" || !post) return { ok: false, error: "auth", state };
  if (action === "restore") post.status = "live";
  if (action === "remove") post.status = "removed";
  if (action === "restore" || action === "dismiss") {
    for (const item of nextState.reports) {
      if (item.targetId === postId && item.state === "open") item.state = "dismissed";
    }
  }
  return { ok: true, state: nextState };
}

export function deleteAccount(state) {
  const nextState = clone(state);
  const user = me(nextState);
  if (!user) return { ok: false, error: "auth", state };
  for (const post of nextState.posts) {
    if (post.authorId === user.id) post.authorId = null;
    for (const comment of post.comments) {
      if (comment.authorId === user.id) comment.authorId = null;
    }
  }
  nextState.members = nextState.members.filter((person) => person.id !== user.id);
  if (nextState.folders) delete nextState.folders[user.id];
  nextState.meId = null;
  nextState.route = { name: "home" };
  return { ok: true, state: nextState };
}

export function queuedPosts(state) {
  const open = new Set(state.reports.filter((item) => item.state === "open").map((item) => item.targetId));
  return state.posts
    .filter((post) => post.status === "held" || post.status === "removed" || post.status === "hidden" || open.has(post.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function clone(state) {
  return structuredClone(state);
}
