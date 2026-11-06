/*
 * Folder readiness — deterministic, explainable, testable.
 * This grades how complete and consistent a folder is. It is NOT a prediction of any USCIS decision.
 *
 * score = required (40) + consistency (20) + dates (20) + evidence depth (20)
 *   required     average credit over applicable required items:
 *                1 = present (marked "In the folder" or has a document that isn't a mismatch) with no completeness findings
 *                0.5 = present but a completeness finding is open (translation, pages, signature, edition, unreadable, wrong document)
 *                0 = missing
 *   consistency  20 × (1 − Σ penalty) over name/consistency findings; until a document is checked: half credit × required ratio
 *   dates        20 × (1 − Σ penalty) over expired / out-of-window findings; until a document is checked: half credit × required ratio
 *   evidence     average over evidence items: 1 with a document, 0.5 marked without a document, 0 missing,
 *                minus 0.34 per "thin evidence" finding (any severity); forms without evidence items use document coverage of present items
 * penalties: high 0.5, medium 0.34, low 0.15
 */

export const WEIGHTS = { required: 40, consistency: 20, dates: 20, evidence: 20 };
export const PENALTY = { high: 0.5, medium: 0.34, low: 0.15 };
export const FINDING_GROUP = {
  name_mismatch: "consistency",
  inconsistent: "consistency",
  date_expired: "dates",
  date_window: "dates",
  translation_missing: "completeness",
  pages_missing: "completeness",
  signature_missing: "completeness",
  wrong_edition: "completeness",
  unreadable: "completeness",
  wrong_document: "completeness",
  thin_evidence: "evidence",
  other: "consistency"
};
export const FINDING_CODES = Object.keys(FINDING_GROUP);
export const CHECK_STATUSES = ["matches", "possible_issue", "mismatch"];

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const penaltyOf = (finding) => PENALTY[finding.severity] ?? PENALTY.medium;

function findingsOf(doc) {
  return doc?.check?.findings || [];
}

/* All findings in play: per-document AI findings plus cross-document findings computed on device. */
export function allFindings(docs, cross = []) {
  const out = [];
  for (const doc of docs || []) {
    for (const [index, finding] of findingsOf(doc).entries()) {
      if (finding.resolved) continue;
      out.push({ ...finding, docId: doc.id, itemId: doc.itemId, key: `${doc.id}:${index}` });
    }
  }
  for (const [index, finding] of (cross || []).entries()) {
    if (finding.resolved) continue;
    out.push({ ...finding, key: `cross:${index}` });
  }
  return out;
}

export function computeReadiness({ items = [], marks = {}, docs = [], cross = [] } = {}) {
  const applicable = items.filter((item) => (marks[item.id] || "need") !== "na");
  const usable = (doc) => doc.check?.status !== "mismatch";
  const docsFor = (id) => docs.filter((doc) => doc.itemId === id);
  const findings = allFindings(docs, cross);
  const byItem = (id, group) => findings.filter((finding) => finding.itemId === id && FINDING_GROUP[finding.code] === group);

  // Required items
  const required = applicable.filter((item) => item.required);
  const requiredRows = required.map((item) => {
    const attached = docsFor(item.id);
    const present = marks[item.id] === "ready" || attached.some(usable);
    const open = byItem(item.id, "completeness").length > 0 || (marks[item.id] === "ready" && attached.length > 0 && !attached.some(usable));
    const credit = present ? (open ? 0.5 : 1) : 0;
    return { id: item.id, present, credit };
  });
  const requiredRatio = required.length ? requiredRows.reduce((sum, row) => sum + row.credit, 0) / required.length : 1;

  // Consistency & dates: only meaningful once something was checked
  const checked = docs.filter((doc) => doc.check);
  const groupRatio = (group) => {
    if (!checked.length) return 0.5 * requiredRatio;
    const total = findings.filter((finding) => FINDING_GROUP[finding.code] === group).reduce((sum, finding) => sum + penaltyOf(finding), 0);
    return clamp01(1 - total);
  };
  const consistencyRatio = groupRatio("consistency");
  const datesRatio = groupRatio("dates");

  // Evidence depth
  const evidenceItems = applicable.filter((item) => item.kind === "evidence");
  let evidenceRatio;
  if (evidenceItems.length) {
    const credits = evidenceItems.map((item) => {
      const attached = docsFor(item.id).filter(usable);
      const credit = attached.length ? 1 : marks[item.id] === "ready" ? 0.5 : 0;
      return clamp01(credit - byItem(item.id, "evidence").length * PENALTY.medium);
    });
    evidenceRatio = credits.reduce((sum, value) => sum + value, 0) / evidenceItems.length;
  } else {
    const present = applicable.filter((item) => marks[item.id] === "ready" || docsFor(item.id).some(usable));
    evidenceRatio = present.length ? present.filter((item) => docsFor(item.id).some(usable)).length / present.length : 0;
  }

  const parts = {
    required: { ratio: requiredRatio, points: WEIGHTS.required * requiredRatio, max: WEIGHTS.required, present: requiredRows.filter((row) => row.present).length, total: required.length },
    consistency: { ratio: consistencyRatio, points: WEIGHTS.consistency * consistencyRatio, max: WEIGHTS.consistency, checked: checked.length > 0 },
    dates: { ratio: datesRatio, points: WEIGHTS.dates * datesRatio, max: WEIGHTS.dates, checked: checked.length > 0 },
    evidence: { ratio: evidenceRatio, points: WEIGHTS.evidence * evidenceRatio, max: WEIGHTS.evidence, items: evidenceItems.length }
  };
  const raw = parts.required.points + parts.consistency.points + parts.dates.points + parts.evidence.points;
  for (const part of Object.values(parts)) part.points = Math.round(part.points * 10) / 10;
  return { score: Math.round(raw), raw, parts, findings };
}

/*
 * Top fixes: simulate each candidate fix and rank by how many points it adds.
 * Deterministic tie-break: larger gain first, then checklist order.
 */
export function topFixes(input, limit = 3) {
  const { items = [], marks = {}, docs = [], cross = [] } = input || {};
  const base = computeReadiness(input).raw;
  const order = new Map(items.map((item, index) => [item.id, index]));
  const candidates = [];
  const applicable = items.filter((item) => (marks[item.id] || "need") !== "na");
  for (const item of applicable) {
    const attached = docs.filter((doc) => doc.itemId === item.id && doc.check?.status !== "mismatch");
    const present = marks[item.id] === "ready" || attached.length > 0;
    if (item.required && !present) {
      const gain = computeReadiness({ items, marks: { ...marks, [item.id]: "ready" }, docs, cross }).raw - base;
      candidates.push({ type: "add", itemId: item.id, gain, order: order.get(item.id) });
    } else if (item.kind === "evidence" && !attached.length) {
      const fake = { id: `sim-${item.id}`, itemId: item.id, check: docs.some((doc) => doc.check) ? { status: "matches", findings: [] } : null };
      const gain = computeReadiness({ items, marks: { ...marks, [item.id]: "ready" }, docs: [...docs, fake], cross }).raw - base;
      candidates.push({ type: "evidence", itemId: item.id, gain, order: order.get(item.id) });
    }
  }
  for (const doc of docs) {
    for (const [index, finding] of (doc.check?.findings || []).entries()) {
      if (finding.resolved) continue;
      const nextDocs = docs.map((entry) => entry.id !== doc.id ? entry : { ...entry, check: { ...entry.check, findings: entry.check.findings.map((row, i) => i === index ? { ...row, resolved: true } : row) } });
      const gain = computeReadiness({ items, marks, docs: nextDocs, cross }).raw - base;
      candidates.push({ type: "finding", itemId: doc.itemId, docId: doc.id, code: finding.code, fix: finding.fix, message: finding.message, gain, order: order.get(doc.itemId) ?? 999 });
    }
    if (doc.check?.status === "mismatch") {
      const nextDocs = docs.map((entry) => entry.id !== doc.id ? entry : { ...entry, check: { status: "matches", findings: [] } });
      const gain = computeReadiness({ items, marks, docs: nextDocs, cross }).raw - base;
      candidates.push({ type: "mismatch", itemId: doc.itemId, docId: doc.id, gain, order: order.get(doc.itemId) ?? 999 });
    }
  }
  for (const [index, finding] of (cross || []).entries()) {
    if (finding.resolved) continue;
    const gain = computeReadiness({ items, marks, docs, cross: cross.map((row, i) => i === index ? { ...row, resolved: true } : row) }).raw - base;
    candidates.push({ type: "finding", itemId: finding.itemId, code: finding.code, fix: finding.fix, message: finding.message, gain, order: order.get(finding.itemId) ?? 999 });
  }
  if (docs.length && !docs.some((doc) => doc.check)) {
    const nextDocs = docs.map((doc) => ({ ...doc, check: { status: "matches", findings: [] } }));
    const gain = computeReadiness({ items, marks, docs: nextDocs, cross }).raw - base;
    candidates.push({ type: "check", gain, order: -1 });
  }
  return candidates
    .filter((row) => row.gain > 0.05)
    .map((row) => ({ ...row, points: Math.max(1, Math.round(row.gain)) }))
    .sort((a, b) => b.gain - a.gain || a.order - b.order)
    .slice(0, limit);
}

/* Cross-document name consistency, computed on device from the facts each check returned. */
const normName = (name) => String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((part) => part.length > 1);
export function namesMatch(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x.length || !y.length) return true;
  const setY = new Set(y);
  const shared = x.filter((part) => setY.has(part)).length;
  // Same person if every part of the shorter name appears in the longer one.
  return shared >= Math.min(x.length, y.length);
}

export function crossDocFindings(docs, lang = "en") {
  const checked = (docs || []).filter((doc) => doc.check?.facts?.primaryName);
  const out = [];
  for (let i = 1; i < checked.length; i += 1) {
    const doc = checked[i];
    const firstDifferent = checked.slice(0, i).find((other) => !namesMatch(other.check.facts.primaryName, doc.check.facts.primaryName));
    if (!firstDifferent) continue;
    const a = firstDifferent.check.facts.primaryName;
    const b = doc.check.facts.primaryName;
    out.push({
      code: "name_mismatch",
      severity: "medium",
      itemId: doc.itemId,
      docId: doc.id,
      source: "device",
      message: lang === "es" ? `El nombre "${b}" no coincide con "${a}" en otro documento.` : `The name "${b}" differs from "${a}" on another document.`,
      fix: lang === "es" ? "Usa el mismo nombre en todo el paquete, o incluye el documento que explica el cambio (por ejemplo, acta de matrimonio o decreto de cambio de nombre)." : "Use the same name across the packet, or include the document that explains the change (for example a marriage certificate or a name-change order)."
    });
  }
  return out;
}

export function readinessBand(score) {
  if (score >= 85) return "high";
  if (score >= 55) return "medium";
  return "low";
}
