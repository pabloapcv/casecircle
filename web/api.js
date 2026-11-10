/*
 * Same-origin JSON client for the CaseCircle server (accounts, community, waitlist).
 * Every state-changing request carries X-CaseCircle: 1; the server rejects POSTs without it (CSRF guard).
 * The session lives in an HttpOnly cookie, so nothing secret is ever readable from JavaScript.
 */
export async function api(path, { method = "GET", body, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CaseCircle"] = "1";
  }
  try {
    const response = await fetchImpl(path, {
      method,
      headers,
      credentials: "same-origin",
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data: data || {}, error: response.ok ? "" : (data && data.error) || "server" };
  } catch {
    return { ok: false, status: 0, data: {}, error: "offline" };
  }
}

/* Server error code -> key in auth-text.js */
const ERROR_KEYS = {
  email: "errEmail", email_taken: "errEmailTaken", password: "errPassword", taken: "errTaken", reserved: "errReserved",
  invalid: "errHandle", agree: "errAgree", login: "errLogin", rate: "errRate", auth: "errAuth", short: "errShort",
  long: "errLong", stage: "errStage", type: "errShort", receipt: "errIdentifiers", "a-number": "errIdentifiers",
  ssn: "errIdentifiers", passport: "errIdentifiers", abuse: "errAbuse", already: "errAlready", self: "errSelf",
  csrf: "errServer", not_found: "errNotFound", closed: "errClosed", offline: "errOffline",
  password_common: "errPasswordCommon", mismatch: "errMismatch", token: "errToken", current: "errCurrent",
  same_email: "errSameEmail", confirm: "errConfirm", unverified: "errUnverified",
  unconfirmed: "errUnconfirmed", confirm_handle: "errConfirmHandle",
  google_cancelled: "errGoogleCancelled", google_expired: "errGoogleExpired", google_failed: "errGoogleFailed",
  google_off: "errGoogleOff", google_unavailable: "errGoogleUnavailable"
};

export function errorKey(code) {
  return ERROR_KEYS[code] || "errServer";
}

/* Query string for a feed; empty values dropped, keys sorted so equal feeds share one cache entry. */
export function feedKey(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== false)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/* Email links: #verify=TOKEN / #reset=TOKEN (built-in accounts) or Supabase's #access_token=…&type=… fragment. */
export function parseEmailLink(hash) {
  const match = /^#(verify|reset)=([A-Za-z0-9_-]{20,200})$/.exec(hash || "");
  if (match) return { kind: match[1], token: match[2] };
  if (!/^#(access_token|error|message)=/.test(hash || "")) return null;
  const params = new URLSearchParams(String(hash).slice(1));
  if (params.get("error") || params.get("error_code")) return { kind: "error" };
  if (params.get("message") && !params.get("access_token")) return { kind: "message" };
  const token = params.get("access_token") || "";
  const refresh = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(token)) return null;
  if (type === "recovery") return { kind: "reset", token };
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(refresh)) return null;
  return { kind: "verify", token, refresh, type };
}

/* The server's redirect back from Google: ?signin=google|google-new or ?signin_error=<code> (plus &lang=).
   Returns null when the address has none of them, else what to show and the URL to put back (markers removed). */
export function parseSignInReturn(search, hash = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const signin = params.get("signin") || "";
  const error = params.get("signin_error") || "";
  if (!signin && !error) return null;
  const lang = params.get("lang") === "es" ? "es" : params.get("lang") === "en" ? "en" : "";
  for (const key of ["signin", "signin_error", "lang"]) params.delete(key);
  const rest = params.toString();
  const known = ["google_cancelled", "google_expired", "google_failed", "google_off", "google_unavailable"];
  return {
    kind: error ? "error" : signin === "google-new" ? "new" : "ok",
    error: error ? (known.includes(error) ? error : "google_failed") : "",
    lang,
    cleanUrl: `${rest ? `?${rest}` : ""}${hash || ""}`
  };
}

/* Link for "Continue with Google": the server keeps the PKCE verifier and comes back to `next`. */
export function googleStartUrl(lang, next = "/") {
  const safe = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `/api/auth/google?locale=${lang === "es" ? "es" : "en"}&next=${encodeURIComponent(safe)}`;
}
