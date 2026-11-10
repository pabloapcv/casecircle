"""Who can use the extras (Interview prep, Civics practice).

One server-side check, ``has_extras``: admin (or the owner) OR inside the free trial OR a paid pass.
The trial starts when an account is created (older accounts start it the first time they load /api/me).
``pass_until`` is the hook for a real payment provider later (e.g. a Stripe webhook calls ``grant_pass``);
nothing in this file takes or fakes a payment.
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


def trial_days() -> int:
    raw = os.environ.get("CASECIRCLE_TRIAL_DAYS", "").strip()
    try:
        days = int(raw) if raw else DEFAULT_TRIAL_DAYS
    except ValueError:
        days = DEFAULT_TRIAL_DAYS
    return max(0, min(MAX_TRIAL_DAYS, days))


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
    base = {"trialDays": days}
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
