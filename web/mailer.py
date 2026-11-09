"""Outgoing email for CaseCircle (stdlib only).

Provider from CASECIRCLE_EMAIL_PROVIDER:
  console (default) - prints the message (with its link) to the server log and writes it to
                      web/data/outbox/ (or CASECIRCLE_OUTBOX_DIR). For local development only.
  resend            - Resend HTTP API (RESEND_API_KEY)
  smtp              - SMTP with STARTTLS (SMTP_HOST, SMTP_PORT=587, SMTP_USER, SMTP_PASSWORD)
Sender: CASECIRCLE_EMAIL_FROM, e.g. "CaseCircle <no-reply@mail.casecircle.app>".

Outside console mode nothing about the link/token is logged: only the template kind and the
recipient's domain. Messages are sent on a background thread so response timing does not reveal
whether an account exists (set CASECIRCLE_EMAIL_SYNC=1 to send inline, used by tests).
"""
from __future__ import annotations

import html
import json
import os
import re
import smtplib
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
OUTBOX: list[dict[str, Any]] = []  # console mode only: last messages, for tests and debugging
_outbox_lock = threading.Lock()


def provider() -> str:
    value = os.environ.get("CASECIRCLE_EMAIL_PROVIDER", "console").strip().lower()
    return value if value in {"console", "resend", "smtp"} else "console"


def sender() -> str:
    return os.environ.get("CASECIRCLE_EMAIL_FROM", "CaseCircle <no-reply@casecircle.local>")


def outbox_dir() -> str:
    return os.environ.get("CASECIRCLE_OUTBOX_DIR") or os.path.join(HERE, "data", "outbox")


# ───────────────────────── templates ─────────────────────────

FOOTER = {
    "en": "CaseCircle is not legal advice and is not affiliated with USCIS. If you didn't ask for this, you can ignore this email.",
    "es": "CaseCircle no es asesoría legal y no está afiliado a USCIS. Si no pediste esto, puedes ignorar este correo.",
}

TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "verify": {
        "en": {"subject": "Confirm your email for CaseCircle",
               "title": "Confirm your email",
               "body": "Hi {handle}, tap the button to confirm this email address. After that you can post and reply in CaseCircle.",
               "button": "Confirm email",
               "note": "This link works once and expires in 24 hours."},
        "es": {"subject": "Confirma tu correo en CaseCircle",
               "title": "Confirma tu correo",
               "body": "Hola {handle}, toca el botón para confirmar esta dirección. Después podrás publicar y responder en CaseCircle.",
               "button": "Confirmar correo",
               "note": "Este enlace funciona una sola vez y vence en 24 horas."},
    },
    "email_change": {
        "en": {"subject": "Confirm your new email for CaseCircle",
               "title": "Confirm your new email",
               "body": "Hi {handle}, you asked to use this address for your CaseCircle account. Confirm it to finish the change.",
               "button": "Confirm new email",
               "note": "This link works once and expires in 24 hours. Until then your old address stays on the account."},
        "es": {"subject": "Confirma tu nuevo correo en CaseCircle",
               "title": "Confirma tu nuevo correo",
               "body": "Hola {handle}, pediste usar esta dirección en tu cuenta de CaseCircle. Confírmala para terminar el cambio.",
               "button": "Confirmar nuevo correo",
               "note": "Este enlace funciona una sola vez y vence en 24 horas. Mientras tanto se mantiene tu correo anterior."},
    },
    "reset": {
        "en": {"subject": "Reset your CaseCircle password",
               "title": "Reset your password",
               "body": "Hi {handle}, someone asked to reset the password for your CaseCircle account. If it was you, choose a new password.",
               "button": "Choose a new password",
               "note": "This link works once and expires in 1 hour. Resetting signs you out on every device."},
        "es": {"subject": "Restablece tu contraseña de CaseCircle",
               "title": "Restablece tu contraseña",
               "body": "Hola {handle}, alguien pidió restablecer la contraseña de tu cuenta de CaseCircle. Si fuiste tú, elige una nueva contraseña.",
               "button": "Elegir nueva contraseña",
               "note": "Este enlace funciona una sola vez y vence en 1 hora. Al restablecerla se cerrará tu sesión en todos los dispositivos."},
    },
    "password_changed": {
        "en": {"subject": "Your CaseCircle password was changed",
               "title": "Your password was changed",
               "body": "Hi {handle}, the password for your CaseCircle account was just changed and other devices were signed out.",
               "button": "",
               "note": "If this wasn't you, reset your password now from the sign-in page and write to support@casecircle.app."},
        "es": {"subject": "Se cambió tu contraseña de CaseCircle",
               "title": "Se cambió tu contraseña",
               "body": "Hola {handle}, se acaba de cambiar la contraseña de tu cuenta de CaseCircle y se cerró la sesión en otros dispositivos.",
               "button": "",
               "note": "Si no fuiste tú, restablece tu contraseña desde la página de inicio de sesión y escribe a support@casecircle.app."},
    },
    "email_changed": {
        "en": {"subject": "Your CaseCircle email is changing",
               "title": "Email change requested",
               "body": "Hi {handle}, someone signed in to your account asked to move it to {new_email}. It switches only after that address is confirmed.",
               "button": "",
               "note": "If this wasn't you, change your password now and write to support@casecircle.app."},
        "es": {"subject": "Tu correo de CaseCircle va a cambiar",
               "title": "Se pidió cambiar el correo",
               "body": "Hola {handle}, alguien con acceso a tu cuenta pidió moverla a {new_email}. El cambio ocurre solo cuando esa dirección se confirme.",
               "button": "",
               "note": "Si no fuiste tú, cambia tu contraseña ahora y escribe a support@casecircle.app."},
    },
}


def render(kind: str, lang: str, link: str = "", **values: str) -> dict[str, str]:
    lang = "es" if lang == "es" else "en"
    t = {k: v.format(**values) if "{" in v else v for k, v in TEMPLATES[kind][lang].items()}
    text_lines = [t["title"], "", t["body"], ""]
    if link and t["button"]:
        text_lines += [f"{t['button']}: {link}", ""]
    text_lines += [t["note"], "", "— CaseCircle", FOOTER[lang]]
    e = {k: html.escape(v) for k, v in t.items()}
    button = (f'<p style="margin:24px 0"><a href="{html.escape(link, quote=True)}" style="display:inline-block;background:#1F7A6E;'
              f'color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">{e["button"]}</a></p>'
              f'<p style="font-size:13px;color:#5E6A66;word-break:break-all">{html.escape(link)}</p>') if link and t["button"] else ""
    body_html = f"""<!doctype html><html lang="{lang}"><body style="margin:0;background:#F5F3EE;font-family:'Inter Tight',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#1B2422">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<p style="font-weight:800;font-size:18px;margin:0 0 16px;color:#1F5A52">◉ CaseCircle</p>
<div style="background:#FFFFFF;border:1px solid #E2DED5;border-radius:16px;padding:28px">
<h1 style="font-size:22px;margin:0 0 12px">{e["title"]}</h1>
<p style="font-size:16px;line-height:1.55;margin:0">{e["body"]}</p>
{button}
<p style="font-size:14px;line-height:1.5;color:#5E6A66;margin:16px 0 0">{e["note"]}</p>
</div>
<p style="font-size:12px;line-height:1.5;color:#5E6A66;margin:16px 4px 0">{html.escape(FOOTER[lang])}</p>
</div></body></html>"""
    return {"subject": t["subject"], "text": "\n".join(text_lines), "html": body_html}


# ───────────────────────── providers ─────────────────────────

def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1] if "@" in address else "?"


def _send_console(to: str, msg: dict[str, str], kind: str) -> None:
    record = {"to": to, "from": sender(), "kind": kind, "at": time.time(), **msg}
    with _outbox_lock:
        OUTBOX.append(record)
        del OUTBOX[:-50]
    try:
        folder = outbox_dir()
        os.makedirs(folder, exist_ok=True)
        safe = re.sub(r"[^a-zA-Z0-9@._-]", "_", to)[:80]
        name = f"{time.strftime('%Y%m%d-%H%M%S')}-{int(time.time() * 1000) % 1000:03d}-{kind}-{safe}"
        with open(os.path.join(folder, name + ".txt"), "w", encoding="utf-8") as handle:
            handle.write(f"From: {sender()}\nTo: {to}\nSubject: {msg['subject']}\n\n{msg['text']}\n")
        with open(os.path.join(folder, name + ".html"), "w", encoding="utf-8") as handle:
            handle.write(msg["html"])
    except OSError:
        pass
    print(f"\n[console email] To: {to}\nSubject: {msg['subject']}\n{msg['text']}\n", file=sys.stderr, flush=True)


def _send_resend(to: str, msg: dict[str, str]) -> None:
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        raise RuntimeError("RESEND_API_KEY missing")
    payload = json.dumps({"from": sender(), "to": [to], "subject": msg["subject"], "text": msg["text"], "html": msg["html"]}).encode()
    request = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST", headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "CaseCircle/1.0"})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status >= 300:
            raise RuntimeError(f"resend status {response.status}")


def _send_smtp(to: str, msg: dict[str, str]) -> None:
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        raise RuntimeError("SMTP_HOST missing")
    message = EmailMessage()
    message["From"] = sender()
    message["To"] = to
    message["Subject"] = msg["subject"]
    message.set_content(msg["text"])
    message.add_alternative(msg["html"], subtype="html")
    with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=20) as client:
        client.starttls(context=ssl.create_default_context())
        user = os.environ.get("SMTP_USER", "")
        if user:
            client.login(user, os.environ.get("SMTP_PASSWORD", ""))
        client.send_message(message)


def _deliver(to: str, msg: dict[str, str], kind: str) -> None:
    name = provider()
    try:
        if name == "console":
            _send_console(to, msg, kind)
        elif name == "resend":
            _send_resend(to, msg)
        else:
            _send_smtp(to, msg)
        if name != "console":
            print(f"[email] sent {kind} via {name} to *@{_domain(to)}", file=sys.stderr, flush=True)
    except (OSError, RuntimeError, urllib.error.URLError, smtplib.SMTPException) as error:
        # never include the message body (it holds the link) in the log
        print(f"[email] FAILED {kind} via {name} to *@{_domain(to)}: {type(error).__name__}", file=sys.stderr, flush=True)


def send(to: str, kind: str, lang: str, link: str = "", **values: str) -> None:
    msg = render(kind, lang, link, **values)
    if os.environ.get("CASECIRCLE_EMAIL_SYNC") == "1":
        _deliver(to, msg, kind)
    else:
        threading.Thread(target=_deliver, args=(to, msg, kind), daemon=True).start()


def clear_outbox() -> None:
    with _outbox_lock:
        OUTBOX.clear()
