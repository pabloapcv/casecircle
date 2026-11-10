"""Supabase backend (supa.py) without the network: a fake Supabase Auth + PostgREST transport.

The live project is exercised separately (see README "Supabase"); these tests pin the server's behaviour:
cookies, refresh, error mapping, trial/pass/admin gating (401/402), the signup/confirm flow and
"Continue with Google" (server-side PKCE, callback exchange, finish-your-profile, error paths)."""
import base64
import hashlib
import json
import os
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import HTTPCookieProcessor, HTTPRedirectHandler, Request, build_opener

import community
import entitlements
import folder_chat
import folder_check
import serve
import supa

FAKE_URL = "https://fake-project.supabase.test"


def jwt(sub, email, exp, providers=None):
    enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    claims = {'sub': sub, 'email': email, 'exp': exp, 'role': 'authenticated'}
    if providers:
        claims["app_metadata"] = {"provider": providers[0], "providers": providers}
    return f"{enc({'alg': 'ES256'})}.{enc(claims)}.c2ln"


def s256(verifier):
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def iso(dt):
    return dt.isoformat()


class FakeSupabase:
    """Just enough GoTrue + PostgREST for the server: users, sessions, refresh rotation, accounts rows."""

    def __init__(self):
        self.users = {}       # email -> dict(id, password, confirmed)
        self.accounts = {}    # id -> row
        self.valid = set()    # access tokens PostgREST accepts
        self.refresh = {}     # refresh token -> user id
        self.calls = []
        self.lock = threading.Lock()
        self.down = False
        self.confirm_email = False
        self.ttl = 3600
        self.waitlist = set()
        self.seq = 0
        self.google_on = True
        self.codes = {}       # PKCE auth code -> (email, code_challenge)
        self.rpc_missing = False
        self.twins = {}       # (user id, form) -> {form, office_id, filed_month, created}

    def add_user(self, email, password, handle, confirmed=True, admin=False, trial_age_days=0.0, pass_until=None):
        uid = f"00000000-0000-0000-0000-{len(self.users) + 1:012d}"
        self.users[email] = {"id": uid, "password": password, "confirmed": confirmed}
        start = datetime.now(timezone.utc) - timedelta(days=trial_age_days)
        self.accounts[uid] = {"user_id": uid, "locale": "en", "spaces": ["i-485"], "case_profiles": [], "is_admin": admin,
                              "trial_started_at": iso(start), "pass_until": pass_until, "created_at": iso(start),
                              "profiles": {"handle": handle, "reputation": 0}}
        return uid

    def session(self, email, ttl=None):
        user = self.users[email]
        self.seq += 1
        at = jwt(user["id"], email, int(time.time()) + (self.ttl if ttl is None else ttl), user.get("providers")) + str(self.seq)
        rt = f"rt{self.seq}x{user['id'][-4:]}"
        self.valid.add(at)
        self.refresh[rt] = user["id"]
        return {"access_token": at, "refresh_token": rt, "expires_in": self.ttl, "token_type": "bearer",
                "user": {"id": user["id"], "email": email}}

    def google_code(self, email, verifier, challenge=None):
        """What Supabase does after Google says yes: create (trigger: placeholder handle) or link the user, and
        hand out a one-time code bound to the code_challenge it got at /authorize."""
        if email in self.users:
            providers = self.users[email].setdefault("providers", ["email"])
            if "google" not in providers:
                providers.append("google")   # automatic identity linking (verified email)
        else:
            uid = self.add_user(email, None, None)
            self.users[email]["providers"] = ["google"]
            self.accounts[uid]["profiles"]["handle"] = supa.placeholder_handle(uid)
        self.seq += 1
        code = f"code-{self.seq}"
        self.codes[code] = (email, challenge or s256(verifier))
        return code

    def __call__(self, method, url, headers, body):
        if self.down:
            raise supa.Upstream("down")
        parsed = urlparse(url)
        q = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        data = json.loads(body) if body else None
        token = headers.get("Authorization", "").removeprefix("Bearer ")
        with self.lock:
            self.calls.append((method, parsed.path, q))
        assert headers.get("apikey") == "sb_publishable_test", "publishable key goes in the apikey header"
        out = lambda status, payload: (status, json.dumps(payload).encode(), {})
        path = parsed.path
        if path == "/auth/v1/token" and q.get("grant_type") == "password":
            user = self.users.get(data["email"])
            if not user or user["password"] != data["password"]:
                return out(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
            if not user["confirmed"]:
                return out(400, {"code": 400, "error_code": "email_not_confirmed", "msg": "Email not confirmed"})
            return out(200, self.session(data["email"]))
        if path == "/auth/v1/token" and q.get("grant_type") == "refresh_token":
            uid = self.refresh.pop(data["refresh_token"], None)   # rotation: one use
            if not uid:
                return out(400, {"error_code": "refresh_token_not_found"})
            email = next(e for e, u in self.users.items() if u["id"] == uid)
            return out(200, self.session(email))
        if path == "/auth/v1/signup":
            if data["email"] in self.users:
                return out(422, {"code": 422, "error_code": "user_already_exists", "msg": "User already registered"})
            meta = data.get("data") or {}
            self.add_user(data["email"], data["password"], meta.get("handle"), confirmed=not self.confirm_email)
            self.accounts[self.users[data["email"]]["id"]]["spaces"] = meta.get("spaces") or ["i-485"]
            if self.confirm_email:
                return out(200, {"id": self.users[data["email"]]["id"], "email": data["email"]})
            return out(200, self.session(data["email"]))
        if path == "/auth/v1/settings":
            return out(200, {"external": {"email": True, "google": self.google_on}, "disable_signup": False})
        if path == "/auth/v1/token" and q.get("grant_type") == "pkce":
            entry = self.codes.pop(data.get("auth_code"), None)
            if not entry:
                return out(404, {"code": 404, "error_code": "flow_state_not_found", "msg": "invalid flow state"})
            if s256(data.get("code_verifier") or "") != entry[1]:
                return out(400, {"code": 400, "error_code": "bad_code_verifier", "msg": "code challenge does not match"})
            return out(200, self.session(entry[0]))
        if path == "/auth/v1/logout":
            self.valid.discard(token)
            return 204, b"", {}
        if path.startswith("/rest/v1/"):
            table = path.split("/")[-1]
            if token and token not in self.valid:
                return out(401, {"code": "PGRST303", "message": "JWT expired"})
            if table == "accounts" and method == "GET":
                uid = q.get("user_id", "").removeprefix("eq.")
                me = token and supa.jwt_claims(token).get("sub")
                return out(200, [self.accounts[uid]] if uid == me and uid in self.accounts else [])
            if table == "accounts" and method == "PATCH":
                uid = supa.jwt_claims(token).get("sub")
                if "is_admin" in data or "pass_until" in data:
                    return out(403, {"code": "42501", "message": "permission denied for table accounts"})
                self.accounts[uid].update(data)
                return 204, b"", {}
            if table == "complete_profile" and method == "POST":
                if self.rpc_missing:
                    return out(404, {"code": "PGRST202", "message": "Could not find the function"})
                uid = supa.jwt_claims(token).get("sub")
                row = self.accounts[uid]
                if row["profiles"]["handle"] != supa.placeholder_handle(uid):
                    return out(400, {"code": "P0001", "message": "cc:already"})
                if any(a["profiles"]["handle"].lower() == data["p_handle"].lower() for a in self.accounts.values()):
                    return out(400, {"code": "P0001", "message": "cc:taken"})
                row["profiles"]["handle"] = data["p_handle"]
                row.update(locale=data["p_locale"], spaces=data["p_spaces"], trial_started_at=iso(datetime.now(timezone.utc)))
                return 204, b"", {}
            if table == "twin_optins":
                if self.rpc_missing:
                    return out(404, {"code": "PGRST205", "message": "Could not find the table"})
                uid = supa.jwt_claims(token).get("sub")
                if method == "POST":
                    assert q.get("on_conflict") == "user_id,form" and "merge-duplicates" in headers.get("Prefer", "")
                    assert set(data) == {"form", "office_id", "filed_month"}, data
                    key = (uid, data["form"])
                    self.seq += 1
                    self.twins[key] = {**data, "created": self.twins.get(key, {}).get("created", self.seq)}
                    return 201, b"", {}
                if method == "DELETE":
                    form = q.get("form", "").removeprefix("eq.")
                    for key in [k for k in self.twins if k[0] == uid and (not form or k[1] == form)]:
                        del self.twins[key]
                    return 204, b"", {}
            if table == "my_case_twins" and method == "POST":
                if self.rpc_missing:
                    return out(404, {"code": "PGRST202", "message": "Could not find the function"})
                uid = supa.jwt_claims(token).get("sub")
                handle = lambda u: self.accounts[u]["profiles"]["handle"]
                rows = []
                for (owner, form), mine in sorted(self.twins.items()):
                    if owner != uid:
                        continue
                    others = sorted(((r["created"], o) for (o, f), r in self.twins.items() if o != uid and f == form
                                     and r["office_id"] == mine["office_id"] and r["filed_month"] == mine["filed_month"]),
                                    reverse=True)
                    n = len(others)   # same buckets as public.my_case_twins()
                    shown = 0 if n < 2 else n if n < 10 else (n // 10) * 10 if n < 50 else 50
                    rows.append({"form": form, "office_id": mine["office_id"], "filed_month": mine["filed_month"][:7],
                                 "others": shown, "plus": (n >= 10 and n % 10 != 0) or n > 50,
                                 "handles": [handle(o) for _, o in others[:9]] if n >= 2 else []})
                return out(200, rows)
            if table == "accounts" and method == "DELETE":
                uid = supa.jwt_claims(token).get("sub")
                self.accounts.pop(uid, None)
                return 204, b"", {}
            if table == "space_counts":
                return out(200, [{"space_id": "i-485", "members": len(self.accounts)}])
            if table == "profiles":
                handle = q.get("handle_key", "").removeprefix("eq.")
                taken = any(a["profiles"]["handle"].lower() == handle for a in self.accounts.values())
                return out(200, [{"id": "x"}] if taken else [])
            if table == "waitlist":
                if data["email"] in self.waitlist:
                    return out(409, {"code": "23505", "message": "duplicate key value violates unique constraint"})
                self.waitlist.add(data["email"])
                return 201, b"", {}
        return out(404, {"message": f"fake: {method} {path}"})


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))
        self.headers = None

    def call(self, method, path, body=None):
        data = json.dumps(body or {}).encode() if method == "POST" else None
        hdrs = {"Content-Type": "application/json", "X-CaseCircle": "1", "Origin": self.base} if method == "POST" else {}
        request = Request(self.base + path, data=data, headers=hdrs, method=method)
        try:
            with self.opener.open(request, timeout=10) as response:
                self.headers = response.headers
                return response.status, json.loads(response.read() or b"null")
        except HTTPError as error:
            self.headers = error.headers
            return error.code, json.loads(error.read() or b"null")

    def cookie(self, name):
        return next((c for c in self.jar if c.name == name), None)

    def get_redirect(self, path):
        """GET without following redirects: (status, Location, Set-Cookie headers)."""
        class Stop(HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        opener = build_opener(HTTPCookieProcessor(self.jar), Stop())
        try:
            with opener.open(Request(self.base + path), timeout=10) as response:
                return response.status, response.headers.get("Location"), response.headers.get_all("Set-Cookie") or []
        except HTTPError as error:
            return error.code, error.headers.get("Location"), error.headers.get_all("Set-Cookie") or []


class SupabaseBackendTest(unittest.TestCase):
    def setUp(self):
        os.environ["SUPABASE_URL"] = FAKE_URL
        os.environ["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test"
        os.environ.pop("CASECIRCLE_TRIAL_DAYS", None)
        os.environ["CASECIRCLE_LLM_MOCK"] = "1"
        community.reset_for_tests()
        folder_chat.reset_rate_limits()
        folder_check.reset_rate_limits()
        supa.reset_for_tests()
        self.fake = FakeSupabase()
        supa.transport = self.fake
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        supa.transport = supa._http
        for name in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"):
            os.environ.pop(name, None)

    def login(self, email="ana@example.com", password="correct horse 1"):
        client = Client(self.base)
        status, body = client.call("POST", "/api/login", {"email": email, "password": password})
        return client, status, body

    # ── config + helpers ──
    def test_enabled_only_with_url_and_key(self):
        self.assertTrue(supa.enabled())
        os.environ.pop("SUPABASE_PUBLISHABLE_KEY")
        self.assertFalse(supa.enabled())
        self.assertIsNone(community.supabase())

    def test_helpers(self):
        self.assertEqual(supa.jwt_claims(jwt("u1", "a@b.co", 5))["sub"], "u1")
        self.assertEqual(supa.jwt_claims("garbage"), {})
        self.assertEqual(supa.iso("2026-11-10T19:52:39.03673+00:00"), "2026-11-10T19:52:39.036Z")
        self.assertAlmostEqual(supa.epoch("2026-11-10T00:00:00Z"), datetime(2026, 11, 10, tzinfo=timezone.utc).timestamp())
        self.assertEqual(supa.quote('a"b\\c,d'), '"a\\"b\\\\c,d"')
        self.assertEqual(supa._like("50%_off*"), "*50\\%\\_off *")
        self.assertEqual(supa.visible_filter(None), ("status", "eq.live"))
        self.assertEqual(supa.visible_filter({"id": "u", "is_admin": True}), ("status", "neq.removed"))
        self.assertEqual(supa.visible_filter({"id": "u", "is_admin": False}), ("or", "(status.eq.live,and(author_id.eq.u,status.eq.held))"))

    def test_error_mapping(self):
        cases = [({"code": "P0001", "message": "cc:rate"}, 400, 429, "rate"),
                 ({"code": "P0001", "message": "cc:ssn"}, 400, 400, "ssn"),
                 ({"code": "P0001", "message": "cc:closed"}, 400, 409, "closed"),
                 ({"code": "23505", "message": "dup"}, 409, 409, "already"),
                 ({"code": "42501", "message": "denied"}, 403, 403, "auth"),
                 ({"code": "PGRST303", "message": "JWT expired"}, 401, 401, "auth")]
        for payload, upstream, status, error in cases:
            err = supa._rest_error(upstream, payload)
            self.assertEqual((err.status, err.payload["error"]), (status, error), payload)

    # ── sign-in, cookies, refresh ──
    def test_login_sets_httponly_cookies_and_me(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, status, body = self.login()
        self.assertEqual(status, 200)
        self.assertEqual(body["user"]["handle"], "ana_m")
        cookies = client.headers.get_all("Set-Cookie")
        self.assertTrue(any(c.startswith("cc_at=") and "HttpOnly" in c and "SameSite=Lax" in c for c in cookies))
        self.assertTrue(any(c.startswith("cc_rt=") and "HttpOnly" in c for c in cookies))
        self.assertNotIn("access_token", json.dumps(body))
        status, me = client.call("GET", "/api/me")
        self.assertEqual(me["user"]["extras"]["reason"], "trial")
        self.assertEqual(me["user"]["extras"]["daysLeft"], 3)
        self.assertEqual(me["groupCounts"], {"i-485": 1})

    def test_bad_password_and_unconfirmed(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        self.fake.add_user("new@example.com", "correct horse 1", "new_one", confirmed=False)
        _, status, body = self.login(password="wrong password 1")
        self.assertEqual((status, body["error"]), (401, "login"))
        _, status, body = self.login("new@example.com")
        self.assertEqual((status, body["error"]), (403, "unconfirmed"))

    def test_expired_access_token_is_refreshed_once_and_rotated(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        self.fake.ttl = 5   # inside the refresh margin: the next request refreshes
        client, status, _ = self.login()
        old_rt = client.cookie("cc_rt").value
        self.fake.ttl = 3600
        status, me = client.call("GET", "/api/me")
        self.assertEqual(me["user"]["handle"], "ana_m")
        self.assertNotEqual(client.cookie("cc_rt").value, old_rt)
        refreshes = [c for c in self.fake.calls if c[2].get("grant_type") == "refresh_token"]
        self.assertEqual(len(refreshes), 1)
        client.call("GET", "/api/me")
        self.assertEqual(len([c for c in self.fake.calls if c[2].get("grant_type") == "refresh_token"]), 1)

    def test_forged_or_revoked_token_is_signed_out(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        self.fake.valid.clear()
        self.fake.refresh.clear()
        status, me = client.call("GET", "/api/me")
        self.assertIsNone(me["user"])
        self.assertIsNone(client.cookie("cc_at"))

    def test_logout_clears_cookies(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        status, _ = client.call("POST", "/api/logout")
        self.assertEqual(status, 200)
        self.assertIsNone(client.cookie("cc_at"))
        self.assertIsNone(client.cookie("cc_rt"))
        self.assertIn(("POST", "/auth/v1/logout", {"scope": "local"}), self.fake.calls)

    # ── signup ──
    def signup_body(self, **extra):
        return {"email": "sam@example.com", "password": "correct horse 1", "handle": "sam_r", "agreeRules": True,
                "agreeNotAdvice": True, "spaces": ["n-400"], **extra}

    def test_signup_with_confirm_email_off_signs_in(self):
        client = Client(self.base)
        status, body = client.call("POST", "/api/signup", self.signup_body())
        self.assertEqual(status, 201)
        self.assertEqual(body["user"]["handle"], "sam_r")
        self.assertEqual(body["user"]["extras"]["reason"], "trial")
        self.assertIsNotNone(client.cookie("cc_at"))

    def test_signup_with_confirm_email_on_asks_to_check_inbox(self):
        self.fake.confirm_email = True
        client = Client(self.base)
        status, body = client.call("POST", "/api/signup", self.signup_body())
        self.assertEqual((status, body["user"], body["confirm"]), (201, None, True))
        self.assertIsNone(client.cookie("cc_at"))
        signup = next(c for c in self.fake.calls if c[1] == "/auth/v1/signup")
        self.assertTrue(signup[2]["redirect_to"].startswith("http://127.0.0.1:"))

    def test_signup_conflicts_and_validation(self):
        self.fake.add_user("sam@example.com", "correct horse 1", "someone")
        status, body = Client(self.base).call("POST", "/api/signup", self.signup_body(handle="new_name"))
        self.assertEqual((status, body["error"]), (409, "email_taken"))
        status, body = Client(self.base).call("POST", "/api/signup", self.signup_body(email="x@example.com", handle="SomeOne"))
        self.assertEqual((status, body["error"]), (409, "taken"))
        status, body = Client(self.base).call("POST", "/api/signup", self.signup_body(email="y@example.com", password="password123"))
        self.assertEqual((status, body["error"]), (400, "password_common"))
        self.assertEqual(len([c for c in self.fake.calls if c[1] == "/auth/v1/signup"]), 1)  # only the email_taken try reached Supabase

    # ── gating stays exactly as before ──
    def test_trial_gating_401_402(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        self.fake.add_user("old@example.com", "correct horse 1", "old_one", trial_age_days=4)
        anon = Client(self.base)
        self.assertEqual(anon.call("GET", "/api/extras/civics")[0], 401)
        self.assertEqual(anon.call("POST", "/api/folder-check", {})[0], 401)
        self.assertEqual(anon.call("POST", "/api/folder-plan", {})[0], 401)
        self.assertEqual(anon.call("POST", "/api/folder-chat", {})[0], 401)
        fresh, _, _ = self.login()
        self.assertEqual(fresh.call("GET", "/api/extras/civics")[0], 200)
        old, _, _ = self.login("old@example.com")
        status, body = old.call("GET", "/api/extras/civics")
        self.assertEqual((status, body["error"]), (402, "extras_locked"))
        for path in ("/api/folder-check", "/api/folder-plan", "/api/folder-chat"):
            self.assertEqual(old.call("POST", path, {})[0], 402, path)
        self.assertEqual(old.call("GET", "/api/me")[1]["user"]["extras"]["reason"], "expired")

    def test_pass_admin_and_owner_squatting(self):
        future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        self.fake.add_user("paid@example.com", "correct horse 1", "paid_one", trial_age_days=10, pass_until=future)
        self.fake.add_user("boss@example.com", "correct horse 1", "boss_one", trial_age_days=10, admin=True)
        owner = next(iter(entitlements.OWNER_EMAILS))
        self.fake.add_user(owner, "correct horse 1", "squatter", trial_age_days=10)   # no DB admin flag
        paid, _, _ = self.login("paid@example.com")
        self.assertEqual(paid.call("GET", "/api/me")[1]["user"]["extras"]["reason"], "paid")
        boss, _, _ = self.login("boss@example.com")
        me = boss.call("GET", "/api/me")[1]["user"]
        self.assertTrue(me["isAdmin"])
        self.assertEqual(me["extras"]["reason"], "admin")
        squat, _, _ = self.login(owner)
        me = squat.call("GET", "/api/me")[1]["user"]
        self.assertFalse(me["isAdmin"])
        self.assertEqual(me["extras"]["reason"], "expired")
        self.assertEqual(squat.call("GET", "/api/mod/queue")[0], 403)

    def test_update_me_cannot_touch_admin_or_pass(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        status, body = client.call("POST", "/api/me", {"locale": "es", "spaces": ["n-400", "BAD SPACE"], "isAdmin": True,
                                                      "is_admin": True, "pass_until": 9e9})
        self.assertEqual(status, 200)
        self.assertEqual((body["user"]["locale"], body["user"]["spaces"], body["user"]["isAdmin"]), ("es", ["n-400"], False))
        patch = [c for c in self.fake.calls if c[0] == "PATCH"]
        self.assertEqual(len(patch), 1)

    def test_waitlist_duplicate_is_ok(self):
        client = Client(self.base)
        for _ in range(2):
            status, body = client.call("POST", "/api/waitlist", {"email": "W@Example.com", "lang": "es"})
            self.assertEqual((status, body), (200, {"ok": True}))
        self.assertEqual(self.fake.waitlist, {"w@example.com"})

    def test_supabase_down_is_503_not_a_crash(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        self.fake.down = True
        status, body = client.call("GET", "/api/me")
        self.assertEqual((status, body["error"]), (503, "server"))
        status, _ = Client(self.base).call("GET", "/healthz")
        self.assertEqual(status, 200)

    def test_csrf_guard_still_applies(self):
        request = Request(self.base + "/api/login", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as caught:
            build_opener().open(request, timeout=10)
        self.assertEqual(caught.exception.code, 403)

    # ── Continue with Google (server-side PKCE) ──
    def google_start(self, client, query="locale=es&next=/%23feed"):
        status, location, cookies = client.get_redirect(f"/api/auth/google?{query}")
        self.assertEqual(status, 302)
        return location, cookies

    def google_sign_in(self, email, client=None):
        """Start, let the fake Supabase 'approve' with the verifier we were given, then hit the callback."""
        client = client or Client(self.base)
        location, _ = self.google_start(client)
        verifier = client.cookie("cc_oauth").value.split(".")[0]
        code = self.fake.google_code(email, verifier)
        status, back, cookies = client.get_redirect(f"/auth/callback?code={code}")
        self.assertEqual(status, 302)
        return client, back, cookies

    def test_google_start_redirects_to_supabase_with_s256_challenge(self):
        client = Client(self.base)
        location, cookies = self.google_start(client)
        target = urlparse(location)
        self.assertEqual(f"{target.scheme}://{target.netloc}{target.path}", FAKE_URL + "/auth/v1/authorize")
        q = {k: v[0] for k, v in parse_qs(target.query).items()}
        self.assertEqual((q["provider"], q["code_challenge_method"]), ("google", "s256"))
        self.assertEqual(q["redirect_to"], self.base + "/auth/callback")
        jar = client.cookie("cc_oauth")
        verifier, locale, _ = jar.value.split(".")
        self.assertEqual(locale, "es")
        self.assertEqual(q["code_challenge"], s256(verifier))
        self.assertGreaterEqual(len(verifier), 43)
        raw = next(c for c in cookies if c.startswith("cc_oauth="))
        for part in ("HttpOnly", "SameSite=Lax", "Max-Age=600", "Path=/"):
            self.assertIn(part, raw)
        self.assertNotIn(verifier, location)   # only the challenge leaves the server
        self.assertIsNone(client.cookie("cc_at"))
        # A second start gets a fresh verifier.
        self.google_start(client)
        self.assertNotEqual(client.cookie("cc_oauth").value.split(".")[0], verifier)

    def test_google_start_never_redirects_off_site_and_honours_secure_cookies(self):
        os.environ["CASECIRCLE_COOKIE_SECURE"] = "1"
        try:
            client = Client(self.base)
            _, cookies = self.google_start(client, "next=//evil.example/x")
            self.assertIn("Secure", next(c for c in cookies if c.startswith("cc_oauth=")))
        finally:
            os.environ.pop("CASECIRCLE_COOKIE_SECURE", None)
        for raw in ("//evil.example", "https://evil.example/", "/\\evil", "javascript:alert(1)", "/ok\x00"):
            self.assertEqual(supa.safe_next(raw), "/", raw)
        self.assertEqual(supa.safe_next("/#post=p3"), "/#post=p3")
        self.assertEqual(supa.app_url("/?a=1#feed", signin="google"), "/?a=1&signin=google#feed")
        self.assertEqual(supa.app_url("/?signin=old", signin_error="google_off", lang="es"), "/?signin_error=google_off&lang=es")

    def test_google_off_sends_people_back_with_a_message(self):
        self.fake.google_on = False
        client = Client(self.base)
        _, me = client.call("GET", "/api/me")
        self.assertEqual(me["providers"], {"google": False})
        location, _ = self.google_start(client, "locale=es")
        self.assertEqual(location, "/?signin_error=google_off&lang=es")
        self.assertIsNone(client.cookie("cc_oauth"))

    def test_google_new_user_finishes_profile_then_trial_starts(self):
        client, back, cookies = self.google_sign_in("gina@gmail.com")
        self.assertEqual(back, "/?signin=google-new&lang=es#feed")
        self.assertIsNotNone(client.cookie("cc_at"))
        self.assertIsNotNone(client.cookie("cc_rt"))
        self.assertIsNone(client.cookie("cc_oauth"))   # one use
        self.assertTrue(any(c.startswith("cc_at=") and "HttpOnly" in c for c in cookies))
        exchange = [c for c in self.fake.calls if c[2].get("grant_type") == "pkce"]
        self.assertEqual(len(exchange), 1)
        status, me = client.call("GET", "/api/me")
        self.assertTrue(me["user"]["needsProfile"])
        self.assertEqual((me["user"]["email"], me["user"]["handle"]), ("gina@gmail.com", ""))
        self.assertEqual(me["user"]["extras"]["reason"], "signin")
        # Until the profile is finished the account counts as signed out everywhere else.
        self.assertEqual(client.call("GET", "/api/extras/civics")[0], 401)
        self.assertEqual(client.call("POST", "/api/folder-check", {})[0], 401)
        self.assertEqual(client.call("POST", "/api/posts", {"type": "question"})[0], 401)
        self.assertEqual(client.call("POST", "/api/me", {"locale": "es"})[0], 401)
        # CSRF guard on the profile step.
        request = Request(self.base + "/api/auth/complete-profile", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as caught:
            build_opener(HTTPCookieProcessor(client.jar)).open(request, timeout=10)
        self.assertEqual(caught.exception.code, 403)
        body = {"handle": "gina_w", "agreeRules": True, "agreeNotAdvice": True, "spaces": ["n-400"], "locale": "es"}
        self.fake.add_user("other@example.com", "correct horse 1", "Taken_One")
        cases = [({**body, "handle": "x"}, 400, "invalid"), ({**body, "handle": "google_fan"}, 400, "reserved"),
                 ({**body, "handle": "user_0123456789"}, 400, "invalid"), ({**body, "agreeNotAdvice": False}, 400, "agree"),
                 ({**body, "handle": "taken_one"}, 409, "taken")]
        for payload, want_status, want_error in cases:
            status, out = client.call("POST", "/api/auth/complete-profile", payload)
            self.assertEqual((status, out["error"]), (want_status, want_error), payload)
        status, out = client.call("POST", "/api/auth/complete-profile", body)
        self.assertEqual(status, 201)
        self.assertEqual((out["user"]["handle"], out["user"]["needsProfile"], out["user"]["hasPassword"]), ("gina_w", False, False))
        self.assertEqual((out["user"]["extras"]["reason"], out["user"]["extras"]["daysLeft"]), ("trial", 3))
        self.assertEqual(client.call("GET", "/api/extras/civics")[0], 200)
        status, out = client.call("POST", "/api/auth/complete-profile", {**body, "handle": "again_1"})
        self.assertEqual((status, out["error"]), (409, "already"))
        # Signing in with Google again goes straight in.
        _, back, _ = self.google_sign_in("gina@gmail.com", client)
        self.assertEqual(back, "/?signin=google#feed")

    def test_google_with_existing_password_email_finds_the_same_account(self):
        uid = self.fake.add_user("ana@example.com", "correct horse 1", "ana_m", trial_age_days=1)
        client, back, _ = self.google_sign_in("ana@example.com")
        self.assertEqual(back, "/?signin=google#feed")
        status, me = client.call("GET", "/api/me")
        self.assertEqual((me["user"]["id"], me["user"]["handle"], me["user"]["needsProfile"]), (f"u{uid}", "ana_m", False))
        self.assertTrue(me["user"]["hasPassword"])
        self.assertEqual(me["user"]["extras"]["daysLeft"], 2)   # the trial is not restarted

    def test_google_callback_error_paths(self):
        client = Client(self.base)
        self.google_start(client)
        status, back, _ = client.get_redirect("/auth/callback?error=access_denied&error_description=denied")
        self.assertEqual(back, "/?signin_error=google_cancelled&lang=es#feed")
        self.assertIsNone(client.cookie("cc_oauth"))
        # No verifier cookie (expired, or the link was opened in another browser).
        status, back, _ = Client(self.base).get_redirect("/auth/callback?code=whatever")
        self.assertEqual(back, "/?signin_error=google_expired&lang=en")
        # A code that was issued for someone else's challenge (login CSRF / code injection).
        client = Client(self.base)
        self.google_start(client)
        code = self.fake.google_code("eve@gmail.com", "", challenge=s256("attacker-verifier-" + "x" * 40))
        status, back, _ = client.get_redirect(f"/auth/callback?code={code}")
        self.assertEqual(back, "/?signin_error=google_expired&lang=es#feed")
        self.assertIsNone(client.cookie("cc_at"))
        # No code at all, an unknown error and a Supabase outage.
        client = Client(self.base)
        self.google_start(client)
        self.assertEqual(client.get_redirect("/auth/callback")[1], "/?signin_error=google_failed&lang=es#feed")
        self.google_start(client)
        self.assertEqual(client.get_redirect("/auth/callback?error=server_error")[1], "/?signin_error=google_failed&lang=es#feed")
        self.google_start(client)
        verifier = client.cookie("cc_oauth").value.split(".")[0]
        code = self.fake.google_code("gina@gmail.com", verifier)
        self.fake.down = True
        self.assertEqual(client.get_redirect(f"/auth/callback?code={code}")[1], "/?signin_error=google_unavailable&lang=es#feed")
        self.assertIsNone(client.cookie("cc_at"))

    def test_complete_profile_before_migration_is_a_clean_503(self):
        client, _, _ = self.google_sign_in("gina@gmail.com")
        self.fake.rpc_missing = True
        status, out = client.call("POST", "/api/auth/complete-profile",
                                  {"handle": "gina_w", "agreeRules": True, "agreeNotAdvice": True})
        self.assertEqual((status, out["error"]), (503, "server"))

    def test_google_only_account_deletes_with_its_public_name(self):
        client, _, _ = self.google_sign_in("gina@gmail.com")
        client.call("POST", "/api/auth/complete-profile", {"handle": "gina_w", "agreeRules": True, "agreeNotAdvice": True})
        status, out = client.call("POST", "/api/account/delete", {"confirm": True, "handle": "someone"})
        self.assertEqual((status, out["error"]), (401, "confirm_handle"))
        status, out = client.call("POST", "/api/account/delete", {"confirm": True, "handle": "Gina_W"})
        self.assertEqual(status, 200)
        self.assertIsNone(client.cookie("cc_at"))

    def test_sqlite_mode_has_no_google(self):
        for name in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"):
            os.environ.pop(name, None)
        status, location, _ = Client(self.base).get_redirect("/api/auth/google")
        self.assertEqual((status, location), (302, "/?signin_error=google_off"))

    # ── Case twins ──
    def twin(self, client, **extra):
        body = {"form": "I-485", "officeId": "miami", "month": "2026-03", **extra}
        return client.call("POST", "/api/twins", body)

    def test_twins_need_an_account(self):
        anon = Client(self.base)
        self.assertEqual(anon.call("GET", "/api/twins")[0], 401)
        self.assertEqual(self.twin(anon)[0], 401)
        self.assertEqual(anon.call("POST", "/api/twins/off", {})[0], 401)

    def test_twins_counts_hide_a_single_other_and_never_leak_private_fields(self):
        names = ["ana_m", "ben_k", "cara_v", "dan_p"]
        clients = []
        for i, handle in enumerate(names):
            self.fake.add_user(f"{handle}@example.com", "correct horse 1", handle)
            clients.append(self.login(f"{handle}@example.com")[0])
        status, body = self.twin(clients[0])
        self.assertEqual(status, 200)
        self.assertEqual(body["cohorts"], [{"form": "I-485", "officeId": "miami", "month": "2026-03", "others": 0,
                                            "plus": False, "handles": []}])
        self.twin(clients[1])
        _, body = clients[0].call("GET", "/api/twins")
        self.assertEqual((body["cohorts"][0]["others"], body["cohorts"][0]["handles"]), (0, []))   # 1 other: "be the first"
        self.twin(clients[2])
        self.twin(clients[3], month="2026-04")   # different month: not a twin
        _, body = clients[0].call("GET", "/api/twins")
        cohort = body["cohorts"][0]
        self.assertEqual(cohort["others"], 2)
        self.assertEqual(sorted(cohort["handles"]), ["ben_k", "cara_v"])
        raw = json.dumps(body)
        for secret in ("@example.com", "00000000-", "password", "2026-03-01"):
            self.assertNotIn(secret, raw)
        # Turning it off removes you from everyone else's matches.
        status, body = clients[2].call("POST", "/api/twins/off", {"form": "I-485"})
        self.assertEqual((status, body["cohorts"]), (200, []))
        _, body = clients[0].call("GET", "/api/twins")
        self.assertEqual((body["cohorts"][0]["others"], body["cohorts"][0]["handles"]), (0, []))

    def test_twins_rough_counts(self):
        self.assertEqual(supa._twins_payload.__name__, "_twins_payload")
        self.fake.add_user("me@example.com", "correct horse 1", "me_one")
        me, _, _ = self.login("me@example.com")
        self.twin(me)
        for i in range(23):
            uid = self.fake.add_user(f"t{i}@example.com", "correct horse 1", f"twin_{i}")
            self.fake.twins[(uid, "I-485")] = {"form": "I-485", "office_id": "miami", "filed_month": "2026-03-01", "created": i}
        _, body = me.call("GET", "/api/twins")
        cohort = body["cohorts"][0]
        self.assertEqual((cohort["others"], cohort["plus"], len(cohort["handles"])), (20, True, 9))

    def test_twins_validation(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        future = datetime.now(timezone.utc) + timedelta(days=40)
        cases = [({"form": "I 485"}, "twin_form"), ({"form": "<b>"}, "twin_form"), ({"officeId": "unsure"}, "twin_office"),
                 ({"officeId": "mars"}, "twin_office"), ({"month": "2026-3"}, "twin_month"),
                 ({"month": f"{future.year}-{future.month:02d}"}, "twin_month"), ({"month": "2026-03-14"}, "twin_month")]
        for extra, error in cases:
            status, body = self.twin(client, **extra)
            self.assertEqual((status, body["error"]), (400, error), extra)
        self.assertEqual(self.fake.twins, {})
        status, body = self.twin(client, form="i-485")   # normalised
        self.assertEqual((status, body["cohorts"][0]["form"]), (200, "I-485"))

    def test_twins_hidden_until_migration_and_for_unfinished_google_signups(self):
        self.fake.add_user("ana@example.com", "correct horse 1", "ana_m")
        client, _, _ = self.login()
        self.fake.rpc_missing = True
        self.assertEqual(client.call("GET", "/api/twins")[1], {"available": False, "cohorts": []})
        self.assertEqual(self.twin(client)[0], 503)
        self.fake.rpc_missing = False
        google, _, _ = self.google_sign_in("gina@gmail.com")
        self.assertEqual(google.call("GET", "/api/twins")[0], 401)
        self.assertEqual(self.twin(google)[0], 401)


if __name__ == "__main__":
    unittest.main()
