"""Accounts, community and waitlist on Supabase (Auth + Postgres), used when SUPABASE_URL is set.

Same JSON API as community.py (which stays as the offline/SQLite backend for local runs and tests), but:

* Sign-in is Supabase Auth (GoTrue REST): sign up, password sign-in, "Continue with Google" (server-side PKCE),
  refresh, sign out, password recovery.
* Data lives in Supabase Postgres and is read/written through PostgREST **with the signed-in user's JWT**, so
  Row Level Security (supabase/migrations/*.sql) is the real boundary. The server only holds the public
  publishable key; there is no service-role/secret key anywhere.
* The browser never talks to Supabase. The access + refresh tokens live in HttpOnly cookies (cc_at, cc_rt),
  so the page keeps its existing UI and no token is readable from JavaScript.

Only the Python standard library is used (urllib).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from typing import Any, Callable

import community as cc
import entitlements

AT_COOKIE = "cc_at"
RT_COOKIE = "cc_rt"
COOKIE_DAYS = 30
REFRESH_MARGIN_S = 60
TIMEOUT_S = 10
REPORT_THRESHOLD = 3   # mirrors private.reports_threshold() in the database


# ───────────────────────── config ─────────────────────────

def base_url() -> str:
    return os.environ.get("SUPABASE_URL", "").strip().rstrip("/")


def api_key() -> str:
    return (os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or "").strip()


def enabled() -> bool:
    return bool(base_url() and api_key())


# ───────────────────────── HTTP ─────────────────────────

class Upstream(Exception):
    """Supabase could not be reached (network error, timeout, 5xx without a JSON body)."""


def _http(method: str, url: str, headers: dict[str, str], body: bytes | None) -> tuple[int, bytes, dict[str, str]]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as err:
        return err.code, err.read(), dict(err.headers or {})
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise Upstream(type(err).__name__) from None


transport: Callable[[str, str, dict[str, str], bytes | None], tuple[int, bytes, dict[str, str]]] = _http


def call(method: str, path: str, *, token: str = "", params: dict[str, str] | list[tuple[str, str]] | None = None,
         body: Any = None, prefer: str = "") -> tuple[int, Any, dict[str, str]]:
    url = base_url() + path
    if params:
        url += "?" + urllib.parse.urlencode(params, safe="(),.*:{}\"", quote_via=urllib.parse.quote)
    headers = {"apikey": api_key(), "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if prefer:
        headers["Prefer"] = prefer
    status, raw, resp_headers = transport(method, url, headers, data)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = None
    if status >= 500 and payload is None:
        raise Upstream(f"http {status}")
    return status, payload, resp_headers


# PostgREST errors -> the API's error codes. Database triggers raise "cc:<code>" (see the migration).
_DB_CODES = {"rate": 429, "auth": 403, "not_found": 404, "closed": 409, "invalid": 400, "receipt": 400,
             "a-number": 400, "ssn": 400, "passport": 400, "abuse": 400, "taken": 409, "reserved": 400,
             "already": 409}


def _rest_error(status: int, payload: Any) -> cc.ApiError:
    info = payload if isinstance(payload, dict) else {}
    code, message = str(info.get("code") or ""), str(info.get("message") or "")
    if message.startswith("cc:"):
        name = message[3:]
        return cc.ApiError(_DB_CODES.get(name, 400), name)
    if code == "23505":
        return cc.ApiError(409, "already")
    if code in ("42501",) or status == 403:
        return cc.ApiError(403, "auth")
    if code in ("23514", "22P02", "23502", "22001"):
        return cc.ApiError(400, "bad_request")
    if status == 401 or code.startswith("PGRST3"):
        return cc.ApiError(401, "auth")
    if status == 404:
        return cc.ApiError(404, "not_found")
    return cc.ApiError(502 if status >= 500 else 400, "server" if status >= 500 else "bad_request")


def rest(method: str, table: str, *, token: str = "", params: Any = None, body: Any = None, prefer: str = "") -> Any:
    status, payload, _ = call(method, f"/rest/v1/{table}", token=token, params=params, body=body, prefer=prefer)
    if status >= 400:
        raise _rest_error(status, payload)
    return payload


def quote(value: str) -> str:
    """A PostgREST filter value, double-quoted so , . : ( ) inside user text stay literal."""
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


# ───────────────────────── tokens + cookies ─────────────────────────

def jwt_claims(token: str) -> dict[str, Any]:
    """Decode (NOT verify) a JWT payload. Only used for expiry timing and for claims of a token that
    PostgREST has just accepted in the same request; PostgREST/GoTrue do the signature checks."""
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        claims = json.loads(base64.urlsafe_b64decode(part.encode()).decode("utf-8"))
        return claims if isinstance(claims, dict) else {}
    except Exception:
        return {}


def read_cookies(handler: Any) -> tuple[str, str]:
    raw = handler.headers.get("Cookie", "")
    if not raw:
        return "", ""
    try:
        jar = SimpleCookie()
        jar.load(raw)
    except Exception:
        return "", ""
    at = jar.get(AT_COOKIE)
    rt = jar.get(RT_COOKIE)
    at_v = at.value if at and len(at.value) < 4096 else ""
    rt_v = rt.value if rt and len(rt.value) < 512 else ""
    return at_v, rt_v


def _cookie(handler: Any, name: str, value: str, max_age: int) -> str:
    parts = [f"{name}={value}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
    if cc.is_https(handler):
        parts.append("Secure")
    return "; ".join(parts)


def session_cookies(handler: Any, session: dict[str, Any]) -> list[str]:
    age = COOKIE_DAYS * 86400
    return [_cookie(handler, AT_COOKIE, str(session["access_token"]), age),
            _cookie(handler, RT_COOKIE, str(session["refresh_token"]), age)]


def clear_cookies(handler: Any) -> list[str]:
    pending(handler).clear()
    return [_cookie(handler, AT_COOKIE, "", 0), _cookie(handler, RT_COOKIE, "", 0), cc.session_cookie(handler, "", 0)]


def pending(handler: Any) -> list[str]:
    """Set-Cookie headers produced by a token refresh during this request (sent by dispatch or serve.end_headers)."""
    jar = getattr(handler, "_cc_set_cookies", None)
    if jar is None:
        jar = []
        try:
            handler._cc_set_cookies = jar
        except AttributeError:
            pass
    return jar


# Parallel requests from one page share one refresh (refresh tokens rotate; reusing an old one too late
# makes Supabase revoke the whole session).
_refresh_lock = threading.Lock()
_refreshed: dict[str, tuple[float, dict[str, Any]]] = {}


def refresh(refresh_token: str) -> dict[str, Any] | None:
    if not refresh_token:
        return None
    digest = hashlib.sha256(refresh_token.encode()).hexdigest()
    with _refresh_lock:
        now = time.time()
        hit = _refreshed.get(digest)
        if hit and now - hit[0] < 30:
            return hit[1]
        status, data, _ = call("POST", "/auth/v1/token", params={"grant_type": "refresh_token"},
                               body={"refresh_token": refresh_token})
        if status != 200 or not isinstance(data, dict) or not data.get("access_token"):
            return None
        for stale in [k for k, (t, _) in _refreshed.items() if now - t > 60]:
            _refreshed.pop(stale, None)
        _refreshed[digest] = (now, data)
        return data


def password_grant(email: str, password: str) -> tuple[int, Any]:
    status, data, _ = call("POST", "/auth/v1/token", params={"grant_type": "password"},
                           body={"email": email, "password": password})
    return status, data


def reset_for_tests() -> None:
    with _refresh_lock:
        _refreshed.clear()
    with _settings_lock:
        _settings_cache.update(at=0.0, google=False)


# ───────────────────────── the signed-in user ─────────────────────────

def epoch(value: Any) -> float | None:
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    if "." in text:  # normalise fractional seconds to 6 digits for fromisoformat on older Pythons
        head, _, tail = text.partition(".")
        digits = "".join(ch for ch in tail if ch.isdigit())
        rest_ = tail[len(digits):]
        text = f"{head}.{(digits + '000000')[:6]}{rest_}"
    try:
        stamp = datetime.fromisoformat(text)
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.timestamp()


def iso(value: Any) -> str | None:
    stamp = epoch(value)
    if stamp is None:
        return None
    return datetime.fromtimestamp(stamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


ACCOUNT_SELECT = "user_id,locale,spaces,case_profiles,is_admin,trial_started_at,pass_until,created_at,profiles(handle,reputation)"


def fetch_account(token: str) -> tuple[int, dict[str, Any] | None]:
    claims = jwt_claims(token)
    uid = str(claims.get("sub") or "")
    if not uid:
        return 401, None
    status, data, _ = call("GET", "/rest/v1/accounts", token=token,
                           params={"select": ACCOUNT_SELECT, "user_id": f"eq.{uid}"})
    if status != 200:
        return status, None
    if not data:
        if is_oauth(claims):   # an OAuth sign-up whose profile rows are missing: finish the profile to create them
            return 200, pending_user(claims, token)
        return 200, None
    return 200, make_user(data[0], claims, token)


def placeholder_handle(user_id: str) -> str:
    """The handle the database gives a new auth user that signed up without one (private.handle_new_user)."""
    return "user_" + str(user_id).replace("-", "")[:10]


def is_oauth(claims: dict[str, Any]) -> bool:
    meta = claims.get("app_metadata") if isinstance(claims.get("app_metadata"), dict) else {}
    providers = meta.get("providers") if isinstance(meta.get("providers"), list) else [meta.get("provider")]
    return any(p and p != "email" for p in providers)


def pending_user(claims: dict[str, Any], token: str) -> dict[str, Any]:
    return {"id": str(claims.get("sub") or ""), "email": str(claims.get("email") or ""), "handle": "", "reputation": 0,
            "locale": "en", "spaces": [], "profiles": [], "is_admin": False, "email_verified": False,
            "trial_started_at": None, "pass_until": None, "created_at": None, "pending_email": None,
            "token": token, "needs_profile": True}


def make_user(row: dict[str, Any], claims: dict[str, Any], token: str) -> dict[str, Any]:
    profile = row.get("profiles") or {}
    admin = bool(row.get("is_admin"))
    return {
        "id": row["user_id"],
        "email": str(claims.get("email") or ""),
        "handle": profile.get("handle") or "",
        "reputation": int(profile.get("reputation") or 0),
        "locale": row.get("locale") or "en",
        "spaces": list(row.get("spaces") or []),
        "profiles": list(row.get("case_profiles") or []),
        "is_admin": admin,
        # entitlements.is_owner() trusts "email_verified" for the owner bypass. With Supabase, an address can be
        # auto-confirmed without proof, so only the database admin flag (set with SQL) counts here.
        "email_verified": admin,
        "trial_started_at": epoch(row.get("trial_started_at")),
        "pass_until": epoch(row.get("pass_until")),
        "created_at": iso(row.get("created_at")),
        "pending_email": None,
        "token": token,
        # Google sign-ups get a placeholder handle from the database trigger until they pick one (and agree to the
        # rules) in "Finish your profile". Until then they count as signed out everywhere except that step.
        "needs_profile": (profile.get("handle") or "") == placeholder_handle(row["user_id"]),
    }


def load_user(handler: Any) -> dict[str, Any] | None:
    """The account for this request's cookies, refreshing an expiring access token once.
    PostgREST verifies the JWT on the account read, so a forged or expired cookie yields no user."""
    cached = getattr(handler, "_cc_user", False)
    if cached is not False:
        return cached
    user = _load_user(handler)
    try:
        handler._cc_user = user
    except AttributeError:
        pass
    return user


def _load_user(handler: Any) -> dict[str, Any] | None:
    at, rt = read_cookies(handler)
    if not at and not rt:
        return None
    refreshed = False
    exp = float(jwt_claims(at).get("exp") or 0) if at else 0
    if (not at or exp - time.time() < REFRESH_MARGIN_S) and rt:
        session = refresh(rt)
        if session:
            at, refreshed = session["access_token"], True
            pending(handler).extend(session_cookies(handler, session))
        elif not at:
            pending(handler).extend(clear_cookies(handler))
            return None
    status, user = fetch_account(at)
    if status == 401 and rt and not refreshed:
        session = refresh(rt)
        if session:
            pending(handler).extend(session_cookies(handler, session))
            status, user = fetch_account(session["access_token"])
    if status == 401 or (status == 200 and user is None):
        pending(handler).extend(clear_cookies(handler))
        return None
    if status != 200:
        raise Upstream(f"account {status}")
    return user


def is_admin(user: dict[str, Any] | None) -> bool:
    return bool(user) and bool(user.get("is_admin")) and not user.get("needs_profile")


def complete_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    """The user, or None while a Google sign-up still has to finish its profile."""
    return None if user and user.get("needs_profile") else user


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    if user.get("needs_profile"):
        return {"id": f"u{user['id']}", "email": user["email"], "needsProfile": True, "handle": "", "isAdmin": False,
                "spaces": [], "profiles": [], "reputation": 0, "locale": user.get("locale") or "en",
                "emailVerified": True, "pendingEmail": None, "createdAt": user.get("created_at"),
                "extras": entitlements.extras_status(None, admin=False)}
    return {
        "id": f"u{user['id']}",
        "handle": user["handle"],
        "email": user["email"],
        "locale": user["locale"],
        "spaces": user["spaces"],
        "profiles": user["profiles"],
        "reputation": user["reputation"],
        "isAdmin": is_admin(user),
        "emailVerified": True,   # Supabase only issues a session once the address is confirmed (or confirmation is off)
        "pendingEmail": user.get("pending_email"),
        "createdAt": user["created_at"],
        "extras": entitlements.extras_status(user, admin=is_admin(user)),
        "needsProfile": False,
        "hasPassword": has_password(user),
    }


def has_password(user: dict[str, Any]) -> bool:
    """False for accounts that only ever signed in with Google (settings then hides the password-based actions)."""
    meta = jwt_claims(user.get("token") or "").get("app_metadata")
    providers = meta.get("providers") if isinstance(meta, dict) and isinstance(meta.get("providers"), list) else ["email"]
    return "email" in providers


def feature_refusal(handler: Any, feature: str) -> tuple[int, dict[str, Any]] | None:
    try:
        user = complete_user(load_user(handler))
    except Upstream:
        user = None
    return entitlements.user_gate(user, feature, admin=is_admin(user))


# ───────────────────────── serialization ─────────────────────────

POST_SELECT = "*,author:profiles(handle,reputation)"


def _author(row: dict[str, Any]) -> dict[str, Any] | None:
    info = row.get("author")
    if row.get("author_id") and isinstance(info, dict) and info.get("handle"):
        return {"id": f"u{row['author_id']}", "username": info["handle"], "reputation": info.get("reputation") or 0}
    return None


def post_json(row: dict[str, Any], viewer: dict[str, Any] | None, voted: set[str], saved: set[int]) -> dict[str, Any]:
    pid = f"p{row['id']}"
    author = _author(row)
    return {
        "id": pid, "authorId": author["id"] if author else None, "author": author,
        "spaceIds": list(row.get("spaces") or []), "type": row["type"], "title": row["title"], "body": row["body"],
        "stage": row.get("stage") or "", "officeId": row.get("office_id") or "", "form": row.get("form") or "",
        "filed": row.get("filed"), "status": row["status"], "faq": False, "createdAt": iso(row.get("created_at")),
        "votes": row.get("votes") or 0, "replyCount": row.get("reply_count") or 0,
        "helpfulCommentId": f"c{row['helpful_comment_id']}" if row.get("helpful_comment_id") else None,
        "voted": pid in voted, "saved": row["id"] in saved,
        "mine": bool(viewer) and row.get("author_id") == viewer["id"],
    }


def comment_json(row: dict[str, Any], viewer: dict[str, Any] | None, voted: set[str]) -> dict[str, Any]:
    cid = f"c{row['id']}"
    author = _author(row)
    return {"id": cid, "authorId": author["id"] if author else None, "author": author, "body": row["body"],
            "createdAt": iso(row.get("created_at")), "votes": row.get("votes") or 0, "status": row["status"],
            "voted": cid in voted, "mine": bool(viewer) and row.get("author_id") == viewer["id"]}


def tok(user: dict[str, Any] | None) -> str:
    return user["token"] if user else ""


def visible_filter(user: dict[str, Any] | None) -> tuple[str, str]:
    """(param, value) mirroring community.visible_clause on top of RLS: admins see all but removed;
    authors also see their own held items; everyone else sees live items."""
    if is_admin(user):
        return "status", "neq.removed"
    if user:
        return "or", f"(status.eq.live,and(author_id.eq.{user['id']},status.eq.held))"
    return "status", "eq.live"


def viewer_marks(user: dict[str, Any] | None) -> tuple[set[str], set[int]]:
    if not user:
        return set(), set()
    votes = rest("GET", "votes", token=tok(user), params={"select": "target_kind,target_id"})
    saves = rest("GET", "saves", token=tok(user), params={"select": "post_id"})
    voted = {("p" if v["target_kind"] == "post" else "c") + str(v["target_id"]) for v in votes or []}
    return voted, {s["post_id"] for s in saves or []}


def load_post(user: dict[str, Any] | None, post_id: int) -> dict[str, Any]:
    key, value = visible_filter(user)
    rows = rest("GET", "posts", token=tok(user), params=[("select", POST_SELECT), ("id", f"eq.{post_id}"), (key, value)])
    if not rows:
        raise cc.ApiError(404, "not_found")
    return rows[0]


# ───────────────────────── handlers ─────────────────────────

def api_me(handler, user, _q):
    rows = rest("GET", "space_counts", params={"select": "space_id,members"}) or []
    counts = {r["space_id"]: r["members"] for r in rows if r.get("members")}
    return 200, {"user": public_user(user) if user else None, "groupCounts": counts,
                 "reportThreshold": REPORT_THRESHOLD, "trialDays": entitlements.trial_days(),
                 "providers": {"google": google_enabled()}}


def _auth_error(status: int, data: Any) -> str:
    info = data if isinstance(data, dict) else {}
    return str(info.get("error_code") or info.get("code") or info.get("error") or status)


def handle_taken(handle: str) -> bool:
    rows = rest("GET", "profiles", params={"select": "id", "handle_key": f"eq.{handle.lower()}"})
    return bool(rows)


def redirect_to(handler: Any) -> str:
    return cc.public_base(handler) + "/"


def finish_sign_in(handler: Any, session: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    status, user = fetch_account(session["access_token"])
    if status != 200 or not user:
        raise cc.ApiError(502, "server")
    return user, session_cookies(handler, session)


def api_signup(handler, user, data):
    if cc.rate_hit("signup", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    email = cc.clean_text(data.get("email"), 254, False).lower()
    password = str(data.get("password") or "")
    handle = cc.clean_text(data.get("handle"), 20, False)
    if not cc.email_ok(email):
        raise cc.ApiError(400, "email")
    issue = cc.handle_issue(handle)
    if issue:
        raise cc.ApiError(400, issue)
    problem = cc.password_issue(password, email, handle)
    if problem:
        raise cc.ApiError(400, problem)
    if not data.get("agreeRules") or not data.get("agreeNotAdvice"):
        raise cc.ApiError(400, "agree")
    locale = "es" if data.get("locale") == "es" else "en"
    spaces = cc.clean_spaces(data.get("spaces")) or ["i-485"]
    profiles = cc.clean_profiles(data.get("profiles"))
    if handle_taken(handle):
        raise cc.ApiError(409, "taken")
    status, body, _ = call("POST", "/auth/v1/signup", params={"redirect_to": redirect_to(handler)},
                           body={"email": email, "password": password,
                                 "data": {"handle": handle, "locale": locale, "spaces": spaces}})
    if status >= 400:
        code = _auth_error(status, body)
        if code in ("user_already_exists", "email_exists"):
            raise cc.ApiError(409, "email_taken")
        if code == "weak_password":
            raise cc.ApiError(400, "password")
        if code in ("email_address_invalid", "validation_failed"):
            raise cc.ApiError(400, "email")
        if status == 429 or code.startswith("over_"):
            raise cc.ApiError(429, "rate")
        if status >= 500 and handle_taken(handle):
            raise cc.ApiError(409, "taken")
        raise cc.ApiError(502, "server")
    if not isinstance(body, dict) or not body.get("access_token"):
        # Confirm-email is on: Supabase emailed a link; there is no session until it is opened.
        return 201, {"user": None, "confirm": True, "email": email}
    if profiles:
        rest("PATCH", "accounts", token=body["access_token"], params={"user_id": f"eq.{body['user']['id']}"},
             body={"case_profiles": profiles}, prefer="return=minimal")
    fresh, cookies = finish_sign_in(handler, body)
    return 201, {"user": public_user(fresh)}, cookies


def api_login(handler, user, data):
    email = cc.clean_text(data.get("email"), 254, False).lower()
    key = cc.lockout_key(email, cc.client_ip(handler))
    wait = cc.locked_for(key)
    if wait > 0:
        raise cc.ApiError(429, "rate", retryAfter=int(wait) + 1)
    if cc.rate_hit("login", cc.client_ip(handler)) or cc.rate_hit("login", f"email:{email}"):
        raise cc.ApiError(429, "rate")
    password = str(data.get("password") or "")[:200]
    if not cc.email_ok(email) or not password:
        cc.record_failure(key)
        raise cc.ApiError(401, "login")
    status, body = password_grant(email, password)
    if status != 200 or not isinstance(body, dict) or not body.get("access_token"):
        code = _auth_error(status, body)
        if code == "email_not_confirmed":
            raise cc.ApiError(403, "unconfirmed")
        if status == 429 or code.startswith("over_"):
            raise cc.ApiError(429, "rate")
        if status >= 500:
            raise cc.ApiError(502, "server")
        cc.record_failure(key)
        raise cc.ApiError(401, "login")
    cc.clear_failures(key)
    fresh, cookies = finish_sign_in(handler, body)
    return 200, {"user": public_user(fresh)}, cookies


def _logout(handler: Any, scope: str) -> None:
    at, _ = read_cookies(handler)
    token = at if at and jwt_claims(at).get("exp", 0) > time.time() else ""
    user = getattr(handler, "_cc_user", None)
    token = (user or {}).get("token") or token
    if token:
        try:
            call("POST", "/auth/v1/logout", token=token, params={"scope": scope})
        except Upstream:
            pass


def api_logout(handler, user, data):
    _logout(handler, "local")
    return 200, {"ok": True}, clear_cookies(handler)


def api_logout_all(handler, user, data):
    cc.require_user(user)
    _logout(handler, "global")
    return 200, {"ok": True}, clear_cookies(handler)


def api_update_me(handler, user, data):
    cc.require_user(user)
    patch: dict[str, Any] = {}
    if "locale" in data:
        patch["locale"] = "es" if data["locale"] == "es" else "en"
    if "spaces" in data:
        patch["spaces"] = cc.clean_spaces(data["spaces"])
    if "profiles" in data:
        patch["case_profiles"] = cc.clean_profiles(data["profiles"])
    if patch:
        rest("PATCH", "accounts", token=tok(user), params={"user_id": f"eq.{user['id']}"}, body=patch, prefer="return=minimal")
    _, fresh = fetch_account(tok(user))
    return 200, {"user": public_user(fresh or user)}


def _check_password(user: dict[str, Any], password: str, error: str) -> dict[str, Any]:
    status, body = password_grant(user["email"], str(password or "")[:200])
    if status != 200 or not isinstance(body, dict) or not body.get("access_token"):
        if status == 429:
            raise cc.ApiError(429, "rate")
        raise cc.ApiError(401, error)
    return body


def api_delete_account(handler, user, data):
    cc.require_user(user)
    if cc.rate_hit("account", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    if data.get("confirm") is not True:
        raise cc.ApiError(400, "confirm")
    if has_password(user):
        session = _check_password(user, data.get("password"), "login")
    else:   # Google-only account: no password to re-check, so the public name is typed instead
        if str(data.get("handle") or "").strip().lower() != user["handle"].lower():
            raise cc.ApiError(401, "confirm_handle")
        session = {"access_token": tok(user)}
    # Deleting your accounts row deletes your Supabase Auth user (trigger); posts stay with no author.
    rest("DELETE", "accounts", token=session["access_token"], params={"user_id": f"eq.{user['id']}"}, prefer="return=minimal")
    return 200, {"ok": True}, clear_cookies(handler)


def api_handle_check(handler, user, query):
    if cc.rate_hit("handle", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    handle = cc.clean_text((query.get("handle") or [""])[0], 20, False)
    issue = cc.handle_issue(handle)
    if not issue and handle_taken(handle):
        issue = "taken"
    return 200, {"handle": handle, "issue": issue}


def _like(text: str) -> str:
    """ilike pattern for PostgREST (* is its wildcard): escape LIKE's own % and _ and drop *."""
    text = text.replace("*", " ").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"*{text}*"


def api_list_posts(handler, user, query):
    q = lambda key, default="": (query.get(key) or [default])[0]
    params: list[tuple[str, str]] = [("select", POST_SELECT)]
    logic: list[str] = []
    key, value = visible_filter(user)
    if key == "or":
        logic.append(f"or{value}")
    else:
        params.append((key, value))
    group = q("group").strip().lower()
    groups = cc.clean_spaces(q("groups").split(",")) if q("groups") else []
    if group:
        if not cc.SPACE_RE.match(group):
            return 200, {"posts": [], "more": False}
        params.append(("spaces", "cs.{%s}" % group))
    elif groups:
        params.append(("spaces", "ov.{%s}" % ",".join(groups)))
    kind = q("type")
    if kind in cc.KINDS:
        params.append(("type", f"eq.{kind}"))
    sort = q("sort", "new")
    if sort == "unanswered":
        params += [("type", "eq.question"), ("reply_count", "eq.0")]
    text = cc.clean_text(q("q"), 80, False)
    if text:
        pattern = quote(_like(text))
        logic.append(f"or(title.ilike.{pattern},body.ilike.{pattern})")
    if q("author") == "me":
        cc.require_user(user)
        params.append(("author_id", f"eq.{user['id']}"))
    try:
        limit = max(1, min(100, int(q("limit", "30"))))
        offset = max(0, int(q("offset", "0")))
    except ValueError:
        raise cc.ApiError(400, "bad_request")
    if len(logic) == 1:
        params.append(("or", logic[0][2:]))
    elif logic:
        params.append(("and", f"({','.join(logic)})"))
    if q("saved") == "1":
        cc.require_user(user)
        saves = rest("GET", "saves", token=tok(user), params={"select": "post_id,created_at", "order": "created_at.desc"}) or []
        order = [s["post_id"] for s in saves]
        if not order:
            return 200, {"posts": [], "more": False}
        params.append(("id", f"in.({','.join(str(i) for i in order)})"))
        rows = rest("GET", "posts", token=tok(user), params=params) or []
        rank = {pid: i for i, pid in enumerate(order)}
        rows.sort(key=lambda r: rank.get(r["id"], 1 << 30))
        rows = rows[offset: offset + limit + 1]
    else:
        params.append(("order", "votes.desc,created_at.desc" if sort == "top" else "created_at.desc"))
        params += [("limit", str(limit + 1)), ("offset", str(offset))]
        rows = rest("GET", "posts", token=tok(user), params=params) or []
    voted, saved = viewer_marks(user)
    return 200, {"posts": [post_json(r, user, voted, saved) for r in rows[:limit]], "more": len(rows) > limit}


def api_get_post(handler, user, post_id: int):
    row = load_post(user, post_id)
    voted, saved = viewer_marks(user)
    post = post_json(row, user, voted, saved)
    key, value = visible_filter(user)
    comments = rest("GET", "comments", token=tok(user), params=[
        ("select", POST_SELECT), ("post_id", f"eq.{post_id}"), (key, value), ("order", "created_at.asc,id.asc")]) or []
    post["comments"] = [comment_json(c, user, voted) for c in comments]
    post["canMarkHelpful"] = bool(user) and row.get("author_id") == user["id"] and row["type"] == "question"
    return 200, {"post": post}


def api_create_post(handler, user, data):
    cc.require_user(user)
    kind = str(data.get("type") or "")
    if kind not in cc.KINDS:
        raise cc.ApiError(400, "type")
    title = cc.clean_text(data.get("title"), cc.LIMITS["title_max"], False)
    body = cc.clean_text(data.get("body"), cc.LIMITS["body_max"])
    spaces = cc.clean_spaces(data.get("spaceIds"), 3)
    if len(title) < cc.LIMITS["title_min"] or len(body) < cc.LIMITS["body_min"] or not spaces:
        raise cc.ApiError(400, "short")
    if len(title) > cc.LIMITS["title_max"] or len(body) > cc.LIMITS["body_max"]:
        raise cc.ApiError(400, "long")
    stage = str(data.get("stage") or "")
    stage = stage if stage in cc.STAGES else ""
    if kind in ("timeline", "interview") and not stage:
        raise cc.ApiError(400, "stage")
    verdict, reason = cc.evaluate(f"{title}\n{body}")
    if verdict == "block":
        raise cc.ApiError(400, reason)
    if cc.rate_hit("post", f"u{user['id']}") or cc.rate_hit("post_day", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    profile = next((p for p in user["profiles"] if p.get("spaceId") == spaces[0]), {})
    office = cc.clean_text(data.get("officeId") or profile.get("officeId") or "", 24, False)
    form = cc.clean_text(profile.get("form") or data.get("form") or spaces[0].upper(), 16, False)
    filed = (str(profile.get("filed"))[:40] if profile.get("filed") else None)
    profile_stage = str(profile.get("stage") or "")
    rows = rest("POST", "posts", token=tok(user), params={"select": "id,status"}, prefer="return=representation", body={
        "type": kind, "title": title, "body": body, "spaces": spaces,
        "stage": stage or (profile_stage if profile_stage in cc.STAGES else ""),
        "office_id": office, "form": form, "filed": filed})
    created = rows[0]
    merged = user["spaces"] + [s for s in spaces if s not in user["spaces"]]
    if merged != user["spaces"]:
        rest("PATCH", "accounts", token=tok(user), params={"user_id": f"eq.{user['id']}"},
             body={"spaces": merged[:12]}, prefer="return=minimal")
    _, payload = api_get_post(handler, user, created["id"])
    payload["held"] = created["status"] == "held"
    return 201, payload


def api_reply(handler, user, post_id: int, data):
    cc.require_user(user)
    row = load_post(user, post_id)
    if row["status"] != "live":
        raise cc.ApiError(409, "closed")
    text = cc.clean_text(data.get("body"), cc.LIMITS["reply_max"])
    if len(text) < cc.LIMITS["reply_min"]:
        raise cc.ApiError(400, "short")
    if len(text) > cc.LIMITS["reply_max"]:
        raise cc.ApiError(400, "long")
    verdict, reason = cc.evaluate(text)
    if verdict == "block":
        raise cc.ApiError(400, reason)
    if cc.rate_hit("reply", f"u{user['id']}") or cc.rate_hit("reply_day", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    rows = rest("POST", "comments", token=tok(user), params={"select": "id,status"}, prefer="return=representation",
                body={"post_id": post_id, "body": text})
    _, payload = api_get_post(handler, user, post_id)
    payload["held"] = rows[0]["status"] == "held"
    return 201, payload


def api_save(handler, user, post_id: int, data):
    cc.require_user(user)
    load_post(user, post_id)
    if cc.rate_hit("vote", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    have = rest("GET", "saves", token=tok(user), params={"select": "post_id", "post_id": f"eq.{post_id}"})
    if have:
        rest("DELETE", "saves", token=tok(user), params={"post_id": f"eq.{post_id}"}, prefer="return=minimal")
        return 200, {"saved": False}
    rest("POST", "saves", token=tok(user), body={"post_id": post_id}, prefer="return=minimal")
    return 200, {"saved": True}


def resolve_target(user, target: Any) -> tuple[str, int, dict[str, Any]]:
    target = str(target or "")
    if target.startswith("p"):
        pid = cc.parse_id(target, "p")
        return "post", pid, load_post(user, pid)
    if target.startswith("c"):
        cid = cc.parse_id(target, "c")
        rows = rest("GET", "comments", token=tok(user), params={"select": "*", "id": f"eq.{cid}"})
        if not rows:
            raise cc.ApiError(404, "not_found")
        row = rows[0]
        load_post(user, row["post_id"])
        if row["status"] != "live" and not is_admin(user):
            raise cc.ApiError(404, "not_found")
        return "comment", cid, row
    raise cc.ApiError(404, "not_found")


def api_vote(handler, user, data):
    cc.require_user(user)
    kind, tid, row = resolve_target(user, data.get("target"))
    if row.get("author_id") == user["id"]:
        raise cc.ApiError(400, "self")
    if cc.rate_hit("vote", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    match = {"target_kind": f"eq.{kind}", "target_id": f"eq.{tid}"}
    had = rest("GET", "votes", token=tok(user), params={"select": "target_id", **match})
    if had:
        rest("DELETE", "votes", token=tok(user), params=match, prefer="return=minimal")
    else:
        rest("POST", "votes", token=tok(user), body={"target_kind": kind, "target_id": tid}, prefer="return=minimal")
    table = "posts" if kind == "post" else "comments"
    now = rest("GET", table, token=tok(user), params={"select": "votes", "id": f"eq.{tid}"}) or [{"votes": 0}]
    return 200, {"voted": not had, "votes": now[0]["votes"]}


def api_helpful(handler, user, post_id: int, data):
    cc.require_user(user)
    post = load_post(user, post_id)
    cid = cc.parse_id(data.get("commentId"), "c")
    rows = rest("GET", "comments", token=tok(user), params={
        "select": "id,author_id", "id": f"eq.{cid}", "post_id": f"eq.{post_id}", "status": "eq.live"})
    if not rows or post.get("author_id") != user["id"] or post["type"] != "question" or rows[0].get("author_id") == user["id"]:
        raise cc.ApiError(403, "auth")
    new = None if post.get("helpful_comment_id") == cid else cid
    rest("PATCH", "posts", token=tok(user), params={"id": f"eq.{post_id}"}, body={"helpful_comment_id": new},
         prefer="return=minimal")
    return api_get_post(handler, user, post_id)


def api_report(handler, user, data):
    cc.require_user(user)
    kind, tid, row = resolve_target(user, data.get("target"))
    reason = str(data.get("reason") or "other")
    reason = reason if reason in cc.REPORT_REASONS else "other"
    if cc.rate_hit("report", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    rest("POST", "reports", token=tok(user), body={"target_kind": kind, "target_id": tid, "reason": reason},
         prefer="return=minimal")
    table = "posts" if kind == "post" else "comments"
    after = rest("GET", table, token=tok(user), params={"select": "status", "id": f"eq.{tid}"})
    hidden = row["status"] == "live" and (not after or after[0]["status"] == "hidden")
    return 200, {"ok": True, "hidden": hidden}


def api_mod_queue(handler, user, query):
    if not is_admin(user):
        raise cc.ApiError(403, "auth")
    reports = rest("GET", "reports", token=tok(user), params={"select": "target_kind,target_id", "state": "eq.open"}) or []
    counts: dict[str, int] = {}
    for r in reports:
        key = ("p" if r["target_kind"] == "post" else "c") + str(r["target_id"])
        counts[key] = counts.get(key, 0) + 1
    post_ids = [k[1:] for k in counts if k.startswith("p")]
    comment_ids = [k[1:] for k in counts if k.startswith("c")]
    def flagged(ids: list[str]) -> str:
        return f"(status.in.(held,hidden,removed){',id.in.(' + ','.join(ids) + ')' if ids else ''})"
    items = []
    for row in rest("GET", "posts", token=tok(user), params=[("select", POST_SELECT), ("or", flagged(post_ids)),
                                                             ("order", "created_at.desc"), ("limit", "200")]) or []:
        item = post_json(row, user, set(), set())
        item["kind"], item["openReports"] = "post", counts.get(item["id"], 0)
        items.append(item)
    for row in rest("GET", "comments", token=tok(user), params=[("select", POST_SELECT), ("or", flagged(comment_ids)),
                                                                ("order", "created_at.desc"), ("limit", "200")]) or []:
        item = comment_json(row, user, set())
        item.update(kind="comment", postId=f"p{row['post_id']}", title="", openReports=counts.get(f"c{row['id']}", 0))
        items.append(item)
    items.sort(key=lambda i: i["createdAt"] or "", reverse=True)
    return 200, {"items": items}


def api_mod(handler, user, data):
    if not is_admin(user):
        raise cc.ApiError(403, "auth")
    action = str(data.get("action") or "")
    target = str(data.get("target") or "")
    if action not in {"hide", "unhide", "remove", "dismiss"}:
        raise cc.ApiError(400, "action")
    kind, tid = ("post", cc.parse_id(target, "p")) if target.startswith("p") else ("comment", cc.parse_id(target, "c"))
    table = "posts" if kind == "post" else "comments"
    if not rest("GET", table, token=tok(user), params={"select": "id", "id": f"eq.{tid}"}):
        raise cc.ApiError(404, "not_found")
    status = {"hide": "hidden", "remove": "removed", "unhide": "live"}.get(action)
    if status:
        rest("PATCH", table, token=tok(user), params={"id": f"eq.{tid}"}, body={"status": status}, prefer="return=minimal")
    if action in ("unhide", "dismiss"):
        rest("PATCH", "reports", token=tok(user), params={"target_kind": f"eq.{kind}", "target_id": f"eq.{tid}",
                                                         "state": "eq.open"}, body={"state": "dismissed"}, prefer="return=minimal")
    return 200, {"ok": True}


def api_waitlist(handler, user, data):
    if cc.rate_hit("waitlist", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    email = cc.clean_text(data.get("email"), 254, False).lower()
    if not cc.email_ok(email):
        raise cc.ApiError(400, "email")
    lang = "es" if data.get("lang") == "es" else "en"
    source = "".join(ch for ch in str(data.get("source") or "").lower() if ch.isascii() and (ch.isalnum() or ch in "_-"))[:40]
    try:   # write-only table (no SELECT for the API), so a duplicate address just reports success
        rest("POST", "waitlist", body={"email": email, "lang": lang, "source": source}, prefer="return=minimal")
    except cc.ApiError as error:
        if error.payload.get("error") != "already":
            raise
    return 200, {"ok": True}


def api_verify_resend(handler, user, data):
    cc.require_user(user)
    return 200, {"ok": True, "already": True}


def api_verify(handler, user, data):
    """The page posts the tokens Supabase put in the link's #fragment (signup / email change confirmation)."""
    if cc.rate_hit("token", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    access, refresh_token = str(data.get("token") or ""), str(data.get("refresh") or "")
    if not access or len(access) > 4096 or not refresh_token or len(refresh_token) > 512:
        raise cc.ApiError(400, "token")
    status, fresh = fetch_account(access)
    if status != 200 or not fresh:
        raise cc.ApiError(400, "token")
    kind = "email_change" if data.get("kind") == "email_change" else "verify"
    session = {"access_token": access, "refresh_token": refresh_token}
    return 200, {"ok": True, "kind": kind, "user": public_user(fresh)}, session_cookies(handler, session)


def api_forgot(handler, user, data):
    """Always the same answer, whether or not the email has an account (no enumeration)."""
    if cc.rate_hit("forgot_ip", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    email = cc.clean_text(data.get("email"), 254, False).lower()
    if not cc.email_ok(email):
        raise cc.ApiError(400, "email")
    if not cc.rate_hit("forgot_email", email):
        call("POST", "/auth/v1/recover", params={"redirect_to": redirect_to(handler)}, body={"email": email})
    return 200, {"ok": True}


def api_reset(handler, user, data):
    """``token`` is the access token from Supabase's recovery link (#access_token=…&type=recovery)."""
    if cc.rate_hit("token", cc.client_ip(handler)):
        raise cc.ApiError(429, "rate")
    token = str(data.get("token") or "")
    if not token or len(token) > 4096:
        raise cc.ApiError(400, "token")
    status, owner = fetch_account(token)
    if status != 200 or not owner:
        raise cc.ApiError(400, "token")
    password = str(data.get("password") or "")
    problem = cc.password_issue(password, owner["email"], owner["handle"])
    if problem:
        raise cc.ApiError(400, problem)
    status, body, _ = call("PUT", "/auth/v1/user", token=token, body={"password": password})
    if status != 200:
        code = _auth_error(status, body)
        if code in ("same_password", "weak_password"):
            raise cc.ApiError(400, "password_common" if code == "same_password" else "password")
        raise cc.ApiError(400, "token")
    call("POST", "/auth/v1/logout", token=token, params={"scope": "global"})   # every device signs in again
    cc.clear_failures(cc.lockout_key(owner["email"], cc.client_ip(handler)))
    return 200, {"ok": True}, clear_cookies(handler)


def api_change_password(handler, user, data):
    cc.require_user(user)
    if cc.rate_hit("account", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    session = _check_password(user, data.get("current"), "current")
    password = str(data.get("password") or "")
    problem = cc.password_issue(password, user["email"], user["handle"])
    if problem:
        raise cc.ApiError(400, problem)
    status, body, _ = call("PUT", "/auth/v1/user", token=session["access_token"], body={"password": password})
    if status != 200:
        code = _auth_error(status, body)
        raise cc.ApiError(400, "password_common" if code == "same_password" else "password")
    call("POST", "/auth/v1/logout", token=session["access_token"], params={"scope": "others"})
    return 200, {"ok": True}, session_cookies(handler, session)


def api_change_email(handler, user, data):
    cc.require_user(user)
    if cc.rate_hit("account", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    session = _check_password(user, data.get("password"), "current")
    email = cc.clean_text(data.get("email"), 254, False).lower()
    if not cc.email_ok(email):
        raise cc.ApiError(400, "email")
    if email == user["email"].lower():
        raise cc.ApiError(400, "same_email")
    status, body, _ = call("PUT", "/auth/v1/user", token=session["access_token"],
                           params={"redirect_to": redirect_to(handler)}, body={"email": email})
    if status != 200:
        code = _auth_error(status, body)
        if code in ("email_exists", "user_already_exists"):
            raise cc.ApiError(409, "email_taken")
        if status == 429 or code.startswith("over_"):
            raise cc.ApiError(429, "rate")
        raise cc.ApiError(400, "email")
    fresh = dict(user)
    fresh["email"] = (body or {}).get("email") or user["email"]
    fresh["pending_email"] = (body or {}).get("new_email") or None
    return 200, {"user": public_user(fresh)}, session_cookies(handler, session)



# ───────────────────────── Continue with Google (server-side PKCE) ─────────────────────────
#
# GET /api/auth/google?locale=es&next=/#feed
#     -> a fresh code_verifier in a short-lived HttpOnly cookie (cc_oauth), then 302 to Supabase's
#        /auth/v1/authorize?provider=google&redirect_to=<origin>/auth/callback&code_challenge=…&code_challenge_method=s256
# Google -> Supabase (/auth/v1/callback) -> GET /auth/callback?code=…   (or ?error=…&error_description=…)
#     -> POST /auth/v1/token?grant_type=pkce {auth_code, code_verifier}; cc_at/cc_rt set like a password sign-in;
#        verifier cookie cleared; 302 back into the app with ?signin=google (or ?signin=google-new when the
#        account still needs a public name, or ?signin_error=<code>).
# POST /api/auth/complete-profile   handle + the two agreements -> public.complete_profile() (see migration).
#
# Supabase links a Google sign-in to an existing account with the same verified email, so the same auth user
# (and the same accounts row) comes back; new Google users get a placeholder handle from the signup trigger.

OAUTH_COOKIE = "cc_oauth"
OAUTH_TTL_S = 600
GOOGLE_ERRORS = ("google_cancelled", "google_expired", "google_failed", "google_off", "google_unavailable")
_settings_lock = threading.Lock()
_settings_cache: dict[str, Any] = {"at": 0.0, "google": False}
SETTINGS_TTL_S = 300


def google_enabled() -> bool:
    """Is the Google provider switched on in Supabase? (public /auth/v1/settings, cached 5 minutes)."""
    now = time.time()
    with _settings_lock:
        if now - _settings_cache["at"] < SETTINGS_TTL_S:
            return bool(_settings_cache["google"])
    try:
        status, data, _ = call("GET", "/auth/v1/settings")
        external = data.get("external") if status == 200 and isinstance(data, dict) else None
        on, known = bool(isinstance(external, dict) and external.get("google")), status == 200
    except Upstream:
        on, known = False, False
    with _settings_lock:   # a failed lookup is retried after 30 s instead of 5 minutes
        _settings_cache.update(at=now if known else now - SETTINGS_TTL_S + 30, google=on)
    return on


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def new_verifier() -> str:
    return _b64url(os.urandom(48))   # 64 chars from [A-Za-z0-9_-]: inside RFC 7636's 43–128


def challenge(verifier: str) -> str:
    return _b64url(hashlib.sha256(verifier.encode("ascii")).digest())


def safe_next(raw: Any) -> str:
    """Only same-site paths ("/", "/#feed", "/?x=1#post=p3"); anything else becomes "/"."""
    text = str(raw or "/")[:300]
    if not text.startswith("/") or text.startswith("//") or "\\" in text or any(ord(ch) < 33 or ord(ch) == 127 for ch in text):
        return "/"
    parsed = urllib.parse.urlsplit(text)
    if parsed.scheme or parsed.netloc:
        return "/"
    return text


def oauth_origin(handler: Any) -> tuple[str, bool]:
    """(origin for redirect_to, is_this_request_on_it). The callback has to land on the host that holds the
    verifier cookie, so a request on another host is first bounced to the configured public origin."""
    configured = [o.strip().rstrip("/") for o in os.environ.get("CASECIRCLE_PUBLIC_ORIGIN", "").split(",") if o.strip()]
    host = (handler.headers.get("X-Forwarded-Host", "") if cc.trust_proxy() else "") or handler.headers.get("Host", "")
    here = f"{'https' if cc.is_https(handler) else 'http'}://{host}" if host else ""
    if not configured:
        return (here or cc.public_base(handler)), True
    if here.lower() in {c.lower() for c in configured}:
        return here, True
    return configured[0], False


def _pack(verifier: str, locale: str, next_path: str) -> str:
    return f"{verifier}.{locale}.{_b64url(next_path.encode('utf-8'))}"


def _unpack(value: str) -> tuple[str, str, str] | None:
    parts = value.split(".")
    if len(parts) != 3 or not (43 <= len(parts[0]) <= 128) or parts[1] not in ("en", "es"):
        return None
    if any(ch not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for ch in parts[0] + parts[2]):
        return None
    try:
        next_path = base64.urlsafe_b64decode((parts[2] + "=" * (-len(parts[2]) % 4)).encode()).decode("utf-8")
    except Exception:
        return None
    return parts[0], parts[1], safe_next(next_path)


def read_oauth_cookie(handler: Any) -> tuple[str, str, str] | None:
    raw = handler.headers.get("Cookie", "")
    try:
        jar = SimpleCookie()
        jar.load(raw)
    except Exception:
        return None
    morsel = jar.get(OAUTH_COOKIE)
    return _unpack(morsel.value) if morsel and len(morsel.value) < 700 else None


def app_url(next_path: str, **params: str) -> str:
    """next_path with ?signin=… merged into its query (before any #route)."""
    parts = urllib.parse.urlsplit(safe_next(next_path))
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k not in ("signin", "signin_error", "lang")]
    query += [(k, v) for k, v in params.items() if v]
    return urllib.parse.urlunsplit(("", "", parts.path or "/", urllib.parse.urlencode(query), parts.fragment))


def send_redirect(handler: Any, location: str, cookies: list[str] | None = None) -> None:
    handler.send_response(302)
    handler.send_header("Location", location)
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", "0")
    for cookie in cookies or []:
        handler.send_header("Set-Cookie", cookie)
    handler.end_headers()


def oauth_start(handler: Any) -> None:
    """GET /api/auth/google — no X-CaseCircle header (it is a plain link); nothing changes until the callback."""
    parsed = urllib.parse.urlparse(handler.path)
    query = urllib.parse.parse_qs(parsed.query)
    locale = "es" if (query.get("locale") or [""])[0] == "es" else "en"
    next_path = safe_next((query.get("next") or ["/"])[0])
    origin, here = oauth_origin(handler)
    if not here:
        send_redirect(handler, origin + parsed.path + (f"?{parsed.query}" if parsed.query else ""))
        return
    fail = lambda code: send_redirect(handler, app_url(next_path, signin_error=code, lang=locale))
    if cc.rate_hit("token", cc.client_ip(handler)):
        fail("google_failed")
        return
    if not google_enabled():
        fail("google_off")
        return
    verifier = new_verifier()
    params = {"provider": "google", "redirect_to": f"{origin}/auth/callback",
              "code_challenge": challenge(verifier), "code_challenge_method": "s256"}
    target = f"{base_url()}/auth/v1/authorize?{urllib.parse.urlencode(params)}"
    cookie = _cookie(handler, OAUTH_COOKIE, _pack(verifier, locale, next_path), OAUTH_TTL_S)
    send_redirect(handler, target, [cookie])


def oauth_callback(handler: Any) -> None:
    """GET /auth/callback — swap the one-time code (plus our verifier) for a session."""
    query = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query).items()}
    stored = read_oauth_cookie(handler)
    verifier, locale, next_path = stored or ("", "en", "/")
    clear = [_cookie(handler, OAUTH_COOKIE, "", 0)]
    fail = lambda code: send_redirect(handler, app_url(next_path, signin_error=code, lang=locale), clear)
    error = query.get("error") or query.get("error_code") or ""
    if error:
        handler.log_message("google sign-in returned error=%s", error[:60])
        fail("google_cancelled" if error == "access_denied" else "google_failed")
        return
    code = query.get("code", "")
    if not code or len(code) > 512:
        fail("google_failed")
        return
    if not verifier:
        fail("google_expired")
        return
    if cc.rate_hit("token", cc.client_ip(handler)):
        fail("google_failed")
        return
    try:
        status, data, _ = call("POST", "/auth/v1/token", params={"grant_type": "pkce"},
                               body={"auth_code": code, "code_verifier": verifier})
        if status != 200 or not isinstance(data, dict) or not data.get("access_token"):
            reason = _auth_error(status, data)
            handler.log_message("google code exchange failed: %s", reason[:60])
            fail("google_expired" if reason in ("flow_state_expired", "flow_state_not_found", "bad_code_verifier",
                                                "bad_oauth_state", "validation_failed") or status == 404
                 else "google_unavailable" if status >= 500 else "google_failed")
            return
        status, user = fetch_account(data["access_token"])
    except Upstream as err:
        handler.log_message("supabase unreachable during google sign-in: %s", str(err))
        fail("google_unavailable")
        return
    if status != 200 or not user:
        fail("google_failed")
        return
    cookies = session_cookies(handler, data) + clear
    if user.get("needs_profile"):
        send_redirect(handler, app_url(next_path, signin="google-new", lang=locale), cookies)
        return
    send_redirect(handler, app_url(next_path, signin="google"), cookies)


def api_complete_profile(handler, user, data):
    """A Google sign-up picks its public name and agrees to the rules; the 3-day trial starts now."""
    if not user:
        raise cc.ApiError(401, "auth")
    if not user.get("needs_profile"):
        raise cc.ApiError(409, "already")
    if cc.rate_hit("account", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    handle = cc.clean_text(data.get("handle"), 20, False)
    issue = cc.handle_issue(handle)
    if not issue and handle.lower().startswith("user_") and len(handle) == 15:
        issue = "invalid"   # looks like a placeholder handle
    if issue:
        raise cc.ApiError(400, issue)
    if not data.get("agreeRules") or not data.get("agreeNotAdvice"):
        raise cc.ApiError(400, "agree")
    if handle_taken(handle):
        raise cc.ApiError(409, "taken")
    locale = "es" if data.get("locale") == "es" else "en"
    spaces = cc.clean_spaces(data.get("spaces")) or ["i-485"]
    profiles = cc.clean_profiles(data.get("profiles"))
    try:
        rest("POST", "rpc/complete_profile", token=tok(user), prefer="return=minimal",
             body={"p_handle": handle, "p_locale": locale, "p_spaces": spaces, "p_case_profiles": profiles})
    except cc.ApiError as error:
        if error.status == 404:   # the migration that adds complete_profile() has not been applied yet
            raise cc.ApiError(503, "server") from None
        raise
    status, fresh = fetch_account(tok(user))
    if status != 200 or not fresh or fresh.get("needs_profile"):
        raise cc.ApiError(502, "server")
    return 201, {"user": public_user(fresh)}



# ───────────────────────── Case twins (opt-in cohort matching) ─────────────────────────
#
# Rows live in public.twin_optins (RLS: only your own). Counts and handles of the others only come from
# public.my_case_twins() (SECURITY DEFINER, aggregates only; fewer than 2 others reads as 0). Free for everyone
# signed in; signed-out visitors just see a teaser in the page.

TWIN_OFFICES = {"vsc", "csc", "nsc", "tsc", "psc", "nbc", "nyc", "los-angeles", "miami", "chicago", "houston",
                "boston", "seattle", "atlanta", "dallas"}   # logic.js offices, minus "unsure"
TWIN_FORM_RE = __import__("re").compile(r"^[A-Z]{1,3}-[0-9]{2,4}[A-Z]?$")
TWIN_MONTH_RE = __import__("re").compile(r"^(20[0-9]{2})-(0[1-9]|1[0-2])$")


def _twins_payload(user: dict[str, Any]) -> dict[str, Any]:
    try:
        rows = rest("POST", "rpc/my_case_twins", token=tok(user), body={})
    except cc.ApiError as error:
        if error.status == 404:   # migration not applied yet: hide the feature
            return {"available": False, "cohorts": []}
        raise
    cohorts = []
    for row in rows if isinstance(rows, list) else []:
        others = int(row.get("others") or 0)
        cohorts.append({
            "form": str(row.get("form") or ""), "officeId": str(row.get("office_id") or ""),
            "month": str(row.get("filed_month") or ""),
            "others": others if others >= 2 else 0,          # never "1 other person"
            "plus": bool(row.get("plus")) and others >= 2,
            "handles": [str(h) for h in (row.get("handles") or [])][:9] if others >= 2 else [],
        })
    return {"available": True, "cohorts": cohorts}


def api_twins(handler, user, _q):
    cc.require_user(user)
    return 200, _twins_payload(user)


def clean_twin(data: dict[str, Any]) -> tuple[str, str, str]:
    form = str(data.get("form") or "").strip().upper()[:12]
    office = str(data.get("officeId") or "").strip().lower()[:24]
    month = str(data.get("month") or "").strip()[:16]
    if not TWIN_FORM_RE.match(form):
        raise cc.ApiError(400, "twin_form")
    if office not in TWIN_OFFICES:
        raise cc.ApiError(400, "twin_office")
    match = TWIN_MONTH_RE.match(month)
    now = datetime.now(timezone.utc)
    if not match or (int(match.group(1)), int(match.group(2))) > (now.year, now.month):
        raise cc.ApiError(400, "twin_month")
    return form, office, f"{month}-01"


def api_twins_on(handler, user, data):
    cc.require_user(user)
    if cc.rate_hit("account", f"u{user['id']}"):
        raise cc.ApiError(429, "rate")
    form, office, month = clean_twin(data)
    try:
        rest("POST", "twin_optins", token=tok(user), params={"on_conflict": "user_id,form"},
             body={"form": form, "office_id": office, "filed_month": month},
             prefer="resolution=merge-duplicates,return=minimal")
    except cc.ApiError as error:
        if error.status == 404:
            raise cc.ApiError(503, "server") from None
        raise
    return 200, _twins_payload(user)


def api_twins_off(handler, user, data):
    """Removes you from matching (one form, or every form when none is given)."""
    cc.require_user(user)
    form = str(data.get("form") or "").strip().upper()[:12]
    params = {"form": f"eq.{form}"} if form and TWIN_FORM_RE.match(form) else {"user_id": f"eq.{user['id']}"}
    try:
        rest("DELETE", "twin_optins", token=tok(user), params=params, prefer="return=minimal")
    except cc.ApiError as error:
        if error.status != 404:
            raise
    return 200, _twins_payload(user)


# ───────────────────────── router ─────────────────────────

GET_ROUTES = {"/api/me": api_me, "/api/posts": api_list_posts, "/api/handle-check": api_handle_check,
              "/api/mod/queue": api_mod_queue, "/api/twins": api_twins}
POST_ROUTES = {
    "/api/signup": api_signup, "/api/login": api_login, "/api/logout": api_logout, "/api/me": api_update_me,
    "/api/account/delete": api_delete_account, "/api/posts": api_create_post, "/api/vote": api_vote,
    "/api/report": api_report, "/api/mod": api_mod, "/api/waitlist": api_waitlist, "/api/verify": api_verify,
    "/api/verify/resend": api_verify_resend, "/api/password/forgot": api_forgot, "/api/password/reset": api_reset,
    "/api/account/password": api_change_password, "/api/account/email": api_change_email,
    "/api/account/logout-all": api_logout_all, "/api/auth/complete-profile": api_complete_profile,
    "/api/twins": api_twins_on, "/api/twins/off": api_twins_off,
}


def handles(method: str, path: str) -> bool:
    """Routes this backend serves (its own plus the extras routes registered on community.GET_ROUTES)."""
    item = cc.POST_ITEM.match(path)
    if method == "GET":
        return path in GET_ROUTES or path in cc.GET_ROUTES or bool(item and not item.group(2))
    if method == "POST":
        return path in POST_ROUTES or bool(item and item.group(2))
    return False
# Routes that see a Google sign-up before it has finished its profile; every other route treats it as signed out.
UNFINISHED_OK = {("GET", "/api/me"), ("GET", "/api/handle-check"), ("POST", "/api/logout"),
                 ("POST", "/api/auth/complete-profile")}


def dispatch(handler: Any, method: str) -> None:
    parsed = urllib.parse.urlparse(handler.path)
    path = parsed.path
    try:
        if method == "POST" and (handler.headers.get("X-CaseCircle") != "1" or not cc.same_origin(handler)):
            raise cc.ApiError(403, "csrf")
        user = load_user(handler)
        if (method, path) not in UNFINISHED_OK:
            user = complete_user(user)
        match = cc.POST_ITEM.match(path)
        if method == "GET":
            query = urllib.parse.parse_qs(parsed.query)
            if match:
                result = api_get_post(handler, user, cc.parse_id(match.group(1), "p"))
            elif path in GET_ROUTES:
                result = GET_ROUTES[path](handler, user, query)
            else:   # extras.py routes (no database access)
                result = cc.GET_ROUTES[path](None, handler, user, query)
        else:
            data = cc.read_json(handler)
            if match:
                action = {"replies": api_reply, "save": api_save, "helpful": api_helpful}[match.group(2)]
                result = action(handler, user, cc.parse_id(match.group(1), "p"), data)
            else:
                result = POST_ROUTES[path](handler, user, data)
        status, payload, *rest_ = result
        cookies = list(pending(handler)) + list(rest_[0] if rest_ else [])
        pending(handler).clear()
        cc.send_json(handler, status, payload, cookies)
    except cc.ApiError as error:
        cookies = list(pending(handler))
        pending(handler).clear()
        cc.send_json(handler, error.status, error.payload, cookies)
    except Upstream as error:
        handler.log_message("supabase unreachable: %s", str(error))
        pending(handler).clear()
        cc.send_json(handler, 503, {"error": "server"})


def healthz(handler: Any) -> None:
    cc.send_json(handler, 200, {"ok": True, "store": "supabase"})
