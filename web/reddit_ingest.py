#!/usr/bin/env python3
"""Reddit thread ingestion for Ask Reddit Q&A.

Pulls recent public posts from r/USCIS, r/USCIS_FORUM, r/immigration, r/greencard
using Reddit's public RSS feeds (JSON returns 403 from datacenter IPs).

Features:
- RSS feeds with old.reddit fallback
- Background thread ingestion (returns 202 immediately)
- Push endpoint for external data
- Fast fail on 403 (no long retries)
- Token-verified writes via SECURITY DEFINER function

Usage:
    # Ingest via CLI (for local testing)
    python3 reddit_ingest.py --subreddit USCIS --limit 50

    # Via HTTP endpoint (background, returns 202)
    curl -X POST https://casecircle.us/api/reddit-ingest -H "Authorization: Bearer $SECRET"

    # Push pre-fetched threads from external job
    curl -X POST https://casecircle.us/api/reddit-ingest/push \
      -H "Authorization: Bearer $SECRET" \
      -H "Content-Type: application/json" \
      -d '[{"reddit_id": "abc123", "title": "...", "selftext": "...", ...}]'

    # Check last run status
    curl https://casecircle.us/api/reddit-ingest/status -H "Authorization: Bearer $SECRET"

Environment variables:
    SUPABASE_URL                 - Supabase project URL
    SUPABASE_PUBLISHABLE_KEY     - Supabase anon key
    REDDIT_INGEST_SECRET         - Secret token for HTTP trigger and DB writes
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

# Rate limiting: 8-15 seconds between RSS requests (lighter than JSON)
MIN_DELAY_S = 8
MAX_DELAY_S = 15

# Subreddits to ingest
SUBREDDITS = ["USCIS", "USCIS_FORUM", "immigration", "greencard"]

# User-Agent per Reddit guidelines
USER_AGENT = "CaseCircle:1.0 (https://casecircle.us; educational immigration companion)"

# Form patterns for tag extraction
FORM_PATTERNS = [
    (r"\bN-?400\b", "N-400"),
    (r"\bI-?485\b", "I-485"),
    (r"\bI-?130\b", "I-130"),
    (r"\bI-?751\b", "I-751"),
    (r"\bI-?765\b|\bEAD\b", "I-765"),
    (r"\bI-?131\b|\bAdvance Parole\b", "I-131"),
    (r"\bI-?90\b", "I-90"),
    (r"\bI-?693\b", "I-693"),
    (r"\bI-?140\b", "I-140"),
    (r"\bI-?129F?\b|\bK-?1\b", "I-129F"),
    (r"\bI-?539\b", "I-539"),
    (r"\bI-?589\b|\basylum\b", "I-589"),
    (r"\bI-?864\b", "I-864"),
    (r"\bN-?600\b", "N-600"),
    (r"\bDS-?160\b", "DS-160"),
    (r"\bDS-?260\b", "DS-260"),
]

# Office patterns (field offices and service centers)
OFFICE_PATTERNS = [
    (r"\bSacramento\b", "sacramento-ca"),
    (r"\bSan Francisco\b", "san-francisco-ca"),
    (r"\bLos Angeles\b", "los-angeles-ca"),
    (r"\bSan Diego\b", "san-diego-ca"),
    (r"\bSan Jose\b", "san-jose-ca"),
    (r"\bNew York\b|\bNYC\b", "new-york-ny"),
    (r"\bChicago\b", "chicago-il"),
    (r"\bHouston\b", "houston-tx"),
    (r"\bDallas\b", "dallas-tx"),
    (r"\bMiami\b|\bKendall\b", "miami-fl"),
    (r"\bAtlanta\b", "atlanta-ga"),
    (r"\bSeattle\b", "seattle-wa"),
    (r"\bDenver\b", "denver-co"),
    (r"\bPhoenix\b", "phoenix-az"),
    (r"\bDetroit\b", "detroit-mi"),
    (r"\bBoston\b", "boston-ma"),
    (r"\bPhiladelphia\b", "philadelphia-pa"),
    (r"\bNewark\b", "newark-nj"),
    (r"\bWashington\s*D\.?C\.?\b", "washington-dc"),
    (r"\bTexas Service Center\b|\bTSC\b", "texas-service-center"),
    (r"\bNebraska Service Center\b|\bNSC\b", "nebraska-service-center"),
    (r"\bCalifornia Service Center\b|\bCSC\b", "california-service-center"),
    (r"\bVermont Service Center\b|\bVSC\b", "vermont-service-center"),
    (r"\bPotomac Service Center\b|\bPSC\b", "potomac-service-center"),
    (r"\bNational Benefits Center\b|\bNBC\b", "national-benefits-center"),
    (r"\bNVC\b|\bNational Visa Center\b", "nvc"),
]

# Process step patterns
STEP_PATTERNS = [
    (r"\bbiometrics?\b|\bfingerprints?\b", "biometrics"),
    (r"\binterview\b", "interview"),
    (r"\bRFE\b|\brequest for evidence\b", "rfe"),
    (r"\bapproved?\b|\bapproval\b", "approval"),
    (r"\boath\b|\boath ceremony\b", "oath"),
    (r"\bcard produced\b|\bcard mailed\b|\bcard delivered\b", "card-produced"),
    (r"\bdenied?\b|\bdenial\b", "denial"),
    (r"\btransferred?\b", "transferred"),
    (r"\bNOID\b|\bnotice of intent to deny\b", "noid"),
    (r"\breceipt\b|\bcase received\b", "received"),
    (r"\bscheduled\b", "scheduled"),
    (r"\bactively reviewed\b|\bactively being reviewed\b", "actively-reviewed"),
    (r"\bcase is ready to be scheduled\b", "ready-to-schedule"),
    (r"\bexpedite\b", "expedite"),
]

# Background job state (simple in-memory, reset on restart)
_job_state: dict[str, Any] = {
    "running": False,
    "job_id": None,
    "started_at": None,
    "finished_at": None,
    "result": None,
    "error": None,
}
_job_lock = threading.Lock()


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def load_dotenv(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def extract_tags(text: str, patterns: list[tuple[str, str]]) -> list[str]:
    """Extract tags from text using regex patterns."""
    tags = set()
    for pattern, tag in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            tags.add(tag)
    return sorted(tags)


def strip_usernames(text: str) -> str:
    """Strip all username references from text."""
    if not text:
        return ""
    # Remove @mentions, /u/username, u/username patterns
    text = re.sub(r"(?:@|/u/|(?<![a-zA-Z])u/)[A-Za-z0-9_-]+", "[user]", text)
    # Remove "by username" patterns that might appear
    text = re.sub(r"\bby\s+[A-Za-z0-9_-]{3,20}(?=\s|$|[.,!?])", "by [user]", text, flags=re.IGNORECASE)
    return text


def strip_authors(comments: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Strip author info from comments, keep only body text."""
    result = []
    for c in comments[:5]:
        body = c.get("body", "").strip()
        if body and body not in ("[deleted]", "[removed]"):
            body = strip_usernames(body)
            result.append({"body": body[:2000]})
    return result


def polite_delay() -> None:
    """Wait between requests per Reddit guidelines."""
    import random
    delay = random.uniform(MIN_DELAY_S, MAX_DELAY_S)
    time.sleep(delay)


def fetch_rss(url: str, timeout: int = 20) -> str | None:
    """Fetch RSS feed content. Returns None on error, fails fast on 403."""
    headers = {"User-Agent": USER_AGENT}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print(f"  403 Forbidden: {url} (fast fail, no retry)")
            return None
        elif e.code == 404:
            print(f"  404 Not found: {url}")
            return None
        elif e.code == 429:
            print(f"  429 Rate limited: {url} (waiting 60s)")
            time.sleep(60)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return resp.read().decode("utf-8")
            except Exception:
                return None
        else:
            print(f"  HTTP {e.code}: {url}")
            return None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"  Network error: {e}")
        return None


def parse_rss_posts(rss_content: str, subreddit: str) -> list[dict[str, Any]]:
    """Parse RSS feed into post data."""
    posts = []
    try:
        root = ET.fromstring(rss_content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        for entry in root.findall("atom:entry", ns):
            try:
                # Extract ID from the link
                link = entry.find("atom:link", ns)
                if link is None:
                    continue
                href = link.get("href", "")
                
                # Extract reddit_id from URL: /r/subreddit/comments/ID/...
                match = re.search(r"/comments/([a-z0-9]+)/", href)
                if not match:
                    continue
                reddit_id = match.group(1)
                
                # Get title
                title_el = entry.find("atom:title", ns)
                title = title_el.text if title_el is not None and title_el.text else ""
                title = html.unescape(title)
                
                # Get content (selftext) from content element
                content_el = entry.find("atom:content", ns)
                selftext = ""
                if content_el is not None and content_el.text:
                    # Content is HTML, extract text roughly
                    content_html = html.unescape(content_el.text)
                    # Strip HTML tags (basic)
                    selftext = re.sub(r"<[^>]+>", " ", content_html)
                    selftext = re.sub(r"\s+", " ", selftext).strip()
                    # Limit length
                    selftext = selftext[:10000]
                
                # Get published date
                updated_el = entry.find("atom:updated", ns)
                created_utc = None
                if updated_el is not None and updated_el.text:
                    try:
                        created_utc = datetime.fromisoformat(updated_el.text.replace("Z", "+00:00"))
                    except ValueError:
                        created_utc = datetime.now(timezone.utc)
                else:
                    created_utc = datetime.now(timezone.utc)
                
                # Build permalink
                permalink = f"/r/{subreddit}/comments/{reddit_id}/"
                
                posts.append({
                    "reddit_id": reddit_id,
                    "subreddit": subreddit,
                    "permalink": permalink,
                    "title": title,
                    "selftext": selftext,
                    "created_utc": created_utc.isoformat() if created_utc else datetime.now(timezone.utc).isoformat(),
                    "score": 0,  # Not available in RSS
                    "num_comments": 0,  # Not available in RSS
                })
            except Exception as e:
                print(f"  Error parsing entry: {e}")
                continue
    except ET.ParseError as e:
        print(f"  RSS parse error: {e}")
    
    return posts


def fetch_subreddit_rss(subreddit: str, limit: int = 50) -> list[dict[str, Any]]:
    """Fetch posts from a subreddit using RSS feeds."""
    posts = []
    
    # Try www.reddit.com RSS first, then old.reddit.com fallback
    urls = [
        f"https://www.reddit.com/r/{subreddit}/new/.rss?limit={limit}",
        f"https://old.reddit.com/r/{subreddit}/new/.rss?limit={limit}",
    ]
    
    for url in urls:
        print(f"Fetching RSS: {url}")
        content = fetch_rss(url)
        if content:
            posts = parse_rss_posts(content, subreddit)
            if posts:
                print(f"  Got {len(posts)} posts from RSS")
                break
        polite_delay()
    
    return posts[:limit]


def process_post(post: dict[str, Any]) -> dict[str, Any] | None:
    """Process a post into our storage format with username stripping."""
    reddit_id = post.get("reddit_id", "")
    if not reddit_id or len(reddit_id) < 4:
        return None
    
    title = post.get("title", "").strip()
    if not title or title in ("[deleted]", "[removed]"):
        return None
    
    # Strip usernames from all text fields
    title = strip_usernames(title)[:500]
    selftext = strip_usernames(post.get("selftext", "") or "")
    if selftext in ("[deleted]", "[removed]"):
        selftext = ""
    selftext = selftext[:10000]
    
    # Extract tags from combined text
    combined_text = f"{title} {selftext}"
    form_tags = extract_tags(combined_text, FORM_PATTERNS)
    office_tags = extract_tags(combined_text, OFFICE_PATTERNS)
    step_tags = extract_tags(combined_text, STEP_PATTERNS)
    
    # Parse created_utc
    created_utc = post.get("created_utc")
    if isinstance(created_utc, (int, float)):
        created_dt = datetime.fromtimestamp(created_utc, tz=timezone.utc)
        created_utc = created_dt.isoformat()
    elif not created_utc:
        created_utc = datetime.now(timezone.utc).isoformat()
    
    # Process any comments
    top_comments = []
    if "top_comments" in post and isinstance(post["top_comments"], list):
        top_comments = strip_authors(post["top_comments"])
    
    return {
        "reddit_id": reddit_id,
        "subreddit": post.get("subreddit", ""),
        "permalink": post.get("permalink", ""),
        "title": title,
        "selftext": selftext,
        "top_comments": top_comments,
        "score": post.get("score", 0) or 0,
        "num_comments": post.get("num_comments", 0) or 0,
        "created_utc": created_utc,
        "form_tags": form_tags,
        "office_tags": office_tags,
        "step_tags": step_tags,
    }


def supabase_upsert_via_function(posts: list[dict[str, Any]], token: str) -> dict[str, Any]:
    """Upsert posts via the SECURITY DEFINER function (no service-role key needed)."""
    base_url = env("SUPABASE_URL")
    api_key = env("SUPABASE_PUBLISHABLE_KEY") or env("SUPABASE_ANON_KEY")
    
    if not base_url or not api_key:
        return {"ok": False, "error": "missing_config", "message": "SUPABASE_URL and key required"}
    
    if not token:
        return {"ok": False, "error": "missing_token", "message": "REDDIT_INGEST_SECRET required"}
    
    url = f"{base_url}/rest/v1/rpc/upsert_reddit_threads"
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    body = json.dumps({
        "payload": posts,
        "token": token,
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result if isinstance(result, dict) else {"ok": True, "result": result}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")[:500]
        return {"ok": False, "error": f"http_{e.code}", "message": error_body}
    except Exception as e:
        return {"ok": False, "error": "exception", "message": str(e)}


def ingest(
    subreddits: list[str] | None = None,
    limit: int = 50,
    dry_run: bool = False,
    token: str | None = None,
) -> dict[str, Any]:
    """Main ingestion function using RSS feeds."""
    subreddits = subreddits or SUBREDDITS
    token = token or env("REDDIT_INGEST_SECRET")
    
    results: dict[str, Any] = {
        "subreddits": {},
        "total_fetched": 0,
        "total_processed": 0,
        "total_upserted": 0,
        "total_errors": 0,
        "errors": [],
    }
    
    for subreddit in subreddits:
        print(f"\n=== Processing r/{subreddit} ===")
        sub_result: dict[str, Any] = {"fetched": 0, "processed": 0, "upserted": 0, "errors": 0}
        
        # Fetch via RSS
        posts = fetch_subreddit_rss(subreddit, limit=limit)
        sub_result["fetched"] = len(posts)
        
        # Process posts
        processed = []
        for post in posts:
            processed_post = process_post(post)
            if processed_post:
                processed.append(processed_post)
        sub_result["processed"] = len(processed)
        
        # Upsert to database
        if processed and not dry_run:
            upsert_result = supabase_upsert_via_function(processed, token)
            if upsert_result.get("ok"):
                sub_result["upserted"] = upsert_result.get("upserted", 0)
                sub_result["errors"] = upsert_result.get("errors", 0)
            else:
                sub_result["errors"] = len(processed)
                results["errors"].append({
                    "subreddit": subreddit,
                    "error": upsert_result.get("error"),
                    "message": upsert_result.get("message"),
                })
        elif dry_run:
            sub_result["upserted"] = len(processed)
            print(f"  DRY RUN: Would upsert {len(processed)} posts")
        
        results["subreddits"][subreddit] = sub_result
        results["total_fetched"] += sub_result["fetched"]
        results["total_processed"] += sub_result["processed"]
        results["total_upserted"] += sub_result["upserted"]
        results["total_errors"] += sub_result["errors"]
        
        # Polite delay between subreddits
        if subreddit != subreddits[-1]:
            polite_delay()
    
    return results


def run_ingest_background(
    subreddits: list[str] | None,
    limit: int,
    token: str,
    job_id: str,
) -> None:
    """Run ingestion in background thread."""
    global _job_state
    
    try:
        result = ingest(subreddits=subreddits, limit=limit, token=token)
        with _job_lock:
            _job_state["result"] = result
            _job_state["error"] = None
            _job_state["finished_at"] = datetime.now(timezone.utc).isoformat()
            _job_state["running"] = False
    except Exception as e:
        with _job_lock:
            _job_state["error"] = str(e)
            _job_state["result"] = None
            _job_state["finished_at"] = datetime.now(timezone.utc).isoformat()
            _job_state["running"] = False


def start_ingest_job(subreddits: list[str] | None, limit: int, token: str) -> dict[str, Any]:
    """Start a background ingestion job. Returns job info immediately."""
    global _job_state
    
    with _job_lock:
        if _job_state["running"]:
            return {
                "ok": False,
                "error": "job_running",
                "job_id": _job_state["job_id"],
                "started_at": _job_state["started_at"],
            }
        
        job_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        _job_state = {
            "running": True,
            "job_id": job_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
            "result": None,
            "error": None,
        }
    
    thread = threading.Thread(
        target=run_ingest_background,
        args=(subreddits, limit, token, job_id),
        daemon=True,
    )
    thread.start()
    
    return {
        "ok": True,
        "job_id": job_id,
        "started_at": _job_state["started_at"],
        "status": "running",
    }


def get_job_status() -> dict[str, Any]:
    """Get the status of the last/current ingestion job."""
    with _job_lock:
        return {
            "running": _job_state["running"],
            "job_id": _job_state["job_id"],
            "started_at": _job_state["started_at"],
            "finished_at": _job_state["finished_at"],
            "result": _job_state["result"],
            "error": _job_state["error"],
        }


def process_push_data(threads: list[dict[str, Any]], token: str) -> dict[str, Any]:
    """Process externally-pushed thread data and upsert to database."""
    if not threads:
        return {"ok": False, "error": "empty_payload", "message": "No threads provided"}
    
    # Process each thread (strips usernames, extracts tags)
    processed = []
    for thread in threads:
        processed_thread = process_post(thread)
        if processed_thread:
            processed.append(processed_thread)
    
    if not processed:
        return {"ok": False, "error": "no_valid_threads", "message": "No valid threads after processing"}
    
    # Upsert via the secure function
    result = supabase_upsert_via_function(processed, token)
    result["processed_count"] = len(processed)
    result["input_count"] = len(threads)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Reddit threads for Ask Reddit Q&A")
    parser.add_argument("--subreddit", "-s", help="Specific subreddit to ingest")
    parser.add_argument("--limit", "-l", type=int, default=50, help="Max posts per subreddit")
    parser.add_argument("--dry-run", "-n", action="store_true", help="Don't write to database")
    args = parser.parse_args()
    
    # Load .env if present
    here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(here, ".env"))
    
    subreddits = [args.subreddit] if args.subreddit else None
    
    print("Starting Reddit ingestion (RSS mode)...")
    print(f"  Subreddits: {subreddits or SUBREDDITS}")
    print(f"  Limit: {args.limit} per subreddit")
    print(f"  Dry run: {args.dry_run}")
    
    results = ingest(
        subreddits=subreddits,
        limit=args.limit,
        dry_run=args.dry_run,
    )
    
    print("\n=== Results ===")
    print(f"Total fetched: {results['total_fetched']}")
    print(f"Total processed: {results['total_processed']}")
    print(f"Total upserted: {results['total_upserted']}")
    print(f"Total errors: {results['total_errors']}")
    
    for sub, stats in results["subreddits"].items():
        print(f"  r/{sub}: {stats['fetched']} fetched, {stats['processed']} processed, "
              f"{stats['upserted']} upserted, {stats['errors']} errors")
    
    if results["errors"]:
        print("\nErrors:")
        for err in results["errors"]:
            print(f"  {err}")
    
    return 0 if results["total_errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
