import json
import os
import shutil
import tempfile
import threading
import unittest
from http.cookiejar import CookieJar
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

import community
import serve


class Client:
    """One browser: its own cookie jar."""

    def __init__(self, base):
        self.base = base
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, headers=None, csrf=True, origin=True):
        data = json.dumps(body or {}).encode() if method == "POST" else None
        hdrs = {"Content-Type": "application/json"}
        if csrf and method == "POST":
            hdrs["X-CaseCircle"] = "1"
        if origin and method == "POST":
            hdrs["Origin"] = self.base
        hdrs.update(headers or {})
        request = Request(self.base + path, data=data, headers=hdrs, method=method)
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, json.loads(response.read() or b"null"), response.headers
        except HTTPError as error:
            return error.code, json.loads(error.read() or b"null"), error.headers

    def get(self, path):
        return self.call("GET", path)

    def post(self, path, body=None, **kw):
        return self.call("POST", path, body, **kw)

    def signup(self, handle, email=None, password="correct horse 1", spaces=("i-485",)):
        return self.post("/api/signup", {"email": email or f"{handle.lower()}@example.com", "password": password,
                                         "handle": handle, "spaces": list(spaces), "locale": "en",
                                         "agreeRules": True, "agreeNotAdvice": True})


POST = {"type": "question", "title": "How long did biometrics take?", "body": "Filed I-485 in March, still waiting for the biometrics notice.", "spaceIds": ["i-485"]}


class CommunityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["CASECIRCLE_DB_PATH"] = os.path.join(self.tmp, "test.db")
        os.environ["CASECIRCLE_ADMIN_EMAILS"] = "boss@example.com"
        os.environ.pop("CASECIRCLE_REPORT_HIDE_THRESHOLD", None)
        community.reset_for_tests()
        self.start()

    def start(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        port = self.server.server_address[1]
        serve.Handler.server_port = port
        self.base = f"http://127.0.0.1:{port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()

    def tearDown(self):
        self.stop()
        community.reset_for_tests()
        shutil.rmtree(self.tmp, ignore_errors=True)
        for key in ("CASECIRCLE_DB_PATH", "CASECIRCLE_ADMIN_EMAILS", "CASECIRCLE_REPORT_HIDE_THRESHOLD"):
            os.environ.pop(key, None)

    # ── accounts ──
    def test_signup_sets_httponly_session_and_me(self):
        ana = Client(self.base)
        status, data, headers = ana.signup("ana_m")
        self.assertEqual(status, 201)
        cookie = headers.get("Set-Cookie")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Lax", cookie)
        self.assertNotIn("Secure", cookie)
        self.assertNotIn("pw_hash", json.dumps(data))
        status, me, _ = ana.get("/api/me")
        self.assertEqual(me["user"]["handle"], "ana_m")
        self.assertEqual(me["groupCounts"].get("i-485"), 1)

    def test_password_is_scrypt_hashed_with_salt(self):
        Client(self.base).signup("ana_m")
        Client(self.base).signup("ben_r", password="correct horse 1")
        conn = community.connect()
        rows = conn.execute("SELECT pw_hash, pw_salt FROM users").fetchall()
        conn.close()
        self.assertEqual(len(rows), 2)
        self.assertNotEqual(rows[0]["pw_hash"], rows[1]["pw_hash"])  # same password, different salt
        self.assertNotIn("correct horse", "".join(rows[0]))
        self.assertTrue(rows[0]["pw_hash"].startswith("scrypt$"))
        self.assertEqual(len(rows[0]["pw_hash"]), len("scrypt$") + 128)

    def test_pbkdf2_fallback_round_trip(self):
        original = community.HAS_SCRYPT
        try:
            community.HAS_SCRYPT = False
            pw_hash, salt = community.hash_password("correct horse 1")
            self.assertTrue(pw_hash.startswith("pbkdf2$"))
            self.assertTrue(community.check_password("correct horse 1", pw_hash, salt))
            self.assertFalse(community.check_password("wrong horse 1", pw_hash, salt))
        finally:
            community.HAS_SCRYPT = original
        self.assertFalse(community.check_password("x", "md5$abc", "00"))

    def test_signup_validation(self):
        c = Client(self.base)
        self.assertEqual(c.signup("ab")[1]["error"], "invalid")
        self.assertEqual(c.signup("uscis_help")[1]["error"], "reserved")
        self.assertEqual(c.signup("ana_m", password="short")[1]["error"], "password")
        self.assertEqual(c.signup("ana_m", email="nope")[1]["error"], "email")
        status, data, _ = c.post("/api/signup", {"email": "a@b.co", "password": "longenough1", "handle": "ana_m"})
        self.assertEqual(data["error"], "agree")

    def test_duplicate_email_and_handle(self):
        self.assertEqual(Client(self.base).signup("ana_m")[0], 201)
        status, data, _ = Client(self.base).signup("ANA_M", email="other@example.com")
        self.assertEqual((status, data["error"]), (409, "taken"))
        status, data, _ = Client(self.base).signup("someone", email="ANA_M@example.com")
        self.assertEqual((status, data["error"]), (409, "email_taken"))
        status, data, _ = Client(self.base).get("/api/handle-check?handle=ana_m")
        self.assertEqual(data["issue"], "taken")

    def test_login_logout(self):
        Client(self.base).signup("ana_m")
        c = Client(self.base)
        self.assertEqual(c.post("/api/login", {"email": "ana_m@example.com", "password": "wrong password"})[0], 401)
        self.assertEqual(c.post("/api/login", {"email": "nobody@example.com", "password": "wrong password"})[0], 401)
        status, data, _ = c.post("/api/login", {"email": "ANA_M@example.com", "password": "correct horse 1"})
        self.assertEqual(status, 200)
        self.assertEqual(c.get("/api/me")[1]["user"]["handle"], "ana_m")
        self.assertEqual(c.post("/api/logout")[0], 200)
        self.assertIsNone(c.get("/api/me")[1]["user"])

    def test_update_profile_groups(self):
        c = Client(self.base)
        c.signup("ana_m")
        status, data, _ = c.post("/api/me", {"spaces": ["i-485", "n-400", "<script>"], "locale": "es",
                                             "profiles": [{"spaceId": "i-485", "form": "I-485", "stage": "biometrics", "evil": "x"}]})
        self.assertEqual(data["user"]["spaces"], ["i-485", "n-400"])
        self.assertEqual(data["user"]["locale"], "es")
        self.assertNotIn("evil", data["user"]["profiles"][0])

    def test_secure_cookie_behind_https_proxy(self):
        os.environ["CASECIRCLE_TRUST_PROXY"] = "1"
        try:
            c = Client(self.base)
            status, _, headers = c.call("POST", "/api/signup", {"email": "p@example.com", "password": "longenough1", "handle": "proxy_u",
                                                                "agreeRules": True, "agreeNotAdvice": True},
                                        headers={"X-Forwarded-Proto": "https"})
            self.assertEqual(status, 201)
            self.assertIn("Secure", headers.get("Set-Cookie"))
        finally:
            os.environ.pop("CASECIRCLE_TRUST_PROXY", None)

    # ── CSRF ──
    def test_csrf_requires_custom_header_and_same_origin(self):
        c = Client(self.base)
        status, data, _ = c.post("/api/signup", {"email": "a@b.co"}, csrf=False)
        self.assertEqual((status, data["error"]), (403, "csrf"))
        status, data, _ = c.post("/api/waitlist", {"email": "a@b.co"}, headers={"Origin": "https://evil.example"})
        self.assertEqual((status, data["error"]), (403, "csrf"))
        c.signup("ana_m")
        status, _, _ = c.post("/api/posts", POST, csrf=False)
        self.assertEqual(status, 403)

    # ── posts + replies ──
    def test_two_users_post_reply_and_survive_restart(self):
        ana, ben = Client(self.base), Client(self.base)
        ana.signup("ana_m")
        ben.signup("ben_r")
        status, data, _ = ana.post("/api/posts", POST)
        self.assertEqual(status, 201)
        pid = data["post"]["id"]
        status, data, _ = ben.post(f"/api/posts/{pid}/replies", {"body": "Mine took about five weeks after filing."})
        self.assertEqual(status, 201)
        self.assertEqual(data["post"]["comments"][0]["author"]["username"], "ben_r")
        # restart the server on the same database file
        self.stop()
        community.reset_for_tests()
        self.start()
        anon = Client(self.base)
        status, data, _ = anon.get("/api/posts?group=i-485")
        self.assertEqual([p["title"] for p in data["posts"]], [POST["title"]])
        self.assertEqual(data["posts"][0]["replyCount"], 1)
        status, data, _ = anon.get(f"/api/posts/{pid}")
        self.assertEqual(data["post"]["comments"][0]["body"], "Mine took about five weeks after filing.")
        self.assertEqual(anon.post(f"/api/posts/{pid}/replies", {"body": "anonymous reply here"})[0], 401)

    def test_post_validation_and_moderation(self):
        c = Client(self.base)
        c.signup("ana_m")
        self.assertEqual(c.post("/api/posts", {**POST, "title": "short"})[1]["error"], "short")
        self.assertEqual(c.post("/api/posts", {**POST, "body": "x" * 6000})[1]["error"], "long")
        self.assertEqual(c.post("/api/posts", {**POST, "type": "timeline"})[1]["error"], "stage")
        self.assertEqual(c.post("/api/posts", {**POST, "body": "My receipt is IOE0912345678 any news?"})[1]["error"], "receipt")
        self.assertEqual(c.post("/api/posts", {**POST, "body": "My SSN is 123-45-6789, is that a problem?"})[1]["error"], "ssn")
        status, data, _ = c.post("/api/posts", {**POST, "body": "Pay to expedite, guaranteed approval, whatsapp me now"})
        self.assertEqual(status, 201)
        self.assertTrue(data["held"])
        # held posts are only visible to their author
        self.assertEqual(len(Client(self.base).get("/api/posts")[1]["posts"]), 0)

    def test_html_is_stored_as_text(self):
        c = Client(self.base)
        c.signup("ana_m")
        body = "<img src=x onerror=alert(1)> is this <b>normal</b> for biometrics?"
        status, data, headers = c.post("/api/posts", {**POST, "body": body})
        self.assertEqual(data["post"]["body"], body)  # plain text; the client escapes on render
        self.assertIn("application/json", headers.get("Content-Type"))
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")

    def test_filters_and_sorts(self):
        ana, ben = Client(self.base), Client(self.base)
        ana.signup("ana_m")
        ben.signup("ben_r")
        community.reset_rate_limits()
        q = ana.post("/api/posts", POST)[1]["post"]["id"]
        community.reset_rate_limits()
        t = ana.post("/api/posts", {"type": "tip", "title": "Bring copies of everything", "body": "Interview went fine because I had copies.", "spaceIds": ["n-400"]})[1]["post"]["id"]
        ben.post("/api/vote", {"target": t})
        self.assertEqual([p["id"] for p in Client(self.base).get("/api/posts?sort=top")[1]["posts"]], [t, q])
        self.assertEqual([p["id"] for p in Client(self.base).get("/api/posts?sort=unanswered")[1]["posts"]], [q])
        self.assertEqual([p["id"] for p in Client(self.base).get("/api/posts?type=tip")[1]["posts"]], [t])
        self.assertEqual([p["id"] for p in Client(self.base).get("/api/posts?groups=n-400,i-130")[1]["posts"]], [t])
        self.assertEqual([p["id"] for p in Client(self.base).get("/api/posts?q=copies")[1]["posts"]], [t])
        self.assertEqual(len(ana.get("/api/posts?author=me")[1]["posts"]), 2)

    def test_vote_save_helpful(self):
        ana, ben = Client(self.base), Client(self.base)
        ana.signup("ana_m")
        ben.signup("ben_r")
        pid = ana.post("/api/posts", POST)[1]["post"]["id"]
        self.assertEqual(ana.post("/api/vote", {"target": pid})[1]["error"], "self")
        self.assertEqual(ben.post("/api/vote", {"target": pid})[1], {"voted": True, "votes": 1})
        self.assertEqual(ben.post("/api/vote", {"target": pid})[1], {"voted": False, "votes": 0})
        self.assertTrue(ben.post(f"/api/posts/{pid}/save")[1]["saved"])
        saved = ben.get("/api/posts?saved=1")[1]["posts"]
        self.assertEqual([p["id"] for p in saved], [pid])
        self.assertTrue(saved[0]["saved"])
        cid = ben.post(f"/api/posts/{pid}/replies", {"body": "Five weeks for me, hang in there."})[1]["post"]["comments"][0]["id"]
        self.assertEqual(ben.post(f"/api/posts/{pid}/helpful", {"commentId": cid})[0], 403)
        status, data, _ = ana.post(f"/api/posts/{pid}/helpful", {"commentId": cid})
        self.assertEqual(data["post"]["helpfulCommentId"], cid)
        self.assertEqual(ben.get("/api/me")[1]["user"]["reputation"], 10)

    # ── reports + admin ──
    def test_reports_hide_after_threshold_and_admin_unhides(self):
        author = Client(self.base)
        author.signup("ana_m")
        pid = author.post("/api/posts", POST)[1]["post"]["id"]
        reporters = []
        for index in range(3):
            r = Client(self.base)
            community.reset_rate_limits()
            r.signup(f"rep_{index}")
            reporters.append(r)
        self.assertEqual(author.post("/api/report", {"target": pid, "reason": "spam"})[0], 200)
        self.assertEqual(author.post("/api/report", {"target": pid, "reason": "spam"})[1]["error"], "already")
        self.assertFalse(reporters[0].post("/api/report", {"target": pid, "reason": "scam"})[1]["hidden"])
        self.assertTrue(reporters[1].post("/api/report", {"target": pid, "reason": "scam"})[1]["hidden"])
        self.assertEqual(Client(self.base).get(f"/api/posts/{pid}")[0], 404)
        self.assertEqual(reporters[2].get("/api/mod/queue")[0], 403)
        boss = Client(self.base)
        community.reset_rate_limits()
        boss.signup("the_boss", email="boss@example.com")
        self.assertTrue(boss.get("/api/me")[1]["user"]["isAdmin"])
        queue = boss.get("/api/mod/queue")[1]["items"]
        self.assertEqual(queue[0]["id"], pid)
        self.assertEqual(queue[0]["openReports"], 3)
        self.assertEqual(reporters[2].post("/api/mod", {"target": pid, "action": "unhide"})[0], 403)
        self.assertEqual(boss.post("/api/mod", {"target": pid, "action": "unhide"})[0], 200)
        self.assertEqual(Client(self.base).get(f"/api/posts/{pid}")[0], 200)
        self.assertEqual(boss.post("/api/mod", {"target": pid, "action": "hide"})[0], 200)
        self.assertEqual(Client(self.base).get(f"/api/posts/{pid}")[0], 404)

    def test_report_threshold_env(self):
        os.environ["CASECIRCLE_REPORT_HIDE_THRESHOLD"] = "1"
        a, b = Client(self.base), Client(self.base)
        a.signup("ana_m")
        b.signup("ben_r")
        pid = a.post("/api/posts", POST)[1]["post"]["id"]
        cid = b.post(f"/api/posts/{pid}/replies", {"body": "Spammy reply text here"})[1]["post"]["comments"][0]["id"]
        self.assertTrue(a.post("/api/report", {"target": cid, "reason": "spam"})[1]["hidden"])
        post = Client(self.base).get(f"/api/posts/{pid}")[1]["post"]
        self.assertEqual(post["comments"], [])
        self.assertEqual(post["replyCount"], 0)

    def test_delete_account_keeps_posts_without_author(self):
        a = Client(self.base)
        a.signup("ana_m")
        pid = a.post("/api/posts", POST)[1]["post"]["id"]
        self.assertEqual(a.post("/api/account/delete", {"password": "nope nope"})[0], 401)
        self.assertEqual(a.post("/api/account/delete", {"password": "correct horse 1"})[0], 200)
        self.assertIsNone(a.get("/api/me")[1]["user"])
        post = Client(self.base).get(f"/api/posts/{pid}")[1]["post"]
        self.assertIsNone(post["author"])

    # ── rate limits ──
    def test_rate_limits(self):
        c = Client(self.base)
        c.signup("ana_m")
        self.assertEqual(c.post("/api/posts", POST)[0], 201)
        status, data, _ = c.post("/api/posts", {**POST, "title": "Second question right away"})
        self.assertEqual((status, data["error"]), (429, "rate"))
        community.reset_rate_limits()
        for index in range(5):
            Client(self.base).signup(f"user_{index}")
        status, data, _ = Client(self.base).signup("one_more")
        self.assertEqual((status, data["error"]), (429, "rate"))
        community.reset_rate_limits()
        for _ in range(10):
            c.post("/api/login", {"email": "ana_m@example.com", "password": "bad bad bad"})
        status, data, _ = c.post("/api/login", {"email": "ana_m@example.com", "password": "correct horse 1"})
        self.assertEqual((status, data["error"]), (429, "rate"))

    # ── waitlist ──
    def test_waitlist_stores_email_lang_source(self):
        c = Client(self.base)
        self.assertEqual(c.post("/api/waitlist", {"email": "bad"})[1]["error"], "email")
        self.assertEqual(c.post("/api/waitlist", {"email": "Maria@Example.com", "lang": "es", "source": "pricing"})[0], 200)
        self.assertEqual(c.post("/api/waitlist", {"email": "maria@example.com", "lang": "es", "source": "pricing"})[0], 200)
        conn = community.connect()
        rows = [dict(r) for r in conn.execute("SELECT email, lang, source FROM waitlist")]
        conn.close()
        self.assertEqual(rows, [{"email": "maria@example.com", "lang": "es", "source": "pricing"}])

    # ── server hygiene ──
    def test_healthz_headers_and_database_not_served(self):
        with urlopen(self.base + "/healthz", timeout=5) as response:
            self.assertEqual(json.loads(response.read()), {"ok": True})
            self.assertIn("default-src 'self'", response.headers.get("Content-Security-Policy"))
            self.assertEqual(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
        with urlopen(self.base + "/styles.css", timeout=5) as response:
            self.assertIn("no-cache", response.headers.get("Cache-Control"))
        for path in ("/data/", "/data/casecircle.db", "/data/test.db-wal", "/.env", "/community.py"):
            with self.assertRaises(HTTPError) as ctx:
                urlopen(self.base + path, timeout=5)
            self.assertEqual(ctx.exception.code, 404)

    def test_migrations_are_idempotent(self):
        conn = community.connect()
        self.assertEqual(community.migrate(conn), len(community.MIGRATIONS))
        self.assertEqual(community.migrate(conn), len(community.MIGRATIONS))
        conn.close()

    def test_bind_address(self):
        self.assertEqual(serve.bind_address(["serve.py"], {}), ("127.0.0.1", 8766))
        self.assertEqual(serve.bind_address(["serve.py"], {"PORT": "10000"}), ("0.0.0.0", 10000))
        self.assertEqual(serve.bind_address(["serve.py", "9000"], {"HOST": "127.0.0.1"}), ("127.0.0.1", 9000))


if __name__ == "__main__":
    unittest.main()
