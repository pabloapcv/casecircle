/*
 * Browser-only document reading. Files never leave the device:
 *   PDFs  -> pdf.js (lazy-loaded from jsDelivr only when a PDF is added)
 *   JPG/PNG -> tesseract.js OCR (lazy-loaded only when an image is added)
 * Extracted text lives in IndexedDB ("casecircle-docs"); the File objects themselves are kept in memory only.
 */
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_CHARS = 12000;

let pdfjs = null;
let tesseractLoading = null;
const memoryFiles = new Map();

async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return pdfjs;
}

function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (!tesseractLoading) {
    tesseractLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => resolve(globalThis.Tesseract);
      script.onerror = () => { tesseractLoading = null; reject(new Error("tesseract")); };
      document.head.append(script);
    });
  }
  return tesseractLoading;
}

export function kindOf(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpe?g)$/.test(type) || /\.(png|jpe?g)$/.test(name)) return "image";
  return "";
}

export async function extractFromFile(file, lang = "en", onProgress = () => {}) {
  const kind = kindOf(file);
  if (!kind) throw new Error("type");
  if (file.size > MAX_FILE_BYTES) throw new Error("size");
  if (kind === "pdf") {
    const lib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
    const parts = [];
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      const lines = [];
      let last = null;
      for (const item of content.items) {
        const y = Math.round(item.transform?.[5] ?? 0);
        if (last !== null && Math.abs(y - last) > 2) lines.push("\n");
        lines.push(item.str);
        last = y;
      }
      parts.push(lines.join(" ").replace(/ *\n */g, "\n"));
      onProgress(index / doc.numPages);
    }
    return { kind, pages: doc.numPages, text: parts.join("\n\n").trim().slice(0, MAX_TEXT_CHARS) };
  }
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, lang === "es" ? "spa+eng" : "eng", {
    logger: (message) => { if (message.status === "recognizing text") onProgress(message.progress || 0); }
  });
  return { kind, pages: 1, text: String(result?.data?.text || "").trim().slice(0, MAX_TEXT_CHARS) };
}

/* ── IndexedDB text store ── */
const DB = "casecircle-docs";
const STORE = "texts";
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("idb")); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function tx(mode, run) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const memoryText = new Map();
export async function saveText(id, text) {
  memoryText.set(id, text);
  try { await tx("readwrite", (store) => store.put(text, id)); } catch { /* memory only */ }
}
export async function loadText(id) {
  if (memoryText.has(id)) return memoryText.get(id);
  try {
    const value = await tx("readonly", (store) => store.get(id));
    if (typeof value === "string") memoryText.set(id, value);
    return value || "";
  } catch { return ""; }
}
export async function deleteText(id) {
  memoryText.delete(id);
  memoryFiles.delete(id);
  try { await tx("readwrite", (store) => store.delete(id)); } catch { /* nothing stored */ }
}
export function keepFile(id, file) { memoryFiles.set(id, file); }
export function hasFile(id) { return memoryFiles.has(id); }
