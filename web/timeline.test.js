import test from "node:test";
import assert from "node:assert/strict";
import { detectForm, extractTimeline, extractAll, summarize, percentile, toDays, MIN_SAMPLE } from "./timeline-extract.js";

const t = (title, flair = "") => extractTimeline({ title, flair });

test("extracts stated completed intervals", () => {
  assert.deepEqual(t("I-485 approved! Filed Jan 2025 -> Approved Apr 2025"), { form: "I-485", milestone: "filed_to_approval", days: 90 });
  assert.deepEqual(t("I-765 approved in 45 days"), { form: "I-765", milestone: "filed_to_approval", days: 45 });
  assert.equal(t("I-485 approved after 4 months").days, 122);
  assert.equal(t("I-485 approved – timeline 3 months").days, 91);
});

test("skips questions, pending cases, denials and hedged titles", () => {
  assert.equal(t("Still pending I-485 after 6 months?"), null);
  assert.equal(t("I-485 approved in 90 days but no card yet"), null);
  assert.equal(t("I-485 denied after 8 months"), null);
  assert.equal(t("How long did your I-485 take after biometrics"), null);
  assert.equal(t("RFE on I-485 after 3 months"), null);
  assert.equal(t("Got my K-1 approved in 5 months"), null);
});

test("form detection is conservative", () => {
  assert.equal(detectForm("I-130 and I-485 approved"), "I-485");
  assert.equal(detectForm("I-140 approved, I-485 pending"), "");
  assert.equal(detectForm("Removal of conditions done"), "I-751");
  assert.equal(detectForm("Approved!", "N-400 (Naturalization)"), "N-400");
  assert.equal(detectForm("Approved!", ""), "");
});

test("durations", () => {
  assert.equal(toDays(2, "weeks"), 14);
  assert.equal(toDays(3, "months"), 91);
  assert.equal(toDays(1, "month", 10, "days"), 40);
});

test("dedupes reposts and summarizes only from 10 posts", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ title: `I-485 approved in ${60 + i * 10} days`, href: `https://www.reddit.com/r/USCIS/comments/x${i}/`, date: "2026-01-01" }));
  rows.push({ ...rows[0], href: "https://www.reddit.com/r/USCIS/comments/dupe/" });
  const all = extractAll(rows);
  assert.equal(all.length, 12);
  const cell = summarize(all)["I-485"].filed_to_approval;
  assert.equal(cell.n, 12);
  assert.equal(cell.median, Math.round(percentile(all.map((r) => r.days).sort((a, b) => a - b), 0.5)));
  assert.ok(cell.p25 <= cell.median && cell.median <= cell.p75);
  assert.ok(cell.sources.every((row) => row.href.startsWith("https://www.reddit.com/")));
  const thin = summarize(all.slice(0, MIN_SAMPLE - 1))["I-485"].filed_to_approval;
  assert.equal(thin.n, MIN_SAMPLE - 1);
  assert.equal(thin.median, undefined);
});

test("percentile is linear", () => {
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentile([10], 0.75), 10);
});
