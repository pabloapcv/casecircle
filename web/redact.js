/*
 * On-device identifier masking. Runs before any document text can leave the browser.
 * Order matters: receipt numbers first (3 letters + 10 digits), then SSNs, then A-numbers,
 * then passport-like numbers. Every match becomes a bracketed token the AI is told to ignore.
 */

export const MASK_TOKENS = {
  receipt: "[RECEIPT #]",
  ssn: "[SSN]",
  aNumber: "[A-NUMBER]",
  passport: "[PASSPORT #]"
};

// USCIS receipt: three letters (IOE, MSC, EAC, WAC, LIN, SRC, NBC, YSC…) + 10 digits, optional separators.
const RECEIPT = /\b[A-Za-z]{3}[\s-]?(?:\d[\s-]?){9}\d\b/g;
// SSN: 123-45-6789 / 123 45 6789, or 9 digits right after an SSN label.
const SSN_DASHED = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g;
const SSN_LABELED = /\b(ssn|social\s+security(?:\s+(?:number|no\.?|#))?|seguro\s+social)(\s*[:#]?\s*)(\d{9})\b/gi;
// A-number: A + 8 or 9 digits, allowing "A-", "A " and "A#".
const A_NUMBER = /\bA[-\s#]?\d{3}[-\s]?\d{3}[-\s]?\d{2,3}\b/g;
const A_NUMBER_LABELED = /\b(a[-\s]?number|alien\s+(?:registration\s+)?number|uscis\s*#|n[uú]mero\s+a)(\s*[:#]?\s*)(\d{7,9})\b/gi;
// Passport-like: labeled value with at least one digit, or a bare letter(s)+digits pattern (C01234567, AB1234567) or 9 bare digits.
const PASSPORT_LABELED = /\b(passport|pasaporte)((?:\s*(?:number|no\.?|num(?:ero|\.)?|#))?\s*[:#-]?\s*)((?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,12})\b/gi;
const PASSPORT_BARE = /\b[A-Za-z]{1,2}\d{7,8}\b|\b\d{9}\b/g;

function replaceCount(text, pattern, replacer) {
  let count = 0;
  const out = text.replace(pattern, (...args) => {
    count += 1;
    return replacer(...args);
  });
  return [out, count];
}

export function maskIdentifiers(input) {
  let text = String(input ?? "");
  const counts = { receipt: 0, ssn: 0, aNumber: 0, passport: 0 };
  let n;
  [text, n] = replaceCount(text, RECEIPT, () => MASK_TOKENS.receipt); counts.receipt += n;
  [text, n] = replaceCount(text, SSN_LABELED, (_, label, gap) => `${label}${gap}${MASK_TOKENS.ssn}`); counts.ssn += n;
  [text, n] = replaceCount(text, SSN_DASHED, () => MASK_TOKENS.ssn); counts.ssn += n;
  [text, n] = replaceCount(text, A_NUMBER_LABELED, (_, label, gap) => `${label}${gap}${MASK_TOKENS.aNumber}`); counts.aNumber += n;
  [text, n] = replaceCount(text, A_NUMBER, () => MASK_TOKENS.aNumber); counts.aNumber += n;
  [text, n] = replaceCount(text, PASSPORT_LABELED, (_, label, gap) => `${label}${gap}${MASK_TOKENS.passport}`); counts.passport += n;
  [text, n] = replaceCount(text, PASSPORT_BARE, () => MASK_TOKENS.passport); counts.passport += n;
  const total = counts.receipt + counts.ssn + counts.aNumber + counts.passport;
  return { text, counts, total };
}

/* True when text still contains something that looks like an identifier after masking. */
export function hasIdentifiers(input) {
  return maskIdentifiers(input).total > 0;
}
