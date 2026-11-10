"""Supabase backend (supa.py) without the network: a fake Supabase Auth + PostgREST transport.

The live project is exercised separately (see README "Supabase"); these tests pin the server's behaviour:
cookies, refresh, error mapping, trial/pass/admin gating (401/402) and the signup/confirm flow."""
import base64
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
from urllib.request import HTTPCookieProcessor, Request, build_opener

import community
import entitlements
import folder_chat
import folder_check
import serve
import supa

FAKE_URL = "https://fake-project.supabase.test"


def jwt(sub, email, exp):
    enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    return f"{enc({'alg': 'ES256'})}.{enc({'sub': sub, 'email': email, 'exp': exp, 'role': 'authenticated'})}.c2ln"


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
        at = jwt(user["id"], email, int(time.time()) + (self.ttl if ttl is None else ttl)) + str(self.seq)
        rt = f"rt{self.seq}x{user['id'][-4:]}"
        self.valid.add(at)
        self.refresh[rt] = user["id"]
        return {"access_token": at, "refresh_token": rt, "expires_in": self.ttl, "token_type": "bearer",
                "user": {"id": user["id"], "email": email}}

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


if __name__ == "__main__":
    unittest.main()
