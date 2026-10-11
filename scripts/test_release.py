"""Release failure boundaries and real PostgreSQL restore (CI opt-in)."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.output = self.root / "out"
        self.output.mkdir()
        self.db = self.root / "source.sqlite"
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TABLE reminder (site TEXT, payload BLOB)")
            db.execute("INSERT INTO reminder VALUES (?, ?)", ("fashion", bytes([0, 255, 127])))
        now = dt.datetime.now(dt.timezone.utc)
        self.row = {"service": "analytics", "path": self.db.name, "sha256": release.digest(self.db),
                    "capturedAt": (now - dt.timedelta(minutes=2)).isoformat(),
                    "restoreVerifiedAt": (now - dt.timedelta(minutes=1)).isoformat(),
                    "restoreEvidence": "Isolated provider restore DRILL-001"}

    def tearDown(self):
        self.temp.cleanup()

    def verify(self, rows):
        receipt = self.root / "receipt.json"
        receipt.write_text(json.dumps(rows))
        return release.verify_external_receipts(str(receipt), {"analytics"}, self.output)

    def test_copies_verified_state_and_rejects_corrupt_or_placeholder_sqlite(self):
        self.assertEqual(self.verify([self.row])[0]["path"], "analytics.backup")
        with sqlite3.connect(self.output / "analytics.backup") as db:
            self.assertEqual(db.execute("SELECT payload FROM reminder").fetchone()[0], bytes([0, 255, 127]))
        self.db.write_bytes(b"not a database")
        with self.assertRaises(ValueError):
            self.verify([self.row])
        with self.assertRaises(sqlite3.DatabaseError):
            self.verify([{**self.row, "sha256": release.digest(self.db)}])

    def test_missing_stale_duplicate_or_unverified_receipts_fail_closed(self):
        with self.assertRaises(ValueError):
            release.verify_external_receipts(None, {"analytics"}, self.output)
        for rows in ([], [self.row, self.row], [{**self.row, "restoreEvidence": ""}],
                     [{**self.row, "capturedAt": "2000-01-01T00:00:00+00:00"}]):
            with self.assertRaises(ValueError):
                self.verify(rows)

    def test_configured_external_state_is_required(self):
        self.assertEqual(release.external_services({"ANALYTICS_LIBSQL_URL": "libsql://db", "THEME_LIBSQL_AUTH_TOKEN": "secret",
                                                   "SUPPORT_CHATWOOT_BASE_URL": "https://support.example", "AWS_STORAGE_BUCKET_NAME": "media"}),
                         {"analytics", "theme", "chatwoot", "object-storage"})
        self.assertEqual(release.external_services({}), set())


class FailureBoundaryTests(unittest.TestCase):
    def simulate(self, fail_phase):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        runner = release.Release.__new__(release.Release)
        runner.directory = Path(temp.name)
        runner.overlay = runner.directory / "images.json"
        runner.production = ["docker", "compose", "production"]
        runner.stage = ["docker", "compose", "isolated"]
        runner.stage_file = runner.directory / "absent.json"
        runner.images = {name: "new-" + name for name in release.APPLICATIONS}
        runner.previous_running = ["api", "worker", "storefront"]
        runner.manifest = {"gitCommit": "test"}
        runner.config = {"services": {"storefront": {"environment": {}}}}
        runner.port = 18080
        runner.stopped = runner.migration_started = runner.preflight_only = False
        events = []

        def phase(name):
            events.append(name)
            if name == fail_phase:
                raise RuntimeError("simulated failure")

        runner.capture_previous_images = lambda: phase("previous-images")
        runner.save = lambda status: events.append(status)
        runner.dump = lambda path: phase("dump")
        runner.prepare_stage = lambda: phase("prepare-stage")
        runner.restore_stage = lambda path: phase("restore-stage")
        runner.wait_api = lambda command: phase("api-health")
        runner.wait_storefront = lambda: phase("storefront-health")
        runner.build = lambda services, *args: phase("frontend-build" if "storefront" in services else "backend-build")
        runner.backup = lambda: phase("backup-restore")

        def command(args, **kwargs):
            if "run" in args and args[-1] == "migrate":
                phase("production-migrate" if "production" in args else "isolated-migrate")
            elif "stop" in args:
                events.append("writers-stop")
            elif "up" in args and "production" in args:
                events.append("production-start")
            return b"sha256:test\n"

        with patch.object(release, "run", command), patch.object(release.subprocess, "run") as recovery:
            with self.assertRaises(RuntimeError):
                try:
                    runner.execute()
                finally:
                    runner.cleanup(True)
            return runner, events, recovery.call_args_list

    def test_frontend_build_failure_cannot_stop_writers_or_migrate_production(self):
        runner, events, _ = self.simulate("frontend-build")
        self.assertIn("isolated-migrate", events)
        self.assertNotIn("writers-stop", events)
        self.assertNotIn("production-migrate", events)
        self.assertFalse(runner.migration_started)

    def test_failed_backup_prevents_migration_and_restarts_previous_images(self):
        runner, events, recovery = self.simulate("backup-restore")
        self.assertIn("writers-stop", events)
        self.assertNotIn("production-migrate", events)
        self.assertFalse(runner.migration_started)
        self.assertTrue(any("start" in call.args[0] for call in recovery))
        self.assertFalse(any("up" in call.args[0] for call in recovery))

    def test_failed_migration_keeps_writers_stopped_without_automatic_restore(self):
        runner, events, recovery = self.simulate("production-migrate")
        self.assertLess(events.index("frontend-build"), events.index("backup-restore"))
        self.assertLess(events.index("backup-restore"), events.index("production-migrate"))
        self.assertTrue(runner.migration_started)
        self.assertNotIn("production-start", events)
        self.assertTrue(any("stop" in str(call) for call in recovery))
        self.assertFalse(any("pg_restore" in str(call) for call in recovery))


@unittest.skipUnless(os.environ.get("RELEASE_TEST_DOCKER") == "1", "Real Docker restore runs in release safety CI")
class PostgreSQLRestoreTests(unittest.TestCase):
    def test_full_runner_builds_before_production_ddl_and_keeps_old_apps_on_build_failure(self):
        with tempfile.TemporaryDirectory(prefix="sloer-release-test-") as directory:
            root = Path(directory)
            backend = root / "backend"
            frontend = root / "storefront"
            backend.mkdir(); frontend.mkdir()
            (root / ".env").write_text("# isolated CI fixture only\n")
            (backend / "Dockerfile").write_text("FROM python:3.12-alpine\nRUN apk add --no-cache postgresql-client\nWORKDIR /app\nCOPY . .\nCMD [\"python3\",\"server.py\"]\n")
            (backend / "manage.py").write_text("import os,subprocess\nsubprocess.run(['psql',os.environ['DATABASE_URL'],'-v','ON_ERROR_STOP=1','-c',\"CREATE TABLE IF NOT EXISTS release_marker (id serial PRIMARY KEY); INSERT INTO release_marker DEFAULT VALUES;\"],check=True)\n")
            (backend / "server.py").write_text("from http.server import BaseHTTPRequestHandler,HTTPServer\nfrom pathlib import Path\nPath('/app/media').mkdir(exist_ok=True);Path('/app/media/fixture.txt').write_text('media fixture')\nclass Handler(BaseHTTPRequestHandler):\n def do_POST(self):\n  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{\"data\":{\"shop\":{\"name\":\"CI\"}}}')\nHTTPServer(('0.0.0.0',8000),Handler).serve_forever()\n")
            (frontend / "Dockerfile").write_text("FROM node:24-alpine\nWORKDIR /app\nARG SALEOR_BUILD_API_URL\nARG FAIL_BUILD=false\nRUN test \"$FAIL_BUILD\" = false\nRUN node --input-type=module -e \"const r=await fetch('$SALEOR_BUILD_API_URL',{method:'POST'});if(!r.ok)process.exit(1)\"\nCOPY server.mjs .\nCMD [\"node\",\"server.mjs\"]\n")
            (frontend / "server.mjs").write_text("import http from 'node:http';http.createServer((q,s)=>s.end('CI storefront')).listen(3000,'0.0.0.0');\n")
            env = {"DATABASE_URL": "postgres://preflight:ci-only@db:5432/preflight", "RSA_PRIVATE_KEY": "CI-placeholder", "DEFAULT_CHANNEL_SLUG": "us"}
            shared_backend = {"build": {"context": "./backend"}, "environment": env, "volumes": ["media:/app/media"]}
            shared_frontend = {"build": {"context": "./storefront", "network": "host", "entitlements": ["network.host"], "args": {"SALEOR_BUILD_API_URL": "${SALEOR_BUILD_API_URL}", "FAIL_BUILD": "${FAIL_BUILD:-false}"}}}
            configuration = {"services": {
                "db": {"image": "postgres:15-alpine", "environment": {"POSTGRES_DB": "preflight", "POSTGRES_USER": "preflight", "POSTGRES_PASSWORD": "ci-only"},
                       "volumes": ["db:/var/lib/postgresql/data"], "healthcheck": {"test": ["CMD", "pg_isready", "-U", "preflight"], "interval": "2s", "timeout": "3s", "retries": 30}},
                "cache": {"image": "valkey/valkey:8.1-alpine"},
                "api": shared_backend, "worker": {**shared_backend, "command": ["python3", "-c", "import time;time.sleep(600)"]},
                "migrate": {**shared_backend, "command": ["python3", "manage.py", "migrate"]},
                "dashboard": shared_frontend, "storefront": {**shared_frontend, "environment": {"NEXT_PUBLIC_DEFAULT_CHANNEL": "us", "NEXT_PUBLIC_DEFAULT_LOCALE": "en"}},
                "support-ai-poller": {"image": "busybox:1.36", "profiles": ["support-ai"]},
                "translations-ai-poller": {"image": "busybox:1.36", "profiles": ["translations-ai"]},
            }, "volumes": {"db": {}, "media": {}}}
            (root / "docker-compose.yml").write_text(json.dumps(configuration))
            (root / "docker-compose.prod.yml").write_text('{"services":{}}')
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=CI", "-c", "user.email=ci@example.test", "commit", "--allow-empty", "-m", "CI fixture"], check=True)
            command = ["docker", "compose", "--project-directory", str(root), "-f", str(root / "docker-compose.yml"), "-f", str(root / "docker-compose.prod.yml")]
            with patch.object(release, "ROOT", root), patch.object(release, "BASE", command):
                try:
                    runner = release.Release()
                    try: runner.execute()
                    finally: runner.cleanup(False)
                    self.assertEqual(runner.manifest["status"], "deployed")
                    self.assertIn("verifiedAt", runner.manifest["backup"])
                    marker_query = command + ["exec", "-T", "db", "psql", "-U", "preflight", "-d", "preflight", "-Atc", "SELECT count(*) FROM release_marker"]
                    self.assertEqual(release.run(marker_query, capture=True).strip(), b"1")
                    old_api = release.run(command + ["ps", "-q", "api"], capture=True)
                    with patch.dict(os.environ, {"FAIL_BUILD": "true"}):
                        failed = release.Release()
                        with self.assertRaises(subprocess.CalledProcessError):
                            try: failed.execute()
                            finally: failed.cleanup(True)
                    self.assertFalse(failed.migration_started)
                    self.assertEqual(release.run(marker_query, capture=True).strip(), b"1")
                    self.assertEqual(release.run(command + ["ps", "-q", "api"], capture=True), old_api)
                finally:
                    subprocess.run(command + ["--profile", "support-ai", "--profile", "translations-ai", "down", "-v"], check=False)

    def test_archive_restores_data_and_corrupt_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = "sloer-restore-test-" + os.urandom(5).hex()
            compose = root / "compose.json"
            compose.write_text(json.dumps({"services": {
                "db": {"image": "postgres:15-alpine", "environment": {"POSTGRES_DB": "preflight", "POSTGRES_USER": "preflight", "POSTGRES_PASSWORD": "ci-only"},
                       "volumes": ["db:/var/lib/postgresql/data"], "healthcheck": {"test": ["CMD", "pg_isready", "-U", "preflight"], "interval": "2s", "timeout": "3s", "retries": 30}},
                "api": {"image": "busybox:1.36"}}, "volumes": {"db": {}}}))
            command = ["docker", "compose", "-p", project, "-f", str(compose)]
            runner = release.Release.__new__(release.Release)
            runner.stage = command
            try:
                release.run(command + ["up", "-d", "--wait", "db"])
                fixture = "CREATE TABLE merchant_order (id integer PRIMARY KEY, brand text, total numeric(12,2)); INSERT INTO merchant_order VALUES (1, 'fashion', 120.35), (2, 'jewelry', 99.99);"
                release.run(command + ["exec", "-T", "db", "psql", "-U", "preflight", "-d", "preflight", "-c", fixture])
                archive = root / "saleor.dump"
                with archive.open("wb") as output:
                    release.run(command + ["exec", "-T", "db", "pg_dump", "-U", "preflight", "-d", "preflight", "-Fc"], stdout=output)
                self.assertEqual(runner.restore_stage(archive), 1)
                result = release.run(command + ["exec", "-T", "db", "psql", "-U", "preflight", "-d", "preflight", "-Atc", "SELECT brand || ':' || total FROM merchant_order ORDER BY id"], capture=True)
                self.assertEqual(result.decode().splitlines(), ["fashion:120.35", "jewelry:99.99"])
                archive.write_bytes(b"corrupt archive")
                with self.assertRaises(subprocess.CalledProcessError):
                    runner.restore_stage(archive)
            finally:
                subprocess.run(command + ["down", "-v"], check=False)


if __name__ == "__main__":
    unittest.main()
