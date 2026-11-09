import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, errorKey, feedKey } from "./api.js";
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
