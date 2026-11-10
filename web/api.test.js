import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, errorKey, feedKey, googleStartUrl, parseEmailLink, parseSignInReturn } from "./api.js";
import { AUTH_TEXT_KEYS, authText, authTextEntry } from "./auth-text.js";

function fakeFetch(status, body, seen) {
  return async (url, options) => {
    seen.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

describe("api client", () => {
  it("sends the CSRF header and JSON body on POST, same-origin credentials", async () => {
    const seen = [];
    const res = await api("/api/posts", { method: "POST", body: { title: "x" }, fetchImpl: fakeFetch(201, { post: { id: "p1" } }, seen) });
    assert.equal(res.ok, true);
    assert.equal(res.data.post.id, "p1");
    assert.equal(seen[0].options.headers["X-CaseCircle"], "1");
    assert.equal(seen[0].options.headers["Content-Type"], "application/json");
    assert.equal(seen[0].options.credentials, "same-origin");
    assert.equal(seen[0].options.body, JSON.stringify({ title: "x" }));
  });

  it("GET has no body and no CSRF header", async () => {
    const seen = [];
    await api("/api/me", { fetchImpl: fakeFetch(200, { user: null }, seen) });
    assert.equal(seen[0].options.body, undefined);
    assert.equal(seen[0].options.headers["X-CaseCircle"], undefined);
  });

  it("returns the server error code, or offline when fetch throws", async () => {
    const res = await api("/api/login", { method: "POST", fetchImpl: fakeFetch(401, { error: "login" }, []) });
    assert.deepEqual([res.ok, res.status, res.error], [false, 401, "login"]);
    const offline = await api("/api/me", { fetchImpl: async () => { throw new Error("net"); } });
    assert.equal(offline.error, "offline");
  });

  it("maps server errors to copy keys that exist in both languages", () => {
    for (const code of ["email", "email_taken", "password", "taken", "reserved", "invalid", "agree", "login", "rate", "auth", "short", "long", "stage", "receipt", "ssn", "abuse", "already", "self", "not_found", "offline", "weird"]) {
      const key = errorKey(code);
      assert.ok(AUTH_TEXT_KEYS.includes(key), `${code} -> ${key}`);
    }
    assert.equal(errorKey("nonsense"), "errServer");
  });

  it("feedKey drops empty values and is order independent", () => {
    assert.equal(feedKey({ sort: "new", type: "", groups: "i-485,n-400", limit: 50 }), "groups=i-485%2Cn-400&limit=50&sort=new");
    assert.equal(feedKey({ b: 1, a: 2 }), feedKey({ a: 2, b: 1 }));
    assert.equal(feedKey({}), "");
  });
});

describe("auth copy", () => {
  it("every string has English and Spanish", () => {
    for (const key of AUTH_TEXT_KEYS) {
      const [en, es] = authTextEntry(key);
      assert.ok(en && es, key);
      assert.equal(Array.isArray(en), Array.isArray(es), key);
      if (Array.isArray(en)) assert.equal(en.length, es.length, key);
    }
  });

  it("privacy and terms say documents are never uploaded and this is not legal advice", () => {
    const privacy = authText("en", "privacyParas").join(" ");
    assert.match(privacy, /never leaves your device/i);
    assert.match(privacy, /not legal advice/i);
    assert.match(authText("es", "privacyParas").join(" "), /no es asesoría legal/i);
    const terms = authText("en", "termsParas").join(" ");
    assert.match(terms, /not legal advice/i);
    assert.match(terms, /never predict/i);
    assert.doesNotMatch(terms + privacy, /approval odds|chance of approval|likelihood/i);
  });

  it("fills variables", () => {
    assert.equal(authText("es", "welcomeBack", { name: "ana" }), "Hola, ana.");
  });
});

describe("auth recovery and settings copy", () => {
  it("maps every new server error to bilingual copy", () => {
    for (const code of ["unverified", "unconfirmed", "password_common", "token", "current", "same_email", "confirm", "mismatch"]) {
      const key = errorKey(code);
      assert.notEqual(key, "errServer", code);
      assert.ok(AUTH_TEXT_KEYS.includes(key), key);
    }
  });

  it("states the 10-character minimum and link lifetimes in both languages", () => {
    assert.match(authText("en", "passwordHelp"), /10 characters/);
    assert.match(authText("es", "passwordHelp"), /10 caracteres/);
    assert.match(authText("en", "forgotSent", { email: "a@b.co" }), /If an account exists for a@b\.co/);
    assert.match(authText("es", "forgotSent", { email: "a@b.co" }), /1 hora/);
  });
});

describe("email links (built-in and Supabase)", () => {
  const jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";
  it("keeps the built-in #verify= / #reset= links", () => {
    assert.deepEqual(parseEmailLink("#verify=abcdefghijklmnopqrstuvwxyz"), { kind: "verify", token: "abcdefghijklmnopqrstuvwxyz" });
    assert.deepEqual(parseEmailLink("#reset=abcdefghijklmnopqrstuvwxyz"), { kind: "reset", token: "abcdefghijklmnopqrstuvwxyz" });
  });
  it("reads Supabase confirmation and recovery fragments", () => {
    assert.deepEqual(parseEmailLink(`#access_token=${jwt}&expires_at=1&expires_in=3600&refresh_token=abc123xyz&token_type=bearer&type=signup`),
      { kind: "verify", token: jwt, refresh: "abc123xyz", type: "signup" });
    assert.deepEqual(parseEmailLink(`#access_token=${jwt}&refresh_token=abc123xyz&type=recovery`), { kind: "reset", token: jwt });
    assert.deepEqual(parseEmailLink("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"), { kind: "error" });
    assert.deepEqual(parseEmailLink("#message=Confirmation+link+accepted"), { kind: "message" });
  });
  it("ignores routes and malformed tokens", () => {
    assert.equal(parseEmailLink("#post=p12"), null);
    assert.equal(parseEmailLink(""), null);
    assert.equal(parseEmailLink("#access_token=<script>&refresh_token=x&type=signup"), null);
    assert.equal(parseEmailLink(`#access_token=${jwt}&type=signup`), null);
  });
  it("has bilingual copy for the confirm-your-email signup step", () => {
    assert.match(authText("en", "signupSent", { email: "a@b.co" }), /a@b\.co/);
    assert.match(authText("es", "signupSent", { email: "a@b.co" }), /enlace de confirmación/);
    assert.ok(authTextEntry("errUnconfirmed")[1].length > 10);
  });
});

describe("Continue with Google", () => {
  it("builds the start link with locale and a same-site return path only", () => {
    assert.equal(googleStartUrl("es", "/#post=p3"), "/api/auth/google?locale=es&next=%2F%23post%3Dp3");
    assert.equal(googleStartUrl("fr", "//evil.example"), "/api/auth/google?locale=en&next=%2F");
    assert.equal(googleStartUrl("en", "https://evil.example"), "/api/auth/google?locale=en&next=%2F");
  });

  it("reads the server's return markers and strips them from the address", () => {
    assert.equal(parseSignInReturn("", "#feed"), null);
    assert.equal(parseSignInReturn("?a=1"), null);
    assert.deepEqual(parseSignInReturn("?signin=google", "#feed"), { kind: "ok", error: "", lang: "", cleanUrl: "#feed" });
    assert.deepEqual(parseSignInReturn("?x=2&signin=google-new&lang=es"), { kind: "new", error: "", lang: "es", cleanUrl: "?x=2" });
    assert.deepEqual(parseSignInReturn("?signin_error=google_expired&lang=en"), { kind: "error", error: "google_expired", lang: "en", cleanUrl: "" });
    assert.equal(parseSignInReturn("?signin_error=<script>").error, "google_failed");
  });

  it("has a bilingual message for every Google error", () => {
    for (const code of ["google_cancelled", "google_expired", "google_failed", "google_off", "google_unavailable", "confirm_handle"]) {
      const key = errorKey(code);
      assert.notEqual(key, "errServer", code);
      const [en, es] = authTextEntry(key);
      assert.ok(en && es && en !== es, key);
    }
    assert.equal(authText("es", "continueGoogle"), "Continuar con Google");
    assert.equal(authText("en", "continueGoogle"), "Continue with Google");
  });
});
