/*
 * Civics practice logic (pure, no DOM). Question text comes only from the official USCIS banks served by
 * /api/extras/civics; nothing here writes questions or answers.
 *
 * Official rules (uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test):
 *   2025 test (N-400 filed on or after Oct. 20, 2025): up to 20 of 128 questions, pass at 12 correct, stop at 9 wrong.
 *   2008 test (filed before Oct. 20, 2025): up to 10 of 100 questions, pass at 6 correct, stop at 5 wrong.
 */
export const CUTOFF_2025 = "2025-10-20";
export const RULES = {
  "2025": { bank: 128, asked: 20, pass: 12, failAt: 9 },
  "2008": { bank: 100, asked: 10, pass: 6, failAt: 5 }
};

/* Which bank applies to an N-400 filing date (YYYY-MM-DD). Null when there is no valid date. */
export function versionForFilingDate(date) {
  const text = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return null;
  return text >= CUTOFF_2025 ? "2025" : "2008";
}

export function rulesFor(version, meta) {
  const base = RULES[version] || RULES["2025"];
  return { ...base, ...(meta ? { asked: meta.asked ?? base.asked, pass: meta.pass ?? base.pass, failAt: meta.failAt ?? base.failAt } : {}) };
}

/* Deterministic shuffle when given a seeded rng (tests), Math.random otherwise. */
export function shuffle(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* The question numbers for one practice session. starredOnly = the 65/20 list (65+ with 20 years as LPR). */
export function pickQuestions(questions, count, { rng = Math.random, starredOnly = false } = {}) {
  const pool = (questions || []).filter((q) => !starredOnly || q.star);
  return shuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length))).map((q) => q.n);
}

/*
 * Score a self-graded session. results = array of true (correct) / false (wrong), in order.
 * The officer stops as soon as you pass or can no longer pass, so does this.
 */
export function scoreSession(results, rules) {
  let correct = 0;
  let wrong = 0;
  let asked = 0;
  for (const ok of results || []) {
    if (asked >= rules.asked || correct >= rules.pass || wrong >= rules.failAt) break;
    asked += 1;
    if (ok) correct += 1;
    else wrong += 1;
  }
  const passed = correct >= rules.pass;
  const failed = !passed && (wrong >= rules.failAt || asked >= rules.asked);
  return { correct, wrong, asked, passed, failed, done: passed || failed, remaining: rules.asked - asked };
}

/* Topics in bank order with counts, e.g. AMERICAN GOVERNMENT / Principles of American Government. */
export function topicsOf(questions) {
  const out = [];
  const seen = new Map();
  for (const q of questions || []) {
    const key = `${q.topic}|${q.subtopic || ""}`;
    if (!seen.has(key)) {
      const row = { key, topic: q.topic, subtopic: q.subtopic || "", topicEs: q.topicEs || "", count: 0 };
      seen.set(key, row);
      out.push(row);
    }
    seen.get(key).count += 1;
  }
  return out;
}

export function questionsInTopic(questions, key) {
  return (questions || []).filter((q) => `${q.topic}|${q.subtopic || ""}` === key);
}

/* What to show as the answer. For answers that change, the official bank text says to check testupdates;
 * `current` (copied from uscis.gov/citizenship/testupdates) is shown alongside with a "check before your interview" flag. */
export function answerView(q) {
  return {
    official: q.answers || [],
    changes: Boolean(q.changes),
    current: q.current || [],
    find: q.find || "",
    note: q.note || ""
  };
}

/* Next flashcard index (wraps). */
export function nextCard(index, total, step = 1) {
  if (!total) return 0;
  return ((index + step) % total + total) % total;
}
