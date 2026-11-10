import json
import os
import time
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

import community
import entitlements
import community_test as ct
from community_test import Client


def row(**kw):
    base = {"id": 1, "email": "a@example.com", "email_verified": 1, "trial_started_at": None, "pass_until": None}
    base.update(kw)
    return base


class TrialRulesTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("CASECIRCLE_TRIAL_DAYS", None)

    def test_default_trial_is_three_days_and_env_is_clamped(self):
        os.environ.pop("CASECIRCLE_TRIAL_DAYS", None)
        self.assertEqual(entitlements.trial_days(), 3)
        os.environ["CASECIRCLE_TRIAL_DAYS"] = "7"
        self.assertEqual(entitlements.trial_days(), 7)
        os.environ["CASECIRCLE_TRIAL_DAYS"] = "-4"
        self.assertEqual(entitlements.trial_days(), 0)
        os.environ["CASECIRCLE_TRIAL_DAYS"] = "9999"
        self.assertEqual(entitlements.trial_days(), entitlements.MAX_TRIAL_DAYS)
        os.environ["CASECIRCLE_TRIAL_DAYS"] = "abc"
        self.assertEqual(entitlements.trial_days(), 3)

    def test_trial_days_left_then_expired(self):
        now = 1_000_000.0
        user = row(trial_started_at=now)
        status = entitlements.extras_status(user, now=now + 1)
        self.assertEqual((status["access"], status["reason"], status["daysLeft"]), (True, "trial", 3))
        status = entitlements.extras_status(user, now=now + 2.5 * 86400)
        self.assertEqual((status["reason"], status["daysLeft"]), ("trial", 1))
        status = entitlements.extras_status(user, now=now + 3 * 86400)
        self.assertEqual((status["access"], status["reason"], status["daysLeft"]), (False, "expired", 0))

    def test_signed_out_admin_owner_and_paid(self):
        self.assertEqual(entitlements.extras_status(None)["reason"], "signin")
        old = row(trial_started_at=1.0)
        self.assertFalse(entitlements.has_extras(old))
        self.assertTrue(entitlements.has_extras(old, admin=True))
        owner = row(email="PabloAPCV@gmail.com", trial_started_at=1.0)
        self.assertEqual(entitlements.extras_status(owner)["reason"], "admin")
        self.assertFalse(entitlements.has_extras({**owner, "email_verified": 0}), "owner email must be verified")
        paid = row(trial_started_at=1.0, pass_until=time.time() + 60)
        self.assertEqual(entitlements.extras_status(paid)["reason"], "paid")
        lapsed = row(trial_started_at=1.0, pass_until=time.time() - 60)
        self.assertFalse(entitlements.has_extras(lapsed))

    def test_gated_feature_list_and_user_gate(self):
        self.assertEqual(entitlements.gated_feature_list(), ["civics", "folder_chat", "folder_check", "interview"])
        self.assertTrue(entitlements.feature_is_gated("folder_chat"))
        self.assertFalse(entitlements.feature_is_gated("checklist"))
        self.assertFalse(entitlements.feature_is_gated("processing_times"))
        self.assertFalse(entitlements.feature_is_gated("community"))
        self.assertFalse(entitlements.feature_is_gated("interview_tips"))
        self.assertFalse(entitlements.feature_is_gated("folder_plan"))
        signed_out = entitlements.user_gate(None, "folder_chat")
        self.assertEqual(signed_out[0], 401)
        self.assertEqual(signed_out[1]["error"], "signin")
        self.assertIn("folder_chat", signed_out[1]["extras"]["gatedFeatures"])
        self.assertIsNone(entitlements.user_gate(None, "checklist"))
        self.assertIsNone(entitlements.user_gate(None, "folder_plan"))
        expired = row(trial_started_at=1.0)
        refused = entitlements.user_gate(expired, "folder_check")
        self.assertEqual((refused[0], refused[1]["error"], refused[1]["extras"]["reason"]), (402, "extras_locked", "expired"))
        self.assertTrue(entitlements.has_feature(expired, "checklist"))
        self.assertFalse(entitlements.has_feature(expired, "folder_chat"))
        self.assertTrue(entitlements.has_feature(expired, "folder_check", admin=True))

    def test_js_gated_list_matches_python(self):
        js = open(os.path.join(os.path.dirname(__file__), "extras-text.js"), encoding="utf-8").read()
        start = js.index("export const GATED_FEATURES")
        chunk = js[start:js.index("]", start) + 1]
        names = sorted(__import__("re").findall(r'"([a-z_]+)"', chunk))
        self.assertEqual(names, entitlements.gated_feature_list())


class ExtrasApiTest(ct.CommunityTest):
    def expire(self, email):
        conn = community.connect()
        conn.execute("UPDATE users SET trial_started_at = ? WHERE email = ?", (time.time() - 30 * 86400, email))
        conn.close()

    def test_extras_api_is_gated_on_the_server(self):
        anon = Client(self.base)
        self.assertEqual(anon.get("/api/extras")[1]["extras"]["reason"], "signin")
        self.assertEqual(anon.get("/api/extras/civics?version=2025")[0], 401)
        self.assertEqual(anon.get("/api/extras/interview?form=n-400")[0], 401)

        user = Client(self.base)
        self.assertEqual(user.signup("Trialer")[0], 201)
        me = user.get("/api/me")[1]["user"]
        self.assertEqual((me["extras"]["reason"], me["extras"]["daysLeft"], me["extras"]["trialDays"]), ("trial", 3, 3))
        status, body, _ = user.get("/api/extras/civics?version=2025")
        self.assertEqual((status, len(body["questions"]), body["meta"]["asked"], body["meta"]["pass"]), (200, 128, 20, 12))
        status, body, _ = user.get("/api/extras/civics?version=2008")
        self.assertEqual((status, len(body["questions"]), body["meta"]["asked"], body["meta"]["pass"]), (200, 100, 10, 6))
        self.assertEqual(user.get("/api/extras/civics?version=1999")[0], 400)
        status, body, _ = user.get("/api/extras/interview?form=i-485")
        self.assertEqual((status, body["key"]), (200, "marriage"))
        self.assertTrue(all(tip["src"] in body["sources"] for tip in body["tips"]))
        self.assertEqual(user.get("/api/extras/interview?form=i-765")[0], 400)

        self.expire("trialer@example.com")
        status, body, _ = user.get("/api/extras/civics?version=2025")
        self.assertEqual((status, body["error"], body["extras"]["reason"]), (402, "extras_locked", "expired"))
        self.assertEqual(user.get("/api/extras/interview?form=n-400")[0], 402)
        self.assertEqual(user.get("/api/me")[1]["user"]["extras"]["access"], False)

        conn = community.connect()
        uid = conn.execute("SELECT id FROM users WHERE email = ?", ("trialer@example.com",)).fetchone()[0]
        entitlements.grant_pass(conn, uid, time.time() + 86400)
        conn.close()
        self.assertEqual(user.get("/api/extras/civics?version=2025")[0], 200)

    def test_admin_keeps_access_after_trial(self):
        admin = Client(self.base)
        admin.signup("Boss", email="boss@example.com")
        self.expire("boss@example.com")
        self.assertEqual(admin.get("/api/extras/interview?form=n-400")[0], 200)

    def test_existing_account_without_trial_starts_it_on_me(self):
        user = Client(self.base)
        user.signup("Oldtimer")
        conn = community.connect()
        conn.execute("UPDATE users SET trial_started_at = NULL WHERE email = ?", ("oldtimer@example.com",))
        conn.close()
        self.assertEqual(user.get("/api/me")[1]["user"]["extras"]["reason"], "trial")
        conn = community.connect()
        self.assertIsNotNone(conn.execute("SELECT trial_started_at FROM users WHERE email = ?", ("oldtimer@example.com",)).fetchone()[0])
        conn.close()

    def test_premium_json_is_not_served_statically(self):
        for path in ("/data/premium/civics.json", "/data/premium/interview.json", "/data/Premium/civics.json", "/data/%70remium/civics.json"):
            with self.assertRaises(HTTPError) as caught:
                urlopen(self.base + path, timeout=10)
            self.assertEqual(caught.exception.code, 404, path)
        with urlopen(self.base + "/data/form-editions.json", timeout=10) as response:
            self.assertEqual(response.status, 200)


class AiFeatureGateTest(ct.CommunityTest):
    """POST /api/folder-chat and /api/folder-check use the same trial/pass gate as /api/extras/*."""

    def setUp(self):
        os.environ["CASECIRCLE_LLM_MOCK"] = "1"
        os.environ.pop("CASECIRCLE_LLM_API_KEY", None)
        super().setUp()

    def tearDown(self):
        super().tearDown()
        os.environ.pop("CASECIRCLE_LLM_MOCK", None)

    def expire(self, email):
        conn = community.connect()
        conn.execute("UPDATE users SET trial_started_at = ? WHERE email = ?", (time.time() - 30 * 86400, email))
        conn.close()

    def chat_payload(self):
        return {
            "consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485",
            "question": "What should I gather next for this folder?",
            "history": [], "items": [{"id": "edition", "label": "Download I-485", "status": "need"}],
        }

    def check_payload(self):
        return {
            "consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485",
            "item": {"id": "i485-marriage", "label": "Marriage certificate + translation"},
            "text": "ACTA DE MATRIMONIO. Contrayente: MARIA ELENA LOPEZ GARCIA. Fecha del matrimonio: 14 de febrero de 2024.",
            "source": "text", "pages": 1, "otherNames": [],
        }

    def plan_payload(self):
        return {
            "consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485",
            "answers": {"basis": "marriage"}, "description": "Married last year.",
            "items": [{"id": "i485-form", "label": "Form I-485", "required": True}],
        }

    def test_signed_out_ai_posts_are_401_and_ungated_stay_open(self):
        anon = Client(self.base)
        for path, body in (("/api/folder-chat", self.chat_payload()), ("/api/folder-check", self.check_payload())):
            status, payload, _ = anon.post(path, body)
            self.assertEqual(status, 401, path)
            self.assertEqual(payload["error"], "signin")
            self.assertEqual(payload["extras"]["reason"], "signin")
            self.assertIn("folder_chat", payload["extras"]["gatedFeatures"])
            self.assertIn("folder_check", payload["extras"]["gatedFeatures"])
        # folder-plan, Check the wait, and chat/AI status stay available signed out
        self.assertEqual(anon.post("/api/folder-plan", self.plan_payload())[0], 200)
        self.assertEqual(anon.get("/api/processing-times?form=I-485")[0], 200)
        self.assertEqual(anon.get("/api/folder-chat")[0], 200)
        self.assertEqual(anon.get("/api/ai-status")[0], 200)

    def test_trial_user_can_use_ai_then_402_after_expiry(self):
        user = Client(self.base)
        self.assertEqual(user.signup("Gater")[0], 201)
        request = __import__("urllib.request", fromlist=["Request"]).Request(
            self.base + "/api/folder-chat",
            data=__import__("json").dumps(self.chat_payload()).encode(),
            headers={"Content-Type": "application/json", "Origin": self.base},
            method="POST",
        )
        with user.opener.open(request, timeout=10) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("text/event-stream", response.headers.get("Content-Type", ""))
            body = response.read().decode()
        self.assertIn("Test-only mock reply", body)
        self.assertEqual(user.post("/api/folder-check", self.check_payload())[0], 200)
        self.expire("gater@example.com")
        for path, body in (("/api/folder-chat", self.chat_payload()), ("/api/folder-check", self.check_payload())):
            status, payload, _ = user.post(path, body)
            self.assertEqual((status, payload["error"], payload["extras"]["reason"]), (402, "extras_locked", "expired"), path)
        # checklist tailor and Check the wait stay free after the trial
        self.assertEqual(user.post("/api/folder-plan", self.plan_payload())[0], 200)
        self.assertEqual(user.get("/api/processing-times?form=I-485")[0], 200)

    def test_admin_and_pass_keep_ai_access_after_trial(self):
        admin = Client(self.base)
        admin.signup("Boss", email="boss@example.com")
        self.expire("boss@example.com")
        self.assertEqual(admin.post("/api/folder-check", self.check_payload())[0], 200)

        user = Client(self.base)
        user.signup("Payer")
        self.expire("payer@example.com")
        self.assertEqual(user.post("/api/folder-check", self.check_payload())[0], 402)
        conn = community.connect()
        uid = conn.execute("SELECT id FROM users WHERE email = ?", ("payer@example.com",)).fetchone()[0]
        entitlements.grant_pass(conn, uid, time.time() + 86400)
        conn.close()
        self.assertEqual(user.post("/api/folder-check", self.check_payload())[0], 200)


# CommunityTest's own tests are run by community_test.py; don't run them twice here.
for _cls in (ExtrasApiTest, AiFeatureGateTest):
    for _name in [n for n in dir(ct.CommunityTest) if n.startswith("test_")]:
        if _name not in _cls.__dict__:
            setattr(_cls, _name, None)

if __name__ == "__main__":
    unittest.main()
