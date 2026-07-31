#!/usr/bin/env python3
"""
P25 Orb demo server.

    python3 serve.py

Then open http://localhost:8000 and follow the links.

This is the only thing you have to start. There is no build step, no bundler,
no package to install — the demo is plain HTML, CSS and JavaScript, and this
script is the standard library's own web server with one extra endpoint bolted
on.

It exists for exactly one reason: the "try it live" page makes a real Anthropic
API call, and an API key must never be shipped to a browser. Anything in
client-side JavaScript is readable by anyone who opens developer tools or later
reads the repository. So the key stays here, on the server side, and the browser
posts a phrase to /api/classify without ever seeing the credential.

The scripted two-tab demo does not use this endpoint at all. It replays cached
classifications, so it will run correctly with no network connection and no API
key present.
"""

import http.server
import json
import os
import socketserver
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classifier import MODEL, classify, load_api_key  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_ROOT = os.path.join(ROOT, "demo")
PORT = int(os.environ.get("PORT", "8000"))

# Read once at startup so a missing key is a clear message on the terminal now,
# rather than a confusing failure in front of an audience later.
try:
    API_KEY = load_api_key(os.path.join(ROOT, ".env"))
    KEY_STATUS = "loaded"
except RuntimeError as exc:
    API_KEY = None
    KEY_STATUS = str(exc)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Lets the live page tell the presenter up front whether a live call can
        # succeed, instead of finding out mid-demo.
        if self.path == "/api/status":
            self._send_json(200, {"model": MODEL, "key_available": API_KEY is not None,
                                  "detail": KEY_STATUS})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/classify":
            self._send_json(404, {"error": "Unknown endpoint."})
            return

        if API_KEY is None:
            self._send_json(503, {"error": f"No API key available on the server. {KEY_STATUS}"})
            return

        try:
            length = int(self.headers.get("content-length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            self._send_json(400, {"error": "Could not read the request body."})
            return

        transcript = (request.get("transcript") or "").strip()
        if not transcript:
            self._send_json(400, {"error": "Type something for the classifier to read."})
            return

        try:
            result, raw = classify(
                unit=request.get("unit") or "8M-4471",
                talkgroup=request.get("talkgroup") or "5301 (REG1 TAC1)",
                truncated=bool(request.get("truncated")),
                transcript=transcript,
                api_key=API_KEY,
            )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            self._send_json(502, {"error": f"The API returned {exc.code}.", "detail": detail})
            return
        except Exception as exc:
            # This endpoint is deliberately allowed to fail without consequence:
            # nothing in the scripted presentation depends on it.
            self._send_json(502, {"error": "Live classification failed.", "detail": str(exc)})
            return

        self._send_json(200, {
            "model": MODEL,
            "classification": result,
            "usage": raw.get("usage", {}),
        })

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    print("\n  P25 Orb — ARC Edge proof of concept")
    print("  " + "-" * 44)
    print(f"  Open:        http://localhost:{PORT}")
    print(f"  Live model:  {MODEL}")
    print(f"  API key:     {'loaded from .env' if API_KEY else 'NOT FOUND'}")
    if API_KEY is None:
        print("               The scripted two-tab demo still works.")
        print("               Only the 'try it live' page needs the key.")
    print("  " + "-" * 44)
    print("  Ctrl-C to stop.\n")

    with Server(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Stopped.\n")
