"""Who can use the extras (Interview practice, Civics practice, AI document check, folder chat, Tailor with AI).

One server-side check, ``has_extras``: admin (or the owner) OR inside the free trial OR a paid pass.
The trial starts when an account is created (older accounts start it the first time they load /api/me).
``pass_until`` is the hook for a real payment provider later (e.g. a Stripe webhook calls ``grant_pass``);
nothing in this file takes or fakes a payment.

``GATED_FEATURES`` is the single list that decides which product features lock after the trial.
To gate another feature later (checklist, Check the wait, community, or general interview tips),
add its id here and lock that endpoint/UI. Features not in the set stay free.
"""
from __future__ import annotations

import math
import os
import time
from typing import Any

DEFAULT_TRIAL_DAYS = 3
MAX_TRIAL_DAYS = 90
OWNER_EMAILS = frozenset({"pabloapcv@gmail.com"})
DAY = 86400.0

# Known feature ids. Only GATED_FEATURES are locked after the trial.
FEATURES = (
    "interview",
    "civics",
    "folder_chat",
    "folder_check",
    "folder_plan",         # AI tailor of the checklist (Tailor with AI)
    "checklist",           # folder checklist / marks / on-device documents
    "processing_times",    # Check the wait
    "community",
    "interview_tips",      # general (free) interview tips
)

GATED_FEATURES = frozenset({"civics", "folder_chat", "folder_check", "folder_plan", "interview"})


def trial_days() -> int:
    raw = os.environ.get("CASECIRCLE_TRIAL_DAYS", "").strip()
    try:
        days = int(raw) if raw else DEFAULT_TRIAL_DAYS
    except ValueError:
        days = DEFAULT_TRIAL_DAYS
    return max(0, min(MAX_TRIAL_DAYS, days))


def gated_feature_list() -> list[str]:
    return sorted(GATED_FEATURES)


def feature_is_gated(feature: str) -> bool:
    return feature in GATED_FEATURES


def _get(user: Any, key: str) -> Any:
    try:
        return user[key]
    except (KeyError, IndexError, TypeError):
        return None


def is_owner(user: Any) -> bool:
    """The owner address always has access, but only once that email is verified (no squatting on signup)."""
    email = str(_get(user, "email") or "").lower()
    return email in OWNER_EMAILS and bool(_get(user, "email_verified"))


def extras_status(user: Any, *, admin: bool = False, now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    days = trial_days()
    base = {"trialDays": days, "gatedFeatures": gated_feature_list()}
    if not user:
        return {**base, "access": False, "reason": "signin", "daysLeft": 0, "trialEndsAt": None}
    if admin or is_owner(user):
        return {**base, "access": True, "reason": "admin", "daysLeft": None, "trialEndsAt": None}
    paid_until = _get(user, "pass_until")
    if paid_until and float(paid_until) > now:
        return {**base, "access": True, "reason": "paid", "daysLeft": None, "trialEndsAt": None,
                "passUntil": float(paid_until)}
    started = _get(user, "trial_started_at")
    started = float(started) if started else now  # not started yet: it starts on the next /api/me
    ends = started + days * DAY
    if now < ends:
        return {**base, "access": True, "reason": "trial", "daysLeft": max(1, math.ceil((ends - now) / DAY)),
                "trialEndsAt": ends}
    return {**base, "access": False, "reason": "expired", "daysLeft": 0, "trialEndsAt": ends}


def has_extras(user: Any, *, admin: bool = False, now: float | None = None) -> bool:
    return bool(extras_status(user, admin=admin, now=now)["access"])


def has_feature(user: Any, feature: str, *, admin: bool = False, now: float | None = None) -> bool:
    """True when this feature is free for everyone, or the user has extras access."""
    if not feature_is_gated(feature):
        return True
    return has_extras(user, admin=admin, now=now)


def user_gate(user: Any, feature: str, *, admin: bool = False, now: float | None = None) -> tuple[int, dict[str, Any]] | None:
    """If ``feature`` is gated and this user may not use it, return ``(HTTP status, JSON body)``.

    Signed-out → 401 ``signin``. Trial expired (and no pass) → 402 ``extras_locked``.
    Ungated features always return None, even when signed out.
    """
    status = extras_status(user, admin=admin, now=now)
    if not feature_is_gated(feature):
        return None
    if not user:
        return 401, {"error": "signin", "extras": status}
    if not status["access"]:
        return 402, {"error": "extras_locked", "extras": status}
    return None


def ensure_trial_started(conn: Any, user: Any, now: float | None = None) -> Any:
    """Start the trial for an account that predates trials. Returns the (possibly refreshed) user row."""
    if not user or _get(user, "trial_started_at"):
        return user
    now = time.time() if now is None else now
    conn.execute("UPDATE users SET trial_started_at = ? WHERE id = ? AND trial_started_at IS NULL", (now, user["id"]))
    return conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()


def grant_pass(conn: Any, user_id: int, until: float) -> None:
    """For a future payment webhook: unlock the extras until ``until`` (epoch seconds)."""
    conn.execute("UPDATE users SET pass_until = ? WHERE id = ?", (float(until), int(user_id)))
