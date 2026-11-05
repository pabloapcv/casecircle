import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankFolder } from "./prepare.js";
import {
  buildFolderChatPayload,
  folderChatContextSafe,
  folderChatItems,
  scanFolderChatPayload
} from "./folder-chat.js";

describe("folder chat payload", () => {
  it("sends only the selected form plus item labels and status", () => {
    const folder = blankFolder("i-485");
    folder.marks.edition = "ready";
    const payload = buildFolderChatPayload({
      spaceId: "i-485",
      lang: "en",
      question: "What should I gather next?",
      history: [{ role: "user", text: "Do I need a translation?" }, { role: "assistant", text: "Put a full English translation with the original." }],
      folder,
      consent: true
    });
    assert.equal(payload.consent, true);
    assert.equal(payload.form, "I-485");
    assert.equal(payload.spaceId, "i-485");
    assert.ok(folderChatContextSafe(payload));
    assert.ok(payload.items.some((item) => item.id === "edition" && item.status === "ready"));
    assert.ok(payload.items.some((item) => item.status === "need"));
    const blob = JSON.stringify(payload);
    assert.equal("filed" in payload, false);
    assert.equal("email" in payload, false);
    assert.equal("username" in payload, false);
    assert.equal(blob.includes("keepuser"), false);
    assert.equal(/I-693 medical may expire/.test(blob), false);
  });

  it("keeps English and Spanish labels on separate payloads", () => {
    const folder = blankFolder("n-400");
    const en = folderChatItems({ sections: [{ items: [{ id: "green", en: "Green card copy", es: "Copia de la tarjeta" }] }] }, folder, "en");
    const es = folderChatItems({ sections: [{ items: [{ id: "green", en: "Green card copy", es: "Copia de la tarjeta" }] }] }, folder, "es");
    assert.equal(en[0].label, "Green card copy");
    assert.equal(es[0].label, "Copia de la tarjeta");
  });

  it("blocks receipt numbers in the question or history", () => {
    const folder = blankFolder("i-765");
    const payload = buildFolderChatPayload({
      spaceId: "i-765",
      lang: "en",
      question: "My receipt is IOE1234567890, what next?",
      history: [],
      folder,
      consent: true
    });
    assert.equal(scanFolderChatPayload(payload).reason, "receipt");
    const history = buildFolderChatPayload({
      spaceId: "i-765",
      lang: "en",
      question: "What is still missing?",
      history: [{ role: "user", text: "A-number A123456789 is on the card" }],
      folder,
      consent: true
    });
    assert.equal(scanFolderChatPayload(history).reason, "a-number");
  });

  it("does not treat a missing consent flag as ready to send", () => {
    const payload = buildFolderChatPayload({
      spaceId: "i-130",
      lang: "es",
      question: "¿Qué falta en la carpeta?",
      history: [],
      folder: blankFolder("i-130"),
      consent: false
    });
    assert.equal(payload.consent, false);
    assert.equal(scanFolderChatPayload(payload).verdict, "allow");
  });
});
