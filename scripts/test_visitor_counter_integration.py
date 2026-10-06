"""Verify SQLite persistence and concurrency using Wrangler's real local runtime."""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"

    def call(method="GET", data=None, headers=None, path="/api/visits"):
        body = json.dumps(data).encode() if data is not None else None
        req = Request(base + path, data=body, method=method, headers=headers or {})
        try:
            with urlopen(req, timeout=15) as res:
                return res.status, res.read(), res.headers
        except HTTPError as exc:
            return exc.code, exc.read(), exc.headers

    def read():
        status, body, headers = call()
        assert status == 200, (status, body)
        assert headers["cache-control"] == "no-store"
        result = json.loads(body)
        assert result["source"] == "first-party-live"
        return result

    def post(visit_id):
        status, body, _ = call("POST", {"visitId": visit_id}, {"Origin": base, "Content-Type": "application/json"})
        assert status == 200, (status, body)
        return json.loads(body)

    with tempfile.TemporaryDirectory(prefix="visitor-counter-test-") as tmp:
        log_path = Path(tmp) / "runtime.log"
        process = None
        log = log_path.open("w")

        def stop():
            nonlocal process
            if process:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
                process = None

        def start():
            nonlocal process
            process = subprocess.Popen([
                "node", "node_modules/wrangler/bin/wrangler.js", "dev", "--local",
                "--ip", "127.0.0.1", "--port", str(port), "--persist-to", str(Path(tmp) / "state"),
                "--log-level", "warn",
            ], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                env={**os.environ, "CI": "true", "WRANGLER_SEND_METRICS": "false"})
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise AssertionError(log_path.read_text())
                try:
                    if call()[0] == 200:
                        return
                except (URLError, TimeoutError):
                    pass
                time.sleep(0.25)
            raise AssertionError("Runtime did not start: " + log_path.read_text())

        try:
            start()
            initial = read()
            assert initial["site_pv"] == 0
            assert read() == initial, "GET must never count a visit"
            first_id = str(uuid.uuid4())
            assert post(first_id)["site_pv"] == 1
            assert post(first_id.upper())["site_pv"] == 1, "retry must not count twice"
            with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
                list(pool.map(post, [first_id] * 24))
            assert read()["site_pv"] == 1, "concurrent retries must remain idempotent"
            with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
                results = list(pool.map(post, [str(uuid.uuid4()) for _ in range(40)]))
            assert read()["site_pv"] == 41, "concurrent visits must not be lost"
            assert sorted(r["site_pv"] for r in results) == list(range(2, 42))
            assert call("POST", {"visitId": str(uuid.uuid4())}, {"Origin": "https://evil.example", "Content-Type": "application/json"})[0] == 403
            assert call("POST", {"visitId": "bad"}, {"Origin": base, "Content-Type": "application/json"})[0] == 400
            assert read()["site_pv"] == 41
            status, body, headers = call(path="/")
            assert status == 200 and b"visitor-count.js?v=first-party-live-1" in body
            assert "no-store" in headers["cache-control"]
            assert call(path="/visitor-count.js")[0] == 200
            assert call("POST", {}, {"Content-Type": "application/json"}, "/api/jev/analyze")[0] == 403
            stop()
            start()
            assert read()["site_pv"] == 41, "restarting/redeploying must preserve the total"
            assert read()["startedAt"] == initial["startedAt"]
            assert post(first_id)["site_pv"] == 41, "idempotency must survive restarts"
            assert post(str(uuid.uuid4()))["site_pv"] == 42
            print("PASS: actual SQLite runtime, concurrent visits, idempotent retries, persistent restart, origin checks, static assets and JEV routing")
        except Exception:
            log.flush()
            print(log_path.read_text())
            raise
        finally:
            stop()
            log.close()


if __name__ == "__main__":
    main()
