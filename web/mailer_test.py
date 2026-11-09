import contextlib
import io
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

import community
import mailer

KINDS = {"verify": {}, "email_change": {}, "reset": {}, "password_changed": {}, "email_changed": {"new_email": "new@example.com"}}


class MailerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.env = mock.patch.dict(os.environ, {"CASECIRCLE_OUTBOX_DIR": self.tmp, "CASECIRCLE_EMAIL_SYNC": "1"})
        self.env.start()
        mailer.clear_outbox()

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_every_template_renders_in_both_languages(self):
        for kind, extra in KINDS.items():
            for lang in ("en", "es"):
                msg = mailer.render(kind, lang, "https://casecircle.app/#verify=abc", handle="ana_m", **extra)
                self.assertTrue(msg["subject"], (kind, lang))
                self.assertIn("CaseCircle", msg["text"])
                self.assertIn(f'lang="{lang}"', msg["html"])
                self.assertIn("USCIS", msg["text"])  # the not-affiliated footer rides on every email
        self.assertIn("new@example.com", mailer.render("email_changed", "es", handle="x", new_email="new@example.com")["text"])

    def test_html_escapes_values_and_links(self):
        msg = mailer.render("verify", "en", 'https://x.test/#verify=a"><script>', handle="<b>ana</b>")
        self.assertNotIn("<script>", msg["html"])
        self.assertNotIn("<b>ana</b>", msg["html"])

    def test_console_provider_writes_outbox_files(self):
        with mock.patch.dict(os.environ, {"CASECIRCLE_EMAIL_PROVIDER": "console"}), contextlib.redirect_stderr(io.StringIO()):
            mailer.send("ana@example.com", "reset", "en", "http://127.0.0.1/#reset=TOKEN123", handle="ana")
        self.assertEqual(mailer.OUTBOX[-1]["to"], "ana@example.com")
        names = sorted(os.listdir(self.tmp))
        self.assertEqual(len(names), 2)
        with open(os.path.join(self.tmp, [n for n in names if n.endswith(".txt")][0]), encoding="utf-8") as handle:
            self.assertIn("#reset=TOKEN123", handle.read())

    def test_resend_payload_and_quiet_log(self):
        seen = {}

        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake_urlopen(request, timeout):
            seen["url"] = request.full_url
            seen["auth"] = request.get_header("Authorization")
            seen["body"] = json.loads(request.data)
            return Response()

        env = {"CASECIRCLE_EMAIL_PROVIDER": "resend", "RESEND_API_KEY": "re_test_key", "CASECIRCLE_EMAIL_FROM": "CaseCircle <hello@mail.casecircle.app>"}
        buf = io.StringIO()
        with mock.patch.dict(os.environ, env), mock.patch("urllib.request.urlopen", fake_urlopen), contextlib.redirect_stderr(buf):
            mailer.send("ana@example.com", "verify", "es", "https://casecircle.app/#verify=SECRET", handle="ana")
        self.assertEqual(seen["url"], "https://api.resend.com/emails")
        self.assertEqual(seen["auth"], "Bearer re_test_key")
        self.assertEqual(seen["body"]["from"], "CaseCircle <hello@mail.casecircle.app>")
        self.assertEqual(seen["body"]["to"], ["ana@example.com"])
        self.assertIn("SECRET", seen["body"]["html"])
        log = buf.getvalue()
        self.assertIn("sent verify via resend to *@example.com", log)
        for secret in ("SECRET", "re_test_key", "ana@example.com"):
            self.assertNotIn(secret, log)
        self.assertEqual(os.listdir(self.tmp), [])  # nothing written to disk outside console mode

    def test_smtp_uses_starttls_and_login(self):
        client = mock.MagicMock()
        smtp = mock.MagicMock()
        smtp.return_value.__enter__.return_value = client
        env = {"CASECIRCLE_EMAIL_PROVIDER": "smtp", "SMTP_HOST": "smtp.example.com", "SMTP_PORT": "2525", "SMTP_USER": "u", "SMTP_PASSWORD": "s3cr3t-pw"}
        buf = io.StringIO()
        with mock.patch.dict(os.environ, env), mock.patch("smtplib.SMTP", smtp), contextlib.redirect_stderr(buf):
            mailer.send("ana@example.com", "password_changed", "en", handle="ana")
        smtp.assert_called_once_with("smtp.example.com", 2525, timeout=20)
        client.starttls.assert_called_once()
        client.login.assert_called_once_with("u", "s3cr3t-pw")
        sent = client.send_message.call_args[0][0]
        self.assertEqual(sent["To"], "ana@example.com")
        self.assertNotIn("s3cr3t-pw", buf.getvalue())
        self.assertIn("sent password_changed via smtp to *@example.com", buf.getvalue())

    def test_unknown_provider_falls_back_to_console(self):
        with mock.patch.dict(os.environ, {"CASECIRCLE_EMAIL_PROVIDER": "carrier-pigeon"}):
            self.assertEqual(mailer.provider(), "console")

    def test_email_validation_blocks_header_tricks(self):
        for bad in ("a@b.co\nBcc: x@y.z", "Ana <a@b.co>", "a b@c.co", "a@b", "a@b.co,c@d.co", "a@.co", "a@b.co."):
            self.assertFalse(community.email_ok(bad), bad)
        for good in ("ana@example.com", "ana.m+cc@mail.example.co.uk"):
            self.assertTrue(community.email_ok(good), good)


if __name__ == "__main__":
    unittest.main()
