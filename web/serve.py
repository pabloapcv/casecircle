#!/usr/bin/env python3
"""Serve the website and its same-origin API on loopback.

GET  /api/folder-chat       chat availability          POST /api/folder-chat   folder chat (SSE)
GET  /api/ai-status         provider + Demo AI flag    POST /api/folder-check  one document vs one checklist item
GET  /api/processing-times  official times (cached)    POST /api/folder-plan   tailor the checklist
"""
from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import folder_chat
import folder_check
import processing_times

HERE = os.path.dirname(os.path.abspath(__file__))
folder_chat.load_dotenv(os.path.join(HERE, ".env"))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".html": "text/html",
    }
    server_port = 8080

    def log_message(self, format: str, *args) -> None:
        message = format % args
        if "Authorization" in message or "Bearer" in message:
            return
        super().log_message("%s", message)

    def _blocked_path(self) -> bool:
        path = urlparse(self.path).path.lower()
        name = os.path.basename(path)
        if name.startswith(".env") or name.endswith((".pyc", ".py")):
            return True  # server code (and its prompts) is never served as a static file
        if "/data/cache/" in path or "__pycache__" in path:
            return True
        return False

    def do_GET(self) -> None:
        if self._blocked_path():
            self.send_error(404, "File not found")
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/folder-chat":
            folder_chat.handle_status(self, self.server_port)
            return
        if parsed.path == "/api/ai-status":
            folder_check.handle_status(self, self.server_port)
            return
        if parsed.path == "/api/processing-times":
            processing_times.handle(self, parse_qs(parsed.query))
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
        self.send_error(404, "File not found")

    def end_headers(self) -> None:
        # Preview: always revalidate static assets so CSS/JS edits show up.
        path = urlparse(self.path).path.lower()
        if path.endswith((".css", ".js", ".mjs", ".html")) or path == "/" or path.endswith("/"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_PUT(self) -> None:
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self) -> None:
        self.send_error(405, "Method Not Allowed")


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(HERE)
    Handler.server_port = port
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving at http://127.0.0.1:{port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        server.server_close()


if __name__ == "__main__":
    main()
