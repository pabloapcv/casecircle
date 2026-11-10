import json
import os
import shutil
import tempfile
import threading
import unittest
import urllib.error
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import community
import folder_chat
import folder_check
import mailer
import processing_times
import serve
from community_test import Client

GOOD_TEXT = (
    "ACTA DE MATRIMONIO. Registro Civil. Contrayente: MARIA ELENA LOPEZ GARCIA. "
    "Contrayente: JOHN MICHAEL SMITH. Fecha del matrimonio: 14 de febrero de 2024. Pagina 1 de 2."
)


def check_payload(**over):
    base = {
        "consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485",
        "item": {"id": "i485-marriage", "label": "Marriage certificate + translation"},
        "text": GOOD_TEXT, "source": "pdf", "pages": 1, "otherNames": [],
    }
    base.update(over)
    return base


class ValidateCheckTests(unittest.TestCase):
    def test_valid(self):
        payload, error = folder_check.validate_check(check_payload())
        self.assertIsNone(error)
        self.assertEqual(payload["item"]["id"], "i485-marriage")

    def test_requires_consent(self):
        _, error = folder_check.validate_check(check_payload(consent=False))
        self.assertEqual(error["error"], "consent")
        _, error = folder_check.validate_check(check_payload(consent="yes"))
        self.assertEqual(error["error"], "consent")

    def test_rejects_bad_fields(self):
        cases = [
            {"spaceId": "i-999"}, {"lang": "fr"}, {"form": "I-485; drop"},
            {"item": {"id": "BAD ID", "label": "x"}}, {"item": {"id": "ok", "label": ""}},
            {"text": "short"}, {"text": "x" * 12001}, {"text": 42},
            {"source": "docx"}, {"pages": -1}, {"pages": True}, {"pages": 501}, {"otherNames": "Maria"},
        ]
        for over in cases:
            payload, error = folder_check.validate_check(check_payload(**over))
            self.assertIsNone(payload, over)
            self.assertEqual(error["error"], "invalid", over)

    def test_server_masks_identifiers_again(self):
        payload, error = folder_check.validate_check(check_payload(text=GOOD_TEXT + " A-number A123456789, receipt IOE1234567890, SSN 123-45-6789, passport G12345678."))
        self.assertIsNone(error)
        for raw in ("A123456789", "IOE1234567890", "123-45-6789", "G12345678"):
            self.assertNotIn(raw, payload["text"])
        self.assertEqual(payload["maskedOnServer"], 4)

    def test_normalize_drops_unknown_values_and_prediction_words(self):
        out = folder_check.normalize_check_result({
            "status": "possible_issue", "summary": "Good odds of approval here.",
            "findings": [{"code": "made_up", "severity": "extreme", "message": "Something", "fix": "Do it"}] * 12,
            "facts": {"names": ["Maria Lopez"], "expires": "soon", "language": "klingon"},
        })
        self.assertEqual(len(out["findings"]), folder_check.MAX_FINDINGS)
        self.assertEqual(out["findings"][0]["code"], "other")
        self.assertEqual(out["findings"][0]["severity"], "medium")
        self.assertNotIn("odds", out["summary"].lower())
        self.assertIsNone(out["facts"]["expires"])
        self.assertEqual(out["facts"]["language"], "")
        self.assertEqual(out["facts"]["primaryName"], "Maria Lopez")
        self.assertIsNone(folder_check.normalize_check_result({"status": "approved"}))

    def test_plan_validation(self):
        good = {"consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485", "answers": {"basis": "marriage"}, "description": "Married, divorced before. A123456789", "items": [{"id": "i485-form", "label": "Form", "required": True}]}
        payload, error = folder_check.validate_plan(good)
        self.assertIsNone(error)
        self.assertNotIn("A123456789", payload["description"])
        for over in ({"answers": {"bad key!": "x"}}, {"items": []}, {"description": "x" * 1501}, {"items": [{"id": "BAD", "label": "x"}]}):
            _, error = folder_check.validate_plan({**good, **over})
            self.assertEqual(error["error"], "invalid", over)

    def test_plan_never_removes_required(self):
        payload, _ = folder_check.validate_plan({"consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485", "answers": {}, "items": [{"id": "i485-form", "label": "Form", "required": True}, {"id": "i485-travel", "label": "Travel", "required": False}]})
        out = folder_check.normalize_plan_result({"remove": [{"id": "i485-form", "reason": "x"}, {"id": "i485-travel", "reason": "No trips"}], "add": [{"label": "Form", "reason": "dupe"}]}, payload)
        self.assertEqual([row["id"] for row in out["remove"]], ["i485-travel"])
        self.assertEqual(out["add"], [])


class MockHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder_chat.reset_rate_limits()
        folder_check.reset_rate_limits()
        os.environ["CASECIRCLE_LLM_MOCK"] = "1"
        os.environ["CASECIRCLE_PROCESSING_TIMES_LIVE"] = "0"
        os.environ.pop("CASECIRCLE_LLM_API_KEY", None)
        cls.tmp = tempfile.mkdtemp()
        os.environ["CASECIRCLE_DB_PATH"] = os.path.join(cls.tmp, "test.db")
        os.environ["CASECIRCLE_EMAIL_PROVIDER"] = "console"
        os.environ["CASECIRCLE_EMAIL_SYNC"] = "1"
        os.environ["CASECIRCLE_OUTBOX_DIR"] = os.path.join(cls.tmp, "outbox")
        mailer.clear_outbox()
        community.reset_for_tests()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        port = cls.server.server_address[1]
        serve.Handler.server_port = port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{port}"
        cls.user = Client(cls.origin)
        status, _, _ = cls.user.signup("CheckUser")
        if status != 201:
            raise RuntimeError(f"signup failed: {status}")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        community.reset_for_tests()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        for key in ("CASECIRCLE_LLM_MOCK", "CASECIRCLE_PROCESSING_TIMES_LIVE", "CASECIRCLE_DB_PATH",
                    "CASECIRCLE_EMAIL_PROVIDER", "CASECIRCLE_EMAIL_SYNC", "CASECIRCLE_OUTBOX_DIR"):
            os.environ.pop(key, None)

    def _post(self, path, payload, origin=None):
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Origin": origin or self.origin}
        return self.user.opener.open(Request(self.origin + path, data=body, headers=headers, method="POST"), timeout=5)

    def test_status(self):
        with urlopen(Request(self.origin + "/api/ai-status", headers={"Origin": self.origin}), timeout=5) as response:
            data = json.loads(response.read().decode())
        self.assertTrue(data["mock"])
        self.assertEqual(data["provider"], "demo")
        self.assertNotIn("key", json.dumps(data).lower())

    def test_mock_check_returns_structured_findings(self):
        with self._post("/api/folder-check", check_payload()) as response:
            data = json.loads(response.read().decode())
        self.assertTrue(data["mock"])
        self.assertIn(data["status"], ("matches", "possible_issue", "mismatch"))
        codes = {row["code"] for row in data["findings"]}
        self.assertIn("translation_missing", codes)
        for row in data["findings"]:
            self.assertTrue(row["message"] and row["fix"])
            self.assertIn(row["code"], folder_check.CODES)

    def test_mock_check_wrong_document(self):
        text = "Bank of Somewhere. Joint checking account statement for March 2025. Balance and transactions listed below for both account holders."
        with self._post("/api/folder-check", check_payload(item={"id": "i485-birth", "label": "Birth certificate + translation"}, text=text, source="text", pages=None)) as response:
            data = json.loads(response.read().decode())
        self.assertEqual(data["status"], "mismatch")

    def test_mock_check_expired_passport(self):
        text = "PASSPORT. Surname LOPEZ. Given names MARIA. Date of expiry: 2020-01-15. Authority SRE Mexico."
        with self._post("/api/folder-check", check_payload(item={"id": "i485-passport", "label": "Passport copy (bio page)"}, text=text, source="text", pages=None)) as response:
            data = json.loads(response.read().decode())
        self.assertIn("date_expired", {row["code"] for row in data["findings"]})

    def test_rejects_without_consent_and_bad_origin(self):
        with self.assertRaises(HTTPError) as ctx:
            self._post("/api/folder-check", check_payload(consent=False))
        self.assertEqual(ctx.exception.code, 403)
        with self.assertRaises(HTTPError) as ctx:
            self._post("/api/folder-check", check_payload(text="tiny"))
        self.assertEqual(ctx.exception.code, 400)
        with self.assertRaises(HTTPError) as ctx:
            self._post("/api/folder-check", check_payload(), origin="https://evil.example")
        self.assertEqual(ctx.exception.code, 403)

    def test_mock_plan(self):
        payload = {"consent": True, "lang": "en", "spaceId": "i-485", "form": "I-485", "answers": {"basis": "marriage", "priorMarriage": "yes"}, "description": "", "items": [{"id": "i485-form", "label": "Form I-485", "required": True}, {"id": "i485-travel", "label": "Travel history", "required": False}]}
        with self._post("/api/folder-plan", payload) as response:
            data = json.loads(response.read().decode())
        self.assertTrue(data["mock"])
        self.assertTrue(data["add"])
        self.assertTrue(all(row["reason"] for row in data["add"]))

    def test_prompts_and_python_are_not_served(self):
        for path in ("/folder_check.py", "/serve.py", "/data/cache/processing-times.json"):
            with self.assertRaises(HTTPError) as ctx:
                urlopen(self.origin + path, timeout=5)
            self.assertEqual(ctx.exception.code, 404, path)

    def test_processing_times_endpoint_without_live(self):
        with urlopen(self.origin + "/api/processing-times?form=I-485", timeout=5) as response:
            data = json.loads(response.read().decode())
        self.assertEqual(data["officialUrl"], "https://egov.uscis.gov/processing-times/")
        self.assertIn(data["source"], ("none", "snapshot", "cache", "live"))
        with self.assertRaises(HTTPError) as ctx:
            urlopen(self.origin + "/api/processing-times?form=I-999", timeout=5)
        self.assertEqual(ctx.exception.code, 400)


class ProcessingTimesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = os.path.join(self.tmp.name, "cache.json")
        self.snapshot = os.path.join(self.tmp.name, "snap.json")
        with open(self.snapshot, "w") as handle:
            json.dump({"checkedAt": "2026-11-05", "forms": {"I-485": {"formUrl": "https://www.uscis.gov/i-485", "offices": {}}}}, handle)
        os.environ["CASECIRCLE_PROCESSING_TIMES_LIVE"] = "1"

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("CASECIRCLE_PROCESSING_TIMES_LIVE", None)

    def test_live_then_cached(self):
        calls = []

        def fetcher(form, office):
            calls.append((form, office))
            return {"subtypes": [{"name": "Family-based", "months": 10.5}]}

        first = processing_times.lookup("I-485", "NBC", fetcher=fetcher, cache_path=self.cache, snapshot_path=self.snapshot)
        second = processing_times.lookup("I-485", "NBC", fetcher=fetcher, cache_path=self.cache, snapshot_path=self.snapshot)
        self.assertEqual(first["source"], "live")
        self.assertEqual(second["data"]["subtypes"][0]["months"], 10.5)
        self.assertEqual(len(calls), 1)  # refreshed at most daily

    def test_blocked_falls_back_without_numbers(self):
        def fetcher(form, office):
            raise urllib.error.HTTPError("https://egov.uscis.gov", 403, "Forbidden", {}, None)

        out = processing_times.lookup("I-485", "NBC", fetcher=fetcher, cache_path=self.cache, snapshot_path=self.snapshot)
        self.assertEqual(out["source"], "none")
        self.assertIsNone(out["data"])
        self.assertEqual(out["officialUrl"], "https://egov.uscis.gov/processing-times/")

    def test_rejects_bad_input(self):
        self.assertEqual(processing_times.lookup("I-999", "", cache_path=self.cache, snapshot_path=self.snapshot)["error"], "invalid")
        self.assertEqual(processing_times.lookup("I-485", "nbc1", cache_path=self.cache, snapshot_path=self.snapshot)["error"], "invalid")


if __name__ == "__main__":
    unittest.main()


class EditionTableTests(unittest.TestCase):
    def test_table_has_the_verified_editions(self):
        table = folder_check.load_editions()
        self.assertEqual(table["forms"]["I-485"]["accepted"], ["09/18/26"])
        self.assertIn("01/20/25", table["forms"]["I-485"]["rejected"])
        for form, row in table["forms"].items():
            self.assertTrue(row["url"].startswith("https://www.uscis.gov/"), form)
            self.assertTrue(row["accepted"], form)

    def test_check_edition_verdicts(self):
        self.assertEqual(folder_check.check_edition("I-485", "09/18/26")[0], "ok")
        self.assertEqual(folder_check.check_edition("i-485", "1/20/2025")[0], "rejected")
        self.assertEqual(folder_check.check_edition("I-485", "09/04/26")[0], "unlisted")
        self.assertEqual(folder_check.check_edition("I-765", "09/15/26")[0], "rejected")
        self.assertEqual(folder_check.check_edition("I-693", "03/09/23")[0], "ok")
        self.assertEqual(folder_check.check_edition("I-999", "01/01/20")[0], "unknown_form")

    def test_footer_detection_and_findings(self):
        self.assertEqual(folder_check.find_edition("Form I-485 Edition 09/18/26 Page 1 of 20", ""), ("I-485", "09/18/26"))
        self.assertIsNone(folder_check.edition_finding("Form I-485 Edition 09/18/26 Page 1 of 20", "I-485"))
        old = folder_check.edition_finding("Form I-485 Edition 01/20/25 Page 3 of 20", "I-485")
        self.assertEqual((old["code"], old["severity"]), ("wrong_edition", "high"))
        self.assertIn("09/18/26", old["message"])
        es = folder_check.edition_finding("Form I-485 Edition 01/20/25 Page 3 of 20", "I-485", "es")
        self.assertIn("Descarga", es["fix"])
        odd = folder_check.edition_finding("Form I-485 Edition 09/04/26 Page 1 of 20", "I-485")
        self.assertEqual(odd["severity"], "medium")

    def test_table_overrides_model_edition_findings(self):
        payload = {"text": "Form N-400 Edition 01/20/25 Page 1 of 14", "form": "N-400", "lang": "en"}
        model = {"status": "possible_issue", "findings": [{"code": "wrong_edition", "severity": "high", "message": "old", "fix": "x"}]}
        cleaned = folder_check.apply_edition_table(model, payload)
        self.assertEqual(cleaned["findings"], [])
        stale = folder_check.apply_edition_table({"status": "matches", "findings": []},
                                                 {**payload, "text": "Form I-485 Edition 01/20/25 Page 1 of 20", "form": "I-485"})
        self.assertEqual(stale["status"], "possible_issue")
        self.assertEqual(stale["findings"][0]["code"], "wrong_edition")

    def test_prompt_lists_accepted_editions(self):
        prompt = folder_check.check_system_prompt("en")
        self.assertIn("09/18/26", prompt)
