"""Official USCIS processing times: server-side fetch-and-cache with a bundled snapshot fallback.

USCIS's Check Case Processing Times page (https://egov.uscis.gov/processing-times/) loads its numbers from
JSON under /processing-times/api/. When that endpoint answers, results are cached in
data/cache/processing-times.json with a timestamp and refreshed at most once a day per form/office
(failures are cached too, so a blocked endpoint is retried at most daily). When nothing live is available
the bundled snapshot data/processing-times.json is used. Numbers are never invented: an empty snapshot
means the UI shows the official link and the "how to read processing times" explainer instead.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import threading
import urllib.error
import urllib.request
from typing import Any, Callable

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT_PATH = os.path.join(HERE, "data", "processing-times.json")
CACHE_PATH = os.path.join(HERE, "data", "cache", "processing-times.json")
API_ROOT = "https://egov.uscis.gov/processing-times/api/processingtime"
OFFICIAL_URL = "https://egov.uscis.gov/processing-times/"
REFRESH_S = 24 * 3600
TIMEOUT = 12
FORMS = {"I-485", "I-130", "I-751", "N-400", "I-765", "I-131"}
OFFICE = re.compile(r"[A-Z]{3}")

_lock = threading.Lock()


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def live_enabled() -> bool:
    return str(os.environ.get("CASECIRCLE_PROCESSING_TIMES_LIVE", "1")).strip().lower() not in {"0", "false", "no", "off"}


def load_json(path: str, default: Any) -> Any:
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return default


def _months(entry: dict[str, Any]) -> float | None:
    try:
        value = float(entry.get("value"))
    except (TypeError, ValueError):
        return None
    unit = str(entry.get("unit") or entry.get("unit_en") or "").lower()
    if unit.startswith("day"):
        return round(value / 30.44, 1)
    if unit.startswith("week"):
        return round(value / 4.35, 1)
    return round(value, 1)


def parse_api(payload: Any) -> dict[str, Any] | None:
    """Parse the processing-times API shape: data.processing_time.subtypes[].range[] (value + unit)."""
    if not isinstance(payload, dict):
        return None
    root = (payload.get("data") or {}).get("processing_time") if isinstance(payload.get("data"), dict) else None
    if not isinstance(root, dict):
        return None
    subtypes = []
    for sub in root.get("subtypes") or []:
        if not isinstance(sub, dict):
            continue
        ranges = [m for m in (_months(r) for r in (sub.get("range") or []) if isinstance(r, dict)) if m is not None]
        if not ranges:
            continue
        subtypes.append({
            "name": str(sub.get("subtype_info_en") or sub.get("form_type") or "")[:160],
            "nameEs": str(sub.get("subtype_info_es") or "")[:160],
            "months": max(ranges),
            "published": str(sub.get("publication_date") or "")[:40],
            "inquiryReceiptDate": str(sub.get("service_request_date") or "")[:40],
        })
    if not subtypes:
        return None
    return {"office": str(root.get("office_code") or "")[:8], "subtypes": subtypes}


def fetch_live(form: str, office: str) -> dict[str, Any]:
    url = f"{API_ROOT}/{form}/{office}"
    request = urllib.request.Request(url, headers={
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "CaseCircle/1.0 (+processing-times cache; refreshed at most daily)",
        "Referer": OFFICIAL_URL,
    })
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        body = response.read(2_000_000).decode("utf-8", "replace")
    parsed = parse_api(json.loads(body))
    if not parsed:
        raise ValueError("shape")
    return parsed


def _age_s(stamp: str) -> float:
    try:
        return (_now() - _dt.datetime.fromisoformat(stamp)).total_seconds()
    except (TypeError, ValueError):
        return float("inf")


def lookup(form: str, office: str, fetcher: Callable[[str, str], dict[str, Any]] | None = None,
           cache_path: str = CACHE_PATH, snapshot_path: str = SNAPSHOT_PATH) -> dict[str, Any]:
    form = str(form or "").upper()
    office = str(office or "").upper()
    if form not in FORMS:
        return {"error": "invalid", "reason": "form"}
    if office and not OFFICE.fullmatch(office):
        return {"error": "invalid", "reason": "office"}
    snapshot = load_json(snapshot_path, {})
    snap_form = (snapshot.get("forms") or {}).get(form) or {}
    base = {
        "form": form,
        "office": office,
        "officialUrl": OFFICIAL_URL,
        "moreInfoUrl": "https://egov.uscis.gov/processing-times/more-info",
        "formUrl": snap_form.get("formUrl") or f"https://www.uscis.gov/{form.lower()}",
    }
    key = f"{form}|{office or '-'}"
    with _lock:
        cache = load_json(cache_path, {"entries": {}})
        entry = (cache.get("entries") or {}).get(key)
        fresh = entry and _age_s(entry.get("fetchedAt", "")) < REFRESH_S
        if office and not fresh and live_enabled():
            stamp = _now().isoformat(timespec="seconds")
            try:
                data = (fetcher or fetch_live)(form, office)
                entry = {"fetchedAt": stamp, "ok": True, "data": data}
            except Exception as error:  # blocked, offline, or changed shape
                reason = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                previous = entry if entry and entry.get("ok") else None
                entry = {"fetchedAt": stamp, "ok": False, "error": reason, "lastGood": previous}
            cache.setdefault("entries", {})[key] = entry
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            tmp = cache_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(cache, handle, indent=1)
            os.replace(tmp, cache_path)
    if entry and entry.get("ok"):
        return {**base, "source": "live", "fetchedAt": entry["fetchedAt"], "data": entry["data"]}
    if entry and entry.get("lastGood"):
        good = entry["lastGood"]
        return {**base, "source": "cache", "fetchedAt": good["fetchedAt"], "data": good["data"], "lastAttempt": entry.get("fetchedAt")}
    snap_office = (snap_form.get("offices") or {}).get(office) if office else None
    if snap_office:
        return {**base, "source": "snapshot", "fetchedAt": snapshot.get("fetchedAt"), "data": snap_office}
    return {**base, "source": "none", "fetchedAt": None, "data": None,
            "lastAttempt": (entry or {}).get("fetchedAt") or snapshot.get("checkedAt"),
            "note": snapshot.get("note") or "Official numbers could not be fetched from this server."}


def handle(handler: Any, query: dict[str, list[str]]) -> None:
    form = (query.get("form") or [""])[0]
    office = (query.get("office") or [""])[0]
    result = lookup(form, office)
    status = 400 if result.get("error") else 200
    body = json.dumps(result, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
