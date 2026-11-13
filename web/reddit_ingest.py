#!/usr/bin/env python3
"""Reddit thread ingestion for Ask Reddit Q&A.

Pulls recent public posts from r/USCIS, r/USCIS_FORUM, r/immigration, r/greencard
using Reddit's public JSON endpoints. Stores in Supabase with full-text search.

Usage:
    # Ingest all subreddits (default: 100 posts each, hot + new)
    python3 reddit_ingest.py

    # Ingest specific subreddit with limit
    python3 reddit_ingest.py --subreddit USCIS --limit 50

    # Dry run (don't write to database)
    python3 reddit_ingest.py --dry-run

    # Via HTTP endpoint (admin-only or secret token)
    curl -X POST https://casecircle.us/api/reddit-ingest -H "Authorization: Bearer $SECRET"

Environment variables:
    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY  - Supabase connection
    REDDIT_INGEST_SECRET                     - Secret token for HTTP trigger (optional)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

# Rate limiting: 25-40 seconds between requests
MIN_DELAY_S = 25
MAX_DELAY_S = 40
BACKOFF_INITIAL_S = 60
BACKOFF_MAX_S = 600

# Subreddits to ingest
SUBREDDITS = ["USCIS", "USCIS_FORUM", "immigration", "greencard"]

# User-Agent per Reddit API guidelines
USER_AGENT = "CaseCircle:1.0 (by /u/casecircle_bot; https://casecircle.us; educational project)"

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
    # Field Offices
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
    # Service Centers
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


def strip_authors(comments: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Strip author info from comments, keep only body text."""
    result = []
    for c in comments[:5]:  # Keep max 5 top-level comments
        body = c.get("body", "").strip()
        if body and body not in ("[deleted]", "[removed]"):
            # Remove any @mentions or u/ references
            body = re.sub(r"(?:@|/u/|u/)[A-Za-z0-9_-]+", "[user]", body)
            result.append({"body": body[:2000]})  # Limit comment length
    return result


def fetch_reddit(url: str, retries: int = 3) -> dict[str, Any] | None:
    """Fetch Reddit JSON with polite rate limiting and backoff on 429."""
    headers = {"User-Agent": USER_AGENT}
    req = urllib.request.Request(url, headers=headers)
    
    backoff = BACKOFF_INITIAL_S
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  Rate limited (429), backing off {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_S)
                continue
            elif e.code == 404:
                print(f"  Not found (404): {url}")
                return None
            else:
                print(f"  HTTP error {e.code}: {url}")
                if attempt < retries - 1:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, BACKOFF_MAX_S)
                    continue
                return None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            print(f"  Network error: {e}")
            if attempt < retries - 1:
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_S)
                continue
            return None
    return None


def polite_delay() -> None:
    """Wait 25-40 seconds between requests as per Reddit guidelines."""
    import random
    delay = random.uniform(MIN_DELAY_S, MAX_DELAY_S)
    print(f"  Waiting {delay:.1f}s...")
    time.sleep(delay)


def fetch_subreddit_posts(subreddit: str, sort: str = "hot", limit: int = 100) -> list[dict[str, Any]]:
    """Fetch posts from a subreddit using Reddit's public JSON API."""
    posts = []
    after = None
    fetched = 0
    
    while fetched < limit:
        batch_size = min(100, limit - fetched)  # Reddit max is 100 per request
        url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={batch_size}"
        if after:
            url += f"&after={after}"
        
        print(f"Fetching r/{subreddit}/{sort} (batch {fetched//100 + 1})...")
        data = fetch_reddit(url)
        if not data or "data" not in data:
            break
        
        children = data["data"].get("children", [])
        if not children:
            break
        
        for child in children:
            post = child.get("data", {})
            if post.get("is_self", False) or not post.get("over_18", False):
                posts.append(post)
        
        after = data["data"].get("after")
        fetched += len(children)
        
        if not after or fetched >= limit:
            break
        
        polite_delay()
    
    return posts[:limit]


def fetch_post_comments(permalink: str, limit: int = 5) -> list[dict[str, Any]]:
    """Fetch top-level comments for a post."""
    url = f"https://www.reddit.com{permalink}.json?limit={limit}&sort=best"
    data = fetch_reddit(url)
    
    if not data or not isinstance(data, list) or len(data) < 2:
        return []
    
    comments_data = data[1].get("data", {}).get("children", [])
    return [
        c.get("data", {}) 
        for c in comments_data 
        if c.get("kind") == "t1" and c.get("data", {}).get("body")
    ]


def process_post(post: dict[str, Any], fetch_comments: bool = True) -> dict[str, Any] | None:
    """Process a Reddit post into our storage format."""
    reddit_id = post.get("id", "")
    if not reddit_id or len(reddit_id) < 6:
        return None
    
    title = post.get("title", "").strip()
    if not title:
        return None
    
    # Strip any author references from title and selftext
    title = re.sub(r"(?:@|/u/|u/)[A-Za-z0-9_-]+", "[user]", title)
    selftext = post.get("selftext", "") or ""
    selftext = re.sub(r"(?:@|/u/|u/)[A-Za-z0-9_-]+", "[user]", selftext)
    
    # Skip deleted/removed posts
    if title in ("[deleted]", "[removed]"):
        return None
    if selftext in ("[deleted]", "[removed]"):
        selftext = ""
    
    # Extract tags from title and selftext
    combined_text = f"{title} {selftext}"
    form_tags = extract_tags(combined_text, FORM_PATTERNS)
    office_tags = extract_tags(combined_text, OFFICE_PATTERNS)
    step_tags = extract_tags(combined_text, STEP_PATTERNS)
    
    # Get comments if requested
    top_comments = []
    if fetch_comments and post.get("num_comments", 0) > 0:
        polite_delay()
        comments = fetch_post_comments(post.get("permalink", ""))
        top_comments = strip_authors(comments)
    
    # Parse created_utc
    created_utc = post.get("created_utc", 0)
    if isinstance(created_utc, (int, float)):
        created_dt = datetime.fromtimestamp(created_utc, tz=timezone.utc)
    else:
        created_dt = datetime.now(timezone.utc)
    
    return {
        "reddit_id": reddit_id,
        "subreddit": post.get("subreddit", ""),
        "permalink": post.get("permalink", ""),
        "title": title[:500],
        "selftext": selftext[:10000],
        "top_comments": top_comments,
        "score": post.get("score", 0),
        "num_comments": post.get("num_comments", 0),
        "created_utc": created_dt.isoformat(),
        "form_tags": form_tags,
        "office_tags": office_tags,
        "step_tags": step_tags,
    }


def supabase_upsert(posts: list[dict[str, Any]], dry_run: bool = False) -> tuple[int, int]:
    """Upsert posts to Supabase. Returns (inserted, updated) counts."""
    base_url = env("SUPABASE_URL")
    api_key = env("SUPABASE_PUBLISHABLE_KEY") or env("SUPABASE_ANON_KEY")
    
    if not base_url or not api_key:
        print("ERROR: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY required")
        return 0, 0
    
    if dry_run:
        print(f"DRY RUN: Would upsert {len(posts)} posts")
        return len(posts), 0
    
    inserted = 0
    updated = 0
    
    for post in posts:
        url = f"{base_url}/rest/v1/reddit_threads"
        headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
        
        body = json.dumps(post).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status in (200, 201):
                    inserted += 1
        except urllib.error.HTTPError as e:
            if e.code == 409:  # Conflict = already exists, try update
                # Update existing
                update_url = f"{url}?reddit_id=eq.{post['reddit_id']}"
                update_req = urllib.request.Request(update_url, data=body, headers=headers, method="PATCH")
                try:
                    with urllib.request.urlopen(update_req, timeout=30) as resp:
                        updated += 1
                except Exception as update_e:
                    print(f"  Update failed for {post['reddit_id']}: {update_e}")
            else:
                error_body = e.read().decode("utf-8", errors="replace")
                print(f"  Insert failed for {post['reddit_id']}: {e.code} {error_body[:200]}")
        except Exception as e:
            print(f"  Error for {post['reddit_id']}: {e}")
    
    return inserted, updated


def ingest(
    subreddits: list[str] | None = None,
    limit: int = 100,
    dry_run: bool = False,
    fetch_comments: bool = True,
) -> dict[str, Any]:
    """Main ingestion function."""
    subreddits = subreddits or SUBREDDITS
    results = {
        "subreddits": {},
        "total_fetched": 0,
        "total_processed": 0,
        "total_inserted": 0,
        "total_updated": 0,
        "errors": [],
    }
    
    for subreddit in subreddits:
        print(f"\n=== Processing r/{subreddit} ===")
        sub_result = {"fetched": 0, "processed": 0, "inserted": 0, "updated": 0}
        
        # Fetch hot and new posts
        for sort in ["hot", "new"]:
            posts = fetch_subreddit_posts(subreddit, sort=sort, limit=limit // 2)
            sub_result["fetched"] += len(posts)
            
            processed = []
            for i, post in enumerate(posts):
                print(f"  Processing {sort} {i+1}/{len(posts)}: {post.get('title', '')[:50]}...")
                processed_post = process_post(post, fetch_comments=fetch_comments)
                if processed_post:
                    processed.append(processed_post)
            
            sub_result["processed"] += len(processed)
            
            if processed:
                inserted, updated = supabase_upsert(processed, dry_run=dry_run)
                sub_result["inserted"] += inserted
                sub_result["updated"] += updated
            
            polite_delay()
        
        results["subreddits"][subreddit] = sub_result
        results["total_fetched"] += sub_result["fetched"]
        results["total_processed"] += sub_result["processed"]
        results["total_inserted"] += sub_result["inserted"]
        results["total_updated"] += sub_result["updated"]
    
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Reddit threads for Ask Reddit Q&A")
    parser.add_argument("--subreddit", "-s", help="Specific subreddit to ingest")
    parser.add_argument("--limit", "-l", type=int, default=100, help="Max posts per subreddit")
    parser.add_argument("--dry-run", "-n", action="store_true", help="Don't write to database")
    parser.add_argument("--no-comments", action="store_true", help="Skip fetching comments")
    args = parser.parse_args()
    
    # Load .env if present
    here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(here, ".env"))
    
    subreddits = [args.subreddit] if args.subreddit else None
    
    print("Starting Reddit ingestion...")
    print(f"  Subreddits: {subreddits or SUBREDDITS}")
    print(f"  Limit: {args.limit} per subreddit")
    print(f"  Dry run: {args.dry_run}")
    print(f"  Fetch comments: {not args.no_comments}")
    
    results = ingest(
        subreddits=subreddits,
        limit=args.limit,
        dry_run=args.dry_run,
        fetch_comments=not args.no_comments,
    )
    
    print("\n=== Results ===")
    print(f"Total fetched: {results['total_fetched']}")
    print(f"Total processed: {results['total_processed']}")
    print(f"Total inserted: {results['total_inserted']}")
    print(f"Total updated: {results['total_updated']}")
    
    for sub, stats in results["subreddits"].items():
        print(f"  r/{sub}: {stats['fetched']} fetched, {stats['processed']} processed, "
              f"{stats['inserted']} inserted, {stats['updated']} updated")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
