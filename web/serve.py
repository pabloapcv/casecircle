#!/usr/bin/env python3
"""Serve the website and the same-origin folder chat endpoint on loopback."""
from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import folder_chat

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
        if name.startswith(".env") or name.endswith(".pyc"):
            return True
        return False

    def do_GET(self) -> None:
        if self._blocked_path():
            self.send_error(404, "File not found")
            return
        if urlparse(self.path).path == "/api/folder-chat":
            folder_chat.handle_status(self, self.server_port)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path == "/api/folder-chat":
            folder_chat.handle_post(self, self.server_port)
            return
        self.send_error(404, "File not found")

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
