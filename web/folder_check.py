"""AI Folder Builder endpoints: /api/folder-check (one document vs one checklist item) and
/api/folder-plan (tailor the checklist). Strict validation in and out, prompts stay server-side,
identifiers are masked again here even though the browser already masked them.

This grades folder organization. It never predicts a USCIS decision.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import folder_chat as fc

MAX_BODY = 64_000
MAX_TEXT = 12_000
MIN_TEXT = 20
MAX_LABEL = 200
MAX_NAMES = 12
MAX_FINDINGS = 8
MAX_DESCRIPTION = 1_500
MAX_PLAN_ITEMS = 80
MAX_PLAN_CHANGES = 6
PROVIDER_TIMEOUT = 45
RATE_MAX = 30
RATE_WINDOW_S = 60

STATUSES = {"matches", "possible_issue", "mismatch"}
SEVERITIES = {"low", "medium", "high"}
CODES = {
    "name_mismatch", "inconsistent", "date_expired", "date_window", "translation_missing",
    "pages_missing", "signature_missing", "wrong_edition", "unreadable", "wrong_document",
    "thin_evidence", "other",
}
SOURCES = {"pdf", "image", "text"}
ANSWER_VALUE = re.compile(r"[a-z0-9]{1,24}")
ANSWER_KEY = re.compile(r"[A-Za-z0-9]{1,24}")
ITEM_ID = re.compile(r"[a-z0-9-]{1,48}")
FORM = re.compile(r"[A-Za-z0-9-]{1,12}")

# Same patterns as web/redact.js. Server-side masking is defense in depth.
_MASKS = [
    (re.compile(r"\b[A-Za-z]{3}[\s-]?(?:\d[\s-]?){9}\d\b"), "[RECEIPT #]"),
    (re.compile(r"\b(ssn|social\s+security(?:\s+(?:number|no\.?|#))?|seguro\s+social)(\s*[:#]?\s*)(\d{9})\b", re.I), r"\1\2[SSN]"),
    (re.compile(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b"), "[SSN]"),
    (re.compile(r"\b(a[-\s]?number|alien\s+(?:registration\s+)?number|uscis\s*#|n[uú]mero\s+a)(\s*[:#]?\s*)(\d{7,9})\b", re.I), r"\1\2[A-NUMBER]"),
    (re.compile(r"\bA[-\s#]?\d{3}[-\s]?\d{3}[-\s]?\d{2,3}\b"), "[A-NUMBER]"),
    (re.compile(r"\b(passport|pasaporte)((?:\s*(?:number|no\.?|num(?:ero|\.)?|#))?\s*[:#-]?\s*)((?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,12})\b", re.I), r"\1\2[PASSPORT #]"),
    (re.compile(r"\b[A-Za-z]{1,2}\d{7,8}\b|\b\d{9}\b"), "[PASSPORT #]"),
]


def mask(text: str) -> tuple[str, int]:
    out = str(text or "")
    total = 0
    for pattern, repl in _MASKS:
        out, n = pattern.subn(repl, out)
        total += n
    return out, total


_rate_lock = threading.Lock()
_rate: dict[str, list[float]] = {}


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


def provider_info() -> dict[str, Any]:
    status = fc.availability()
    host = urllib.parse.urlparse(fc.base_url()).hostname or ""
    names = {"api.openai.com": "OpenAI", "api.x.ai": "xAI"}
    return {
        **status,
        "provider": "demo" if status.get("mock") else names.get(host, host),
        "host": "" if status.get("mock") else host,
        "model": "" if status.get("mock") else fc.model_name(),
    }


# ───────────── validation ─────────────

def _err(reason: str, kind: str = "invalid") -> tuple[None, dict[str, str]]:
    return None, {"error": kind, "reason": reason}


def _common(data: Any) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    if not isinstance(data, dict):
        return _err("body")
    if data.get("consent") is not True:
        return _err("consent", "consent")
    space_id = str(data.get("spaceId") or "")
    if space_id not in fc.ALLOWED_SPACES:
        return _err("space")
    lang = str(data.get("lang") or "en")
    if lang not in fc.ALLOWED_LANG:
        return _err("lang")
    form = str(data.get("form") or "")
    if not FORM.fullmatch(form):
        return _err("form")
    return {"spaceId": space_id, "lang": lang, "form": form, "officialUrl": fc.OFFICIAL_URLS[space_id]}, None


def validate_check(data: Any) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    base, error = _common(data)
    if error or base is None:
        return None, error
    item = data.get("item")
    if not isinstance(item, dict):
        return _err("item")
    item_id = str(item.get("id") or "")
    if not ITEM_ID.fullmatch(item_id):
        return _err("item")
    label = str(item.get("label") or "").strip()
    if not label or len(label) > MAX_LABEL:
        return _err("label")
    text = data.get("text")
    if not isinstance(text, str):
        return _err("text")
    text = text.strip()
    if len(text) < MIN_TEXT or len(text) > MAX_TEXT:
        return _err("text")
    source = str(data.get("source") or "text")
    if source not in SOURCES:
        return _err("source")
    pages = data.get("pages")
    if pages is not None and (not isinstance(pages, int) or isinstance(pages, bool) or pages < 0 or pages > 500):
        return _err("pages")
    names_in = data.get("otherNames") or []
    if not isinstance(names_in, list):
        return _err("names")
    names = [str(n).strip()[:80] for n in names_in[:MAX_NAMES] if isinstance(n, str) and str(n).strip()]
    masked, masked_count = mask(text)
    names = [mask(n)[0] for n in names]
    if fc.scan_text(label)["verdict"] == "block":
        return _err("label", "blocked")
    return {
        **base,
        "item": {"id": item_id, "label": label},
        "text": masked,
        "maskedOnServer": masked_count,
        "source": source,
        "pages": pages,
        "otherNames": names,
    }, None


def validate_plan(data: Any) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    base, error = _common(data)
    if error or base is None:
        return None, error
    answers_in = data.get("answers") or {}
    if not isinstance(answers_in, dict) or len(answers_in) > 12:
        return _err("answers")
    answers: dict[str, str] = {}
    for key, value in answers_in.items():
        if not ANSWER_KEY.fullmatch(str(key)) or not ANSWER_VALUE.fullmatch(str(value)):
            return _err("answers")
        answers[str(key)] = str(value)
    description = str(data.get("description") or "").strip()
    if len(description) > MAX_DESCRIPTION:
        return _err("description")
    description, _ = mask(description)
    items_in = data.get("items")
    if not isinstance(items_in, list) or not items_in or len(items_in) > MAX_PLAN_ITEMS:
        return _err("items")
    items = []
    for row in items_in:
        if not isinstance(row, dict):
            return _err("items")
        item_id = str(row.get("id") or "")
        label = str(row.get("label") or "").strip()[:MAX_LABEL]
        if not ITEM_ID.fullmatch(item_id) or not label:
            return _err("items")
        if fc.scan_text(label)["verdict"] == "block":
            return _err("items", "blocked")
        items.append({"id": item_id, "label": label, "required": bool(row.get("required"))})
    return {**base, "answers": answers, "description": description, "items": items}, None


def _clip(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


_BANNED = re.compile(r"[^.!?]*(approval (chance|odds|likelihood|probability)|\bodds\b|\blikelihood\b|likely (to be )?(approved|denied)|chances? of (approval|denial|being approved)|probabilidad(es)? de (aprobaci|ser aprobad)|posibilidades de aprobaci)[^.!?]*[.!?]?", re.I)


def _safe(text: str) -> str:
    """Strip any decision-prediction phrasing and identifiers from model output."""
    cleaned = mask(text)[0]
    if _BANNED.search(cleaned):
        cleaned = _BANNED.sub(" [removed: CaseCircle does not predict decisions]", cleaned).strip()
    return cleaned


def normalize_check_result(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    status = str(raw.get("status") or "")
    if status not in STATUSES:
        return None
    findings = []
    for row in (raw.get("findings") or [])[:MAX_FINDINGS]:
        if not isinstance(row, dict):
            continue
        code = str(row.get("code") or "other")
        if code not in CODES:
            code = "other"
        severity = str(row.get("severity") or "medium")
        if severity not in SEVERITIES:
            severity = "medium"
        message = _safe(_clip(row.get("message"), 300))
        fix = _safe(_clip(row.get("fix"), 300))
        if not message:
            continue
        findings.append({"code": code, "severity": severity, "message": message, "fix": fix})
    facts_in = raw.get("facts") if isinstance(raw.get("facts"), dict) else {}
    names = [_safe(_clip(n, 80)) for n in (facts_in.get("names") or [])[:MAX_NAMES] if isinstance(n, str) and n.strip()]
    expires = facts_in.get("expires")
    if not (isinstance(expires, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", expires)):
        expires = None
    language = str(facts_in.get("language") or "")
    if language not in {"en", "es", "other"}:
        language = ""
    doc_type = _clip(facts_in.get("documentType"), 80)
    primary = names[0] if names else ""
    return {
        "status": status,
        "summary": _safe(_clip(raw.get("summary"), 400)),
        "findings": findings,
        "facts": {"names": names, "primaryName": primary, "expires": expires, "language": language, "documentType": doc_type},
    }


def normalize_plan_result(raw: Any, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    allowed_remove = {item["id"] for item in payload["items"] if not item["required"]}
    labels = {item["label"].lower() for item in payload["items"]}
    add = []
    for row in (raw.get("add") or [])[:MAX_PLAN_CHANGES]:
        if not isinstance(row, dict):
            continue
        label = _safe(_clip(row.get("label"), MAX_LABEL))
        reason = _safe(_clip(row.get("reason"), 300))
        if not label or not reason or label.lower() in labels:
            continue
        kind = "evidence" if str(row.get("kind") or "") == "evidence" else "other"
        add.append({"label": label, "reason": reason, "required": bool(row.get("required")), "kind": kind})
    remove = []
    for row in (raw.get("remove") or [])[:MAX_PLAN_CHANGES]:
        if not isinstance(row, dict):
            continue
        item_id = str(row.get("id") or "")
        reason = _safe(_clip(row.get("reason"), 300))
        if item_id in allowed_remove and reason:
            remove.append({"id": item_id, "reason": reason})
    notes = [_safe(_clip(n, 300)) for n in (raw.get("notes") or [])[:3] if isinstance(n, str) and n.strip()]
    return {"add": add, "remove": remove, "notes": notes}


# ───────────── prompts (server-side only) ─────────────

def check_system_prompt(lang: str) -> str:
    language = "Spanish" if lang == "es" else "English"
    return (
        "You are CaseCircle's folder checker. You compare ONE document's extracted text against ONE checklist item "
        "for a USCIS filing packet, and report organization problems the person can fix. You are not a lawyer, not USCIS, "
        "and you do not judge eligibility or predict any decision. Never mention approval chances, odds, likelihood, or "
        "whether a case is strong or weak.\n"
        "Identifiers were masked on the user's device: tokens like [A-NUMBER], [SSN], [RECEIPT #], [PASSPORT #] are "
        "intentional redactions, not missing information. Never ask for them or try to reconstruct them.\n"
        "Look for: the document not being what the checklist item asks for; names that differ from the other names given; "
        "expired documents or dates outside a required window; non-English text with no translator's certification; "
        "missing pages (e.g. 'Page 2 of 4' with pages absent, or fewer PDF pages than stated); missing signature where one is "
        "expected; an old form edition date if one is visible; evidence that looks thin (one record covering a short period).\n"
        "Each finding needs a concrete fix. Do not invent fees, deadlines, or form editions; if a rule depends on current "
        "instructions, say to confirm it on the official page.\n"
        "Return ONLY a JSON object with this shape:\n"
        '{"status":"matches|possible_issue|mismatch","summary":"one sentence",'
        '"findings":[{"code":"name_mismatch|inconsistent|date_expired|date_window|translation_missing|pages_missing|'
        'signature_missing|wrong_edition|unreadable|wrong_document|thin_evidence|other","severity":"low|medium|high",'
        '"message":"what you saw","fix":"what to do"}],'
        '"facts":{"documentType":"","names":["primary person name first"],"expires":"YYYY-MM-DD or null","language":"en|es|other"}}\n'
        "status: matches = the document is what the item asks for and no open issue; possible_issue = right kind of document "
        "with at least one issue, or you cannot confirm; mismatch = it is a different document.\n"
        f"Write summary, message, and fix in {language}. At most 8 findings."
    )


def check_user_message(payload: dict[str, Any], today: str) -> str:
    names = ", ".join(payload["otherNames"]) or "(none yet)"
    pages = payload["pages"] if payload["pages"] is not None else "unknown"
    return (
        f"Today: {today}\nForm: {payload['form']} (official instructions: {payload['officialUrl']})\n"
        f"Checklist item: {payload['item']['label']}\nSource: {payload['source']}, PDF pages: {pages}\n"
        f"Names already seen on other documents in this folder: {names}\n"
        "Extracted text (masked):\n<<<\n" + payload["text"] + "\n>>>"
    )


def plan_system_prompt(lang: str) -> str:
    language = "Spanish" if lang == "es" else "English"
    return (
        "You are CaseCircle's folder planner. Given a USCIS form, the person's short intake answers, an optional masked "
        "description, and the current checklist, suggest at most 6 documents to ADD that the instructions typically call for "
        "in this situation, and at most 6 optional items to REMOVE because they do not fit. Every change needs a one-sentence "
        "reason. You do not decide eligibility, you do not predict any decision, and you never mention approval odds. "
        "Never remove required items. Do not invent fees or deadlines. If something depends on legal judgment (prior removal, "
        "criminal history, waivers), add a note to talk to a lawyer or accredited representative.\n"
        'Return ONLY JSON: {"add":[{"label":"","reason":"","required":false,"kind":"evidence|other"}],'
        '"remove":[{"id":"existing item id","reason":""}],"notes":[""]}\n'
        f"Write labels, reasons and notes in {language}."
    )


def plan_user_message(payload: dict[str, Any]) -> str:
    lines = [f"Form: {payload['form']} (official: {payload['officialUrl']})", "Answers:"]
    lines += [f"- {k}: {v}" for k, v in payload["answers"].items()] or ["- (none)"]
    if payload["description"]:
        lines += ["Description (masked):", payload["description"]]
    lines.append("Current checklist (id | required | label):")
    lines += [f"- {i['id']} | {'required' if i['required'] else 'optional'} | {i['label']}" for i in payload["items"]]
    return "\n".join(lines)


def _extract_json(text: str) -> Any:
    raw = str(text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no json")
    return json.loads(raw[start:end + 1])


def call_provider(system: str, user: str, max_tokens: int = 900) -> Any:
    url = fc.base_url() + "/chat/completions"
    body = {
        "model": fc.model_name(),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    def post(payload: dict[str, Any]) -> Any:
        request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
        request.add_header("Authorization", f"Bearer {fc.api_key()}")
        request.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(request, timeout=PROVIDER_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))

    try:
        data = post(body)
    except urllib.error.HTTPError as error:
        if error.code != 400:
            raise RuntimeError("provider") from error
        body.pop("response_format", None)  # some OpenAI-compatible providers reject it
        try:
            data = post(body)
        except Exception as inner:
            raise RuntimeError("provider") from inner
    except Exception as error:
        raise RuntimeError(fc._redact(str(error))) from error
    content = (((data.get("choices") or [{}])[0] or {}).get("message") or {}).get("content") or ""
    return _extract_json(content)


# ───────────── Demo AI (CASECIRCLE_LLM_MOCK=1) ─────────────

_DOC_TYPES = [
    ("marriage", re.compile(r"certificate of marriage|marriage certificate|marriage license|acta de matrimonio|certificado de matrimonio", re.I), "Marriage certificate", "Acta de matrimonio"),
    ("birth", re.compile(r"birth certificate|certificate of live birth|acta de nacimiento|certificado de nacimiento", re.I), "Birth certificate", "Acta de nacimiento"),
    ("divorce", re.compile(r"divorce|dissolution of marriage|sentencia de divorcio", re.I), "Divorce decree", "Decreto de divorcio"),
    ("passport", re.compile(r"\bpassport\b|\bpasaporte\b", re.I), "Passport", "Pasaporte"),
    ("medical", re.compile(r"i-?693|report of immigration medical|civil surgeon", re.I), "Medical exam (I-693)", "Examen médico (I-693)"),
    ("i864", re.compile(r"i-?864|affidavit of support", re.I), "Affidavit of support (I-864)", "Declaración de apoyo (I-864)"),
    ("i94", re.compile(r"\bi-?94\b|arrival/departure record|admission record", re.I), "I-94 record", "Registro I-94"),
    ("lease", re.compile(r"lease agreement|rental agreement|residential lease|landlord|tenant", re.I), "Lease", "Contrato de arrendamiento"),
    ("bank", re.compile(r"bank statement|account summary|statement period|checking account|savings account|beginning balance", re.I), "Bank statement", "Estado de cuenta"),
    ("tax", re.compile(r"form 1040|tax return|tax transcript|internal revenue service", re.I), "Tax record", "Registro de impuestos"),
    ("greencard", re.compile(r"permanent resident card|resident since|green card", re.I), "Green card", "Tarjeta de residencia"),
    ("form", re.compile(r"application to register permanent residence|petition for alien relative|application for naturalization|application for employment authorization|application for travel document|petition to remove conditions", re.I), "USCIS form", "Formulario de USCIS"),
    ("translation", re.compile(r"certif(y|ication)[^.]{0,80}(translat|competent)|translator", re.I), "Translation certificate", "Certificado de traducción"),
]

_ITEM_TYPES = [
    (re.compile(r"marriage|matrimonio", re.I), {"marriage"}),
    (re.compile(r"birth|nacimiento", re.I), {"birth"}),
    (re.compile(r"divorce|divorcio|prior marriage", re.I), {"divorce"}),
    (re.compile(r"passport|pasaporte", re.I), {"passport"}),
    (re.compile(r"i-?693|medical|médico", re.I), {"medical"}),
    (re.compile(r"i-?864|affidavit of support|declaración de apoyo", re.I), {"i864", "tax"}),
    (re.compile(r"\bi-?94\b", re.I), {"i94"}),
    (re.compile(r"bona fide|evidence|joint|lease|bank|insurance|evidencia|registros conjuntos", re.I), {"lease", "bank", "tax"}),
    (re.compile(r"tax|impuestos", re.I), {"tax"}),
    (re.compile(r"green card|tarjeta", re.I), {"greencard"}),
    (re.compile(r"form i-|form n-|formulario", re.I), {"form"}),
    (re.compile(r"translat|traducci", re.I), {"translation"}),
]

_SPANISH = re.compile(r"\b(de|del|la|el|los|las|y|fecha|nombre|nacimiento|matrimonio|registro|civil|lugar|padre|madre)\b", re.I)
_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b", re.I)
_MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_NAME_LINE = re.compile(r"(?:full name|name of (?:bride|groom|applicant|child|registrant|holder|account holder|tenant|spouse)|account holder|applicant|bride|groom|husband|wife|spouse|tenant|registrant|nombre(?: completo)?|surname[s]?\s*/\s*given names?|name)\s*[:\-]\s*([A-Za-zÀ-ÿ'’.\- ]{3,60})", re.I)


def _parse_date(m: re.Match[str]) -> _dt.date | None:
    try:
        if m.group(1):
            return _dt.date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
        if m.group(4):
            return _dt.date(int(m.group(4)), int(m.group(5)), int(m.group(6)))
        return _dt.date(int(m.group(9)), _MONTHS[m.group(7).lower()[:3]], int(m.group(8)))
    except (ValueError, KeyError):
        return None


def _expiry(text: str) -> _dt.date | None:
    for hit in re.finditer(r"(expir\w*|valid (?:until|through|thru)|date of expiration|fecha de (?:vencimiento|expiración))[^\n]{0,40}", text, re.I):
        m = _DATE.search(hit.group(0))
        if m:
            parsed = _parse_date(m)
            if parsed:
                return parsed
    return None


def _names(text: str) -> list[str]:
    out = []
    for m in _NAME_LINE.finditer(text):
        name = re.split(r"\s{2,}|\b(?:date|fecha|born|place|address|dob)\b", m.group(1), flags=re.I)[0].strip(" .-")
        name = re.sub(r"\s+", " ", name)
        if len(name.split()) >= 2 and name.lower() not in {n.lower() for n in out}:
            out.append(name.title() if name.isupper() else name)
    return out[:MAX_NAMES]


def _norm_parts(name: str) -> set[str]:
    import unicodedata
    plain = unicodedata.normalize("NFD", name.lower())
    plain = "".join(c for c in plain if unicodedata.category(c) != "Mn")
    return {p for p in re.split(r"[^a-z]+", plain) if len(p) > 1}


def mock_check(payload: dict[str, Any], today: _dt.date | None = None) -> dict[str, Any]:
    today = today or _dt.date.today()
    es = payload["lang"] == "es"
    t = lambda en, sp: sp if es else en  # noqa: E731
    text = payload["text"]
    label = payload["item"]["label"]
    found = [(key, en, sp) for key, test, en, sp in _DOC_TYPES if test.search(text)]
    found_keys = {k for k, _, _ in found}
    expected: set[str] = set()
    for test, keys in _ITEM_TYPES:
        if test.search(label) or test.search(payload["item"]["id"].replace("-", " ")):
            expected |= keys
    if "translations" in payload["item"]["id"]:
        expected = {"translation"}
    findings: list[dict[str, str]] = []
    doc_label = next((sp if es else en for key, en, sp in found if key in expected), None) or (found[0][2] if es else found[0][1]) if found else ""

    if expected and found_keys and not (expected & found_keys) and not ({"form"} & expected and "form" in found_keys):
        status = "mismatch"
        findings.append({"code": "wrong_document", "severity": "high",
                         "message": t(f"This looks like a {doc_label.lower()}, not \u201c{label}\u201d.", f"Esto parece {doc_label.lower()}, no \u201c{label}\u201d."),
                         "fix": t("Attach it to the right checklist line, and add the document this line asks for.", "Muévelo a la línea correcta y agrega el documento que pide esta línea.")})
    else:
        status = "matches" if (expected & found_keys) or not expected else "possible_issue"
        if not found_keys or (expected and not (expected & found_keys)):
            findings.append({"code": "unreadable", "severity": "low",
                             "message": t("I couldn't confirm what kind of document this is from the text.", "No pude confirmar qué tipo de documento es a partir del texto."),
                             "fix": t("Check that the scan is legible and includes the title of the document.", "Revisa que el escaneo sea legible e incluya el título del documento.")})

    spanish_hits = len(_SPANISH.findall(text))
    has_translation = bool(re.search(r"translat|traducci[oó]n certificada|certify that i am (fluent|competent)", text, re.I))
    if spanish_hits >= 6 and not has_translation and "translations" not in payload["item"]["id"]:
        findings.append({"code": "translation_missing", "severity": "high",
                         "message": t("The text is mostly in Spanish and no translator's certification is attached.", "El texto está mayormente en español y no hay certificación del traductor."),
                         "fix": t("Add a complete English translation plus a signed statement that the translator is competent in both languages.", "Agrega una traducción completa al inglés y una declaración firmada de que el traductor domina ambos idiomas.")})

    expires = _expiry(text)
    if expires and expires < today:
        findings.append({"code": "date_expired", "severity": "high",
                         "message": t(f"The document shows an expiration date of {expires.isoformat()}, which has passed.", f"El documento muestra vencimiento el {expires.isoformat()}, ya pasó."),
                         "fix": t("Use a current, unexpired document, or follow the instructions for expired documents.", "Usa un documento vigente, o sigue las instrucciones para documentos vencidos.")})
    elif expires and (expires - today).days < 183 and "passport" in found_keys:
        findings.append({"code": "date_window", "severity": "medium",
                         "message": t(f"The passport expires on {expires.isoformat()}, less than 6 months from today.", f"El pasaporte vence el {expires.isoformat()}, en menos de 6 meses."),
                         "fix": t("Consider renewing it before you file or travel, and confirm what the instructions require.", "Considera renovarlo antes de presentar o viajar, y confirma lo que piden las instrucciones.")})
    if "medical" in found_keys:
        signed = [d for d in (_parse_date(m) for m in _DATE.finditer(text)) if d]
        if signed and (today - max(signed)).days > 60 and re.search(r"civil surgeon", text, re.I):
            findings.append({"code": "date_window", "severity": "medium",
                             "message": t(f"The latest date on the medical form is {max(signed).isoformat()}.", f"La fecha más reciente del examen es {max(signed).isoformat()}."),
                             "fix": t("Check the current I-693 validity rules on uscis.gov before you file.", "Revisa en uscis.gov las reglas vigentes de validez del I-693 antes de presentar.")})

    page_marks = [(int(a), int(b)) for a, b in re.findall(r"page\s+(\d{1,2})\s+of\s+(\d{1,2})", text, re.I)]
    if page_marks:
        total = max(b for _, b in page_marks)
        seen = {a for a, _ in page_marks}
        if len(seen) < total and (payload["pages"] is None or payload["pages"] < total):
            findings.append({"code": "pages_missing", "severity": "high",
                             "message": t(f"The document says it has {total} pages, but only page(s) {', '.join(str(p) for p in sorted(seen))} are here.", f"El documento dice que tiene {total} páginas, pero solo están la(s) {', '.join(str(p) for p in sorted(seen))}."),
                             "fix": t("Scan and add every page, including blank backs if they carry stamps.", "Escanea y agrega todas las páginas, incluso reversos con sellos.")})

    edition = re.search(r"edition\s*(\d{2})/(\d{2})/(\d{2,4})", text, re.I)
    if edition:
        year = int(edition.group(3))
        year = year + 2000 if year < 100 else year
        if year <= today.year - 2:
            findings.append({"code": "wrong_edition", "severity": "medium",
                             "message": t(f"The form edition date is {edition.group(1)}/{edition.group(2)}/{edition.group(3)}, which may be outdated.", f"La edición del formulario es {edition.group(1)}/{edition.group(2)}/{edition.group(3)}; puede estar desactualizada."),
                             "fix": t(f"Compare it with the edition listed on {payload['officialUrl']} and re-download if it differs.", f"Compárala con la edición de {payload['officialUrl']} y descárgala otra vez si es distinta.")})

    wants_signature = bool(expected & {"form", "i864", "translation"})
    if wants_signature and not re.search(r"signature|signed|/s/|firma", text, re.I):
        findings.append({"code": "signature_missing", "severity": "high",
                         "message": t("I don't see a signature or signature date.", "No veo una firma ni fecha de firma."),
                         "fix": t("Sign and date where the form asks, in ink if filing on paper.", "Firma y pon fecha donde lo pide el formulario, con tinta si es en papel.")})

    names = _names(text)
    if names and payload["otherNames"]:
        mine = _norm_parts(names[0])
        others = [n for n in payload["otherNames"] if _norm_parts(n)]
        if others and not any(len(mine & _norm_parts(o)) >= min(len(mine), len(_norm_parts(o))) for o in others):
            findings.append({"code": "name_mismatch", "severity": "medium",
                             "message": t(f"The name here, \u201c{names[0]}\u201d, differs from \u201c{others[0]}\u201d on another document.", f"El nombre aquí, \u201c{names[0]}\u201d, difiere de \u201c{others[0]}\u201d en otro documento."),
                             "fix": t("Make the names match on the forms, or include the record that explains the difference (marriage certificate, court order).", "Haz que los nombres coincidan o incluye el registro que explica la diferencia (acta de matrimonio, orden judicial).")})

    if expected & {"lease", "bank"} and status != "mismatch":
        months = {(d.year, d.month) for d in (_parse_date(m) for m in _DATE.finditer(text)) if d}
        if len(text) < 700 or len(months) <= 2:
            findings.append({"code": "thin_evidence", "severity": "medium",
                             "message": t("This record covers a short period, so it shows little of the shared life on its own.", "Este registro cubre un periodo corto; por sí solo muestra poco de la vida compartida."),
                             "fix": t("Add records spread across the marriage, for example a statement every few months, plus insurance or a lease with both names.", "Agrega registros repartidos en el tiempo, por ejemplo un estado cada pocos meses, más seguro o contrato con ambos nombres.")})

    if status == "matches" and findings:
        status = "possible_issue"
    lang_code = "es" if spanish_hits >= 6 else "en"
    summary = {
        "matches": t(f"Looks like the right document for \u201c{label}\u201d.", f"Parece el documento correcto para \u201c{label}\u201d."),
        "possible_issue": t(f"Right kind of document, with {len(findings)} thing(s) to fix.", f"Tipo de documento correcto, con {len(findings)} punto(s) por corregir."),
        "mismatch": t("This doesn't match the checklist line.", "Esto no corresponde a la línea de la lista."),
    }[status]
    if status == "possible_issue" and not (expected & found_keys):
        summary = t("I couldn't confirm this matches the checklist line.", "No pude confirmar que corresponda a la línea de la lista.")
    return {"status": status, "summary": summary, "findings": findings[:MAX_FINDINGS],
            "facts": {"documentType": doc_label, "names": names, "expires": expires.isoformat() if expires else None, "language": lang_code}}


def mock_plan(payload: dict[str, Any]) -> dict[str, Any]:
    es = payload["lang"] == "es"
    t = lambda en, sp: sp if es else en  # noqa: E731
    a = payload["answers"]
    add: list[dict[str, Any]] = []
    remove: list[dict[str, str]] = []
    notes: list[str] = []
    space = payload["spaceId"]
    marriage = a.get("basis") == "marriage" or a.get("relation") == "spouse" or space == "i-751" or a.get("basis") == "three"
    if marriage:
        add.append({"label": t("Joint bank statements spread across the marriage (e.g. one every quarter)", "Estados de cuenta conjuntos repartidos en el matrimonio (p. ej. uno por trimestre)"),
                    "reason": t("Records spread over time show a shared life better than one recent statement.", "Registros repartidos en el tiempo muestran mejor una vida compartida que un solo estado reciente."), "required": False, "kind": "evidence"})
        add.append({"label": t("Lease, deed, or utility bills with both names", "Contrato, escritura o facturas con ambos nombres"),
                    "reason": t("A shared address is one of the first things an officer looks for.", "Una dirección compartida es de lo primero que revisa un oficial."), "required": False, "kind": "evidence"})
    if a.get("priorMarriage") == "yes":
        add.append({"label": t("Final divorce decree or death certificate for each prior marriage, both spouses", "Decreto final de divorcio o acta de defunción de cada matrimonio anterior, de ambos cónyuges"),
                    "reason": t("You said there was a prior marriage; the end of every prior marriage has to be documented.", "Dijiste que hubo un matrimonio anterior; el fin de cada uno tiene que documentarse."), "required": True, "kind": "other"})
    if a.get("nonEnglish") == "yes":
        notes.append(t("Each translation should be complete and come with the translator's signed certification.", "Cada traducción debe estar completa y llevar la certificación firmada del traductor."))
    if a.get("arrests") == "yes":
        notes.append(t("Arrests or citations can change what you need to file. Talk to a lawyer or accredited representative before filing.", "Arrestos o citaciones pueden cambiar lo que debes presentar. Habla con un abogado o representante acreditado antes."))
    if space == "i-485" and a.get("basis") == "employment":
        add.append({"label": t("Employment verification letter from the sponsoring employer", "Carta de verificación de empleo del empleador patrocinador"),
                    "reason": t("Employment-based cases usually show the job offer is still current.", "Los casos por empleo suelen mostrar que la oferta sigue vigente."), "required": False, "kind": "other"})
    if space == "n-400" and a.get("longTrips") == "yes":
        add.append({"label": t("Evidence of ties during long trips (lease, taxes, job letter)", "Pruebas de vínculos durante viajes largos (contrato, impuestos, empleo)"),
                    "reason": t("Trips over 6 months can raise continuous-residence questions.", "Viajes de más de 6 meses pueden generar preguntas de residencia continua."), "required": False, "kind": "evidence"})
    optional_ids = [i["id"] for i in payload["items"] if not i["required"]]
    if space == "i-485" and a.get("basis") in {"employment", "other"} and "i485-travel" in optional_ids and a.get("withEad") == "no":
        remove.append({"id": "i485-travel", "reason": t("Not needed unless you are also asking for a travel document.", "No hace falta salvo que también pidas un documento de viaje.")})
    if not add and not remove:
        notes.append(t("Your list already covers what the instructions usually ask for this situation. Confirm on the official page.", "Tu lista ya cubre lo que suelen pedir las instrucciones. Confírmalo en la página oficial."))
    return {"add": add, "remove": remove, "notes": notes}


# ───────────── HTTP handlers ─────────────

def _read_json(handler: Any, port: int) -> tuple[Any, bool]:
    if not fc.allowed_origin(handler.headers.get("Origin", ""), handler.headers.get("Host", ""), port):
        handler.send_error(403, "Forbidden")
        return None, False
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        fc._json_error(handler, 415, {"error": "invalid", "reason": "type"})
        return None, False
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY:
        fc._json_error(handler, 413, {"error": "invalid", "reason": "size"})
        return None, False
    ip = handler.client_address[0] if handler.client_address else "127.0.0.1"
    if rate_limited(ip):
        fc._json_error(handler, 429, {"error": "rate", "reason": "rate"})
        return None, False
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8")), True
    except (UnicodeDecodeError, json.JSONDecodeError):
        fc._json_error(handler, 400, {"error": "invalid", "reason": "json"})
        return None, False


def _send(handler: Any, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def run_check(payload: dict[str, Any]) -> dict[str, Any]:
    if fc.mock_enabled():
        result = normalize_check_result(mock_check(payload))
        return {**(result or {}), "mock": True}
    raw = call_provider(check_system_prompt(payload["lang"]), check_user_message(payload, _dt.date.today().isoformat()))
    result = normalize_check_result(raw)
    if result is None:
        raise RuntimeError("provider_shape")
    return {**result, "mock": False}


def run_plan(payload: dict[str, Any]) -> dict[str, Any]:
    if fc.mock_enabled():
        return {**(normalize_plan_result(mock_plan(payload), payload) or {}), "mock": True}
    raw = call_provider(plan_system_prompt(payload["lang"]), plan_user_message(payload), 700)
    result = normalize_plan_result(raw, payload)
    if result is None:
        raise RuntimeError("provider_shape")
    return {**result, "mock": False}


def _handle(handler: Any, port: int, validate: Any, run: Any) -> None:
    data, ok = _read_json(handler, port)
    if not ok:
        return
    payload, error = validate(data)
    if error or payload is None:
        status = 403 if error and error.get("error") in {"blocked", "consent"} else 400
        fc._json_error(handler, status, error or {"error": "invalid", "reason": "body"})
        return
    if not fc.availability()["available"]:
        fc._json_error(handler, 503, {"error": "unavailable", "reason": "no_key"})
        return
    try:
        result = run(payload)
    except Exception:
        fc._json_error(handler, 502, {"error": "provider", "reason": "provider"})
        return
    _send(handler, 200, result)


def handle_check(handler: Any, port: int) -> None:
    _handle(handler, port, validate_check, run_check)


def handle_plan(handler: Any, port: int) -> None:
    _handle(handler, port, validate_plan, run_plan)


def handle_status(handler: Any, port: int) -> None:
    if not fc.allowed_origin(handler.headers.get("Origin", ""), handler.headers.get("Host", ""), port):
        handler.send_error(403, "Forbidden")
        return
    _send(handler, 200, provider_info())
