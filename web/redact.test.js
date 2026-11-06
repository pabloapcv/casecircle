import test from "node:test";
import assert from "node:assert/strict";
import { maskIdentifiers, hasIdentifiers, MASK_TOKENS } from "./redact.js";

test("masks A-numbers in common shapes", () => {
  for (const sample of ["A123456789", "A12345678", "A-123-456-789", "A# 123456789".replace(" ", ""), "A 123 456 789"]) {
    const out = maskIdentifiers(`My number is ${sample} here`);
    assert.ok(out.text.includes(MASK_TOKENS.aNumber), sample);
    assert.ok(!/\d{3}/.test(out.text), `${sample} -> ${out.text}`);
    assert.equal(out.counts.aNumber, 1);
  }
  const labeled = maskIdentifiers("A-Number: 123456789");
  assert.ok(labeled.text.includes(MASK_TOKENS.aNumber));
});

test("masks USCIS receipt numbers before anything else", () => {
  for (const sample of ["IOE1234567890", "MSC 1234567890", "EAC-12-345-67890", "lin1234567890"]) {
    const out = maskIdentifiers(`Receipt ${sample}.`);
    assert.equal(out.counts.receipt, 1, sample);
    assert.equal(out.text, `Receipt ${MASK_TOKENS.receipt}.`);
  }
});

test("masks SSNs, dashed or labeled", () => {
  assert.equal(maskIdentifiers("SSN 123-45-6789").text, `SSN ${MASK_TOKENS.ssn}`);
  assert.equal(maskIdentifiers("Social Security Number: 123456789").counts.ssn, 1);
  assert.equal(maskIdentifiers("seguro social 123 45 6789").counts.ssn, 1);
});

test("masks passport-like numbers", () => {
  const out = maskIdentifiers("Passport No. G12345678, also C01234567 and 123456789");
  assert.equal(out.counts.passport, 3);
  assert.ok(!/\d{6}/.test(out.text));
  assert.equal(maskIdentifiers("Pasaporte: N0123456").counts.passport, 1);
});

test("leaves dates, phone numbers, zip codes and money alone", () => {
  const text = "Married on 2024-02-14 in Guadalajara. Call 555-123-4567. ZIP 33101. Fee $1,440. Page 1 of 2. Form edition 01/20/25.";
  const out = maskIdentifiers(text);
  assert.equal(out.total, 0, out.text);
  assert.equal(out.text, text);
  assert.equal(hasIdentifiers(text), false);
});

test("totals add up and masking is idempotent", () => {
  const once = maskIdentifiers("A123456789 IOE1234567890 123-45-6789 X1234567");
  assert.equal(once.total, 4);
  const twice = maskIdentifiers(once.text);
  assert.equal(twice.total, 0);
  assert.equal(twice.text, once.text);
});
