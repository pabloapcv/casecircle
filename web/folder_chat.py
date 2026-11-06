"""Same-origin folder chat: strict payload, PII checks, optional OpenAI-compatible LLM."""
from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Iterator

ALLOWED_SPACES = {"n-400", "i-751", "i-485", "i-130", "i-765", "i-131"}
ALLOWED_STATUS = {"ready", "need", "na"}
ALLOWED_LANG = {"en", "es"}
MAX_BODY = 16_384
MAX_QUESTION = 1_000
MAX_HISTORY = 8
MAX_ITEMS = 80
MAX_LABEL = 200
MAX_TURNS_TEXT = 1_000
PROVIDER_TIMEOUT = 30
MAX_OUTPUT_TOKENS = 800
RATE_MAX = 8
RATE_WINDOW_S = 60

OFFICIAL_URLS = {
    "n-400": "https://www.uscis.gov/n-400",
    "i-751": "https://www.uscis.gov/i-751",
    "i-485": "https://www.uscis.gov/i-485",
    "i-130": "https://www.uscis.gov/i-130",
    "i-765": "https://www.uscis.gov/i-765",
    "i-131": "https://www.uscis.gov/i-131",
}

RECEIPT = re.compile(r"\b[a-z]{3}(?:[-\s]*\d){10}\b", re.I)
A_NUMBER_WORDS = re.compile(r"\b(?:a[-\s]?number|alien\s+number|a#)\b[-\s:]*\d{7,9}\b", re.I)
A_NUMBER = re.compile(r"\bA[-\s]?\d{8,9}\b")
SSN = re.compile(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b")
SSN_WORDS = re.compile(
    r"\b(?:ssn|social\s+security)\b(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*\d{3}-?\d{2}-?\d{4}\b",
    re.I,
)
PASSPORT = re.compile(
    r"\b(?:passport|pasaporte)\b(?:\s*(?:number|no\.?|num(?:ero)?|#))?\s*[:#-]?\s*(?=[a-z0-9]*\d)[a-z0-9]{6,12}\b",
    re.I,
)

_rate_lock = threading.Lock()
_rate: dict[str, list[float]] = {}


def load_dotenv(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def env_name(name: str, default: str = "") -> str:
    return str(os.environ.get(name, default) or default).strip()


def mock_enabled() -> bool:
    return env_name("CASECIRCLE_LLM_MOCK") in {"1", "true", "yes", "on"}


def api_key() -> str:
    return env_name("CASECIRCLE_LLM_API_KEY")


def base_url() -> str:
    return env_name("CASECIRCLE_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")


def model_name() -> str:
    return env_name("CASECIRCLE_LLM_MODEL", "gpt-4o-mini")


def availability() -> dict[str, Any]:
    if mock_enabled():
        return {"available": True, "mock": True, "reason": "mock"}
    if not api_key():
        return {"available": False, "mock": False, "reason": "no_key"}
    return {"available": True, "mock": False, "reason": "ready"}


def scan_text(text: str) -> dict[str, str]:
    raw = str(text or "")
    folded = raw.casefold()
    if RECEIPT.search(raw) or RECEIPT.search(folded):
        return {"verdict": "block", "reason": "receipt"}
    if A_NUMBER_WORDS.search(raw) or A_NUMBER.search(raw):
        return {"verdict": "block", "reason": "a-number"}
    if SSN.search(raw) or SSN_WORDS.search(raw):
        return {"verdict": "block", "reason": "ssn"}
    if PASSPORT.search(raw):
        return {"verdict": "block", "reason": "passport"}
    return {"verdict": "allow", "reason": ""}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def validate_payload(data: Any) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    if not isinstance(data, dict):
        return None, {"error": "invalid", "reason": "body"}
    if data.get("consent") is not True:
        return None, {"error": "consent", "reason": "consent"}
    space_id = str(data.get("spaceId") or "")
    if space_id not in ALLOWED_SPACES:
        return None, {"error": "invalid", "reason": "space"}
    lang = str(data.get("lang") or "en")
    if lang not in ALLOWED_LANG:
        return None, {"error": "invalid", "reason": "lang"}
    form = str(data.get("form") or "")[:40]
    if not re.fullmatch(r"[A-Za-z0-9-]{1,12}", form):
        return None, {"error": "invalid", "reason": "form"}
    question = str(data.get("question") or "").strip()
    if not question or len(question) > MAX_QUESTION:
        return None, {"error": "invalid", "reason": "question"}
    history_in = _as_list(data.get("history"))[:MAX_HISTORY]
    history: list[dict[str, str]] = []
    for item in history_in:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in {"user", "assistant"}:
            return None, {"error": "invalid", "reason": "history"}
        text = str(item.get("text") or "").strip()[:MAX_TURNS_TEXT]
        if not text:
            continue
        history.append({"role": role, "text": text})
    items_in = _as_list(data.get("items"))[:MAX_ITEMS]
    items: list[dict[str, str]] = []
    for item in items_in:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "")
        if not re.fullmatch(r"[a-z0-9-]{1,40}", item_id):
            return None, {"error": "invalid", "reason": "item"}
        status = str(item.get("status") or "need")
        if status not in ALLOWED_STATUS:
            status = "need"
        label = str(item.get("label") or "")[:MAX_LABEL]
        items.append({"id": item_id, "label": label, "status": status})
    official = OFFICIAL_URLS[space_id]
    parts = [question, form, official]
    parts.extend(row["text"] for row in history)
    parts.extend(row["label"] for row in items)
    for part in parts:
        scanned = scan_text(part)
        if scanned["verdict"] == "block":
            return None, {"error": "blocked", "reason": scanned["reason"]}
    return {
        "spaceId": space_id,
        "lang": lang,
        "form": form,
        "question": question,
        "history": history,
        "items": items,
        "officialUrl": official,
    }, None


def system_prompt(lang: str) -> str:
    language = "Spanish" if lang == "es" else "English"
    return (
        "You are the CaseCircle folder assistant. You help someone organize a paper filing "
        "packet for one USCIS form. You organize and explain checklist labels; you do not judge "
        "the case. You are not a lawyer, not a paralegal, not USCIS, and not "
        "a government service. Checklist progress is organization only. It is not legal "
        "eligibility, not evidence strength, not a filing, and not a prediction of approval.\n"
        "Rules:\n"
        "- Help the user mark and gather papers. Point them at the official form instructions URL in the context.\n"
        "- Do not invent filing deadlines, fees, processing times, or medical-exam validity dates. "
        "If asked, say those change and must be read on the current official pages.\n"
        "- Do not treat checklist progress or any percentage as a chance of success or a judgment of the case.\n"
        "- Never say a case is strong, weak, likely to be approved, or likely to be denied.\n"
        "- Do not ask for or repeat receipt numbers, A-numbers, Social Security numbers, passport numbers, or document photos.\n"
        "- For denials, NOIDs, removal, criminal history, or legal eligibility, tell the user to seek a lawyer or accredited representative and to verify official instructions. Do not make that decision.\n"
        f"- Reply in {language}. If unsure, say so and point at the official instructions."
    )


def context_message(payload: dict[str, Any]) -> str:
    lines = [
        f"Form: {payload['form']}",
        f"Official instructions (only citation you may use): {payload['officialUrl']}",
        "Checklist labels and status only. Documents are not attached. No personal identifiers are included.",
    ]
    for item in payload["items"]:
        lines.append(f"- [{item['status']}] {item['label']}")
    return "\n".join(lines)


def provider_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": system_prompt(payload["lang"])},
        {"role": "user", "content": context_message(payload)},
    ]
    for row in payload["history"]:
        messages.append({"role": row["role"], "content": row["text"]})
    messages.append({"role": "user", "content": payload["question"]})
    return messages


def mock_reply(payload: dict[str, Any]) -> str:
    missing = [item["label"] for item in payload["items"] if item["status"] == "need"][:3]
    gap = "; ".join(missing) if missing else (
        "the checklist is marked; still read the official instructions before you file"
    )
    if payload["lang"] == "es":
        return (
            "Respuesta de prueba solamente (no es un modelo de lenguaje). "
            "La lista de la carpeta es organización, no elegibilidad legal ni una aprobación. "
            f"Revisa las instrucciones vigentes en {payload['officialUrl']}. "
            f"Pendiente en la lista: {gap}. "
            "No invento plazos, tarifas ni vigencia médica. "
            "Para negaciones, NOIDs o elegibilidad, consulta a un abogado o representante acreditado."
        )
    return (
        "Test-only mock reply (not a language model). "
        "The folder checklist is organization, not legal eligibility and not an approval. "
        f"Read the current official instructions at {payload['officialUrl']}. "
        f"Still open on the list: {gap}. "
        "I do not invent deadlines, fees, or medical validity. "
        "For denials, NOIDs, or eligibility, talk to a lawyer or accredited representative."
    )


def allowed_origin(origin: str, host: str, port: int) -> bool:
    allowed = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    if origin:
        return origin in allowed
    if host:
        return host in {f"127.0.0.1:{port}", f"localhost:{port}"}
    return False


def rate_limited(ip: str, now: float | None = None) -> bool:
    stamp = now if now is not None else time.time()
    with _rate_lock:
        bucket = [t for t in _rate.get(ip, []) if stamp - t < RATE_WINDOW_S]
        if len(bucket) >= RATE_MAX:
            _rate[ip] = bucket
            return True
        bucket.append(stamp)
        _rate[ip] = bucket
        return False


def reset_rate_limits() -> None:
    with _rate_lock:
        _rate.clear()


def _redact(text: str) -> str:
    return re.sub(r"(Bearer\s+)(\S+)", r"\1[redacted]", str(text or ""), flags=re.I)


def stream_provider(payload: dict[str, Any]) -> Iterator[str]:
    url = base_url() + "/chat/completions"
    body = json.dumps({
        "model": model_name(),
        "messages": provider_messages(payload),
        "stream": True,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Authorization", f"Bearer {api_key()}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=PROVIDER_TIMEOUT) as response:
            for raw in response:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or [{}]
                delta = ((choices[0] or {}).get("delta") or {}).get("content") or ""
                if delta:
                    yield str(delta)
    except urllib.error.HTTPError as error:
        raise RuntimeError("provider") from error
    except Exception as error:
        raise RuntimeError(_redact(str(error))) from error


def iter_reply(payload: dict[str, Any]) -> tuple[bool, Iterator[str]]:
    if mock_enabled():
        text = mock_reply(payload)
        def chunks() -> Iterator[str]:
            yield text
        return True, chunks()
    if not api_key():
        raise RuntimeError("no_key")
    return False, stream_provider(payload)


def sse_bytes(obj: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode("utf-8")


def handle_status(handler: Any, port: int) -> None:
    if not allowed_origin(handler.headers.get("Origin", ""), handler.headers.get("Host", ""), port):
        handler.send_error(403, "Forbidden")
        return
    payload = availability()
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_post(handler: Any, port: int) -> None:
    if not allowed_origin(handler.headers.get("Origin", ""), handler.headers.get("Host", ""), port):
        handler.send_error(403, "Forbidden")
        return
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        _json_error(handler, 415, {"error": "invalid", "reason": "type"})
        return
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY:
        _json_error(handler, 413, {"error": "invalid", "reason": "size"})
        return
    ip = handler.client_address[0] if handler.client_address else "127.0.0.1"
    if rate_limited(ip):
        _json_error(handler, 429, {"error": "rate", "reason": "rate"})
        return
    raw = handler.rfile.read(length)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        _json_error(handler, 400, {"error": "invalid", "reason": "json"})
        return
    payload, error = validate_payload(data)
    if error or payload is None:
        status = 403 if error and error.get("error") == "blocked" else 400
        _json_error(handler, status, error or {"error": "invalid", "reason": "body"})
        return
    status = availability()
    if not status["available"]:
        _json_error(handler, 503, {"error": "unavailable", "reason": status["reason"]})
        return
    try:
        mock, chunks = iter_reply(payload)
    except RuntimeError as error:
        reason = "no_key" if str(error) == "no_key" else "provider"
        _json_error(handler, 503 if reason == "no_key" else 502, {"error": reason, "reason": reason})
        return
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Accel-Buffering", "no")
    handler.end_headers()
    try:
        for delta in chunks:
            handler.wfile.write(sse_bytes({"delta": delta}))
            handler.wfile.flush()
        handler.wfile.write(sse_bytes({"done": True, "mock": mock}))
        handler.wfile.flush()
    except BrokenPipeError:
        return
    except Exception:
        try:
            handler.wfile.write(sse_bytes({"error": "provider"}))
            handler.wfile.flush()
        except Exception:
            return


def _json_error(handler: Any, status: int, payload: dict[str, str]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
