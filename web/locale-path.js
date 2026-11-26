/** URL prefix → default locale for marketing entry points. */
export function pathLang() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/es" || path.startsWith("/es/")) return "es";
  return null;
}

export function localeHome(lang) {
  return lang === "es" ? "/es/" : "/";
}