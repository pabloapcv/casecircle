#!/usr/bin/env node
/*
 * Builds web/data/timelines.json and web/data/insights.json from the bundled public post titles
 * (reddit-posts.js: r/USCIS and r/USCIS_FORUM). Deterministic: same input, same output.
 * Usage (from web/): node scripts/build-data.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redditPosts } from "../reddit-posts.js";
import { redditStats } from "../reddit.js";
import { MIN_SAMPLE, TIMELINE_FORMS, detectForm, extractAll, normalizeTitle, summarize } from "../timeline-extract.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data");
mkdirSync(out, { recursive: true });

// Raw rows keep the full flair (reddit.js trims long flairs for display).
const posts = redditPosts.map((row) => ({ sub: row[0], date: row[1], title: row[2], href: row[3], score: row[4], comments: row[5], flair: row[6] || "" }));
const range = { from: posts.reduce((a, p) => (p.date < a ? p.date : a), "9999"), to: posts.reduce((a, p) => (p.date > a ? p.date : a), "0000") };
const unique = [];
const seen = new Set();
for (const post of posts) {
  const key = normalizeTitle(post.title);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  unique.push(post);
}

const rows = extractAll(posts);
const timelines = {
  generatedBy: "web/scripts/build-data.mjs",
  label: { en: "From public posts, self-reported, not official", es: "De publicaciones públicas, autodeclarado, no oficial" },
  source: { posts: posts.length, uniqueTitles: unique.length, from: range.from, to: range.to, subs: ["r/USCIS", "r/USCIS_FORUM"], fields: "titles only" },
  minSample: MIN_SAMPLE,
  method: "Conservative regex rules over post titles. Kept only completed intervals stated outright (for example 'approved in 103 days', 'approved after 11 months', 'Sept \u201925 -> Jan \u201926'). Skipped questions, pending or 'no update' posts, denials and RFEs, and titles that name more than one form (I-130 + I-485 together counts as I-485). Duplicate titles across both subreddits count once. Months are 30.44 days.",
  extracted: rows.length,
  forms: summarize(rows)
};
writeFileSync(join(out, "timelines.json"), JSON.stringify(timelines, null, 1) + "\n");

// ── Insights: what people ask per form, and RFE topics — counts from titles, not invented ──
const QUESTION_TOPICS = [
  ["interview", /\binterview\w*\b/i, "Interview", "Entrevista"],
  ["timeline", /\b(how long|timeline|wait\w*|processing time|still pending|pending|no update|silent update|\bsu\b)\b/i, "Waiting and timelines", "Espera y tiempos"],
  ["biometrics", /\bbiometric\w*\b/i, "Biometrics", "Biometría"],
  ["rfe", /\brfe\b|request for evidence|\bnoid\b/i, "RFEs and NOIDs", "RFE y NOID"],
  ["travel", /\btravel\w*|advance parole|\bap\b|reentry|abroad|leave the (us|country)\b/i, "Travel while pending", "Viajar con el caso pendiente"],
  ["work", /\bwork permit|\bead\b|employment authori|\bjob\b|\bwork\b/i, "Work permit", "Permiso de trabajo"],
  ["documents", /\b(document\w*|evidence|certificate|translation|photos?|i-?864|affidavit|tax\w*|medical|i-?693)\b/i, "Documents and evidence", "Documentos y pruebas"],
  ["status", /\b(case status|status (changed|update)|case was|actively reviewed|transferred|fta|card (is being )?produced)\b/i, "Reading status updates", "Leer actualizaciones"],
  ["address", /\b(address|moved|move)\b/i, "Address changes", "Cambio de dirección"],
  ["fees", /\bfees?\b|\bpayment\b|\bcheck cashed\b/i, "Fees and payment", "Tarifas y pago"],
  ["oath", /\boath\b/i, "Oath ceremony", "Juramento"],
  ["expedite", /\bexpedit\w*\b|\bcongress\w*\b|\binquiry\b|\bombudsman\b/i, "Expedite and inquiries", "Agilizar y consultas"]
];
const questions = unique.filter((post) => /\?/.test(post.title));
const perForm = {};
for (const form of TIMELINE_FORMS) {
  const list = questions.filter((post) => detectForm(post.title, post.flair) === form);
  const topics = QUESTION_TOPICS.map(([id, test, en, es]) => {
    const hits = list.filter((post) => test.test(post.title));
    return { id, en, es, count: hits.length, examples: hits.sort((a, b) => (b.comments - a.comments) || b.date.localeCompare(a.date)).slice(0, 2).map((post) => ({ title: post.title, href: post.href })) };
  }).filter((topic) => topic.count > 0).sort((a, b) => b.count - a.count);
  perForm[form] = { questions: list.length, topics: topics.slice(0, 4) };
}

const RFE_TOPICS = [
  ["support", /\bi-?864\b|affidavit of support|\bincome\b|\bsponsor\b|joint sponsor|tax (return|transcript)/i, "Affidavit of support / income", "Declaración de apoyo / ingresos"],
  ["medical", /\bi-?693\b|\bmedical\b|vaccin\w*/i, "Medical exam (I-693) / vaccines", "Examen médico (I-693) / vacunas"],
  ["bonafide", /bona ?fide|\bmarriage\b|\brelationship\b|\bjoint\b/i, "Proof of a real marriage", "Prueba de matrimonio real"],
  ["civil", /birth certificate|\bcivil\b|divorce|marriage certificate|\bpassport\b/i, "Civil documents (birth, marriage, divorce)", "Documentos civiles (nacimiento, matrimonio, divorcio)"],
  ["status", /\bi-?94\b|maintain\w* status|\bstatus\b|\bentry\b|\bparole\b|\boverstay\b/i, "Status and entry records", "Estatus y registros de entrada"],
  ["employment", /\bemploy\w*|\bjob\b|\bexperience letter\b|\bability to pay\b|\bi-?140\b/i, "Employment evidence", "Pruebas de empleo"],
  ["criminal", /\barrest\w*|\bcourt\b|\bpolice\b|\bcriminal\b|\bdui\b/i, "Court or police records", "Registros judiciales o policiales"],
  ["translation", /\btranslat\w*/i, "Translations", "Traducciones"]
];
const rfePosts = unique.filter((post) => /\brfe\b|request for evidence|\bnoid\b|notice of intent to deny/i.test(post.title));
const rfeTopics = RFE_TOPICS.map(([id, test, en, es]) => {
  const hits = rfePosts.filter((post) => test.test(post.title));
  return { id, en, es, count: hits.length, examples: hits.slice(0, 2).map((post) => ({ title: post.title, href: post.href })) };
}).filter((topic) => topic.count > 0).sort((a, b) => b.count - a.count);
const rfeByForm = Object.fromEntries(TIMELINE_FORMS.map((form) => [form, rfePosts.filter((post) => detectForm(post.title, post.flair) === form).length]));

const insights = {
  generatedBy: "web/scripts/build-data.mjs",
  label: { en: "From public posts, self-reported, not official", es: "De publicaciones públicas, autodeclarado, no oficial" },
  source: { posts: posts.length, uniqueTitles: unique.length, questions: questions.length, from: range.from, to: range.to, fields: "titles only" },
  datasetWide: { posts: redditStats.posts, from: redditStats.from, to: redditStats.to, note: "Theme counts across the full 12-month pull (reddit.js redditStats)." },
  questionsByForm: perForm,
  rfe: { posts: rfePosts.length, byForm: rfeByForm, topics: rfeTopics, note: "A title can mention more than one topic." }
};
writeFileSync(join(out, "insights.json"), JSON.stringify(insights, null, 1) + "\n");

const counts = Object.fromEntries(Object.entries(timelines.forms).map(([form, cells]) => [form, Object.fromEntries(Object.entries(cells).map(([m, c]) => [m, c.n]))]));
console.log(JSON.stringify({ extracted: rows.length, counts, rfe: rfePosts.length, questions: questions.length }, null, 1));
