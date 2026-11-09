// Loads the app and shows a readable error instead of a blank page if a module fails (kept out of index.html for the CSP).
import("./app.js").catch((error) => {
  const root = document.getElementById("app");
  if (!root) return;
  const pre = document.createElement("pre");
  pre.className = "page";
  pre.textContent = error && (error.stack || error.message) || String(error);
  root.replaceChildren(pre);
});
