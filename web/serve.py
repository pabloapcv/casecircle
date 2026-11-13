#!/usr/bin/env python3
"""Serve the website and its same-origin API.

GET  /healthz               health check (also opens the SQLite database)
GET  /api/folder-chat       chat availability          POST /api/folder-chat   folder chat (SSE; trial/pass)
GET  /api/ai-status         provider + Demo AI flag    POST /api/folder-check  one document vs one checklist item (trial/pass)
GET  /api/processing-times  official times (cached)    POST /api/folder-plan   tailor the checklist
GET  /api/extras, /api/extras/civics, /api/extras/interview   extras (signed-in, trial or pass; extras.py)
GET  /api/auth/google, /auth/callback   "Continue with Google" (Supabase only; server-side PKCE, see supa.py)
/api/me, /api/signup, /api/login, /api/logout, /api/posts…, /api/vote, /api/report, /api/mod…, /api/waitlist
                            accounts + community + waitlist (supa.py on Supabase when SUPABASE_URL is set; else community.py, SQLite)

Host/port: ``python3 serve.py [port]``; otherwise ``PORT`` / ``HOST`` from the environment.
Locally the default is 127.0.0.1:8766. When a host sets ``PORT`` (Render, Fly, …) the default host is 0.0.0.0.
"""
from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import blog
import community
import extras  # noqa: F401  (registers /api/extras* on community.GET_ROUTES)
import folder_chat
import mailer
import folder_check
import processing_times
import re
import reddit_ask

HERE = os.path.dirname(os.path.abspath(__file__))
folder_chat.load_dotenv(os.path.join(HERE, ".env"))

JSDELIVR = "https://cdn.jsdelivr.net"
# Only what the page really loads: Google Fonts (Inter Tight), pdf.js + tesseract.js from jsDelivr (lazy, in-browser
# reading), tesseract language data, and blob: workers/summary page. The one inline handler is the summary's
# Print button (hash below).
SUPABASE_INSIGHTS = "https://aucdxtyzyilcjqtgxrqf.supabase.co"
CSP = "; ".join([
    "default-src 'self'",
    f"script-src 'self' {JSDELIVR} 'wasm-unsafe-eval' 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    f"connect-src 'self' {JSDELIVR} https://tessdata.projectnaptha.com {SUPABASE_INSIGHTS}",
    f"worker-src 'self' blob: {JSDELIVR}",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

BLOG_POST_PATTERN = re.compile(r'^(/es)?/blog/([a-z0-9][a-z0-9-]{2,100})$')


def send_html(handler, status: int, html: str, cache: str = "no-cache, must-revalidate") -> None:
    """Send an HTML response with proper headers."""
    body = html.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", cache)
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
    handler.send_header("X-Frame-Options", "DENY")
    handler.end_headers()
    handler.wfile.write(body)


def send_xml(handler, status: int, xml: str, cache: str = "public, max-age=3600") -> None:
    """Send an XML response (for sitemap)."""
    body = xml.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/xml; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", cache)
    handler.end_headers()
    handler.wfile.write(body)


def send_text(handler, status: int, text: str, cache: str = "public, max-age=86400") -> None:
    """Send a plain text response (for robots.txt)."""
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", cache)
    handler.end_headers()
    handler.wfile.write(body)


def fetch_blog_posts(lang: str | None = None) -> list[dict]:
    """Fetch published blog posts from Supabase (or return empty if not available)."""
    supabase = community.supabase()
    if not supabase:
        return []
    try:
        params = [
            ("status", "eq.published"),
            ("order", "published_at.desc"),
        ]
        if lang:
            params.append(("lang", f"eq.{lang}"))
        posts = supabase.rest("GET", "blog_posts", params=params)
        return posts or []
    except Exception:
        return []


def fetch_blog_post(slug: str, lang: str) -> tuple[dict | None, dict | None]:
    """Fetch a single blog post and its translation if available."""
    supabase = community.supabase()
    if not supabase:
        return None, None
    try:
        posts = supabase.rest("GET", "blog_posts", params=[
            ("slug", f"eq.{slug}"),
            ("lang", f"eq.{lang}"),
            ("status", "eq.published"),
            ("limit", "1"),
        ])
        if not posts:
            return None, None
        post = posts[0]
        translation = None
        if post.get("translation_slug"):
            other_lang = "es" if lang == "en" else "en"
            try:
                trans_posts = supabase.rest("GET", "blog_posts", params=[
                    ("slug", f"eq.{post['translation_slug']}"),
                    ("lang", f"eq.{other_lang}"),
                    ("status", "eq.published"),
                    ("limit", "1"),
                ])
                if trans_posts:
                    translation = trans_posts[0]
            except Exception:
                pass
        return post, translation
    except Exception:
        return None, None


def handle_blog_route(handler, path: str) -> bool | None:
    """Handle blog routes, sitemap.xml, and robots.txt. Returns True if handled, None if not a blog route."""
    if path == "/robots.txt":
        send_text(handler, 200, blog.robots_txt())
        return True
    
    if path == "/sitemap.xml":
        posts = fetch_blog_posts()
        send_xml(handler, 200, blog.sitemap_xml(posts))
        return True
    
    if path == "/blog":
        posts = fetch_blog_posts("en")
        html = blog.blog_index_html(posts, "en")
        send_html(handler, 200, html)
        return True
    
    if path == "/es/blog":
        posts = fetch_blog_posts("es")
        html = blog.blog_index_html(posts, "es")
        send_html(handler, 200, html)
        return True
    
    match = BLOG_POST_PATTERN.match(path)
    if match:
        is_es = match.group(1) == "/es"
        lang = "es" if is_es else "en"
        slug = match.group(2)
        post, translation = fetch_blog_post(slug, lang)
        if post:
            html = blog.blog_post_html(post, translation, lang)
            send_html(handler, 200, html)
        else:
            html = blog.blog_404_html(lang)
            send_html(handler, 404, html)
        return True
    
    return None


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".html": "text/html",
    }
    server_port = 8766
    server_version = "CaseCircle"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def log_message(self, format: str, *args) -> None:
        message = format % args
        if "Authorization" in message or "Bearer" in message:
            return
        super().log_message("%s", message)

    def _blocked_path(self) -> bool:
        path = unquote(urlparse(self.path).path).lower()  # decode first: translate_path decodes %6f etc. too
        name = os.path.basename(path)
        if name.startswith(".") or name.endswith((".pyc", ".py")):
            return True  # server code (and its prompts) and dotfiles are never served as static files
        if name.endswith((".db", ".sqlite", ".sqlite3", "-wal", "-shm", "-journal")):
            return True  # the community database
        if "/data/cache/" in path or "/data/premium/" in path or "/data/outbox/" in path or "__pycache__" in path or "/." in path or "/scripts/" in path:
            return True
        return False

    def list_directory(self, path):  # no directory listings (data/ holds the database)
        self.send_error(404, "File not found")
        return None

    def do_HEAD(self) -> None:
        if self._blocked_path():
            self.send_error(404, "File not found")
            return
        super().do_HEAD()

    def do_GET(self) -> None:
        if self._blocked_path():
            self.send_error(404, "File not found")
            return
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            community.healthz(self)
            return
        blog_result = handle_blog_route(self, parsed.path)
        if blog_result is not None:
            return
        if parsed.path == "/api/folder-chat":
            folder_chat.handle_status(self, self.server_port)
            return
        if parsed.path == "/api/ai-status":
            folder_check.handle_status(self, self.server_port)
            return
        if parsed.path == "/api/processing-times":
            processing_times.handle(self, parse_qs(parsed.query))
            return
        if parsed.path == "/api/reddit-ask/status":
            reddit_ask.handle_status(self, self.server_port)
            return
        if parsed.path == "/api/reddit-ingest/status":
            reddit_ask.handle_ingest_status(self, self.server_port)
            return
        if parsed.path in ("/api/auth/google", "/auth/callback"):
            supabase = community.supabase()
            if not supabase:   # SQLite accounts: no Google sign-in
                self.send_response(302)
                self.send_header("Location", "/?signin_error=google_off")
                self.send_header("Content-Length", "0")
                self.end_headers()
            elif parsed.path == "/api/auth/google":
                supabase.oauth_start(self)
            else:
                supabase.oauth_callback(self)
            return
        if community.handles("GET", parsed.path):
            community.dispatch(self, "GET")
            return
        if parsed.path.startswith("/api/"):
            self.send_error(404, "File not found")
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/folder-chat":
            folder_chat.handle_post(self, self.server_port)
            return
        if path == "/api/folder-check":
            folder_check.handle_check(self, self.server_port)
            return
        if path == "/api/folder-plan":
            folder_check.handle_plan(self, self.server_port)
            return
        if path == "/api/reddit-ask":
            reddit_ask.handle_ask(self, self.server_port)
            return
        if path == "/api/reddit-ask/feedback":
            reddit_ask.handle_feedback(self, self.server_port)
            return
        if path == "/api/reddit-ingest":
            reddit_ask.handle_ingest(self, self.server_port)
            return
        if path == "/api/reddit-ingest/push":
            reddit_ask.handle_ingest_push(self, self.server_port)
            return
        if community.handles("POST", path):
            community.dispatch(self, "POST")
            return
        self.send_error(404, "File not found")

    def end_headers(self) -> None:
        path = unquote(urlparse(self.path).path).lower()  # decode first: translate_path decodes %6f etc. too
        # Always revalidate static assets so CSS/JS edits show up after a deploy or a local edit.
        if path.endswith((".css", ".js", ".mjs", ".html")) or path == "/" or path.endswith("/"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", CSP)
        if community.is_https(self):
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        for cookie in self.__dict__.pop("_cc_set_cookies", None) or []:  # refreshed Supabase session (supa.py)
            self.send_header("Set-Cookie", cookie)
        super().end_headers()

    def do_PUT(self) -> None:
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self) -> None:
        self.send_error(405, "Method Not Allowed")


def bind_address(argv: list[str], env: dict[str, str]) -> tuple[str, int]:
    if len(argv) > 1:
        port = int(argv[1])
    else:
        port = int(env.get("PORT") or 8766)
    host = env.get("HOST") or ("0.0.0.0" if env.get("PORT") else "127.0.0.1")
    return host, port


def main() -> None:
    host, port = bind_address(sys.argv, dict(os.environ))
    os.chdir(HERE)
    Handler.server_port = port
    supabase = community.supabase()
    if supabase:
        store = f"Supabase {supabase.base_url()}"
    else:
        conn = community.connect()  # run migrations before taking traffic
        conn.close()
        store = community.db_path()
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    shown = "127.0.0.1" if host in ("0.0.0.0", "") else host
    print(f"Serving at http://{shown}:{port}/  (db: {store})", flush=True)
    mail = mailer.provider()
    if supabase:
        print("Accounts: Supabase Auth (confirmation and reset emails are sent by Supabase).", flush=True)
    elif mail == "console" and os.environ.get("PORT"):
        print("WARNING: CASECIRCLE_EMAIL_PROVIDER is console — verification and reset links only go to the server log. "
              "Set it to resend or smtp in production.", flush=True)
    elif mail != "console" and not os.environ.get("CASECIRCLE_PUBLIC_ORIGIN"):
        print("WARNING: set CASECIRCLE_PUBLIC_ORIGIN so email links point at your real domain.", flush=True)
    print(f"Email: {mail}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        server.server_close()


if __name__ == "__main__":
    main()
