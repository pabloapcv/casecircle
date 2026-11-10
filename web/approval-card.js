/* Shareable approval card: pure model + canvas drawing (client-side PNG). Light mode only. */

export const CARD_SIZE = 1080;
export const SITE = "https://casecircle.us";

/* Whole months from the filing month to the approval month (never negative). */
export function monthsBetween(filed, approved) {
  const a = /^(\d{4})-(\d{2})/.exec(String(filed || ""));
  const b = /^(\d{4})-(\d{2})/.exec(String(approved || ""));
  if (!a || !b) return null;
  const n = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  return n < 0 ? null : n;
}

/* A first name or handle only: letters, digits, space, _ . ' -, at most 24 characters. */
export function cleanCardName(value) {
  return String(value || "").normalize("NFC").replace(/[^\p{L}\p{N}_ .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

export function shareUrl(refCode = "") {
  const code = /^[A-Za-z0-9_-]{3,32}$/.test(String(refCode || "")) ? refCode : "";
  return code ? `${SITE}/?ref=${encodeURIComponent(code)}` : `${SITE}/`;
}

export function shareLinks(text, url) {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  };
}

/* Everything the card shows. `t(key, vars)` is the bilingual copy (growth-text.js). */
export function cardModel({ t, form, formName = "", months, office = "", name = "", refCode = "" }) {
  const monthsLine = months == null ? "" : months === 0 ? t("cardMonthsZero") : months === 1 ? t("cardMonthsOne") : t("cardMonths", { n: months });
  const who = cleanCardName(name);
  return {
    brand: "CaseCircle",
    headline: t("cardHeadline"),
    form: String(form || "").slice(0, 12),
    formName: String(formName || "").slice(0, 48),
    months: monthsLine,
    office: String(office || "").slice(0, 40),
    name: who ? t("cardBy", { name: who }) : "",
    cta: t("cardCta"),
    url: shareUrl(refCode).replace(/^https:\/\//, "").replace(/\/$/, ""),
    fine: t("cardFine")
  };
}

const C = { ground: "#F5F3EE", surface: "#FFFFFF", ink: "#1B2422", secondary: "#5E6A66", accent: "#1F7A6E", soft: "#DCEBE7", line: "#E2DED5" };
const FONT = '"Inter Tight", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, size, weight) {
  let px = size;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (px > 18 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

/* Draws the card on a 1080×1080 2D context. Returns the list of texts drawn (used by tests). */
export function drawCard(ctx, model, size = CARD_SIZE) {
  const drawn = [];
  const text = (value, x, y, px, weight, color, align = "center", max = size - 240) => {
    if (!value) return;
    fitText(ctx, value, max, px, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
    drawn.push(value);
  };
  const mid = size / 2;
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, size, size);
  roundRect(ctx, 60, 60, size - 120, size - 120, 44);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  // Brand: the CaseCircle ring mark + name.
  ctx.lineWidth = 9;
  ctx.strokeStyle = C.accent;
  ctx.beginPath(); ctx.arc(140, 150, 28, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.arc(140, 150, 10, 0, Math.PI * 2); ctx.fill();
  text(model.brand, 188, 163, 40, 800, C.ink, "left", 500);
  // Check badge.
  ctx.fillStyle = C.soft;
  ctx.beginPath(); ctx.arc(mid, 330, 92, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(mid - 42, 332); ctx.lineTo(mid - 10, 364); ctx.lineTo(mid + 46, 300); ctx.stroke();
  text(model.headline, mid, 520, 96, 800, C.ink);
  text(model.form, mid, 610, 64, 800, C.accent);
  text(model.formName, mid, 660, 32, 500, C.secondary);
  text(model.months, mid, 748, 52, 700, C.ink);
  text(model.office, mid, 800, 32, 500, C.secondary);
  text(model.name, mid, model.office ? 848 : 806, 30, 500, C.secondary);
  // Footer: link back + small print.
  ctx.fillStyle = C.line;
  ctx.fillRect(120, 880, size - 240, 2);
  text(model.cta, mid, 928, 28, 600, C.ink);
  text(model.url, mid, 968, 30, 800, C.accent);
  text(model.fine, mid, 1004, 20, 500, C.secondary, "center", size - 200);
  return drawn;
}
