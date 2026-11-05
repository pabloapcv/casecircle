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

export function buildFolderChatPayload({ spaceId, lang, question, history, folder, consent }) {
  const packet = packetFor(spaceId);
  return {
    consent: consent === true,
    lang: lang === "es" ? "es" : "en",
    spaceId,
    form: packet?.form || "",
    question: String(question || "").trim().slice(0, FOLDER_CHAT_LIMITS.question),
    history: (history || []).slice(-FOLDER_CHAT_LIMITS.history).map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      text: String(row.text || "").slice(0, FOLDER_CHAT_LIMITS.question)
    })),
    items: folderChatItems(packet, folder, lang)
  };
}

export function scanFolderChatPayload(payload) {
  const parts = [payload?.question, payload?.form, payload?.spaceId];
  for (const row of payload?.history || []) parts.push(row.text);
  for (const item of payload?.items || []) parts.push(item.label, item.id);
  for (const part of parts) {
    const scanned = evaluate(part);
    if (scanned.verdict === "block") return scanned;
  }
  return { verdict: "allow" };
}

export function folderChatContextSafe(payload) {
  const keys = Object.keys(payload || {}).sort();
  return keys.join(",") === "consent,form,history,items,lang,question,spaceId"
    && !("filed" in (payload || {}))
    && !("email" in (payload || {}))
    && !("username" in (payload || {}))
    && !("riskFlags" in (payload || {}))
    && !("score" in (payload || {}));
}
