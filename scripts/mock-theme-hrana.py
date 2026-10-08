#!/usr/bin/env python3
"""CI-only local Hrana v3 subset, backed by Python's SQLite stdlib.

Tests real Next.js HTTP -> Hrana -> SQLite draft and published state. Not for production.
Runs only on 127.0.0.1 and requires CI_THEME_LIBSQL_TOKEN.
"""
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = os.environ.get("CI_THEME_LIBSQL_TOKEN", "")
PORT = int(os.environ.get("CI_THEME_LIBSQL_PORT", "3789"))
if not TOKEN:
    raise SystemExit("CI_THEME_LIBSQL_TOKEN is required")

conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA busy_timeout = 3000")


def decode_value(arg):
    kind = arg.get("type")
    if kind == "null":
        return None
    if kind == "integer":
        return int(arg["value"])
    if kind == "float":
        return float(arg["value"])
    if kind == "text":
        return arg["value"]
    raise ValueError(f"Unsupported Hrana argument type: {kind}")


def encode_value(value):
    if value is None:
        return {"type": "null"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    return {"type": "text", "value": str(value)}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.respond(200, {"status": "ok"})

    def do_POST(self):
        if self.path != "/v3/pipeline":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.respond(401, {"error": "unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 300000 or size < 1:
                self.respond(413, {"error": "bad request size"})
                return
            body = json.loads(self.rfile.read(size))
            results = []
            for request in body.get("requests", []):
                if request["type"] == "close":
                    results.append({"type": "ok", "response": {"type": "close"}})
                    continue
                if request["type"] != "execute":
                    raise ValueError("Unsupported Hrana request")
                statement = request["stmt"]
                sql = statement["sql"]
                args = [decode_value(value) for value in statement.get("args", [])]
                cursor = conn.execute(sql, args)
                cols = [{"name": col[0]} for col in (cursor.description or [])]
                rows = [
                    [encode_value(value) for value in row]
                    for row in (cursor.fetchall() if cursor.description else [])
                ]
                affected = cursor.rowcount if cursor.rowcount >= 0 else 0
                conn.commit()
                results.append({
                    "type": "ok",
                    "response": {
                        "type": "execute",
                        "result": {"cols": cols, "rows": rows, "affected_row_count": affected},
                    },
                })
            self.respond(200, {"baton": None, "base_url": None, "results": results})
        except (ValueError, KeyError, TypeError, sqlite3.Error) as error:
            self.respond(400, {"error": str(error)})

    def respond(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        print("hrana-mock: " + format % args, flush=True)


print(f"Starting CI Hrana/SQLite at 127.0.0.1:{PORT}", flush=True)
HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
