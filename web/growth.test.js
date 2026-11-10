import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GROWTH_TEXT_KEYS, growthText, growthTextEntry } from "./growth-text.js";
import { TWIN_FORMS, TWIN_OFFICES, cohortFrom, monthKey, sameCohort, twinIssue, twinsView } from "./twins.js";
import { CARD_SIZE, cardModel, cleanCardName, drawCard, monthsBetween, shareLinks, shareUrl } from "./approval-card.js";

describe("growth copy", () => {
  it("has English and Spanish for every key", () => {
    for (const key of GROWTH_TEXT_KEYS) {
      const [en, es] = growthTextEntry(key);
      assert.ok(en && es, key);
      assert.notEqual(en, es, key);
    }
  });
  it("keeps the disclaimers in the card and the twins privacy note", () => {
    for (const lang of ["en", "es"]) {
      assert.match(growthText(lang, "cardFine"), /USCIS/);
      assert.match(growthText(lang, "cardFine"), /legal/i);
      assert.match(growthText(lang, "twinsPrivacy"), /legal/i);
    }
  });
});

describe("case twins helpers", () => {
  it("builds a cohort from a case profile or Check the wait", () => {
    assert.deepEqual(cohortFrom({ form: "I-485", officeId: "miami", filed: "2026-03-01T00:00:00.000Z" }), { form: "I-485", officeId: "miami", month: "2026-03" });
    assert.deepEqual(cohortFrom({ form: "N-400", office: "HOU", filed: "2025-11-17" }), { form: "N-400", officeId: "houston", month: "2025-11" });
    assert.deepEqual(cohortFrom({ form: "X-1", officeId: "unsure", filed: "" }), { form: "", officeId: "", month: "" });
    assert.equal(TWIN_OFFICES.includes("unsure"), false);
    assert.ok(TWIN_FORMS.includes("I-485"));
  });
  it("validates like the server", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    assert.equal(twinIssue({ form: "I-485", officeId: "miami", month: "2026-03" }, now), "");
    assert.equal(twinIssue({ form: "I-999", officeId: "miami", month: "2026-03" }, now), "twin_form");
    assert.equal(twinIssue({ form: "I-485", officeId: "unsure", month: "2026-03" }, now), "twin_office");
    assert.equal(twinIssue({ form: "I-485", officeId: "miami", month: "2026-12" }, now), "twin_month");
    assert.equal(twinIssue({ form: "I-485", officeId: "miami", month: "" }, now), "twin_month");
    assert.equal(monthKey("2026-03-14"), "2026-03");
  });
  it("never shows exactly one other person", () => {
    assert.deepEqual(twinsView({ others: 0, handles: [] }), { kind: "first", others: 0, handles: [] });
    assert.deepEqual(twinsView({ others: 1, handles: ["solo"] }), { kind: "first", others: 0, handles: [] });
    const four = twinsView({ others: 4, handles: ["a", "b", "c", "d"] });
    assert.equal(four.kind, "count");
    assert.equal(four.more, false);
    const many = twinsView({ others: 20, plus: true, handles: Array.from({ length: 12 }, (_, i) => `h${i}`) });
    assert.equal(many.kind, "plus");
    assert.equal(many.handles.length, 9);
    assert.equal(many.more, true);
    assert.ok(sameCohort({ form: "I-485", officeId: "miami", month: "2026-03" }, { form: "I-485", officeId: "miami", month: "2026-03-01" }));
  });
  it("words the count with no exact dates", () => {
    const line = growthText("en", "twinsCount", { n: 4, form: "I-485", office: "Miami, FL", month: "Mar 2026" });
    assert.equal(line, "4 others filed I-485 at Miami, FL in Mar 2026");
    assert.match(growthText("es", "twinsFirst", { form: "I-485", office: "Miami, FL", month: "mar 2026" }), /^Sé el primero/);
  });
});

describe("approval card", () => {
  const t = (key, vars) => growthText("en", key, vars);
  it("counts months from filing month to approval month", () => {
    assert.equal(monthsBetween("2025-03-01T00:00:00Z", "2026-01-01T00:00:00Z"), 10);
    assert.equal(monthsBetween("2026-03", "2026-03"), 0);
    assert.equal(monthsBetween("2026-04", "2026-03"), null);
    assert.equal(monthsBetween("", "2026-03"), null);
  });
  it("keeps names short and plain", () => {
    assert.equal(cleanCardName("  María  José <script>"), "María José script");
    assert.equal(cleanCardName("ana_m"), "ana_m");
    assert.equal(cleanCardName("x".repeat(40)).length, 24);
  });
  it("links back to casecircle.us, with a referral code only when one exists", () => {
    assert.equal(shareUrl(), "https://casecircle.us/");
    assert.equal(shareUrl("ANA2026"), "https://casecircle.us/?ref=ANA2026");
    assert.equal(shareUrl("bad code!"), "https://casecircle.us/");
    const links = shareLinks("Approved!", "https://casecircle.us/");
    assert.equal(links.whatsapp, "https://wa.me/?text=Approved!%20https%3A%2F%2Fcasecircle.us%2F");
    assert.equal(links.facebook, "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fcasecircle.us%2F");
  });
  it("shows only form, months, optional office and name, the link and the small print", () => {
    const model = cardModel({ t, form: "I-485", formName: "Adjustment of status", months: 8, office: "Miami, FL", name: "Maria" });
    assert.equal(model.months, "Approved in 8 months");
    assert.equal(model.name, "Shared by Maria");
    assert.equal(model.url, "casecircle.us");
    assert.equal(cardModel({ t, form: "N-400", months: 1 }).months, "Approved in 1 month");
    assert.equal(cardModel({ t, form: "N-400", months: 0 }).name, "");
    const calls = [];
    const ctx = new Proxy({ measureText: (s) => ({ width: String(s).length * 10 }) }, {
      get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); },
      set(target, key, value) { target[key] = value; return true; }
    });
    const drawn = drawCard(ctx, model);
    assert.deepEqual(drawn, ["CaseCircle", "Approved!", "I-485", "Adjustment of status", "Approved in 8 months", "Miami, FL", "Shared by Maria", t("cardCta"), "casecircle.us", t("cardFine")]);
    assert.ok(calls.some(([name, , , w]) => name === "fillRect" && w === CARD_SIZE));
    assert.ok(drawn.every((line) => !/\b[A-Z]{3}\d{10}\b|\bA\d{8,9}\b|@/.test(line)), "no receipt, A-number or email");
  });
  it("is bilingual", () => {
    const es = cardModel({ t: (k, v) => growthText("es", k, v), form: "I-485", months: 8 });
    assert.equal(es.headline, "¡Aprobado!");
    assert.equal(es.months, "Aprobado en 8 meses");
    assert.match(es.fine, /no está afiliado a USCIS/);
  });
});
