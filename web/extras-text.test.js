import test from "node:test";
import assert from "node:assert/strict";
import { EXTRAS_KEYS, extrasText, trialLabel } from "./extras-text.js";

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
});
