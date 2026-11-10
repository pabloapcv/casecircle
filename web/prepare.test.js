import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateRiskFlags, calculateScore, packetFor, parseRFE, tally } from "./prepare.js";
import { statusDecoder } from "./questions.js";

describe("folder scoring and RFE helper", () => {
  it("scores a folder from ready marks", () => {
    const packet = packetFor("i-485");
    const folder = { marks: {}, focus: packet.sections[0].id };
    assert.equal(calculateScore(packet, folder), 0);
    const first = packet.sections[0].items[0];
    folder.marks[first.id] = "ready";
    const counts = tally(packet, folder);
    assert.equal(counts.ready, 1);
    assert.ok(calculateScore(packet, folder) > 0);
    assert.ok(calculateScore(packet, folder) < 100);
  });

  it("parses common RFE evidence into a checklist", () => {
    const parsed = parseRFE("en", "Please send your birth certificate, marriage certificate, and a copy of your passport. Include tax transcripts.");
    assert.ok(parsed.items.length >= 4);
    const labels = parsed.items.map((item) => item.text).join(" ").toLowerCase();
    assert.match(labels, /birth certificate/);
    assert.match(labels, /marriage certificate/);
    assert.match(labels, /passport/);
    assert.match(labels, /tax/);
  });

  it("blocks identifiers pasted into the RFE helper", () => {
    const parsed = parseRFE("en", "Respond with receipt IOE1234567890 and your birth certificate.");
    assert.equal(parsed.items.length, 1);
    assert.match(parsed.items[0].text, /identifier/i);
  });

  it("does not invent an I-693 expiry countdown (Policy Manual: a signed I-693 no longer expires on a timer)", () => {
    const filed = new Date();
    filed.setMonth(filed.getMonth() - 26);
    const flags = calculateRiskFlags("en", { spaceId: "i-485", filed: filed.toISOString(), stage: "filed" }, { marks: {} });
    assert.ok(!flags.some((flag) => /I-693/i.test(flag.message)));
  });
});

describe("status decoder", () => {
  it("explains actively-reviewed adjacent stages in plain language", () => {
    const filed = statusDecoder("en", "filed");
    const rfe = statusDecoder("en", "rfe");
    assert.match(filed.explanation, /received/i);
    assert.match(rfe.explanation, /not a denial/i);
    assert.equal(statusDecoder("en", "not-a-stage"), null);
  });
});
