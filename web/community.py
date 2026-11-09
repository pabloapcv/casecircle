"""CaseCircle accounts, community posts, moderation and waitlist on SQLite (stdlib only).

Everything here is plain JSON over same-origin requests:

GET  /api/me                      current account (or null) + group member counts
POST /api/signup  /api/login  /api/logout
POST /api/me                      update locale / joined groups / case profiles
POST /api/account/delete          delete your account (posts stay, author removed)
GET  /api/handle-check?handle=    is a handle free?
GET  /api/posts                   list (group, groups, type, sort=new|top|unanswered, q, author=me, saved=1)
POST /api/posts                   create
GET  /api/posts/<id>              one post + replies
POST /api/posts/<id>/replies      reply
POST /api/posts/<id>/save         toggle save
POST /api/posts/<id>/helpful      the asker marks one reply helpful (toggle)
POST /api/vote                    toggle an up-vote on a post or reply
POST /api/report                  report a post or reply (hidden after N open reports)
GET  /api/mod/queue               admins only
POST /api/mod                     admins only: hide | unhide | remove | dismiss
POST /api/waitlist                Case Pass waitlist email

State-changing requests need the header ``X-CaseCircle: 1`` (a custom header cannot be sent
cross-site without a CORS preflight, which this server never grants) and, when the browser
sends one, a same-origin ``Origin``. Text is stored as plain text and only ever rendered by the
client through its HTML escaper; responses are JSON with ``nosniff``.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import unicodedata
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from typing import Any
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
COOKIE = "cc_session"
SESSION_DAYS = 30
MAX_BODY = 32 * 1024
SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 64, "maxmem": 64 * 1024 * 1024}

KINDS = {"question", "timeline", "interview", "tip", "vent"}
STAGES = {"filed", "biometrics", "rfe", "interview_scheduled", "interview_done", "approved", "denied", "oath"}
REPORT_REASONS = {"spam", "identifiers", "scam", "abuse", "other"}
SPACE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,23}$")
RESERVED = {"uscis", "dhs", "ice", "cbp", "official", "admin", "moderator", "notario", "casecircle",
            "support", "deleted", "apple", "google"}
LIMITS = {"title_min": 8, "title_max": 140, "body_min": 20, "body_max": 5000, "reply_min": 8, "reply_max": 3000}


# ───────────────────────── config ─────────────────────────

def db_path() -> str:
    return os.environ.get("CASECIRCLE_DB_PATH") or os.path.join(HERE, "data", "casecircle.db")


def admin_emails() -> set[str]:
    raw = os.environ.get("CASECIRCLE_ADMIN_EMAILS", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def report_threshold() -> int:
    try:
        return max(1, int(os.environ.get("CASECIRCLE_REPORT_HIDE_THRESHOLD", "3")))
    except ValueError:
        return 3


def trust_proxy() -> bool:
    return os.environ.get("CASECIRCLE_TRUST_PROXY", "") == "1"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# ───────────────────────── database ─────────────────────────

MIGRATIONS: list[str] = [
    # 1: initial schema
    """
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pw_hash TEXT NOT NULL,
      pw_salt TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'en',
      spaces TEXT NOT NULL DEFAULT '[]',
      profiles TEXT NOT NULL DEFAULT '[]',
      reputation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at REAL NOT NULL
    );
    CREATE INDEX sessions_user ON sessions(user_id);
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      spaces TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT '',
      office_id TEXT NOT NULL DEFAULT '',
      form TEXT NOT NULL DEFAULT '',
      filed TEXT,
      status TEXT NOT NULL DEFAULT 'live',
      held_reason TEXT NOT NULL DEFAULT '',
      helpful_comment_id INTEGER,
      votes INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX posts_created ON posts(created_at);
    CREATE TABLE post_spaces (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      space_id TEXT NOT NULL,
      PRIMARY KEY (post_id, space_id)
    );
    CREATE INDEX post_spaces_space ON post_spaces(space_id);
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'live',
      votes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX comments_post ON comments(post_id);
    CREATE TABLE votes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, target)
    );
    CREATE TABLE saves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, post_id)
    );
    CREATE TABLE reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target TEXT NOT NULL,
      reason TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      UNIQUE (reporter_id, target)
    );
    CREATE INDEX reports_target ON reports(target, state);
    CREATE TABLE waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      lang TEXT NOT NULL DEFAULT 'en',
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    """,
]

_write_lock = threading.Lock()
_migrated: set[str] = set()


def connect() -> sqlite3.Connection:
    path = db_path()
    if path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    if path not in _migrated:
        migrate(conn)
        _migrated.add(path)
    return conn


def migrate(conn: sqlite3.Connection) -> int:
    with _write_lock:
        conn.execute("PRAGMA journal_mode = WAL")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for index, script in enumerate(MIGRATIONS, start=1):
            if index <= version:
                continue
            conn.execute("BEGIN IMMEDIATE")
            try:
                for statement in [part.strip() for part in script.split(";") if part.strip()]:
                    conn.execute(statement)
                conn.execute(f"PRAGMA user_version = {index}")
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
        return conn.execute("PRAGMA user_version").fetchone()[0]


def reset_for_tests() -> None:
    _migrated.clear()
    reset_rate_limits()


# ───────────────────────── rate limiting ─────────────────────────

_rate_lock = threading.Lock()
_rate: dict[str, list[float]] = {}
RATES = {
    "signup": (5, 3600),
    "login": (10, 900),
    "post": (1, 30),
    "post_day": (20, 86400),
    "reply": (1, 8),
    "reply_day": (200, 86400),
    "vote": (60, 60),
    "report": (20, 3600),
    "waitlist": (5, 3600),
    "handle": (60, 60),
}


def rate_hit(kind: str, key: str, now: float | None = None) -> bool:
    """Record one attempt; True means the caller is over the limit (and nothing is recorded)."""
    limit, window = RATES[kind]
    stamp = time.time() if now is None else now
    bucket_key = f"{kind}:{key}"
    with _rate_lock:
        bucket = [t for t in _rate.get(bucket_key, []) if stamp - t < window]
        if len(bucket) >= limit:
            _rate[bucket_key] = bucket
            return True
        bucket.append(stamp)
        _rate[bucket_key] = bucket
        if len(_rate) > 50_000:  # keep memory bounded
            for stale in [k for k, v in _rate.items() if not v or stamp - v[-1] > 86400]:
                _rate.pop(stale, None)
        return False


def reset_rate_limits() -> None:
    with _rate_lock:
        _rate.clear()


# ───────────────────────── validation + moderation ─────────────────────────

SCAM = ["pay to expedite", "pay me to expedite", "expedite fee", "gift card", "whatsapp me",
        "message me on whatsapp", "text me on whatsapp", "wa.me", "notario", "guaranteed approval",
        "western union", "moneygram", "zelle me", "cash app me", "venmo me", "wire transfer",
        "i prepare forms for", "we prepare your forms for", "form preparation for $", "dm me for a fee",
        "send bitcoin", "crypto payment"]
ABUSE = ["fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "asshole", "cunt", "nigger", "nigga",
         "faggot", "retard", "slut", "whore", "puta", "puto", "mierda", "cabron", "maricon", "pendejo",
         "gilipollas", "kys"]


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()


def evaluate(text: str) -> tuple[str, str]:
    """Same rules as logic.js evaluate(): block identifiers/abuse, hold likely scams."""
    raw = str(text or "")
    folded = fold(raw)
    if re.search(r"\b[a-z]{3}(?:[-\s]*\d){10}\b", raw, re.I) or re.search(r"\b[a-z]{3}(?:[-\s]*\d){10}\b", folded, re.I):
        return "block", "receipt"
    if re.search(r"\b(?:a[-\s]?number|alien\s+number|a#)\b[-\s:]*\d{7,9}\b", raw, re.I) or re.search(r"\bA[-\s]?\d{8,9}\b", raw):
        return "block", "a-number"
    if re.search(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b", raw) or re.search(r"\b(?:ssn|social\s+security)\b(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*\d{3}-?\d{2}-?\d{4}\b", raw, re.I):
        return "block", "ssn"
    if re.search(r"\b(?:passport|pasaporte)\b(?:\s*(?:number|no\.?|num(?:ero)?|#))?\s*[:#-]?\s*(?=[a-z0-9]*\d)[a-z0-9]{6,12}\b", raw, re.I):
        return "block", "passport"
    if "kill yourself" in folded:
        return "block", "abuse"
    for word in ABUSE:
        if re.search(rf"\b{re.escape(word)}\b", folded):
            return "block", "abuse"
    if any(phrase in folded for phrase in SCAM):
        return "hold", "scam"
    return "allow", ""


def clean_text(value: Any, max_len: int, multiline: bool = True) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    allowed = "\n\t" if multiline else ""
    text = "".join(c for c in text if c in allowed or unicodedata.category(c)[0] != "C")
    text = re.sub(r"\r\n?", "\n", text)
    if not multiline:
        text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip()
    return text[: max_len + 1]


def email_ok(value: str) -> bool:
    parts = value.split("@")
    return (len(parts) == 2 and len(parts[0]) >= 1 and "." in parts[1] and not parts[1].startswith(".")
            and not parts[1].endswith(".") and " " not in value and len(value) <= 254)


def handle_issue(raw: str) -> str | None:
    name = str(raw or "").strip()
    if not (3 <= len(name) <= 20) or not re.fullmatch(r"[A-Za-z0-9_]+", name):
        return "invalid"
    lower = name.lower()
    if lower in RESERVED or any(part in RESERVED for part in lower.split("_")):
        return "reserved"
    return None


def clean_spaces(value: Any, limit: int = 12) -> list[str]:
    out: list[str] = []
    for item in value if isinstance(value, list) else []:
        item = str(item).strip().lower()
        if SPACE_RE.match(item) and item not in out:
            out.append(item)
    return out[:limit]


PROFILE_KEYS = {"spaceId", "form", "basedOn", "filed", "officeId", "method", "stage", "dates", "completed", "id"}


def clean_profiles(value: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in value if isinstance(value, list) else []:
        if not isinstance(row, dict) or not SPACE_RE.match(str(row.get("spaceId", ""))):
            continue
        item: dict[str, Any] = {}
        for key in PROFILE_KEYS:
            if key not in row:
                continue
            val = row[key]
            if key == "dates":
                if isinstance(val, dict):
                    item["dates"] = {str(k)[:24]: str(v)[:32] for k, v in list(val.items())[:12] if str(k) in STAGES}
            elif key == "completed":
                item["completed"] = bool(val)
            else:
                item[key] = str(val)[:40]
        out.append(item)
    return out[:10]


HAS_SCRYPT = hasattr(hashlib, "scrypt")
PBKDF2_ITERATIONS = 600_000


def _derive(password: str, salt: bytes, scheme: str) -> str:
    data = password.encode("utf-8")
    if scheme == "scrypt":
        return hashlib.scrypt(data, salt=salt, **SCRYPT).hex()
    return hashlib.pbkdf2_hmac("sha256", data, salt, PBKDF2_ITERATIONS).hex()


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    """scrypt with a 16-byte random salt; stored as "scrypt$<hex>". Python builds without OpenSSL scrypt
    (e.g. macOS system Python on LibreSSL) fall back to PBKDF2-SHA256, stored as "pbkdf2$<hex>"."""
    salt = salt or secrets.token_bytes(16)
    scheme = "scrypt" if HAS_SCRYPT else "pbkdf2"
    return f"{scheme}${_derive(password, salt, scheme)}", salt.hex()


def check_password(password: str, pw_hash: str, pw_salt: str) -> bool:
    scheme, _, digest = pw_hash.partition("$")
    if scheme not in ("scrypt", "pbkdf2") or not digest or (scheme == "scrypt" and not HAS_SCRYPT):
        return False
    return hmac.compare_digest(_derive(password, bytes.fromhex(pw_salt), scheme), digest)


_DUMMY = hash_password("not-a-real-password", b"0123456789abcdef")


# ───────────────────────── HTTP helpers ─────────────────────────

class ApiError(Exception):
    def __init__(self, status: int, error: str, **extra: Any) -> None:
        super().__init__(error)
        self.status = status
        self.payload = {"error": error, **extra}


def client_ip(handler: Any) -> str:
    if trust_proxy():
        forwarded = handler.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return handler.client_address[0] if handler.client_address else "unknown"


def is_https(handler: Any) -> bool:
    if os.environ.get("CASECIRCLE_COOKIE_SECURE") == "1":
        return True
    return trust_proxy() and handler.headers.get("X-Forwarded-Proto", "").lower() == "https"


def same_origin(handler: Any) -> bool:
    origin = handler.headers.get("Origin", "")
    if not origin:
        return True  # non-browser clients; the custom header below still blocks cross-site forms
    extra = {o.strip().rstrip("/") for o in os.environ.get("CASECIRCLE_PUBLIC_ORIGIN", "").split(",") if o.strip()}
    if origin.rstrip("/") in extra:
        return True
    host = handler.headers.get("X-Forwarded-Host", "") if trust_proxy() else ""
    host = host or handler.headers.get("Host", "")
    return bool(host) and urlparse(origin).netloc.lower() == host.lower()


def send_json(handler: Any, status: int, payload: Any, cookies: list[str] | None = None) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    for cookie in cookies or []:
        handler.send_header("Set-Cookie", cookie)
    handler.end_headers()
    if handler.command != "HEAD":
        handler.wfile.write(body)


def read_json(handler: Any) -> dict[str, Any]:
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        raise ApiError(400, "bad_request")
    if length > MAX_BODY:
        raise ApiError(413, "too_large")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError(400, "bad_json")
    if not isinstance(data, dict):
        raise ApiError(400, "bad_json")
    return data


def session_token(handler: Any) -> str:
    raw = handler.headers.get("Cookie", "")
    if not raw:
        return ""
    try:
        jar = SimpleCookie()
        jar.load(raw)
    except Exception:
        return ""
    morsel = jar.get(COOKIE)
    return morsel.value if morsel else ""


def session_cookie(handler: Any, token: str, max_age: int) -> str:
    parts = [f"{COOKIE}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
    if is_https(handler):
        parts.append("Secure")
    return "; ".join(parts)


def current_user(conn: sqlite3.Connection, handler: Any) -> sqlite3.Row | None:
    token = session_token(handler)
    if not token or len(token) > 200:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        (token_hash, time.time()),
    ).fetchone()
    return row


def is_admin(user: sqlite3.Row | None) -> bool:
    return bool(user) and user["email"].lower() in admin_emails()


def public_user(user: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": f"u{user['id']}",
        "handle": user["handle"],
        "email": user["email"],
        "locale": user["locale"],
        "spaces": json.loads(user["spaces"] or "[]"),
        "profiles": json.loads(user["profiles"] or "[]"),
        "reputation": user["reputation"],
        "isAdmin": is_admin(user),
        "createdAt": user["created_at"],
    }


def parse_id(value: str, prefix: str) -> int:
    value = str(value or "")
    if value.startswith(prefix):
        value = value[len(prefix):]
    if not value.isdigit() or len(value) > 12:
        raise ApiError(404, "not_found")
    return int(value)


# ───────────────────────── serialization ─────────────────────────

POST_SELECT = """
SELECT p.*, u.handle AS author_handle, u.reputation AS author_rep
FROM posts p LEFT JOIN users u ON u.id = p.author_id
"""


def post_json(row: sqlite3.Row, viewer: sqlite3.Row | None, voted: set[str], saved: set[int]) -> dict[str, Any]:
    pid = f"p{row['id']}"
    author = None
    if row["author_id"] is not None and row["author_handle"]:
        author = {"id": f"u{row['author_id']}", "username": row["author_handle"], "reputation": row["author_rep"] or 0}
    mine = bool(viewer) and row["author_id"] == viewer["id"]
    return {
        "id": pid,
        "authorId": author["id"] if author else None,
        "author": author,
        "spaceIds": json.loads(row["spaces"] or "[]"),
        "type": row["type"],
        "title": row["title"],
        "body": row["body"],
        "stage": row["stage"],
        "officeId": row["office_id"],
        "form": row["form"],
        "filed": row["filed"],
        "status": row["status"],
        "faq": False,
        "createdAt": row["created_at"],
        "votes": row["votes"],
        "replyCount": row["reply_count"],
        "helpfulCommentId": f"c{row['helpful_comment_id']}" if row["helpful_comment_id"] else None,
        "voted": pid in voted,
        "saved": row["id"] in saved,
        "mine": mine,
    }


def viewer_marks(conn: sqlite3.Connection, viewer: sqlite3.Row | None) -> tuple[set[str], set[int]]:
    if not viewer:
        return set(), set()
    voted = {r[0] for r in conn.execute("SELECT target FROM votes WHERE user_id = ?", (viewer["id"],))}
    saved = {r[0] for r in conn.execute("SELECT post_id FROM saves WHERE user_id = ?", (viewer["id"],))}
    return voted, saved


def visible_clause(viewer: sqlite3.Row | None, alias: str = "p") -> tuple[str, list[Any]]:
    if is_admin(viewer):
        return f"{alias}.status != 'removed'", []
    if viewer:
        return f"({alias}.status = 'live' OR ({alias}.author_id = ? AND {alias}.status = 'held'))", [viewer["id"]]
    return f"{alias}.status = 'live'", []


# ───────────────────────── handlers ─────────────────────────

def group_counts(conn: sqlite3.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for (spaces,) in conn.execute("SELECT spaces FROM users"):
        for space in json.loads(spaces or "[]"):
            counts[space] = counts.get(space, 0) + 1
    return counts


def api_me(conn, handler, user, _q):
    return 200, {"user": public_user(user) if user else None, "groupCounts": group_counts(conn),
                 "reportThreshold": report_threshold()}


def create_session(conn: sqlite3.Connection, handler: Any, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
    conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                 (token_hash, user_id, now_iso(), time.time() + SESSION_DAYS * 86400))
    return session_cookie(handler, token, SESSION_DAYS * 86400)


def api_signup(conn, handler, user, data):
    if rate_hit("signup", client_ip(handler)):
        raise ApiError(429, "rate")
    email = clean_text(data.get("email"), 254, False).lower()
    password = str(data.get("password") or "")
    handle = clean_text(data.get("handle"), 20, False)
    if not email_ok(email):
        raise ApiError(400, "email")
    if len(password) < 8 or len(password) > 200:
        raise ApiError(400, "password")
    issue = handle_issue(handle)
    if issue:
        raise ApiError(400, issue)
    if not data.get("agreeRules") or not data.get("agreeNotAdvice"):
        raise ApiError(400, "agree")
    locale = "es" if data.get("locale") == "es" else "en"
    spaces = clean_spaces(data.get("spaces")) or ["i-485"]
    profiles = clean_profiles(data.get("profiles"))
    pw_hash, pw_salt = hash_password(password)
    with _write_lock:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise ApiError(409, "email_taken")
        if conn.execute("SELECT 1 FROM users WHERE handle = ?", (handle,)).fetchone():
            raise ApiError(409, "taken")
        cur = conn.execute(
            "INSERT INTO users (email, handle, pw_hash, pw_salt, locale, spaces, profiles, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (email, handle, pw_hash, pw_salt, locale, json.dumps(spaces), json.dumps(profiles), now_iso()))
        cookie = create_session(conn, handler, cur.lastrowid)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"user": public_user(row)}, [cookie]


def api_login(conn, handler, user, data):
    email = clean_text(data.get("email"), 254, False).lower()
    if rate_hit("login", client_ip(handler)) or rate_hit("login", f"email:{email}"):
        raise ApiError(429, "rate")
    password = str(data.get("password") or "")[:200]
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        check_password(password, *_DUMMY)  # same work either way
        raise ApiError(401, "login")
    if not check_password(password, row["pw_hash"], row["pw_salt"]):
        raise ApiError(401, "login")
    with _write_lock:
        cookie = create_session(conn, handler, row["id"])
    return 200, {"user": public_user(row)}, [cookie]


def api_logout(conn, handler, user, data):
    token = session_token(handler)
    if token:
        with _write_lock:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
    return 200, {"ok": True}, [session_cookie(handler, "", 0)]


def require_user(user):
    if not user:
        raise ApiError(401, "auth")
    return user


def api_update_me(conn, handler, user, data):
    require_user(user)
    fields, values = [], []
    if "locale" in data:
        fields.append("locale = ?"); values.append("es" if data["locale"] == "es" else "en")
    if "spaces" in data:
        fields.append("spaces = ?"); values.append(json.dumps(clean_spaces(data["spaces"])))
    if "profiles" in data:
        fields.append("profiles = ?"); values.append(json.dumps(clean_profiles(data["profiles"])))
    if fields:
        with _write_lock:
            conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", (*values, user["id"]))
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return 200, {"user": public_user(row)}


def api_delete_account(conn, handler, user, data):
    require_user(user)
    if not check_password(str(data.get("password") or "")[:200], user["pw_hash"], user["pw_salt"]):
        raise ApiError(401, "login")
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("UPDATE posts SET author_id = NULL WHERE author_id = ?", (user["id"],))
            conn.execute("UPDATE comments SET author_id = NULL WHERE author_id = ?", (user["id"],))
            conn.execute("UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?", (user["id"],))
            conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return 200, {"ok": True}, [session_cookie(handler, "", 0)]


def api_handle_check(conn, handler, user, query):
    if rate_hit("handle", client_ip(handler)):
        raise ApiError(429, "rate")
    handle = clean_text((query.get("handle") or [""])[0], 20, False)
    issue = handle_issue(handle)
    if not issue and conn.execute("SELECT 1 FROM users WHERE handle = ?", (handle,)).fetchone():
        issue = "taken"
    return 200, {"handle": handle, "issue": issue}


def api_list_posts(conn, handler, user, query):
    q = lambda key, default="": (query.get(key) or [default])[0]
    where, args = [], []
    vis, vargs = visible_clause(user)
    where.append(vis); args += vargs
    group = q("group").strip().lower()
    groups = clean_spaces(q("groups").split(",")) if q("groups") else []
    if group:
        where.append("p.id IN (SELECT post_id FROM post_spaces WHERE space_id = ?)"); args.append(group)
    elif groups:
        where.append(f"p.id IN (SELECT post_id FROM post_spaces WHERE space_id IN ({','.join('?' * len(groups))}))"); args += groups
    kind = q("type")
    if kind in KINDS:
        where.append("p.type = ?"); args.append(kind)
    sort = q("sort", "new")
    if sort == "unanswered":
        where.append("p.type = 'question' AND p.reply_count = 0")
    text = clean_text(q("q"), 80, False)
    if text:
        like = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')"); args += [like, like]
    if q("author") == "me":
        require_user(user)
        where.append("p.author_id = ?"); args.append(user["id"])
    if q("saved") == "1":
        require_user(user)
        where.append("p.id IN (SELECT post_id FROM saves WHERE user_id = ?)"); args.append(user["id"])
    order = "p.votes DESC, p.created_at DESC" if sort == "top" else "p.created_at DESC"
    if q("saved") == "1":
        order = "(SELECT created_at FROM saves s WHERE s.post_id = p.id AND s.user_id = ?) DESC"
    try:
        limit = max(1, min(100, int(q("limit", "30"))))
        offset = max(0, int(q("offset", "0")))
    except ValueError:
        raise ApiError(400, "bad_request")
    sql = f"{POST_SELECT} WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ? OFFSET ?"
    order_args = [user["id"]] if q("saved") == "1" else []
    rows = conn.execute(sql, (*args, *order_args, limit + 1, offset)).fetchall()
    voted, saved = viewer_marks(conn, user)
    posts = [post_json(r, user, voted, saved) for r in rows[:limit]]
    return 200, {"posts": posts, "more": len(rows) > limit}


def comment_json(row, viewer, voted):
    cid = f"c{row['id']}"
    author = None
    if row["author_id"] is not None and row["author_handle"]:
        author = {"id": f"u{row['author_id']}", "username": row["author_handle"], "reputation": row["author_rep"] or 0}
    return {"id": cid, "authorId": author["id"] if author else None, "author": author, "body": row["body"],
            "createdAt": row["created_at"], "votes": row["votes"], "status": row["status"], "voted": cid in voted,
            "mine": bool(viewer) and row["author_id"] == viewer["id"]}


def load_post(conn, user, post_id: int) -> sqlite3.Row:
    vis, vargs = visible_clause(user)
    row = conn.execute(f"{POST_SELECT} WHERE p.id = ? AND {vis}", (post_id, *vargs)).fetchone()
    if not row:
        raise ApiError(404, "not_found")
    return row


def api_get_post(conn, handler, user, post_id: int):
    row = load_post(conn, user, post_id)
    voted, saved = viewer_marks(conn, user)
    post = post_json(row, user, voted, saved)
    vis, vargs = visible_clause(user, "c")
    comments = conn.execute(
        f"SELECT c.*, u.handle AS author_handle, u.reputation AS author_rep FROM comments c LEFT JOIN users u ON u.id = c.author_id "
        f"WHERE c.post_id = ? AND {vis} ORDER BY c.created_at ASC, c.id ASC", (post_id, *vargs)).fetchall()
    post["comments"] = [comment_json(c, user, voted) for c in comments]
    post["canMarkHelpful"] = bool(user) and row["author_id"] == user["id"] and row["type"] == "question"
    return 200, {"post": post}


def api_create_post(conn, handler, user, data):
    require_user(user)
    kind = str(data.get("type") or "")
    if kind not in KINDS:
        raise ApiError(400, "type")
    title = clean_text(data.get("title"), LIMITS["title_max"], False)
    body = clean_text(data.get("body"), LIMITS["body_max"])
    spaces = clean_spaces(data.get("spaceIds"), 3)
    if len(title) < LIMITS["title_min"] or len(body) < LIMITS["body_min"] or not spaces:
        raise ApiError(400, "short")
    if len(title) > LIMITS["title_max"] or len(body) > LIMITS["body_max"]:
        raise ApiError(400, "long")
    stage = str(data.get("stage") or "")
    stage = stage if stage in STAGES else ""
    if kind in ("timeline", "interview") and not stage:
        raise ApiError(400, "stage")
    verdict, reason = evaluate(f"{title}\n{body}")
    if verdict == "block":
        raise ApiError(400, reason)
    if rate_hit("post", f"u{user['id']}") or rate_hit("post_day", f"u{user['id']}"):
        raise ApiError(429, "rate")
    profiles = json.loads(user["profiles"] or "[]")
    profile = next((p for p in profiles if p.get("spaceId") == spaces[0]), {})
    office = clean_text(data.get("officeId") or profile.get("officeId") or "", 24, False)
    form = clean_text(profile.get("form") or data.get("form") or spaces[0].upper(), 16, False)
    filed = profile.get("filed") or None
    status = "held" if verdict == "hold" else "live"
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            cur = conn.execute(
                "INSERT INTO posts (author_id, type, title, body, spaces, stage, office_id, form, filed, status, held_reason, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (user["id"], kind, title, body, json.dumps(spaces), stage or str(profile.get("stage") or "")[:24],
                 office, form, filed, status, reason if verdict == "hold" else "", now_iso()))
            for space in spaces:
                conn.execute("INSERT INTO post_spaces (post_id, space_id) VALUES (?, ?)", (cur.lastrowid, space))
            joined = json.loads(user["spaces"] or "[]")
            merged = joined + [s for s in spaces if s not in joined]
            if merged != joined:
                conn.execute("UPDATE users SET spaces = ? WHERE id = ?", (json.dumps(merged[:12]), user["id"]))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    status_code, payload = api_get_post(conn, handler, user, cur.lastrowid)
    payload["held"] = status == "held"
    return 201, payload


def api_reply(conn, handler, user, post_id: int, data):
    require_user(user)
    row = load_post(conn, user, post_id)
    if row["status"] != "live":
        raise ApiError(409, "closed")
    text = clean_text(data.get("body"), LIMITS["reply_max"])
    if len(text) < LIMITS["reply_min"]:
        raise ApiError(400, "short")
    if len(text) > LIMITS["reply_max"]:
        raise ApiError(400, "long")
    verdict, reason = evaluate(text)
    if verdict == "block":
        raise ApiError(400, reason)
    if rate_hit("reply", f"u{user['id']}") or rate_hit("reply_day", f"u{user['id']}"):
        raise ApiError(429, "rate")
    status = "held" if verdict == "hold" else "live"
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("INSERT INTO comments (post_id, author_id, body, status, created_at) VALUES (?,?,?,?,?)",
                         (post_id, user["id"], text, status, now_iso()))
            if status == "live":
                conn.execute("UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?", (post_id,))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    code, payload = api_get_post(conn, handler, user, post_id)
    payload["held"] = status == "held"
    return 201, payload


def api_save(conn, handler, user, post_id: int, data):
    require_user(user)
    load_post(conn, user, post_id)
    if rate_hit("vote", f"u{user['id']}"):
        raise ApiError(429, "rate")
    with _write_lock:
        if conn.execute("SELECT 1 FROM saves WHERE user_id = ? AND post_id = ?", (user["id"], post_id)).fetchone():
            conn.execute("DELETE FROM saves WHERE user_id = ? AND post_id = ?", (user["id"], post_id))
            saved = False
        else:
            conn.execute("INSERT INTO saves (user_id, post_id, created_at) VALUES (?,?,?)", (user["id"], post_id, now_iso()))
            saved = True
    return 200, {"saved": saved}


def resolve_target(conn, user, target: str) -> tuple[str, int, sqlite3.Row]:
    target = str(target or "")
    if target.startswith("p"):
        pid = parse_id(target, "p")
        row = load_post(conn, user, pid)
        return "post", pid, row
    if target.startswith("c"):
        cid = parse_id(target, "c")
        row = conn.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
        if not row:
            raise ApiError(404, "not_found")
        load_post(conn, user, row["post_id"])
        if row["status"] != "live" and not is_admin(user):
            raise ApiError(404, "not_found")
        return "comment", cid, row
    raise ApiError(404, "not_found")


def api_vote(conn, handler, user, data):
    require_user(user)
    kind, tid, row = resolve_target(conn, user, data.get("target"))
    if row["author_id"] == user["id"]:
        raise ApiError(400, "self")
    if rate_hit("vote", f"u{user['id']}"):
        raise ApiError(429, "rate")
    target = f"{'p' if kind == 'post' else 'c'}{tid}"
    table = "posts" if kind == "post" else "comments"
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            had = conn.execute("SELECT 1 FROM votes WHERE user_id = ? AND target = ?", (user["id"], target)).fetchone()
            delta = -1 if had else 1
            if had:
                conn.execute("DELETE FROM votes WHERE user_id = ? AND target = ?", (user["id"], target))
            else:
                conn.execute("INSERT INTO votes (user_id, target, created_at) VALUES (?,?,?)", (user["id"], target, now_iso()))
            conn.execute(f"UPDATE {table} SET votes = MAX(0, votes + ?) WHERE id = ?", (delta, tid))
            if row["author_id"]:
                conn.execute("UPDATE users SET reputation = MAX(0, reputation + ?) WHERE id = ?", (delta, row["author_id"]))
            votes = conn.execute(f"SELECT votes FROM {table} WHERE id = ?", (tid,)).fetchone()[0]
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return 200, {"voted": not had, "votes": votes}


def api_helpful(conn, handler, user, post_id: int, data):
    require_user(user)
    post = load_post(conn, user, post_id)
    cid = parse_id(data.get("commentId"), "c")
    comment = conn.execute("SELECT * FROM comments WHERE id = ? AND post_id = ? AND status = 'live'", (cid, post_id)).fetchone()
    if not comment or post["author_id"] != user["id"] or post["type"] != "question" or comment["author_id"] == user["id"]:
        raise ApiError(403, "auth")
    previous = post["helpful_comment_id"]
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            if previous:
                old = conn.execute("SELECT author_id FROM comments WHERE id = ?", (previous,)).fetchone()
                if old and old["author_id"]:
                    conn.execute("UPDATE users SET reputation = MAX(0, reputation - 10) WHERE id = ?", (old["author_id"],))
            new = None if previous == cid else cid
            if new and comment["author_id"]:
                conn.execute("UPDATE users SET reputation = reputation + 10 WHERE id = ?", (comment["author_id"],))
            conn.execute("UPDATE posts SET helpful_comment_id = ? WHERE id = ?", (new, post_id))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return api_get_post(conn, handler, user, post_id)


def set_status(conn, kind: str, tid: int, status: str) -> None:
    if kind == "post":
        conn.execute("UPDATE posts SET status = ? WHERE id = ?", (status, tid))
        return
    row = conn.execute("SELECT post_id, status FROM comments WHERE id = ?", (tid,)).fetchone()
    if not row or row["status"] == status:
        return
    conn.execute("UPDATE comments SET status = ? WHERE id = ?", (status, tid))
    if row["status"] == "live" and status != "live":
        conn.execute("UPDATE posts SET reply_count = MAX(0, reply_count - 1) WHERE id = ?", (row["post_id"],))
    elif status == "live":
        conn.execute("UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?", (row["post_id"],))


def api_report(conn, handler, user, data):
    require_user(user)
    kind, tid, row = resolve_target(conn, user, data.get("target"))
    reason = str(data.get("reason") or "other")
    reason = reason if reason in REPORT_REASONS else "other"
    if rate_hit("report", f"u{user['id']}"):
        raise ApiError(429, "rate")
    target = f"{'p' if kind == 'post' else 'c'}{tid}"
    hidden = False
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            if conn.execute("SELECT 1 FROM reports WHERE reporter_id = ? AND target = ?", (user["id"], target)).fetchone():
                conn.execute("ROLLBACK")
                raise ApiError(409, "already")
            conn.execute("INSERT INTO reports (reporter_id, target, reason, created_at) VALUES (?,?,?,?)",
                         (user["id"], target, reason, now_iso()))
            open_count = conn.execute("SELECT COUNT(*) FROM reports WHERE target = ? AND state = 'open'", (target,)).fetchone()[0]
            if open_count >= report_threshold() and row["status"] == "live":
                set_status(conn, kind, tid, "hidden")
                hidden = True
            conn.execute("COMMIT")
        except ApiError:
            raise
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return 200, {"ok": True, "hidden": hidden}


def api_mod_queue(conn, handler, user, query):
    if not is_admin(user):
        raise ApiError(403, "auth")
    items = []
    reports = {r["target"]: r["n"] for r in conn.execute("SELECT target, COUNT(*) AS n FROM reports WHERE state = 'open' GROUP BY target")}
    posts = conn.execute(f"{POST_SELECT} WHERE p.status IN ('held','hidden','removed') OR ('p' || p.id) IN "
                         f"(SELECT target FROM reports WHERE state = 'open') ORDER BY p.created_at DESC LIMIT 200").fetchall()
    for row in posts:
        item = post_json(row, user, set(), set())
        item["kind"] = "post"
        item["openReports"] = reports.get(item["id"], 0)
        items.append(item)
    comments = conn.execute(
        "SELECT c.*, u.handle AS author_handle, u.reputation AS author_rep FROM comments c LEFT JOIN users u ON u.id = c.author_id "
        "WHERE c.status IN ('held','hidden','removed') OR ('c' || c.id) IN (SELECT target FROM reports WHERE state = 'open') "
        "ORDER BY c.created_at DESC LIMIT 200").fetchall()
    for row in comments:
        item = comment_json(row, user, set())
        item["kind"] = "comment"
        item["postId"] = f"p{row['post_id']}"
        item["title"] = ""
        item["openReports"] = reports.get(item["id"], 0)
        items.append(item)
    items.sort(key=lambda i: i["createdAt"], reverse=True)
    return 200, {"items": items}


def api_mod(conn, handler, user, data):
    if not is_admin(user):
        raise ApiError(403, "auth")
    action = str(data.get("action") or "")
    target = str(data.get("target") or "")
    if action not in {"hide", "unhide", "remove", "dismiss"}:
        raise ApiError(400, "action")
    if target.startswith("p"):
        kind, tid = "post", parse_id(target, "p")
        exists = conn.execute("SELECT 1 FROM posts WHERE id = ?", (tid,)).fetchone()
    else:
        kind, tid = "comment", parse_id(target, "c")
        exists = conn.execute("SELECT 1 FROM comments WHERE id = ?", (tid,)).fetchone()
    if not exists:
        raise ApiError(404, "not_found")
    key = f"{'p' if kind == 'post' else 'c'}{tid}"
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            if action == "hide":
                set_status(conn, kind, tid, "hidden")
            elif action == "remove":
                set_status(conn, kind, tid, "removed")
            elif action == "unhide":
                set_status(conn, kind, tid, "live")
            if action in ("unhide", "dismiss"):
                conn.execute("UPDATE reports SET state = 'dismissed' WHERE target = ? AND state = 'open'", (key,))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return 200, {"ok": True}


def api_waitlist(conn, handler, user, data):
    if rate_hit("waitlist", client_ip(handler)):
        raise ApiError(429, "rate")
    email = clean_text(data.get("email"), 254, False).lower()
    if not email_ok(email):
        raise ApiError(400, "email")
    lang = "es" if data.get("lang") == "es" else "en"
    source = re.sub(r"[^a-z0-9_-]", "", str(data.get("source") or "").lower())[:40]
    with _write_lock:
        conn.execute("INSERT INTO waitlist (email, lang, source, created_at) VALUES (?,?,?,?) "
                     "ON CONFLICT(email) DO UPDATE SET lang = excluded.lang, source = excluded.source",
                     (email, lang, source, now_iso()))
    return 200, {"ok": True}


# ───────────────────────── router ─────────────────────────

GET_ROUTES = {
    "/api/me": api_me,
    "/api/posts": api_list_posts,
    "/api/handle-check": api_handle_check,
    "/api/mod/queue": api_mod_queue,
}
POST_ROUTES = {
    "/api/signup": api_signup,
    "/api/login": api_login,
    "/api/logout": api_logout,
    "/api/me": api_update_me,
    "/api/account/delete": api_delete_account,
    "/api/posts": api_create_post,
    "/api/vote": api_vote,
    "/api/report": api_report,
    "/api/mod": api_mod,
    "/api/waitlist": api_waitlist,
}
POST_ITEM = re.compile(r"^/api/posts/(p?\d{1,12})(?:/(replies|save|helpful))?$")


def handles(method: str, path: str) -> bool:
    if method == "GET":
        return path in GET_ROUTES or bool(POST_ITEM.match(path) and not POST_ITEM.match(path).group(2))
    if method == "POST":
        return path in POST_ROUTES or bool(POST_ITEM.match(path) and POST_ITEM.match(path).group(2))
    return False


def dispatch(handler: Any, method: str) -> None:
    parsed = urlparse(handler.path)
    path = parsed.path
    conn = None
    try:
        if method == "POST":
            if handler.headers.get("X-CaseCircle") != "1" or not same_origin(handler):
                raise ApiError(403, "csrf")
        conn = connect()
        user = current_user(conn, handler)
        match = POST_ITEM.match(path)
        if method == "GET":
            if match:
                result = api_get_post(conn, handler, user, parse_id(match.group(1), "p"))
            else:
                result = GET_ROUTES[path](conn, handler, user, parse_qs(parsed.query))
        else:
            data = read_json(handler)
            if match:
                action = {"replies": api_reply, "save": api_save, "helpful": api_helpful}[match.group(2)]
                result = action(conn, handler, user, parse_id(match.group(1), "p"), data)
            else:
                result = POST_ROUTES[path](conn, handler, user, data)
        status, payload, *rest = result
        send_json(handler, status, payload, rest[0] if rest else None)
    except ApiError as error:
        send_json(handler, error.status, error.payload)
    except sqlite3.Error as error:
        handler.log_message("sqlite error: %s", type(error).__name__)
        send_json(handler, 500, {"error": "server"})
    finally:
        if conn is not None:
            conn.close()


def healthz(handler: Any) -> None:
    try:
        conn = connect()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        send_json(handler, 200, {"ok": True})
    except sqlite3.Error:
        send_json(handler, 503, {"ok": False})
