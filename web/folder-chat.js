import { evaluate } from "./logic.js";
import { packetFor } from "./prepare.js";

export const FOLDER_CHAT_SPACES = ["n-400", "i-751", "i-485", "i-130", "i-765", "i-131"];
export const FOLDER_CHAT_LIMITS = { question: 1000, history: 8, items: 80, label: 200 };

const statusOf = (value) => (value === "ready" || value === "na" ? value : "need");

export function folderChatItems(packet, folder, lang) {
  const marks = folder?.marks || {};
  const es = lang === "es";
  const items = [];
  for (const section of packet?.sections || []) {
    for (const item of section.items || []) {
      items.push({
        id: String(item.id || ""),
        label: String(es ? item.es : item.en || "").slice(0, FOLDER_CHAT_LIMITS.label),
        status: statusOf(marks[item.id])
      });
      if (items.length >= FOLDER_CHAT_LIMITS.items) return items;
    }
  }
  return items;
}

/* items: optional pre-built [{id,label,status}] (the AI Folder Builder list). findings: only when the user opted in. */
export function buildFolderChatPayload({ spaceId, lang, question, history, folder, consent, items, findings }) {
  const packet = packetFor(spaceId);
  const payload = {
    consent: consent === true,
    lang: lang === "es" ? "es" : "en",
    spaceId,
    form: packet?.form || "",
    question: String(question || "").trim().slice(0, FOLDER_CHAT_LIMITS.question),
    history: (history || []).slice(-FOLDER_CHAT_LIMITS.history).map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      text: String(row.text || "").slice(0, FOLDER_CHAT_LIMITS.question)
    })),
    items: Array.isArray(items)
      ? items.slice(0, FOLDER_CHAT_LIMITS.items).map((row) => ({ id: String(row.id), label: String(row.label || "").slice(0, FOLDER_CHAT_LIMITS.label), status: statusOf(row.status) }))
      : folderChatItems(packet, folder, lang)
  };
  if (Array.isArray(findings) && findings.length) {
    payload.findings = findings.slice(0, 40).map((row) => ({
      itemId: String(row.itemId || ""),
      status: ["matches", "possible_issue", "mismatch"].includes(row.status) ? row.status : "possible_issue",
      code: String(row.code || ""),
      message: String(row.message || "").slice(0, 300)
    }));
  }
  return payload;
}

export function scanFolderChatPayload(payload) {
  const parts = [payload?.question, payload?.form, payload?.spaceId];
  for (const row of payload?.history || []) parts.push(row.text);
  for (const item of payload?.items || []) parts.push(item.label, item.id);
  for (const row of payload?.findings || []) parts.push(row.message);
  for (const part of parts) {
    const scanned = evaluate(part);
    if (scanned.verdict === "block") return scanned;
  }
  return { verdict: "allow" };
}

export function folderChatContextSafe(payload) {
  const keys = Object.keys(payload || {}).filter((key) => key !== "findings").sort();
  return keys.join(",") === "consent,form,history,items,lang,question,spaceId"
    && !("filed" in (payload || {}))
    && !("email" in (payload || {}))
    && !("username" in (payload || {}))
    && !("riskFlags" in (payload || {}))
    && !("score" in (payload || {}));
}
