/**
 * Thin entry: resolve language from URL, paint fast, then load the app and Reddit data.
 */
import { loadRedditCatalog } from "./reddit.js";

async function start() {
  const { bootApp } = await import("./app.js");
  bootApp();
  loadRedditCatalog()
    .then(() => bootApp())
    .catch((err) => console.warn("Reddit catalog failed to load", err));
}

start();