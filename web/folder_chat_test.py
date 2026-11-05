import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import folder_chat
import serve


class ValidateTests(unittest.TestCase):
    def test_requires_consent(self):
        payload, error = folder_chat.validate_payload({
            "consent": False,
            "lang": "en",
            "spaceId": "i-485",
            "form": "I-485",
            "question": "What is next?",
            "history": [],
            "items": [{"id": "edition", "label": "Download the form", "status": "need"}],
        })
        self.assertIsNone(payload)
        self.assertEqual(error["error"], "consent")

    def test_blocks_receipt_in_question(self):
        _, error = folder_chat.validate_payload({
            "consent": True,
            "lang": "en",
            "spaceId": "i-485",
            "form": "I-485",
            "question": "Receipt IOE1234567890 is on my notice",
            "history": [],
            "items": [],
        })
        self.assertEqual(error["error"], "blocked")
        self.assertEqual(error["reason"], "receipt")

    def test_blocks_identifier_in_history(self):
        _, error = folder_chat.validate_payload({
            "consent": True,
            "lang": "en",
            "spaceId": "n-400",
            "form": "N-400",
            "question": "What else belongs in the folder?",
            "history": [{"role": "user", "text": "SSN 123-45-6789"}],
            "items": [],
        })
        self.assertEqual(error["error"], "blocked")
        self.assertEqual(error["reason"], "ssn")

    def test_context_omits_unrelated_fields(self):
        payload, error = folder_chat.validate_payload({
            "consent": True,
            "lang": "es",
            "spaceId": "i-751",
            "form": "I-751",
            "question": "Que falta en la lista?",
            "history": [],
            "items": [{"id": "joint", "label": "Shared leases", "status": "need"}],
            "email": "hidden@example.com",
            "filed": "2024-01-01",
        })
        self.assertIsNone(error)
        self.assertNotIn("email", payload)
        self.assertNotIn("filed", payload)
        message = folder_chat.context_message(payload)
        self.assertIn("https://www.uscis.gov/i-751", message)
        self.assertNotIn("hidden@example.com", message)

    def test_rejects_oversized_question(self):
        _, error = folder_chat.validate_payload({
            "consent": True,
            "lang": "en",
            "spaceId": "i-130",
            "form": "I-130",
            "question": "x" * (folder_chat.MAX_QUESTION + 1),
            "history": [],
            "items": [],
        })
        self.assertEqual(error["reason"], "question")

    def test_mock_reply_is_labeled(self):
        payload, _ = folder_chat.validate_payload({
            "consent": True,
            "lang": "en",
            "spaceId": "i-765",
            "form": "I-765",
            "question": "What should I check on the form?",
            "history": [],
            "items": [{"id": "code", "label": "Category on the form", "status": "need"}],
        })
        text = folder_chat.mock_reply(payload)
        self.assertIn("Test-only mock reply", text)
        self.assertIn("not a language model", text)
        self.assertIn("https://www.uscis.gov/i-765", text)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder_chat.reset_rate_limits()
        os.environ["CASECIRCLE_LLM_MOCK"] = "1"
        os.environ.pop("CASECIRCLE_LLM_API_KEY", None)
        serve.Handler.server_port = 8769
        cls.server = ThreadingHTTPServer(("127.0.0.1", 8769), serve.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = "http://127.0.0.1:8769"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        os.environ.pop("CASECIRCLE_LLM_MOCK", None)

    def _post(self, payload, origin=None):
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Origin": origin or self.origin}
        request = Request(self.origin + "/api/folder-chat", data=body, headers=headers, method="POST")
        return urlopen(request, timeout=5)

    def test_status_mock_available(self):
        request = Request(self.origin + "/api/folder-chat", headers={"Origin": self.origin})
        with urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode())
        self.assertTrue(data["available"])
        self.assertTrue(data["mock"])

    def test_post_mock_stream(self):
        payload = {
            "consent": True,
            "lang": "en",
            "spaceId": "i-485",
            "form": "I-485",
            "question": "What should I gather next for this folder?",
            "history": [],
            "items": [{"id": "edition", "label": "Download I-485", "status": "need"}],
        }
        with self._post(payload) as response:
            self.assertEqual(response.headers.get_content_type(), "text/event-stream")
            text = response.read().decode()
        self.assertIn("Test-only mock reply", text)
        self.assertIn("not a language model", text)

    def test_rejects_without_consent(self):
        payload = {
            "consent": False,
            "lang": "en",
            "spaceId": "i-485",
            "form": "I-485",
            "question": "What should I gather next?",
            "history": [],
            "items": [],
        }
        with self.assertRaises(HTTPError) as raised:
            self._post(payload)
        self.assertEqual(raised.exception.code, 400)

    def test_rejects_foreign_origin(self):
        payload = {
            "consent": True,
            "lang": "en",
            "spaceId": "i-485",
            "form": "I-485",
            "question": "What should I gather next?",
            "history": [],
            "items": [],
        }
        with self.assertRaises(HTTPError) as raised:
            self._post(payload, origin="http://evil.example")
        self.assertEqual(raised.exception.code, 403)


class NoKeyTests(unittest.TestCase):
    def test_status_without_key_is_unavailable(self):
        old_mock = os.environ.pop("CASECIRCLE_LLM_MOCK", None)
        old_key = os.environ.pop("CASECIRCLE_LLM_API_KEY", None)
        try:
            status = folder_chat.availability()
            self.assertFalse(status["available"])
            self.assertEqual(status["reason"], "no_key")
        finally:
            if old_mock is not None:
                os.environ["CASECIRCLE_LLM_MOCK"] = old_mock
            if old_key is not None:
                os.environ["CASECIRCLE_LLM_API_KEY"] = old_key


if __name__ == "__main__":
    unittest.main()
