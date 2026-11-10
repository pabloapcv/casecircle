/* Case twins: pure helpers (cohort keys, wording). The matching itself runs in Supabase (my_case_twins). */
import { offices } from "./logic.js";

export const TWIN_FORMS = ["I-485", "I-130", "I-751", "N-400", "I-765", "I-131", "I-129F", "I-140", "I-90", "I-589", "DS-260"];
export const TWIN_OFFICES = offices.filter((row) => row.id !== "unsure").map((row) => row.id);

export function monthKey(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[1]}-${match[2]}` : "";
}

/* A cohort from a saved case profile ({form, officeId, filed}) or from Check the wait ({form, office: "MIA", filed}). */
export function cohortFrom(source) {
  if (!source) return { form: "", officeId: "", month: "" };
  let officeId = source.officeId || "";
  if (!officeId && source.office) officeId = offices.find((row) => row.code === source.office)?.id || "";
  if (!TWIN_OFFICES.includes(officeId)) officeId = "";
  return { form: TWIN_FORMS.includes(source.form) ? source.form : "", officeId, month: monthKey(source.filed) };
}

/* Problem with a cohort before sending it, or "" (mirrors the server and the database checks). */
export function twinIssue(cohort, now = new Date()) {
  if (!TWIN_FORMS.includes(cohort?.form)) return "twin_form";
  if (!TWIN_OFFICES.includes(cohort?.officeId)) return "twin_office";
  const month = monthKey(cohort?.month);
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!month || month < "2000-01" || month > current) return "twin_month";
  return "";
}

/* What a cohort card says: "first" for 0–1 others (a single person is never shown), else a rough count. */
export function twinsView(cohort) {
  const others = Number(cohort?.others) || 0;
  if (others < 2) return { kind: "first", others: 0, handles: [] };
  return { kind: cohort.plus ? "plus" : "count", others, handles: (cohort.handles || []).slice(0, 9), more: Boolean(cohort.plus) || others > (cohort.handles || []).length };
}

export function sameCohort(a, b) {
  return Boolean(a && b) && a.form === b.form && a.officeId === b.officeId && monthKey(a.month) === monthKey(b.month);
}
