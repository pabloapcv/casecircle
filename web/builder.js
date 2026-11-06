/*
 * AI Folder Builder — the deterministic half.
 * Short intake questions per form, on-device inference from a free-text case description,
 * and a personalized checklist built from prepare.js formChecklists with a reason for every
 * item that was added or removed. The AI (or Demo AI) can then suggest extra adds/removes
 * through /api/folder-plan; mergeAiPlan folds those in with their reasons.
 */
import { formChecklists } from "./prepare.js";

export const BUILDER_FORMS = ["i-485", "i-130", "i-751", "n-400", "i-765", "i-131"];

const yesNo = [
  { value: "yes", en: "Yes", es: "Sí" },
  { value: "no", en: "No", es: "No" }
];
const q = (id, en, es, options) => ({ id, en, es, options });

const nonEnglishQ = q("nonEnglish", "Are any of your documents in a language other than English?", "¿Alguno de tus documentos está en un idioma que no sea inglés?", yesNo);
const arrestsQ = q("arrests", "Have you ever been arrested, cited, or charged with anything, anywhere?", "¿Alguna vez te arrestaron, citaron o acusaron de algo, en cualquier país?", yesNo);
const priorQ = q("priorMarriage", "Were you or your spouse married before?", "¿Tú o tu cónyuge estuvieron casados antes?", yesNo);

export const QUESTIONS = {
  "i-485": [
    q("basis", "What is the green card based on?", "¿En qué se basa la residencia?", [
      { value: "marriage", en: "Marriage to a U.S. citizen or resident", es: "Matrimonio con ciudadano o residente" },
      { value: "family", en: "Another family relationship", es: "Otra relación familiar" },
      { value: "employment", en: "A job (employment-based)", es: "Un empleo" },
      { value: "other", en: "Something else", es: "Otra cosa" }
    ]),
    priorQ,
    q("withEad", "Are you also filing for a work permit or travel document with it?", "¿También pides permiso de trabajo o de viaje junto con él?", yesNo),
    nonEnglishQ,
    arrestsQ
  ],
  "i-130": [
    q("relation", "Who are you petitioning for?", "¿Para quién es la petición?", [
      { value: "spouse", en: "My spouse", es: "Mi cónyuge" },
      { value: "parent", en: "My parent", es: "Mi padre o madre" },
      { value: "child", en: "My child", es: "Mi hijo o hija" },
      { value: "sibling", en: "My brother or sister", es: "Mi hermano o hermana" }
    ]),
    q("petitioner", "What is your status, as the petitioner?", "¿Cuál es tu estatus como peticionario?", [
      { value: "citizen", en: "U.S. citizen", es: "Ciudadano de EE. UU." },
      { value: "resident", en: "Green card holder", es: "Residente permanente" }
    ]),
    priorQ,
    nonEnglishQ
  ],
  "i-751": [
    q("filing", "Are you filing together with your spouse?", "¿Presentas junto con tu cónyuge?", [
      { value: "joint", en: "Yes, jointly", es: "Sí, en conjunto" },
      { value: "waiver", en: "No, I need a waiver", es: "No, necesito un perdón" }
    ]),
    q("children", "Were children born to the marriage?", "¿Nacieron hijos del matrimonio?", yesNo),
    nonEnglishQ,
    arrestsQ
  ],
  "n-400": [
    q("basis", "Which path are you applying under?", "¿Por cuál vía solicitas?", [
      { value: "five", en: "5 years as a resident", es: "5 años como residente" },
      { value: "three", en: "3 years, married to a U.S. citizen", es: "3 años, casado con ciudadano" }
    ]),
    q("longTrips", "Any trips outside the U.S. longer than 6 months?", "¿Algún viaje fuera de EE. UU. de más de 6 meses?", yesNo),
    arrestsQ,
    nonEnglishQ
  ],
  "i-765": [
    q("category", "What is the work permit based on?", "¿En qué se basa el permiso de trabajo?", [
      { value: "pending485", en: "A pending green card (I-485)", es: "Un I-485 pendiente" },
      { value: "asylum", en: "A pending asylum case", es: "Un asilo pendiente" },
      { value: "student", en: "Student (OPT)", es: "Estudiante (OPT)" },
      { value: "other", en: "Something else", es: "Otra cosa" }
    ]),
    q("renewal", "Is this a renewal?", "¿Es una renovación?", yesNo)
  ],
  "i-131": [
    q("docType", "Which travel document do you need?", "¿Qué documento de viaje necesitas?", [
      { value: "parole", en: "Advance parole (pending green card)", es: "Advance parole (residencia pendiente)" },
      { value: "reentry", en: "Reentry permit (green card holder)", es: "Permiso de reingreso (residente)" },
      { value: "refugee", en: "Refugee travel document", es: "Documento de viaje de refugiado" }
    ])
  ]
};

/* Kind drives the readiness "evidence depth" part and the doc-type hints. */
const KIND = {
  evidence: /(-evidence|-joint|-affidavits|-relationship|-children)$|^(i130|i751)-photos$/,
  form: /-form$/,
  civil: /(-birth|-marriage|-divorce|-waiver)$/,
  identity: /(-passport|-id|-gc|-card|-i94|-petitioner|-photos|-photosid)$/
};
export function itemKind(id) {
  if (KIND.evidence.test(id)) return "evidence";
  if (KIND.form.test(id)) return "form";
  if (KIND.civil.test(id)) return "civil";
  if (KIND.identity.test(id)) return "identity";
  return "other";
}

const R = (en, es) => ({ en, es });

/* Which conditional/optional item applies, and why. Return a reason to include, or null to remove with removeReason. */
const RULES = {
  "i-485": {
    "i485-i130": (a) => a.basis === "marriage" || a.basis === "family" ? R("Family-based: the I-130 receipt or approval is your basis.", "Basado en familia: el recibo o la aprobación del I-130 es tu base.") : null,
    "i485-i864": (a) => a.basis === "marriage" || a.basis === "family" ? R("Family-based cases need the sponsor's affidavit of support.", "Los casos familiares necesitan la declaración de apoyo del patrocinador.") : null,
    "i485-marriage": (a) => a.basis === "marriage" ? R("Marriage-based: the marriage certificate proves the relationship.", "Por matrimonio: el acta prueba la relación.") : null,
    "i485-divorce": (a) => a.priorMarriage === "yes" ? R("A prior marriage has to be shown as legally ended.", "Un matrimonio anterior tiene que mostrarse terminado legalmente.") : null,
    "i485-i140": (a) => a.basis === "employment" ? R("Employment-based: the I-140 approval is your basis.", "Por empleo: la aprobación del I-140 es tu base.") : null,
    "i485-evidence": (a) => a.basis === "marriage" ? R("Marriage cases are reviewed for a real, shared life.", "Los casos por matrimonio se revisan por una vida real compartida.") : null
  },
  "i-765": {
    "i765-i94": (a) => a.category === "student" || a.category === "other" ? R("Status-based categories ask for the I-94.", "Las categorías por estatus piden el I-94.") : null,
    "i765-pending": (a) => a.category === "pending485" || a.category === "asylum" ? R("Based on a pending case: include that receipt notice copy.", "Basado en un caso pendiente: incluye la copia del recibo.") : null
  },
  "n-400": {
    "n400-trips": (a) => R(a.longTrips === "yes" ? "Long trips can affect continuous residence; list every trip with exact dates." : "The form asks for every trip; keep the list matching your records.", a.longTrips === "yes" ? "Los viajes largos pueden afectar la residencia continua; anota cada viaje con fechas exactas." : "El formulario pide cada viaje; la lista tiene que coincidir con tus registros."),
    "n400-taxes": (a) => R("Tax transcripts back up the years the instructions ask about.", "Las transcripciones respaldan los años que piden las instrucciones."),
    "n400-arrest": (a) => a.arrests === "yes" ? R("Any arrest or citation needs certified court records.", "Cualquier arresto o citación necesita registros judiciales certificados.") : null
  },
  "i-130": {
    "i130-marriage": (a) => a.relation === "spouse" ? R("Spouse petition: the marriage certificate proves the relationship.", "Petición de cónyuge: el acta prueba la relación.") : null,
    "i130-evidence": (a) => a.relation === "spouse" ? R("Spouse petitions are reviewed for a real marriage.", "Las peticiones de cónyuge se revisan por un matrimonio real.") : null,
    "i130-birth": (a) => a.relation && a.relation !== "spouse" ? R("Parent, child, or sibling: birth certificates prove the relationship.", "Padre, hijo o hermano: las actas de nacimiento prueban la relación.") : null,
    "i130-photos": (a) => a.relation === "spouse" ? R("Photos over time support the joint records.", "Las fotos a lo largo del tiempo apoyan los registros.") : null
  },
  "i-751": {
    "i751-children": (a) => a.children === "yes" ? R("Children born to the marriage are strong shared-life evidence.", "Los hijos del matrimonio son pruebas fuertes de vida compartida.") : null,
    "i751-waiver": (a) => a.filing === "waiver" ? R("A waiver needs evidence of its basis. Talk to a lawyer or accredited representative.", "Un perdón necesita pruebas de su base. Habla con un abogado o representante acreditado.") : null,
    "i751-court": (a) => a.arrests === "yes" ? R("Any arrest or citation needs certified court records.", "Cualquier arresto o citación necesita registros judiciales certificados.") : null
  },
  "i-131": {
    "i131-pending": (a) => a.docType === "parole" ? R("Advance parole is tied to the pending I-485.", "El advance parole depende del I-485 pendiente.") : null,
    "i131-gc": (a) => a.docType === "reentry" ? R("A reentry permit is for green card holders.", "El permiso de reingreso es para residentes.") : null,
    "i131-refugee": (a) => a.docType === "refugee" ? R("A refugee travel document needs proof of that status.", "El documento de refugiado necesita prueba de ese estatus.") : null
  }
};

const REMOVED_REASON = R("Doesn't apply to the answers you gave.", "No aplica según tus respuestas.");

/* Extra items the answers add that are not in the base list. */
function extras(spaceId, a) {
  const out = [];
  if (a.nonEnglish === "yes") out.push({ id: `${spaceId.replace("-", "")}-translations`, en: "Certified English translation for every non-English document", es: "Traducción certificada al inglés de cada documento que no esté en inglés", required: true, reason: R("You said some documents are not in English.", "Dijiste que algunos documentos no están en inglés.") });
  if (spaceId === "i-485" && a.arrests === "yes") out.push({ id: "i485-court", en: "Certified court records for any arrest or citation", es: "Registros judiciales certificados de cualquier arresto o citación", required: true, reason: R("You mentioned an arrest or citation. Get a lawyer's view before filing.", "Mencionaste un arresto o citación. Consulta a un abogado antes de presentar.") });
  if (spaceId === "i-485" && a.withEad === "yes") out.push({ id: "i485-ead", en: "Form I-765 and/or I-131 filed with the I-485, with their own photos", es: "Formulario I-765 y/o I-131 junto con el I-485, con sus propias fotos", required: false, reason: R("You're filing a work permit or travel document together.", "Presentas permiso de trabajo o de viaje junto.") });
  if (spaceId === "i-130" && a.priorMarriage === "yes") out.push({ id: "i130-divorce", en: "Divorce decree or death certificate for every prior marriage", es: "Decreto de divorcio o acta de defunción de cada matrimonio anterior", required: true, reason: R("Prior marriages have to be shown as legally ended.", "Los matrimonios anteriores tienen que mostrarse terminados.") });
  if (spaceId === "i-130" && a.relation === "spouse") out.push({ id: "i130-i130a", en: "Form I-130A for the spouse beneficiary", es: "Formulario I-130A del cónyuge beneficiario", required: true, reason: R("Spouse petitions include Form I-130A.", "Las peticiones de cónyuge incluyen el I-130A.") });
  if (spaceId === "n-400" && a.basis === "three") out.push({ id: "n400-marriage", en: "Proof of your spouse's U.S. citizenship and your marriage for the last 3 years", es: "Prueba de la ciudadanía de tu cónyuge y del matrimonio de los últimos 3 años", required: true, reason: R("The 3-year path depends on the marriage to a citizen.", "La vía de 3 años depende del matrimonio con un ciudadano.") });
  if (spaceId === "i-765" && a.renewal === "yes") out.push({ id: "i765-prior", en: "Copy of the current or last work permit (front and back)", es: "Copia del permiso de trabajo actual o anterior (frente y dorso)", required: true, reason: R("Renewals include the previous card.", "Las renovaciones incluyen la tarjeta anterior.") });
  return out;
}

export function questionsFor(spaceId) {
  return QUESTIONS[spaceId] || [];
}

export function nextQuestion(spaceId, answers = {}) {
  return questionsFor(spaceId).find((item) => !answers[item.id]) || null;
}

/* Build the personalized list. Deterministic: same answers, same list. */
export function buildPlan(spaceId, answers = {}) {
  const base = formChecklists[spaceId];
  if (!base) return { items: [], removed: [] };
  const rules = RULES[spaceId] || {};
  const items = [];
  const removed = [];
  const push = (entry, required, source, reason) => items.push({ id: entry.id, en: entry.en, es: entry.es, required, kind: itemKind(entry.id), source, reason: reason || null });
  for (const entry of base.required) push(entry, true, "base");
  for (const entry of base.conditional) {
    const rule = rules[entry.id];
    const reason = rule ? rule(answers) : null;
    if (reason) push(entry, true, "rule", reason);
    else removed.push({ id: entry.id, en: entry.en, es: entry.es, reason: REMOVED_REASON });
  }
  for (const entry of base.optional) {
    const rule = rules[entry.id];
    if (!rule) { push(entry, false, "base"); continue; }
    const reason = rule(answers);
    if (reason) push(entry, false, "rule", reason);
    else removed.push({ id: entry.id, en: entry.en, es: entry.es, reason: REMOVED_REASON });
  }
  for (const entry of extras(spaceId, answers)) push(entry, entry.required, "rule", entry.reason);
  return { items, removed };
}

const slug = (text) => String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item";

/* Fold the AI's validated suggestions into the plan. Required items are never removed. */
export function mergeAiPlan(plan, ai) {
  if (!ai) return plan;
  const items = plan.items.map((item) => ({ ...item }));
  const removed = [...plan.removed];
  const removeIds = new Set();
  for (const row of ai.remove || []) {
    const item = items.find((entry) => entry.id === row.id);
    if (!item || item.required) continue;
    removeIds.add(row.id);
    removed.push({ id: item.id, en: item.en, es: item.es, reason: { en: row.reason, es: row.reason }, source: "ai" });
  }
  const kept = items.filter((item) => !removeIds.has(item.id));
  const seen = new Set(kept.map((item) => String(item.en || "").toLowerCase()));
  for (const row of ai.add || []) {
    const label = String(row.label || "").trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const id = `ai-${slug(label)}`;
    kept.push({ id, en: label, es: label, required: Boolean(row.required), kind: row.kind === "evidence" ? "evidence" : "other", source: "ai", reason: { en: row.reason || "", es: row.reason || "" } });
  }
  return { items: kept, removed };
}

/* On-device inference from a free-text description. Only fills answers it is confident about. */
export function inferFromDescription(text) {
  const raw = String(text || "");
  const s = raw.toLowerCase();
  const answers = {};
  let form = "";
  if (/\bn-?400\b|naturali[sz]|citizenship|ciudadan/.test(s)) form = "n-400";
  else if (/\bi-?751\b|remove (the )?conditions|removal of conditions|conditional (green )?card|tarjeta condicional/.test(s)) form = "i-751";
  else if (/\bi-?131\b|advance parole|reentry permit|travel document|permiso de reingreso/.test(s)) form = "i-131";
  else if (/\bi-?765\b|work permit|\bead\b|employment authorization|permiso de trabajo/.test(s) && !/green card|i-?485|adjust/.test(s)) form = "i-765";
  else if (/\bi-?485\b|adjust(ment)? of status|\baos\b|green card|residencia|ajuste/.test(s)) form = "i-485";
  else if (/\bi-?130\b|petition for (my )?(wife|husband|spouse|mother|father|parent|son|daughter|brother|sister)|petici[oó]n/.test(s)) form = "i-130";
  const marriage = /\b(married|marriage|my (wife|husband|spouse)|esposa|esposo|matrimonio|casad[oa])\b/.test(s);
  if (/\b(divorc\w*|was married before|previous(ly)? married|prior marriage|ex-?(wife|husband)|widow\w*|annul\w*|matrimonio anterior)\b/.test(s)) answers.priorMarriage = "yes";
  if (/\b(first marriage|never married before|no prior marriage)\b/.test(s)) answers.priorMarriage = "no";
  if (/\b(spanish|español|portuguese|french|chinese|mandarin|arabic|russian|vietnamese|hindi|tagalog|korean|in (my )?native language|translat\w*|traducci\w*)\b/.test(s)) answers.nonEnglish = "yes";
  if (/\b(arrest\w*|dui|dwi|citation|charged|conviction|police record|arresto|multa)\b/.test(s)) answers.arrests = "yes";
  if (/\b(no arrests?|never (been )?arrested|clean record)\b/.test(s)) answers.arrests = "no";
  if (/\b(work permit|ead|i-?765|advance parole|i-?131)\b/.test(s) && form === "i-485") answers.withEad = "yes";
  if (form === "i-485" || (!form && marriage)) {
    if (marriage) answers.basis = "marriage";
    else if (/\b(eb-?[1-5]|employ\w*|employer|h-?1b|i-?140|job offer)\b/.test(s)) answers.basis = "employment";
    else if (/\b(parent|mother|father|son|daughter|brother|sister)\b/.test(s)) answers.basis = "family";
  }
  if (form === "i-130") {
    if (marriage) answers.relation = "spouse";
    else if (/\b(mother|father|parent|mom|dad)\b/.test(s)) answers.relation = "parent";
    else if (/\b(son|daughter|child)\b/.test(s)) answers.relation = "child";
    else if (/\b(brother|sister|sibling)\b/.test(s)) answers.relation = "sibling";
    if (/\b(i am|i'm) a (u\.?s\.? )?citizen|\bnaturalized\b/.test(s)) answers.petitioner = "citizen";
    else if (/\b(green card holder|permanent resident|lpr)\b/.test(s)) answers.petitioner = "resident";
  }
  if (form === "i-751") {
    if (/\b(divorc\w*|separated|abuse|waiver|widow\w*)\b/.test(s)) answers.filing = "waiver";
    else if (marriage || /\bjoint(ly)?\b/.test(s)) answers.filing = "joint";
    if (/\b(our (son|daughter|baby|kids?|children)|had a (baby|child))\b/.test(s)) answers.children = "yes";
  }
  if (form === "n-400") {
    if (/\b3 years|three years\b/.test(s) && marriage) answers.basis = "three";
    else if (/\b5 years|five years\b/.test(s)) answers.basis = "five";
  }
  if (form === "i-765") {
    if (/\b(i-?485|adjust|green card)\b/.test(s)) answers.category = "pending485";
    else if (/\basylum\b/.test(s)) answers.category = "asylum";
    else if (/\b(opt|f-?1|student)\b/.test(s)) answers.category = "student";
    if (/\brenew\w*\b/.test(s)) answers.renewal = "yes";
  }
  if (form === "i-131") {
    if (/\badvance parole\b|pending (i-?485|green card)/.test(s)) answers.docType = "parole";
    else if (/\breentry\b/.test(s)) answers.docType = "reentry";
    else if (/\brefugee|asylee\b/.test(s)) answers.docType = "refugee";
  }
  const allowed = new Set((QUESTIONS[form] || Object.values(QUESTIONS).flat()).map((item) => item.id));
  for (const key of Object.keys(answers)) if (!allowed.has(key)) delete answers[key];
  return { form, answers };
}

export function answerLabel(lang, spaceId, questionId, value) {
  const question = questionsFor(spaceId).find((item) => item.id === questionId);
  const option = question?.options.find((item) => item.value === value);
  if (!option) return value;
  return lang === "es" ? option.es : option.en;
}

/* Suggest which checklist item a new document belongs to, from its name or text. */
const DOC_HINTS = [
  [/marriage|matrimonio/i, /-marriage$/],
  [/birth|nacimiento/i, /-birth$/],
  [/divorce|divorcio|dissolution/i, /-divorce$/],
  [/passport|pasaporte/i, /-passport$/],
  [/i-?693|medical/i, /-i693$/],
  [/i-?864|affidavit of support/i, /-i864$/],
  [/i-?94\b|arrival/i, /-i94$/],
  [/lease|bank|statement|insurance|joint|mortgage/i, /-(evidence|joint)$/],
  [/photo/i, /-photos$/],
  [/tax|1040|transcript/i, /-taxes$/],
  [/green card|permanent resident card/i, /-(gc|card)$/],
  [/translat|traducci/i, /-translations$/]
];
export function suggestItem(items, hint) {
  const text = String(hint || "");
  for (const [test, idPattern] of DOC_HINTS) {
    if (!test.test(text)) continue;
    const match = items.find((item) => idPattern.test(item.id));
    if (match) return match.id;
  }
  return "";
}
