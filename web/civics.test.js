import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULES, versionForFilingDate, rulesFor, pickQuestions, scoreSession, seeded, topicsOf, questionsInTopic, nextCard } from "./civics.js";

const bank = JSON.parse(readFileSync(new URL("./data/premium/civics.json", import.meta.url), "utf8"));

describe("civics banks (official files)", () => {
  it("has 128 questions for 2025 and 100 for 2008, numbered in order, 20 starred each", () => {
    for (const [version, size] of [["2025", 128], ["2008", 100]]) {
      const qs = bank.versions[version].questions;
      assert.equal(qs.length, size);
      assert.deepEqual(qs.map((q) => q.n), Array.from({ length: size }, (_, i) => i + 1));
      assert.equal(qs.filter((q) => q.star).length, 20);
      assert.ok(qs.every((q) => q.q && q.answers.length));
    }
    assert.equal(bank.versions["2025"].asked, 20);
    assert.equal(bank.versions["2025"].pass, 12);
    assert.equal(bank.versions["2008"].asked, 10);
    assert.equal(bank.versions["2008"].pass, 6);
  });
  it("flags the answers that change and carries the current officials", () => {
    const q25 = bank.versions["2025"].questions;
    assert.ok(q25.find((q) => q.n === 38).changes);
    assert.ok(q25.find((q) => q.n === 38).current.length);
    const q08 = bank.versions["2008"].questions;
    assert.ok(q08.find((q) => q.n === 28).changes);
    assert.ok(q08.every((q) => q.es && q.es.q), "2008 bank carries the official USCIS Spanish");
  });
  it("includes the reading and writing vocabulary lists", () => {
    assert.ok(bank.vocab.reading && bank.vocab.writing);
  });
});

describe("civics logic", () => {
  it("picks the bank from the N-400 filing date", () => {
    assert.equal(versionForFilingDate("2025-10-20"), "2025");
    assert.equal(versionForFilingDate("2025-10-19"), "2008");
    assert.equal(versionForFilingDate(""), null);
    assert.equal(versionForFilingDate("10/20/2025"), null);
  });
  it("scores 2025 sessions: pass at 12, stop at 9 wrong, 20 max", () => {
    const rules = rulesFor("2025");
    assert.deepEqual(RULES["2025"], { bank: 128, asked: 20, pass: 12, failAt: 9 });
    const pass = scoreSession(Array(12).fill(true).concat([false, false]), rules);
    assert.equal(pass.passed, true);
    assert.equal(pass.asked, 12, "stops once 12 are correct");
    const fail = scoreSession(Array(9).fill(false).concat([true]), rules);
    assert.equal(fail.failed, true);
    assert.equal(fail.asked, 9);
    const mixed = scoreSession([...Array(11).fill(true), ...Array(8).fill(false)], rules);
    assert.equal(mixed.done, false);
    assert.equal(mixed.remaining, 1);
    assert.equal(scoreSession([...Array(11).fill(true), ...Array(9).fill(false)], rules).failed, true);
  });
  it("scores 2008 sessions: pass at 6 of 10", () => {
    const rules = rulesFor("2008");
    assert.equal(scoreSession([true, false, true, true, false, true, true, true], rules).passed, true);
    assert.equal(scoreSession([false, false, false, false, false], rules).failed, true);
    assert.equal(scoreSession([true, true, true, true, true, false, false, false, false], rules).done, false);
  });
  it("draws distinct questions, optionally only the 65/20 starred ones", () => {
    const qs = bank.versions["2025"].questions;
    const pick = pickQuestions(qs, 20, { rng: seeded(7) });
    assert.equal(new Set(pick).size, 20);
    const starred = pickQuestions(qs, 50, { rng: seeded(3), starredOnly: true });
    assert.equal(starred.length, 20);
    assert.ok(starred.every((n) => qs.find((q) => q.n === n).star));
  });
  it("groups by topic and wraps flashcards", () => {
    const qs = bank.versions["2025"].questions;
    const topics = topicsOf(qs);
    assert.equal(topics.reduce((sum, t) => sum + t.count, 0), 128);
    assert.equal(questionsInTopic(qs, topics[0].key).length, topics[0].count);
    assert.equal(nextCard(127, 128), 0);
    assert.equal(nextCard(0, 128, -1), 127);
  });
});
