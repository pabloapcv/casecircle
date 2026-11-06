import test from "node:test";
import assert from "node:assert/strict";
import { WEIGHTS, computeReadiness, topFixes, crossDocFindings, namesMatch, readinessBand } from "./readiness.js";
import { buildPlan } from "./builder.js";

const items = [
  { id: "f-form", en: "Form", required: true, kind: "form" },
  { id: "f-fee", en: "Fee", required: true, kind: "other" },
  { id: "f-evidence", en: "Joint evidence", required: true, kind: "evidence" },
  { id: "f-extra", en: "Extra photos", required: false, kind: "identity" }
];

test("weights add to 100", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("empty folder scores 0, full unchecked folder gets half credit for unchecked parts", () => {
  assert.equal(computeReadiness({ items, marks: {}, docs: [] }).score, 0);
  const marks = { "f-form": "ready", "f-fee": "ready", "f-evidence": "ready" };
  const r = computeReadiness({ items, marks, docs: [] });
  assert.equal(r.parts.required.points, 40);
  assert.equal(r.parts.consistency.points, 10);
  assert.equal(r.parts.dates.points, 10);
  assert.equal(r.parts.evidence.points, 10); // ready without a document = half credit
  assert.equal(r.score, 70);
});

test("checked, clean documents reach 100", () => {
  const marks = { "f-form": "ready", "f-fee": "ready", "f-evidence": "ready" };
  const docs = [{ id: "d1", itemId: "f-evidence", check: { status: "matches", findings: [] } }];
  assert.equal(computeReadiness({ items, marks, docs }).score, 100);
});

test("findings lower the right part and are deterministic", () => {
  const marks = { "f-form": "ready", "f-fee": "ready", "f-evidence": "ready" };
  const docs = [
    { id: "d1", itemId: "f-evidence", check: { status: "possible_issue", findings: [{ code: "date_expired", severity: "high", message: "x", fix: "y" }] } },
    { id: "d2", itemId: "f-form", check: { status: "possible_issue", findings: [{ code: "signature_missing", severity: "medium", message: "x", fix: "y" }] } }
  ];
  const a = computeReadiness({ items, marks, docs });
  const b = computeReadiness({ items, marks, docs });
  assert.deepEqual(a, b);
  assert.equal(a.parts.dates.points, 10); // 20 × (1 − 0.5)
  assert.ok(a.parts.required.points < 40); // completeness finding = half credit on that item
  assert.ok(a.score < 100 && a.score > 50);
});

test("a mismatched document does not count as present", () => {
  const docs = [{ id: "d1", itemId: "f-form", check: { status: "mismatch", findings: [{ code: "wrong_document", severity: "high", message: "x", fix: "y" }] } }];
  const r = computeReadiness({ items, marks: {}, docs });
  assert.equal(r.parts.required.points, 0);
});

test("'doesn't apply' items leave the denominator", () => {
  const r = computeReadiness({ items, marks: { "f-form": "ready", "f-fee": "na", "f-evidence": "ready" }, docs: [] });
  assert.equal(r.parts.required.points, 40);
});

test("score is always within 0–100", () => {
  const docs = [{ id: "d1", itemId: "f-evidence", check: { status: "possible_issue", findings: Array.from({ length: 8 }, () => ({ code: "thin_evidence", severity: "high", message: "x", fix: "y" })) } }];
  const r = computeReadiness({ items, marks: { "f-evidence": "ready" }, docs });
  assert.ok(r.score >= 0 && r.score <= 100);
  for (const part of Object.values(r.parts)) assert.ok(part.points >= 0 && part.points <= part.max);
});

test("top fixes are ranked by points and capped", () => {
  const plan = buildPlan("i-485", { basis: "marriage", priorMarriage: "no", withEad: "no", nonEnglish: "no", arrests: "no" });
  const fixes = topFixes({ items: plan.items, marks: {}, docs: [] }, 3);
  assert.equal(fixes.length, 3);
  for (let i = 1; i < fixes.length; i += 1) assert.ok(fixes[i - 1].points >= fixes[i].points);
  assert.ok(fixes.every((fix) => fix.points >= 1));
  const after = topFixes({ items, marks: { "f-form": "ready", "f-fee": "ready" }, docs: [{ id: "d", itemId: "f-evidence", check: { status: "matches", findings: [] } }] });
  assert.equal(after.length, 0);
});

test("resolving a finding is suggested and raises the score", () => {
  const marks = { "f-form": "ready", "f-fee": "ready", "f-evidence": "ready" };
  const docs = [{ id: "d1", itemId: "f-evidence", check: { status: "possible_issue", findings: [{ code: "name_mismatch", severity: "high", message: "Name differs", fix: "Use one name" }] } }];
  const [fix] = topFixes({ items, marks, docs }, 1);
  assert.equal(fix.type, "finding");
  const resolved = [{ ...docs[0], check: { ...docs[0].check, findings: [{ ...docs[0].check.findings[0], resolved: true }] } }];
  assert.ok(computeReadiness({ items, marks, docs: resolved }).score > computeReadiness({ items, marks, docs }).score);
});

test("cross-document name check runs on device", () => {
  assert.ok(namesMatch("Maria Elena Lopez Garcia", "MARIA LOPEZ"));
  assert.ok(!namesMatch("Maria Lopez", "John Smith"));
  const docs = [
    { id: "a", itemId: "x", check: { facts: { primaryName: "Maria Lopez" } } },
    { id: "b", itemId: "y", check: { facts: { primaryName: "Mariana Torres" } } }
  ];
  const found = crossDocFindings(docs, "en");
  assert.equal(found.length, 1);
  assert.equal(found[0].code, "name_mismatch");
  assert.equal(found[0].docId, "b");
});

test("bands", () => {
  assert.equal(readinessBand(90), "high");
  assert.equal(readinessBand(60), "medium");
  assert.equal(readinessBand(10), "low");
});
