"""Record real worker cache receipts in disposable CI without changing Saleor."""
import hashlib
import hmac
import json
import os
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if os.environ.get("CI") != "true" or os.environ.get("CI_NATIVE_CACHE_SEED") != "true":
    raise RuntimeError("Cache receiver requires disposable CI")
secret = os.environ.get("SALEOR_WEBHOOK_SECRET", "")
if len(secret) < 32:
    raise RuntimeError("Native cache HMAC key is missing")
receipt_lock = threading.Lock()
receipt_path = "/tmp/native-cache-receipts.jsonl"


class Receiver(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/revalidate":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 1_000_000:
            self.send_error(413)
            return
        raw = self.rfile.read(length)
        signature = self.headers.get("Saleor-Signature", "")
        signed = hmac.compare_digest(
            signature, hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        )
        headers = {key: value for key, value in self.headers.items()
                   if key.lower() not in {"host", "content-length", "connection"}}
        request = urllib.request.Request(
            "http://127.0.0.1:3101/api/revalidate", raw, headers, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status, body = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
        except urllib.error.URLError:
            self.send_error(502)
            return
        try:
            result = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            result = {}
        receipt = {"signed": signed, "event": self.headers.get("Saleor-Event"),
                   "status": status, "success": result.get("success"),
                   "tags": result.get("tags", [])}
        with receipt_lock, open(receipt_path, "a") as output:
            output.write(json.dumps(receipt) + "\n")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("0.0.0.0", 3103), Receiver).serve_forever()
