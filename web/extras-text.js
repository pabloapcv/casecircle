/* UI copy for the extras (Interview practice, Civics practice, AI document check, folder chat, Tailor with AI) and the free trial. [English, Spanish]. */
const copy = {
  extrasKicker: ["Extra", "Extra"],
  trialDaysLeft: ["Free trial: {days} day left", "Prueba gratis: queda {days} día"],
  trialDaysLeftPlural: ["Free trial: {days} days left", "Prueba gratis: quedan {days} días"],
  trialBody: ["Interview practice, Civics practice, the AI document check, folder chat, and Tailor with AI are open during your trial. The folder checklist, Check the wait, and the community stay free.", "La práctica de entrevista, la de educación cívica, la revisión de documentos con IA, el chat de la carpeta y Ajustar con IA están abiertos durante tu prueba. La lista de la carpeta, Ver la espera y la comunidad siguen gratis."],
  adminAccess: ["Extras: full access (admin)", "Extras: acceso completo (admin)"],
  paidAccess: ["Extras: Case Pass active", "Extras: Case Pass activo"],
  lockedSigninTitle: ["Sign in to start your free trial", "Inicia sesión para empezar tu prueba gratis"],
  lockedSigninBody: ["Interview practice, Civics practice, the AI document check, folder chat, and Tailor with AI are extras. New accounts get {days} days free — no card, no charge.", "La práctica de entrevista, la de educación cívica, la revisión de documentos con IA, el chat de la carpeta y Ajustar con IA son extras. Las cuentas nuevas tienen {days} días gratis — sin tarjeta y sin cobro."],
  lockedExpiredTitle: ["Your free trial has ended", "Tu prueba gratis terminó"],
  lockedExpiredBody: ["Interview practice, Civics practice, the AI document check, folder chat, and Tailor with AI will be part of Case Pass. There is no checkout yet — join the waitlist and we'll email you once when it's ready. The folder checklist, Check the wait, and the community stay free.", "La práctica de entrevista, la de educación cívica, la revisión de documentos con IA, el chat de la carpeta y Ajustar con IA serán parte de Case Pass. Aún no hay pago — únete a la lista de espera y te escribiremos una vez cuando esté listo. La lista de la carpeta, Ver la espera y la comunidad siguen gratis."],
  signIn: ["Sign in or create an account", "Inicia sesión o crea una cuenta"],
  joinWaitlist: ["See Case Pass and join the waitlist", "Ver Case Pass y unirse a la lista"],
  loading: ["Loading…", "Cargando…"],
  loadError: ["Couldn't load this. Check your connection and try again.", "No se pudo cargar. Revisa tu conexión e inténtalo de nuevo."],
  retry: ["Try again", "Intentar de nuevo"],
  notAdvice: ["Not legal advice. Not affiliated with USCIS or any government agency. Always check the official USCIS page before your interview.", "No es asesoría legal. No está afiliado a USCIS ni a ninguna agencia del gobierno. Revisa siempre la página oficial de USCIS antes de tu entrevista."],

  interviewTitle: ["Interview prep", "Preparar entrevista"],
  interviewFree: ["General tips (free)", "Consejos generales (gratis)"],
  pickCase: ["Your case", "Tu caso"],
  caseMarriage: ["Marriage (I-485 / I-130)", "Matrimonio (I-485 / I-130)"],
  caseI751: ["Remove conditions (I-751)", "Quitar condiciones (I-751)"],
  caseN400: ["Citizenship (N-400)", "Ciudadanía (N-400)"],
  practiceTitle: ["Practice questions", "Preguntas de práctica"],
  practiceLead: ["Say your answer out loud, then check it against your own forms. These are prompts from the sections of your forms — not a USCIS question list.", "Di tu respuesta en voz alta y compárala con tus propios formularios. Son preguntas de las secciones de tus formularios — no una lista de preguntas de USCIS."],
  fromPart: ["From: {from}", "De: {from}"],
  showOther: ["Show in Spanish too", "Mostrar también en inglés"],
  practiceStart: ["Start a mock interview", "Empezar una entrevista de práctica"],
  practiceNext: ["Next question", "Siguiente pregunta"],
  practiceEnd: ["End practice", "Terminar práctica"],
  practiceCount: ["Question {i} of {n}", "Pregunta {i} de {n}"],
  practiceDone: ["Done. Note any answer that doesn't match your forms and fix it before the interview.", "Listo. Anota cualquier respuesta que no coincida con tus formularios y corrígela antes de la entrevista."],
  practiceAll: ["All practice questions", "Todas las preguntas de práctica"],
  bringTitle: ["What to bring", "Qué llevar"],
  bringLead: ["Matched against this device's folder. Ready means you marked it ready in the folder builder — check the paper itself.", "Comparado con la carpeta de este dispositivo. Listo significa que lo marcaste listo en el armador — revisa el papel."],
  bringReady: ["Ready in folder", "Listo en la carpeta"],
  bringMissing: ["Not marked ready", "No marcado listo"],
  bringNoFolder: ["Bring this", "Lleva esto"],
  openFolder: ["Open the folder", "Abrir la carpeta"],
  tipsTitle: ["Tips with official sources", "Consejos con fuentes oficiales"],
  sourceLabel: ["Source", "Fuente"],
  checkedOn: ["Sources checked {date}.", "Fuentes revisadas el {date}."],
  goCivics: ["Practice the civics test", "Practicar el examen de educación cívica"],

  civicsTitle: ["Civics test practice", "Práctica del examen de educación cívica"],
  civicsLead: ["Official USCIS questions and answers. The test is given in English; Spanish is shown only as a study aid.", "Preguntas y respuestas oficiales de USCIS. El examen es en inglés; el español se muestra solo como ayuda para estudiar."],
  whichTest: ["Which test do I take?", "¿Qué examen me toca?"],
  whichTestHelp: ["Pick the test you will take. Filed your N-400 on or after Oct. 20, 2025: 2025 test. Filed before: 2008 test.", "Elige el examen que te toca. Si presentaste el N-400 el 20 de oct. de 2025 o después: examen 2025. Antes: examen 2008."],
  filedOn: ["N-400 filed on", "N-400 presentado el"],
  youTake: ["You take the {label}.", "Te toca el {label}."],
  version2025: ["2025 test — 128 questions (asked up to 20, pass with 12)", "Examen 2025 — 128 preguntas (hasta 20, apruebas con 12)"],
  version2008: ["2008 test — 100 questions (asked up to 10, pass with 6)", "Examen 2008 — 100 preguntas (hasta 10, apruebas con 6)"],
  label2025: ["2025 test", "examen 2025"],
  label2008: ["2008 test", "examen 2008"],
  step1: ["Step 1", "Paso 1"],
  step2: ["Step 2", "Paso 2"],
  chooseHow: ["Choose how to practice", "Elige cómo practicar"],
  changeTest: ["Change", "Cambiar"],
  practicingTest: ["You're practicing the {label}.", "Estás practicando el {label}."],
  notSureDate: ["Not sure? Enter your N-400 filing date", "¿No estás seguro? Escribe la fecha en que presentaste el N-400"],
  test2025Title: ["2025 test", "Examen 2025"],
  test2008Title: ["2008 test", "Examen 2008"],
  test2025Stats: ["128 official questions", "128 preguntas oficiales"],
  test2008Stats: ["100 official questions", "100 preguntas oficiales"],
  test2025Rules: ["Up to 20 asked · pass with 12", "Hasta 20 preguntas · apruebas con 12"],
  test2008Rules: ["Up to 10 asked · pass with 6", "Hasta 10 preguntas · apruebas con 6"],
  modePractice: ["Practice test", "Examen de práctica"],
  modeTopics: ["Study by topic", "Estudiar por tema"],
  modeCards: ["Flashcards", "Tarjetas"],
  modeVocab: ["Reading & writing words", "Palabras de lectura y escritura"],
  modePracticeLead: ["A practice round like the real test. Answer out loud, reveal the official answers, then grade yourself.", "Una ronda de práctica como el examen real. Responde en voz alta, revela las respuestas oficiales y califícate."],
  modeTopicsLead: ["Browse official questions by topic and open any one to see the acceptable answers.", "Revisa las preguntas oficiales por tema y abre cualquiera para ver las respuestas aceptables."],
  modeCardsLead: ["One official question at a time. Show the answer when you're ready, then go on to the next card.", "Una pregunta oficial a la vez. Muestra la respuesta cuando estés listo y sigue a la siguiente tarjeta."],
  modeVocabLead: ["Official USCIS words used on the reading and writing tests.", "Palabras oficiales de USCIS que se usan en los exámenes de lectura y escritura."],
  senior: ["65/20 only (starred questions)", "Solo 65/20 (preguntas con asterisco)"],
  seniorHelp: ["65 or older and a permanent resident for 20+ years: 10 questions from the 20 starred ones; 6 correct passes; you may take the civics test in your language.", "65 años o más y residente permanente por 20+ años: 10 preguntas de las 20 con asterisco; apruebas con 6; puedes tomar el examen de cívica en tu idioma."],
  practiceRules: ["Like the real test: {asked} questions at most; it stops when you reach {pass} correct or {failAt} wrong. Answer out loud, reveal, then grade yourself honestly.", "Como el examen real: {asked} preguntas como máximo; se detiene al llegar a {pass} correctas o {failAt} incorrectas. Responde en voz alta, revela y califícate con honestidad."],
  startTest: ["Start practice test", "Empezar examen de práctica"],
  reveal: ["Show answer", "Mostrar respuesta"],
  gotIt: ["I got it right", "Acerté"],
  missedIt: ["I missed it", "Fallé"],
  scoreLine: ["{correct} correct · {wrong} wrong · {asked} of {max} asked", "{correct} correctas · {wrong} incorrectas · {asked} de {max}"],
  passed: ["Passed this practice round ({correct} correct).", "Aprobaste esta ronda de práctica ({correct} correctas)."],
  failed: ["Not yet — {correct} correct. Review the ones you missed and try again.", "Todavía no — {correct} correctas. Repasa las que fallaste y vuelve a intentarlo."],
  missedList: ["Questions to review", "Preguntas para repasar"],
  again: ["New practice test", "Nuevo examen de práctica"],
  acceptable: ["Acceptable answers (official)", "Respuestas aceptables (oficiales)"],
  changes: ["This answer changes", "Esta respuesta cambia"],
  changesBody: ["Answer with the official serving on the day of your interview. Check {link} the week before.", "Responde con el funcionario en el cargo el día de tu entrevista. Revisa {link} la semana anterior."],
  currentAsOf: ["Current answer per USCIS test updates (page last reviewed {date}):", "Respuesta actual según la página de USCIS (revisada el {date}):"],
  findYours: ["Find yours", "Busca el tuyo"],
  studyAid: ["Spanish — study aid only (official USCIS translation). The test is in English.", "Español — solo ayuda para estudiar (traducción oficial de USCIS). El examen es en inglés."],
  noSpanish2025: ["USCIS has not published a Spanish version of the 2025 questions, so they appear in English only.", "USCIS no ha publicado una versión en español de las preguntas 2025, así que aparecen solo en inglés."],
  showSpanish: ["Show Spanish study aid", "Mostrar ayuda en español"],
  allTopics: ["All topics", "Todos los temas"],
  questionsCount: ["{n} questions", "{n} preguntas"],
  flip: ["Flip", "Voltear"],
  hideAnswer: ["Hide answer", "Ocultar respuesta"],
  prev: ["Previous", "Anterior"],
  next: ["Next", "Siguiente"],
  shuffle: ["Shuffle", "Mezclar"],
  cardOf: ["Card {i} of {n}", "Tarjeta {i} de {n}"],
  vocabLead: ["Official USCIS vocabulary for the reading and writing tests. The sentences you read and write use these words.", "Vocabulario oficial de USCIS para los exámenes de lectura y escritura. Las oraciones que lees y escribes usan estas palabras."],
  vocabReading: ["Reading test vocabulary", "Vocabulario del examen de lectura"],
  vocabWriting: ["Writing test vocabulary", "Vocabulario del examen de escritura"],
  officialFiles: ["Official files", "Archivos oficiales"],
  question: ["Question", "Pregunta"],
  pricingTrial: ["New accounts: all extras are free for {days} days. No card needed.", "Cuentas nuevas: todos los extras son gratis por {days} días. Sin tarjeta."],
  pricingGated: ["Extras after the trial, via Case Pass: Interview practice (mock interview, what-to-bring checklist tied to your folder, cited tips), Civics practice (2025 and 2008 tests, topics, flashcards, vocabulary), the AI document check, folder chat, and Tailor with AI.", "Extras después de la prueba, con Case Pass: práctica de entrevista (entrevista de práctica, lista de qué llevar ligada a tu carpeta, consejos con fuentes), práctica de educación cívica (exámenes 2025 y 2008, temas, tarjetas, vocabulario), la revisión de documentos con IA, el chat de la carpeta y Ajustar con IA."]
};

export function extrasText(lang, key, values = {}) {
  const row = copy[key];
  const text = row ? (lang === "es" ? row[1] : row[0]) : key;
  return String(text).replace(/\{(\w+)\}/g, (_, name) => (name in values ? String(values[name]) : ""));
}

export function trialLabel(lang, days) {
  return extrasText(lang, days === 1 ? "trialDaysLeft" : "trialDaysLeftPlural", { days });
}

export const EXTRAS_KEYS = Object.keys(copy);

/* Must match entitlements.GATED_FEATURES. Add an id here and in entitlements.py to gate another feature later.
   checklist, processing_times, community, and interview_tips stay free. */
export const GATED_FEATURES = Object.freeze(["civics", "folder_chat", "folder_check", "folder_plan", "interview"]);

export function isFeatureOpen(status, feature) {
  return !GATED_FEATURES.includes(feature) || Boolean(status && status.access);
}
