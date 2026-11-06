/* Pure helpers for Check the wait and Insights. No DOM, no network: tested in node. */
import { MIN_SAMPLE } from "./timeline-extract.js";

export const WAIT_FORMS = ["I-485", "I-130", "I-751", "N-400", "I-765", "I-131"];
export const OFFICIAL = {
  processing: "https://egov.uscis.gov/processing-times/",
  moreInfo: "https://egov.uscis.gov/processing-times/more-info",
  faqs: "https://egov.uscis.gov/processing-times/processing-times-faqs",
  eRequest: "https://egov.uscis.gov/e-request/Intro.do",
  contact: "https://www.uscis.gov/contactcenter",
  ombudsman: "https://www.dhs.gov/case-assistance",
  house: "https://www.house.gov/representatives/find-your-representative"
};

const S = (en, es) => ({ en, es });
export const NEXT_STEPS = {
  "I-485": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Mailed or posted to your online account within a few weeks of filing.", "Llega por correo o a tu cuenta en línea unas semanas después de presentar."), milestone: null },
    { id: "biometrics", label: S("Biometrics appointment", "Cita de biometría"), body: S("Fingerprints and photo at an Application Support Center. Sometimes earlier prints are reused.", "Huellas y foto en un Centro de Apoyo. A veces reutilizan huellas anteriores."), milestone: "filed_to_biometrics" },
    { id: "interview", label: S("Interview (if scheduled)", "Entrevista (si la programan)"), body: S("At your field office. Some cases are decided without one.", "En tu oficina local. Algunos casos se deciden sin entrevista."), milestone: "filed_to_interview" },
    { id: "decision", label: S("Decision", "Decisión"), body: S("Your online account updates; a card is produced and mailed if approved.", "Tu cuenta en línea se actualiza; si se aprueba, producen y envían la tarjeta."), milestone: "filed_to_approval" }
  ],
  "I-130": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Confirms USCIS has the petition.", "Confirma que USCIS tiene la petición."), milestone: null },
    { id: "review", label: S("Review (an RFE is possible)", "Revisión (puede haber RFE)"), body: S("Answer any request for evidence by its deadline with exactly what it lists.", "Responde cualquier RFE a tiempo con lo que pide."), milestone: null },
    { id: "decision", label: S("Decision", "Decisión"), body: S("If approved, the case moves to the National Visa Center or a pending I-485.", "Si se aprueba, pasa al Centro Nacional de Visas o al I-485 pendiente."), milestone: "filed_to_approval" }
  ],
  "I-751": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Keep it with your card: it extends your status for the period printed on it.", "Guárdalo con tu tarjeta: extiende tu estatus por el periodo impreso."), milestone: null },
    { id: "biometrics", label: S("Biometrics (sometimes reused)", "Biometría (a veces reutilizada)"), body: S("You may get an appointment or a reuse notice.", "Puede llegar una cita o un aviso de reutilización."), milestone: "filed_to_biometrics" },
    { id: "interview", label: S("Interview (if scheduled)", "Entrevista (si la programan)"), body: S("Many cases are decided without one.", "Muchos casos se deciden sin entrevista."), milestone: "filed_to_interview" },
    { id: "decision", label: S("Decision and 10-year card", "Decisión y tarjeta de 10 años"), body: S("The new card is mailed if approved.", "La tarjeta nueva se envía si se aprueba."), milestone: "filed_to_approval" }
  ],
  "N-400": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Confirms the application.", "Confirma la solicitud."), milestone: null },
    { id: "biometrics", label: S("Biometrics", "Biometría"), body: S("Fingerprints for background checks; sometimes reused.", "Huellas para revisión de antecedentes; a veces reutilizadas."), milestone: "filed_to_biometrics" },
    { id: "interview", label: S("Interview, English and civics tests", "Entrevista, examen de inglés y civismo"), body: S("Study the official civics questions; bring what the notice lists.", "Estudia las preguntas oficiales de civismo; lleva lo que pide el aviso."), milestone: "filed_to_interview" },
    { id: "oath", label: S("Oath ceremony", "Ceremonia de juramento"), body: S("You become a citizen at the oath, not at the interview.", "Te haces ciudadano en el juramento, no en la entrevista."), milestone: "interview_to_oath" }
  ],
  "I-765": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Check whether your category gets an automatic extension.", "Revisa si tu categoría tiene extensión automática."), milestone: null },
    { id: "biometrics", label: S("Biometrics (if required)", "Biometría (si la piden)"), body: S("Not every category needs a new appointment.", "No todas las categorías necesitan cita nueva."), milestone: "filed_to_biometrics" },
    { id: "decision", label: S("Decision and card", "Decisión y tarjeta"), body: S("'Card is being produced' usually comes before mailing.", "'La tarjeta se está produciendo' suele llegar antes del envío."), milestone: "filed_to_approval" }
  ],
  "I-131": [
    { id: "receipt", label: S("Receipt notice", "Aviso de recibo"), body: S("Don't travel on a pending advance parole without legal advice.", "No viajes con un advance parole pendiente sin consejo legal."), milestone: null },
    { id: "biometrics", label: S("Biometrics (if required)", "Biometría (si la piden)"), body: S("Reentry permits require biometrics in the U.S.", "El permiso de reingreso requiere biometría en EE. UU."), milestone: "filed_to_biometrics" },
    { id: "decision", label: S("Decision and document", "Decisión y documento"), body: S("The travel document is mailed or held at a consulate if you asked.", "El documento se envía o queda en un consulado si lo pediste."), milestone: "filed_to_approval" }
  ]
};

export function daysBetween(fromIso, today = new Date()) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (Number.isNaN(from.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

export function cellFor(timelines, form, milestone) {
  const cell = timelines?.forms?.[form]?.[milestone];
  if (!cell) return { n: 0 };
  return cell;
}

export function publishable(cell, minSample = MIN_SAMPLE) {
  return Boolean(cell && cell.n >= minSample && cell.median != null);
}

/* Where a filing date stands vs official times and public-post timelines. */
export function waitPosition({ form, filed, today = new Date(), timelines = null, official = null }) {
  const days = daysBetween(filed, today);
  if (days == null) return { error: "date" };
  if (days < 0) return { error: "future" };
  const months = Math.round((days / 30.44) * 10) / 10;
  const result = { form, days, months, official: { available: false }, publicPosts: null, next: [] };

  const subtypes = official?.data?.subtypes || [];
  if (subtypes.length) {
    const best = subtypes[0];
    result.official = { available: true, months: best.months, subtype: best.name, past: months > best.months, source: official.source, fetchedAt: official.fetchedAt };
  }

  const cell = cellFor(timelines, form, "filed_to_approval");
  if (publishable(cell)) {
    const samples = (cell.sources || []).map((row) => row.days);
    const shorter = samples.filter((value) => value < days).length;
    const pct = samples.length ? Math.round((shorter / samples.length) * 100) : null;
    result.publicPosts = { n: cell.n, median: cell.median, p25: cell.p25, p75: cell.p75, min: cell.min, max: cell.max, pct, band: days < cell.p25 ? "early" : days <= cell.p75 ? "typical" : days <= cell.max ? "long" : "beyond" };
  } else {
    result.publicPosts = { n: cell.n || 0, thin: true };
  }

  for (const step of NEXT_STEPS[form] || []) {
    const stepCell = step.milestone ? cellFor(timelines, form, step.milestone) : { n: 0 };
    const typical = publishable(stepCell) ? stepCell.median : null;
    result.next.push({ ...step, typical, n: stepCell.n || 0, upcoming: typical == null ? null : typical > days });
  }
  return result;
}

/* Scale helper for the range bar: positions (0–100) of p25, median, p75 and you on a shared axis. */
export function rangeBar(pub, days) {
  if (!pub || pub.thin) return null;
  const max = Math.max(pub.max, days, pub.p75) * 1.08;
  const at = (value) => Math.max(0, Math.min(100, Math.round((value / max) * 1000) / 10));
  return { p25: at(pub.p25), median: at(pub.median), p75: at(pub.p75), you: at(days), max: Math.round(max) };
}
