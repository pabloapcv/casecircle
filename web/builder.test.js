import test from "node:test";
import assert from "node:assert/strict";
import { BUILDER_FORMS, buildPlan, inferFromDescription, mergeAiPlan, nextQuestion, questionsFor } from "./builder.js";
import { TOOLS_TEXT_KEYS, toolsText } from "./tools-text.js";
import { waitPosition, rangeBar, OFFICIAL } from "./insights.js";
import { folderSummaryHtml } from "./summary.js";

test("every builder form has questions and a plan with reasons for rule items", () => {
  for (const id of BUILDER_FORMS) {
    assert.ok(questionsFor(id).length >= 1, id);
    const plan = buildPlan(id, {});
    assert.ok(plan.items.some((item) => item.required), id);
    for (const item of plan.items) if (item.source === "rule") assert.ok(item.reason?.en && item.reason?.es, item.id);
    for (const row of plan.removed) assert.ok(row.reason?.en && row.reason?.es, row.id);
  }
});

test("answers change the list deterministically", () => {
  const married = buildPlan("i-485", { basis: "marriage", priorMarriage: "yes", nonEnglish: "yes" });
  const ids = married.items.map((item) => item.id);
  assert.ok(ids.includes("i485-marriage"));
  assert.ok(ids.includes("i485-divorce"));
  assert.ok(ids.includes("i485-translations"));
  assert.deepEqual(buildPlan("i-485", { basis: "marriage", priorMarriage: "yes", nonEnglish: "yes" }), married);
  const work = buildPlan("i-485", { basis: "employment", priorMarriage: "no" });
  assert.ok(!work.items.some((item) => item.id === "i485-marriage"));
  assert.ok(work.removed.some((item) => item.id === "i485-marriage"));
});

test("nextQuestion walks the intake", () => {
  const first = nextQuestion("n-400", {});
  assert.ok(first);
  assert.notEqual(nextQuestion("n-400", { [first.id]: first.options[0].value })?.id, first.id);
});

test("description inference stays on device and only fills confident answers", () => {
  const out = inferFromDescription("I married my U.S. citizen wife last year and want my green card. I was divorced before; my birth certificate is in Spanish.");
  assert.equal(out.form, "i-485");
  assert.equal(out.answers.basis, "marriage");
  assert.equal(out.answers.priorMarriage, "yes");
  assert.equal(out.answers.nonEnglish, "yes");
  assert.equal(inferFromDescription("hello").form, "");
});

test("AI plan merge never removes required items", () => {
  const plan = buildPlan("i-485", { basis: "marriage" });
  const required = plan.items.find((item) => item.required);
  const optional = plan.items.find((item) => !item.required);
  const merged = mergeAiPlan(plan, { add: [{ label: "Wedding photos", reason: "Shows the relationship", kind: "evidence" }], remove: [{ id: required.id, reason: "x" }, { id: optional.id, reason: "Not needed" }] });
  assert.ok(merged.items.some((item) => item.id === required.id));
  assert.ok(!merged.items.some((item) => item.id === optional.id));
  const added = merged.items.find((item) => item.source === "ai");
  assert.equal(added.id, "ai-wedding-photos");
  assert.equal(mergeAiPlan(merged, { add: [{ label: "wedding photos", reason: "dupe" }] }).items.filter((item) => item.source === "ai").length, 1);
});

test("tools copy is bilingual and never frames the score as a prediction", () => {
  const banned = /approval chance|chance of approval|likelihood|odds|probabilidad|posibilidades de aprobaci/i;
  for (const key of TOOLS_TEXT_KEYS) {
    const en = toolsText("en", key);
    const es = toolsText("es", key);
    assert.ok(en && es, key);
    assert.ok(!banned.test(en) && !banned.test(es), key);
  }
  assert.equal(toolsText("en", "readinessTitle"), "Folder readiness");
  assert.equal(toolsText("es", "readinessTitle"), "Preparación de la carpeta");
  assert.equal(toolsText("en", "readinessNote"), "This scores how complete and consistent your folder is. It can't predict USCIS's decision.");
});

test("wait position compares with public posts only when n ≥ 10, and never invents official numbers", () => {
  const sources = Array.from({ length: 12 }, (_, i) => ({ days: 60 + i * 10 }));
  const timelines = { forms: { "I-485": { filed_to_approval: { n: 12, median: 115, p25: 87, p75: 142, min: 60, max: 170, sources } }, "I-130": { filed_to_approval: { n: 3, sources: [] } } } };
  const today = new Date(Date.UTC(2026, 10, 5));
  const pos = waitPosition({ form: "I-485", filed: "2026-07-01", today, timelines, official: null });
  assert.equal(pos.days, 127);
  assert.equal(pos.official.available, false);
  assert.equal(pos.publicPosts.n, 12);
  assert.equal(pos.publicPosts.pct, 58);
  assert.ok(rangeBar(pos.publicPosts, pos.days).you > 0);
  const thin = waitPosition({ form: "I-130", filed: "2026-01-01", today, timelines });
  assert.equal(thin.publicPosts.thin, true);
  assert.equal(waitPosition({ form: "I-485", filed: "2027-01-01", today, timelines }).error, "future");
  const live = waitPosition({ form: "I-485", filed: "2026-01-01", today, timelines, official: { source: "live", fetchedAt: "2026-11-05", data: { subtypes: [{ name: "Family", months: 9.5 }] } } });
  assert.equal(live.official.available, true);
  assert.equal(live.official.past, true);
  for (const url of Object.values(OFFICIAL)) assert.match(url, /^https:\/\/(egov\.uscis\.gov|www\.uscis\.gov|www\.dhs\.gov|www\.house\.gov)\//);
});

test("printable summary carries the disclaimer and no prediction wording", () => {
  const html = folderSummaryHtml({ lang: "en", form: "I-485", title: "Adjustment of status", items: [{ id: "a", en: "Form", es: "Formulario", required: true }], marks: { a: "ready" }, docs: [], readiness: { score: 40, parts: { required: { points: 40, max: 40 }, consistency: { points: 0, max: 20 }, dates: { points: 0, max: 20 }, evidence: { points: 0, max: 20 } } }, fixes: [] });
  assert.match(html, /not affiliated with USCIS/);
  assert.match(html, /can&#39;t predict USCIS&#39;s decision/);
  assert.doesNotMatch(html, /likelihood|odds|approval chance/i);
});
