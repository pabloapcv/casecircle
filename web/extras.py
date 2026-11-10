"""Extras API (Interview prep + Civics practice), gated by entitlements.user_gate on the server.

GET /api/extras                       -> {"extras": status}   (anyone; tells the UI what to show)
GET /api/extras/civics?version=2025   -> official civics bank + vocabulary (entitled accounts only)
GET /api/extras/interview?form=n-400  -> interview prep content (entitled accounts only)

The JSON lives in data/premium/, which serve.py never serves as a static file.
"""
from __future__ import annotations

import json
import os
from typing import Any

import community
import entitlements

HERE = os.path.dirname(os.path.abspath(__file__))
PREMIUM = os.path.join(HERE, "data", "premium")
INTERVIEW_FORMS = {"marriage": "marriage", "i-485": "marriage", "i-130": "marriage", "i-751": "i-751", "n-400": "n-400"}
_cache: dict[str, tuple[float, Any]] = {}


def load(name: str) -> Any:
    path = os.path.join(PREMIUM, name)
    mtime = os.path.getmtime(path)
    hit = _cache.get(path)
    if hit and hit[0] == mtime:
        return hit[1]
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    _cache[path] = (mtime, data)
    return data


def status_for(user: Any) -> dict[str, Any]:
    return entitlements.extras_status(user, admin=community.is_admin(user))


def require_extras(user: Any) -> dict[str, Any]:
    status = status_for(user)
    if not user:
        raise community.ApiError(401, "signin", extras=status)
    if not status["access"]:
        raise community.ApiError(402, "extras_locked", extras=status)
    return status


def _one(q: dict[str, list[str]], key: str) -> str:
    return str((q.get(key) or [""])[0]).strip().lower()


def api_extras(conn, handler, user, _q):
    return 200, {"extras": status_for(user)}


def api_civics(conn, handler, user, q):
    status = require_extras(user)
    version = _one(q, "version") or "2025"
    data = load("civics.json")
    if version not in data["versions"]:
        raise community.ApiError(400, "version")
    bank = data["versions"][version]
    meta = {k: v for k, v in bank.items() if k != "questions"}
    return 200, {"extras": status, "version": version, "meta": meta, "questions": bank["questions"],
                 "versions": {k: {"label": v["label"], "bank": v["bank"], "asked": v["asked"], "pass": v["pass"]}
                              for k, v in data["versions"].items()},
                 "vocab": data.get("vocab"), "senior": data.get("senior"), "checked": data.get("checked"),
                 "updatesPage": data.get("updatesPage"), "updatesPageReviewed": data.get("updatesPageReviewed"),
                 "studyPage": data.get("studyPage")}


def api_interview(conn, handler, user, q):
    status = require_extras(user)
    key = INTERVIEW_FORMS.get(_one(q, "form"))
    if not key:
        raise community.ApiError(400, "form")
    data = load("interview.json")
    return 200, {"extras": status, "key": key, "checked": data["checked"], "sources": data["sources"],
                 **data["forms"][key]}


ROUTES = {"/api/extras": api_extras, "/api/extras/civics": api_civics, "/api/extras/interview": api_interview}
community.GET_ROUTES.update(ROUTES)
