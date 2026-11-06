/* Printable folder summary (opened in a new tab; the user prints or saves as PDF). Pure string builder. */
import { toolsText } from "./tools-text.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function folderSummaryHtml({ lang = "en", form, title, items = [], marks = {}, docs = [], readiness, fixes = [], mock = false, date = new Date(), officialUrl = "" }) {
  const T = (key, vars) => toolsText(lang, key, vars);
  const es = lang === "es";
  const label = (item) => (es ? item.es : item.en);
  const markName = { ready: T("markReady"), need: T("markNeed"), na: T("markNa") };
  const statusName = { matches: T("statusMatches"), possible_issue: T("statusPossible"), mismatch: T("statusMismatch") };
  const when = new Intl.DateTimeFormat(es ? "es" : "en", { dateStyle: "long" }).format(date);
  const partRow = (key, part) => `<tr><td>${esc(T(key))}</td><td class="num">${Math.round(part.points)} / ${part.max}</td></tr>`;
  const rows = items.map((item) => {
    const mine = docs.filter((doc) => doc.itemId === item.id);
    const docList = mine.length ? mine.map((doc) => {
      const check = doc.check;
      const findings = (check?.findings || []).filter((f) => !f.resolved).map((f) => `<li><strong>${esc(f.message)}</strong>${f.fix ? `<br><span class="fix">${esc(T("fix"))}: ${esc(f.fix)}</span>` : ""}</li>`).join("");
      return `<div class="doc"><span class="docname">${esc(doc.name)}</span> — ${esc(check ? statusName[check.status] : T("notChecked"))}${check?.mock ? ` <em>(${esc(T("demoAi"))})</em>` : ""}${findings ? `<ul>${findings}</ul>` : ""}</div>`;
    }).join("") : `<span class="muted">${esc(T("summaryNoDocs"))}</span>`;
    return `<tr><td><strong>${esc(label(item))}</strong><div class="muted">${esc(item.required ? T("required") : T("optional"))}${item.reason ? ` · ${esc(es ? item.reason.es : item.reason.en)}` : ""}</div></td><td>${esc(markName[marks[item.id] || "need"])}</td><td>${docList}</td></tr>`;
  }).join("");
  const fixList = fixes.length ? `<ol>${fixes.map((fix) => `<li>${esc(fix.text)} <span class="muted">(${esc(T("points", { n: fix.points }))})</span></li>`).join("")}</ol>` : `<p>${esc(T("noFixes"))}</p>`;
  return `<!DOCTYPE html><html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><title>${esc(T("summaryTitle"))} — ${esc(form)}</title>
<style>
body{font-family:"Inter Tight",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1B2422;margin:32px;line-height:1.45;font-size:14px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.muted{color:#5E6A66;font-size:12px}
.score{display:flex;gap:24px;align-items:center;border:1px solid #E2DED5;border-radius:12px;padding:16px;margin:16px 0}
.score .big{font-size:44px;font-weight:800;color:#1F5A52}table{width:100%;border-collapse:collapse}td,th{border-top:1px solid #E2DED5;padding:8px;vertical-align:top;text-align:left}td:nth-child(2){white-space:nowrap;width:7.5rem}
.num{text-align:right;white-space:nowrap}.doc{margin-bottom:6px}.docname{font-weight:600}.fix{color:#1F5A52}ul{margin:4px 0 0 18px;padding:0}
.disclaimer{margin-top:24px;padding:12px;border-radius:10px;background:#DCEBE7;font-size:12px}.toolbar{margin-bottom:16px}@media print{.toolbar{display:none}body{margin:12mm}}
button{font:inherit;padding:8px 14px;border-radius:999px;border:0;background:#1F7A6E;color:#fff;font-weight:600;cursor:pointer}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">${esc(T("summaryPrint"))}</button></div>
<p class="muted">${esc(T("summaryGenerated", { date: when }))} · ${esc(T("notLegal"))}</p>
<h1>${esc(T("summaryTitle"))}: ${esc(form)} — ${esc(title)}</h1>
${officialUrl ? `<p class="muted">${esc(officialUrl)}</p>` : ""}
<div class="score"><div><div class="muted">${esc(T("readinessTitle"))}</div><div class="big">${readiness.score}<span style="font-size:18px;color:#5E6A66">/100</span></div></div>
<div style="flex:1"><table>${partRow("partRequired", readiness.parts.required)}${partRow("partConsistency", readiness.parts.consistency)}${partRow("partDates", readiness.parts.dates)}${partRow("partEvidence", readiness.parts.evidence)}</table>
<p class="muted">${esc(T("readinessNote"))}</p></div></div>
${mock ? `<p class="muted"><strong>${esc(T("demoAi"))}:</strong> ${esc(T("demoAiNote"))}</p>` : ""}
<h2>${esc(T("topFixes"))}</h2>${fixList}
<h2>${esc(T("checklistTitle"))}</h2>
<table><thead><tr><th>${esc(T("checklistTitle"))}</th><th>${esc(T("status"))}</th><th>${esc(T("documents"))} · ${esc(T("findings"))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="disclaimer"><strong>${esc(T("notLegal"))}</strong> ${esc(T("summaryDisclaimer"))}</div>
</body></html>`;
}
