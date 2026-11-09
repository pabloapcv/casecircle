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
  csrf: "errServer", not_found: "errNotFound", closed: "errClosed", offline: "errOffline"
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
