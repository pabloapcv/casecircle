import test from "node:test";
import assert from "node:assert/strict";
import { EXTRAS_KEYS, extrasText, trialLabel, GATED_FEATURES, isFeatureOpen } from "./extras-text.js";

test("every extras string exists in English and Spanish and they differ where they should", () => {
  for (const key of EXTRAS_KEYS) {
    assert.ok(extrasText("en", key), key);
    assert.ok(extrasText("es", key), key);
  }
  assert.equal(trialLabel("en", 3), "Free trial: 3 days left");
  assert.equal(trialLabel("en", 1), "Free trial: 1 day left");
  assert.equal(trialLabel("es", 3), "Prueba gratis: quedan 3 días");
  assert.match(extrasText("en", "notAdvice"), /Not legal advice/);
  assert.match(extrasText("en", "notAdvice"), /Not affiliated with USCIS/);
  assert.match(extrasText("es", "lockedSigninBody", { days: 3 }), /3 días/);
  assert.match(extrasText("en", "trialBody"), /AI document check/);
  assert.match(extrasText("en", "trialBody"), /folder chat/);
  assert.match(extrasText("en", "trialBody"), /folder checklist/);
  assert.match(extrasText("en", "lockedExpiredBody"), /no checkout yet/i);
  assert.match(extrasText("en", "pricingTrial"), /all extras are free/);
  assert.match(extrasText("en", "trialBody"), /Tailor with AI/);
  assert.match(extrasText("es", "trialBody"), /Ajustar con IA/);
  assert.match(extrasText("en", "pricingGated"), /AI document check/);
  assert.match(extrasText("en", "pricingGated"), /folder chat/);
  assert.match(extrasText("en", "pricingGated"), /Tailor with AI/);
  assert.match(extrasText("es", "pricingGated"), /Ajustar con IA/);
  assert.match(extrasText("en", "lockedExpiredBody"), /Tailor with AI/);
});

test("gated feature list and isFeatureOpen", () => {
  assert.deepEqual([...GATED_FEATURES].sort(), ["civics", "folder_chat", "folder_check", "folder_plan", "interview"]);
  assert.equal(isFeatureOpen({ access: false }, "checklist"), true);
  assert.equal(isFeatureOpen({ access: false }, "processing_times"), true);
  assert.equal(isFeatureOpen({ access: false }, "community"), true);
  assert.equal(isFeatureOpen({ access: false }, "folder_plan"), false);
  assert.equal(isFeatureOpen({ access: true }, "folder_plan"), true);
  assert.equal(isFeatureOpen({ access: false }, "folder_chat"), false);
  assert.equal(isFeatureOpen({ access: true }, "folder_check"), true);
});
