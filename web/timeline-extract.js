/*
 * Conservative milestone extraction from public post titles (r/USCIS, r/USCIS_FORUM).
 * Only completed intervals that a title states outright are kept. Questions, "still pending",
 * "no update", denials, and ambiguous multi-form titles are skipped on purpose.
 * Output feeds web/data/timelines.json via scripts/build-data.mjs.
 */

export const TIMELINE_FORMS = ["I-485", "I-130", "I-751", "N-400", "I-765", "I-131"];
export const MILESTONES = ["filed_to_biometrics", "filed_to_interview", "filed_to_approval", "interview_to_approval", "interview_to_oath"];
export const MIN_SAMPLE = 10;

const MONTH_DAYS = 30.44;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

const FORM_TESTS = [
  ["I-485", /\bi[-\s]?485\b|\baos\b|adjustment of status|green ?card (?:approved|received|in hand)|\bgreened\b/i],
  ["I-130", /\bi[-\s]?130\b/i],
  ["I-751", /\bi[-\s]?751\b|\broc\b|removal of conditions/i],
  ["N-400", /\bn[-\s]?400\b|naturali[sz]ation|citizenship|\boath\b/i],
  ["I-765", /\bi[-\s]?765\b|\bead\b|work permit/i],
  ["I-131", /\bi[-\s]?131\b|advance parole|\bap\b|reentry permit/i]
];
const OTHER_FORMS = /\bi[-\s]?129f?\b|\bk-?1\b|\bi[-\s]?140\b|\bi[-\s]?526\b|\bi[-\s]?589\b|\basylum\b|\bdaca\b|\bi[-\s]?90\b|\bn[-\s]?600\b|\bi[-\s]?539\b|\bopt\b|\bh-?1b\b|\bnvc\b|\bconsular\b|\bi[-\s]?601a?\b|\bi[-\s]?360\b|\bvawa\b|\bi[-\s]?824\b/i;

const FLAIR_FORMS = [
  [/^I-130 & I-485|^I-140 & I-485|^I-485/i, "I-485"],
  [/^N-400|^Timeline: Citizenship/i, "N-400"],
  [/^I-751/i, "I-751"],
  [/^I-765|^Timeline: EAD/i, "I-765"],
  [/^I-130 \(Family\/Consul/i, "I-130"],
  [/^I-131/i, "I-131"]
];

/* One form, or "" when the title is ambiguous or about a form we don't chart. */
export function detectForm(title, flair = "") {
  const text = String(title || "");
  const found = new Set(FORM_TESTS.filter(([, test]) => test.test(text)).map(([form]) => form));
  // Concurrent family filings are charted as the I-485 (that is the green card decision).
  if (found.has("I-485") && found.has("I-130")) found.delete("I-130");
  if (found.has("I-485") && (found.has("I-765") || found.has("I-131"))) { found.delete("I-765"); found.delete("I-131"); }
  if (found.has("N-400") && /\boath\b/i.test(text) && found.size > 1 && !/\bn[-\s]?400\b|naturali|citizenship/i.test(text)) found.delete("N-400");
  if (found.size > 1) return "";
  if (found.size === 1) {
    if (OTHER_FORMS.test(text)) return "";
    return [...found][0];
  }
  if (OTHER_FORMS.test(text)) return "";
  for (const [test, form] of FLAIR_FORMS) if (test.test(String(flair || ""))) return form;
  return "";
}

const DUR = String.raw`(\d{1,3}(?:\.\d)?)\s*(days?|d\b|weeks?|wks?|months?|mos?)(?:\s*(?:and|,|&)?\s*(\d{1,2})\s*(days?|weeks?))?`;
const durRe = () => new RegExp(DUR, "i");

export function toDays(value, unit, extraValue, extraUnit) {
  const n = Number(value);
  const u = String(unit || "").toLowerCase();
  let days = /^d/.test(u) ? n : /^w/.test(u) ? n * 7 : n * MONTH_DAYS;
  if (extraValue) days += /^w/i.test(extraUnit || "") ? Number(extraValue) * 7 : Number(extraValue);
  return Math.round(days);
}

const SKIP = /\?|\bno\b[^|]{0,20}\bupdates?\b|\bbut\b|\b(pending|still|waiting|no update|stuck|anyone|anybody|is it normal|should i|expect|denied|denial|noid|rfe|request for evidence|not yet|yet to|hoping|when will|how long|will i|reschedul\w*|expired?|expiring|grace period|rule|requirement|law|policy|news|ban|travel ban|abroad|outside the us|out of the us|ago\b)\b/i;
const DONE = /\b(approv\w*|greened|green ?card (?:received|in hand|arrived)|got (?:my|our) green ?card|card (?:received|in hand|produced|arrived)|oath (?:done|taken|completed)|took (?:the|my) oath|sworn in|became a (?:u\.?s\.? )?citizen|naturali[sz]ed)\b/i;

function monthRange(text) {
  // (Sept '25 -> Jan '26), Mar 2025 - Oct 2025, filed March 2025 ... approved October 2025
  const M = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?(?:'|20)?(\d{2})\b`;
  const re = new RegExp(`${M}\\s*(?:->|→|–|—|-|to|until|till)\\s*${M}`, "i");
  const match = text.match(re);
  const filedApproved = new RegExp(`\\bfiled\\s+(?:in\\s+|on\\s+)?${M}.{0,40}?\\bapprov\\w*\\s+(?:in\\s+|on\\s+)?${M}`, "i");
  const m = match || text.match(filedApproved);
  if (!m) return null;
  const a = Date.UTC(2000 + Number(m[2]), MONTHS[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)], 15);
  const b = Date.UTC(2000 + Number(m[4]), MONTHS[m[3].toLowerCase().slice(0, 3)], 15);
  const days = Math.round((b - a) / 86400000);
  return days > 0 ? days : null;
}

const BOUNDS = {
  filed_to_biometrics: [3, 365],
  filed_to_interview: [14, 1095],
  filed_to_approval: [14, 1460],
  interview_to_approval: [0, 730],
  interview_to_oath: [0, 365]
};

/* Returns at most one { form, milestone, days } per title, or null. */
export function extractTimeline(post) {
  const title = String(post?.title || "").replace(/\s+/g, " ").trim();
  if (!title || SKIP.test(title)) return null;
  const form = detectForm(title, post?.flair);
  if (!form) return null;
  const dur = String.raw`~?\s*` + DUR;
  let milestone = "";
  let days = null;
  let m;
  if (/\boath\b/i.test(title) && (m = title.match(new RegExp(`(?:interview\\s*(?:to|->|→)\\s*oath|oath[^|]{0,30}?\\b${dur}\\s*(?:after|post)\\s*(?:the\\s*|my\\s*)?interview)`, "i")))) {
    const d = title.match(new RegExp(`(?:interview\\s*(?:to|->|→)\\s*oath)[^\\d]{0,20}${dur}`, "i")) || m;
    const idx = d[1] && !/^\d/.test(d[1]) ? 2 : 1;
    if (d[idx]) { milestone = "interview_to_oath"; days = toDays(d[idx], d[idx + 1], d[idx + 2], d[idx + 3]); }
  }
  if (!milestone && /\bbiometrics?\b/i.test(title) && (m = title.match(new RegExp(`biometrics?[^|]{0,40}?${dur}\\s*(?:after|from)\\s*(?:filing|applying|submitting|submission)`, "i")))) {
    milestone = "filed_to_biometrics"; days = toDays(m[1], m[2], m[3], m[4]);
  }
  if (!milestone && /\binterview\b/i.test(title) && !DONE.test(title) && (m = title.match(new RegExp(`interview[^|]{0,40}?${dur}\\s*(?:after|from)\\s*(?:filing|applying|submitting|submission)`, "i")))) {
    milestone = "filed_to_interview"; days = toDays(m[1], m[2], m[3], m[4]);
  }
  if (!milestone && DONE.test(title)) {
    const after = title.match(new RegExp(`${dur}\\s*(?:after|post|from)[-\\s]*(?:the\\s*|my\\s*|our\\s*)?interview`, "i"))
      || title.match(new RegExp(`(?:post|after)[-\\s]interview[^|]{0,12}?${dur}`, "i"));
    if (after) {
      milestone = "interview_to_approval"; days = toDays(after[1], after[2], after[3], after[4]);
    } else if (!/\binterview\b/i.test(title) || /\b(?:in|after|within|took)\s*~?\s*\d/i.test(title) || /\btotal\b/i.test(title)) {
      const total = title.match(new RegExp(`(?:approv\\w*|greened|card\\s+\\w+|citizen|naturali[sz]ed|oath)[^|]{0,40}?\\b(?:in|after|within|took|total of)\\s*${dur}`, "i"))
        || title.match(new RegExp(`${dur}\\s*(?:total|from filing|to approval|filing to approval)`, "i"))
        || title.match(new RegExp(`^${dur}[^|]{0,30}?\\b(?:approv\\w*|greened)`, "i"))
        || title.match(new RegExp(`(?:approval|approved)\\s*[-–—:|]?\\s*(?:timeline:?\\s*)?${dur}`, "i"))
        || title.match(new RegExp(`timeline[^|\\d]{0,12}${dur}\\s*(?:wait|total)`, "i"))
        || title.match(new RegExp(`(?:approval|approved)[^|?]{0,40}\\|\\s*${dur}\\s*$`, "i"));
      if (total) { milestone = "filed_to_approval"; days = toDays(total[1], total[2], total[3], total[4]); }
      else {
        const range = monthRange(title);
        if (range) { milestone = "filed_to_approval"; days = range; }
      }
    }
  }
  if (!milestone || days == null || !Number.isFinite(days)) return null;
  if (form !== "N-400" && milestone === "interview_to_oath") return null;
  const [low, high] = BOUNDS[milestone];
  if (days < low || days > high) return null;
  return { form, milestone, days };
}

export function normalizeTitle(title) {
  return String(title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/* Linear-interpolated percentile on a sorted array. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function extractAll(posts) {
  const seen = new Set();
  const rows = [];
  for (const post of posts) {
    const key = normalizeTitle(post.title);
    if (!key || seen.has(key)) continue;
    const hit = extractTimeline(post);
    if (!hit) continue;
    seen.add(key);
    rows.push({ ...hit, title: post.title, href: post.href, date: post.date, sub: post.sub });
  }
  return rows;
}

export function summarize(rows, minSample = MIN_SAMPLE) {
  const forms = {};
  for (const form of TIMELINE_FORMS) {
    forms[form] = {};
    for (const milestone of MILESTONES) {
      const list = rows.filter((row) => row.form === form && row.milestone === milestone);
      const sorted = list.map((row) => row.days).sort((a, b) => a - b);
      const cell = { n: sorted.length };
      if (sorted.length >= minSample) {
        cell.median = Math.round(percentile(sorted, 0.5));
        cell.p25 = Math.round(percentile(sorted, 0.25));
        cell.p75 = Math.round(percentile(sorted, 0.75));
        cell.min = sorted[0];
        cell.max = sorted[sorted.length - 1];
      }
      cell.sources = list.sort((a, b) => b.date.localeCompare(a.date)).map((row) => ({ title: row.title, href: row.href, days: row.days, date: row.date }));
      forms[form][milestone] = cell;
    }
  }
  return forms;
}
