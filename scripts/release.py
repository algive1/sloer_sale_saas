#!/usr/bin/env python3
"""Build on an isolated database; verify a quiesced backup before production DDL.

No production restore is automatic: restoring a database after new orders arrived
would discard those orders. Failed migrations leave application writers stopped.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
APPLICATIONS = ("api", "worker", "migrate", "dashboard", "storefront")
WRITERS = ("storefront", "dashboard", "worker", "api", "support-ai-poller", "translations-ai-poller")
BASE = ["docker", "compose", "--project-directory", str(ROOT), "-f", str(ROOT / "docker-compose.yml"),
        "-f", str(ROOT / "docker-compose.prod.yml")]


def run(args, *, capture=False, stdin=None, stdout=None, env=None):
    # Do not echo resolved Compose configuration or commands containing secrets.
    return subprocess.run(args, check=True, input=stdin, stdout=subprocess.PIPE if capture else stdout,
                          env=env, cwd=ROOT).stdout


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")
    path.chmod(0o600)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def compose_escape(value):
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [compose_escape(item) for item in value]
    if isinstance(value, dict):
        return {key: compose_escape(item) for key, item in value.items()}
    return value


def external_services(environment):
    required = set()
    for prefix, service in (("ANALYTICS", "analytics"), ("THEME", "theme"), ("TRANSLATION", "translations")):
        if environment.get(prefix + "_LIBSQL_URL") or environment.get(prefix + "_LIBSQL_AUTH_TOKEN"):
            required.add(service)
    if environment.get("SUPPORT_CHATWOOT_BASE_URL"):
        required.add("chatwoot")
    # Saleor local media is archived separately. Configured cloud media needs
    # an external object-store snapshot/versioning receipt as well.
    if any(environment.get(key) for key in ("AWS_STORAGE_BUCKET_NAME", "GS_BUCKET_NAME", "AZURE_CONTAINER")):
        required.add("object-storage")
    return required


def verify_external_receipts(receipt_path, required, destination):
    if not required:
        return []
    if not receipt_path:
        raise ValueError("External state is configured; set RELEASE_EXTERNAL_BACKUP_RECEIPT (see docs/release-recovery.md).")
    receipt_path = Path(receipt_path).resolve()
    records = json.loads(receipt_path.read_text())
    if not isinstance(records, list):
        raise ValueError("External backup receipt must be an array")
    accepted = []
    now = dt.datetime.now(dt.timezone.utc)
    for service in sorted(required):
        rows = [row for row in records if isinstance(row, dict) and row.get("service") == service]
        if len(rows) != 1:
            raise ValueError("Exactly one backup receipt required for " + service)
        row = rows[0]
        source = (receipt_path.parent / str(row.get("path", ""))).resolve()
        captured = dt.datetime.fromisoformat(str(row.get("capturedAt", "")))
        verified = dt.datetime.fromisoformat(str(row.get("restoreVerifiedAt", "")))
        if captured.tzinfo is None or verified.tzinfo is None or not (dt.timedelta(0) <= now - captured <= dt.timedelta(hours=24)):
            raise ValueError("External backup timestamp invalid or older than 24 hours: " + service)
        if verified < captured or verified > now or not str(row.get("restoreEvidence", "")).strip():
            raise ValueError("External backup requires restore evidence: " + service)
        if not source.is_file() or source.stat().st_size == 0 or digest(source) != row.get("sha256"):
            raise ValueError("External backup missing or checksum mismatch: " + service)
        # A receipt cannot turn a text placeholder into a verified SQLite backup.
        if service in {"analytics", "theme", "translations"}:
            with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as db:
                if db.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                    raise ValueError("External SQLite integrity check failed: " + service)
        target = destination / (service + ".backup")
        shutil.copyfile(source, target)
        target.chmod(0o600)
        accepted.append({**row, "path": target.name})
    return accepted


class Release:
    def __init__(self, *, preflight_only=False):
        self.config = json.loads(run(BASE + ["config", "--format", "json"], capture=True))
        self.previous_running = run(BASE + ["--profile", "support-ai", "--profile", "translations-ai", "ps", "--status", "running", "--services"], capture=True).decode().split()
        self.id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
        self.directory = ROOT / ".local" / "releases" / self.id
        self.directory.mkdir(parents=True, mode=0o700)
        self.images = {name: "sloer-release/" + name + ":" + self.id for name in APPLICATIONS}
        self.overlay = self.directory / "images.json"
        write_json(self.overlay, {"services": {name: {"image": image} for name, image in self.images.items()}})
        self.production = BASE + ["-f", str(self.overlay)]
        self.stage_name = "sloer-preflight-" + secrets.token_hex(8)
        self.stage_file = self.directory / "preflight.json"
        self.stage = ["docker", "compose", "--project-directory", str(ROOT), "-p", self.stage_name, "-f", str(self.stage_file)]
        self.stopped = False
        self.migration_started = False
        self.preflight_only = preflight_only
        self.manifest = {"id": self.id, "createdAt": utc(), "project": self.config["name"], "status": "preparing",
                         "gitCommit": run(["git", "rev-parse", "HEAD"], capture=True).decode().strip(), "images": self.images}

    def save(self, status):
        self.manifest.update(status=status, updatedAt=utc())
        write_json(self.directory / "manifest.json", self.manifest)

    def build(self, services, environment=None):
        # Match the repository's explicit BuildKit network.host entitlement.
        plan = run(self.production + ["build", "--print", *services], capture=True, env=environment)
        run(["docker", "buildx", "bake", "--allow=network.host", "-f", "-", *services], stdin=plan, env=environment)

    def dump(self, path):
        with path.open("wb") as output:
            run(BASE + ["exec", "-T", "db", "sh", "-ec",
                        'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges'], stdout=output)
        path.chmod(0o600)
        if path.stat().st_size == 0:
            raise ValueError("Database dump was empty")

    def prepare_stage(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        self.port = port
        secret = secrets.token_hex(32)
        stage_environment = {
            "DEBUG": "False", "DATABASE_URL": "postgres://preflight:" + secret + "@db:5432/preflight",
            "SECRET_KEY": secret, "RSA_PRIVATE_KEY": self.config["services"]["api"]["environment"]["RSA_PRIVATE_KEY"],
            "CACHE_URL": "redis://cache:6379/0", "CELERY_BROKER_URL": "redis://cache:6379/1",
            "EMAIL_URL": "console://", "DEFAULT_CHANNEL_SLUG": self.config["services"]["api"]["environment"].get("DEFAULT_CHANNEL_SLUG", "us"),
            "ALLOWED_HOSTS": "localhost,127.0.0.1,api", "HTTP_IP_FILTER_ENABLED": "True",
            "PUBLIC_URL": "http://127.0.0.1:" + str(port) + "/", "DASHBOARD_URL": "http://127.0.0.1:9000/",
        }
        write_json(self.stage_file, compose_escape({
            "services": {
                "db": {"image": self.config["services"]["db"]["image"], "environment": {"POSTGRES_USER": "preflight", "POSTGRES_DB": "preflight", "POSTGRES_PASSWORD": secret},
                       "volumes": ["db:/var/lib/postgresql/data"], "networks": ["isolated"],
                       "healthcheck": {"test": ["CMD-SHELL", "pg_isready -U preflight -d preflight"], "interval": "2s", "timeout": "3s", "retries": 30}},
                "cache": {"image": self.config["services"]["cache"]["image"], "networks": ["isolated"]},
                "migrate": {"image": self.images["migrate"], "environment": stage_environment, "command": ["python3", "manage.py", "migrate", "--noinput"], "networks": ["isolated"]},
                "api": {"image": self.images["api"], "environment": stage_environment, "ports": ["127.0.0.1:" + str(port) + ":8000"], "networks": ["isolated"]},
            }, "volumes": {"db": {}}, "networks": {"isolated": {"internal": True}},
        }))
        run(self.stage + ["up", "-d", "--wait", "db", "cache"])

    def restore_stage(self, path):
        run(self.stage + ["stop", "api"])
        run(self.stage + ["exec", "-T", "db", "dropdb", "-U", "preflight", "--if-exists", "--force", "preflight"])
        run(self.stage + ["exec", "-T", "db", "createdb", "-U", "preflight", "preflight"])
        # Stream the archive without loading a large merchant DB into memory.
        with path.open("rb") as source:
            subprocess.run(self.stage + ["exec", "-T", "db", "pg_restore", "-U", "preflight", "-d", "preflight",
                                          "--no-owner", "--no-privileges", "--exit-on-error"], stdin=source, check=True, cwd=ROOT)
        result = run(self.stage + ["exec", "-T", "db", "psql", "-U", "preflight", "-d", "preflight", "-Atc",
                                  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'"], capture=True)
        return int(result.decode().strip())

    def wait_api(self, command):
        query = 'import json,urllib.request; r=urllib.request.Request("http://127.0.0.1:8000/graphql/",data=b\'{"query":"{ shop { name } }"}\',headers={"content-type":"application/json"}); b=json.load(urllib.request.urlopen(r,timeout=5)); assert b.get("data",{}).get("shop") and not b.get("errors")'
        for _ in range(60):
            result = subprocess.run(command + ["exec", "-T", "api", "python3", "-c", query], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT)
            if result.returncode == 0:
                return
            time.sleep(2)
        raise RuntimeError("Saleor GraphQL did not become healthy")

    def capture_previous_images(self):
        images = {}
        runtime = {}
        for service in APPLICATIONS:
            ids = run(BASE + ["ps", "-aq", service], capture=True).decode().split()
            if ids:
                images[service] = run(["docker", "inspect", "--format", "{{.Image}}", ids[0]], capture=True).decode().strip()
                runtime[service] = json.loads(run(["docker", "inspect", ids[0]], capture=True))[0]
        write_json(self.directory / "previous-images.json", {"services": {key: {"image": value} for key, value in images.items()}})
        write_json(self.directory / "previous-containers.json", runtime)
        self.manifest["previousImages"] = images

    def backup(self):
        backup = self.directory / "backup"
        backup.mkdir(mode=0o700)
        self.dump(backup / "saleor.dump")
        # The backend's local media volume is the same volume used by workers.
        with (backup / "media.tar.gz").open("wb") as output:
            run(self.production + ["run", "--rm", "--no-deps", "-T", "--pull", "never", "api", "python3", "-c",
                        'import sys,tarfile; t=tarfile.open(fileobj=sys.stdout.buffer,mode="w|gz"); t.add("/app/media",arcname="media"); t.close()'], stdout=output)
        with tarfile.open(backup / "media.tar.gz", "r:gz") as archive:
            for member in archive:
                if (member.name != "media" and not member.name.startswith("media/")) or member.issym() or member.islnk():
                    raise ValueError("Unexpected media backup entry")
                if member.isfile():
                    with archive.extractfile(member) as source, open(os.devnull, "wb") as sink:
                        shutil.copyfileobj(source, sink)
        shutil.copyfile(ROOT / ".env", backup / "deployment.env")
        write_json(backup / "resolved-compose.json", self.config)
        external = verify_external_receipts(os.environ.get("RELEASE_EXTERNAL_BACKUP_RECEIPT"),
                                           external_services({**self.config["services"]["api"]["environment"], **self.config["services"]["storefront"]["environment"]}), backup)
        table_count = self.restore_stage(backup / "saleor.dump")
        checksums = {path.name: digest(path) for path in backup.iterdir() if path.is_file()}
        self.manifest["backup"] = {"verifiedAt": utc(), "publicTableCount": table_count, "sha256": checksums, "external": external}
        self.save("backup-restore-verified")

    def execute(self):
        self.capture_previous_images()
        self.save("building")
        print("Building backend; production application writers remain running.", flush=True)
        self.build(["api", "worker", "migrate"])
        run(BASE + ["up", "-d", "--wait", "db", "cache"])
        self.dump(self.directory / "preflight.dump")
        self.prepare_stage()
        self.restore_stage(self.directory / "preflight.dump")
        run(self.stage + ["run", "--rm", "--no-deps", "-T", "migrate"])
        run(self.stage + ["up", "-d", "--no-build", "api"])
        self.wait_api(self.stage)
        environment = {**os.environ, "SALEOR_BUILD_API_URL": "http://127.0.0.1:" + str(self.port) + "/graphql/"}
        print("Building Dashboard and Storefront against the isolated migrated copy.", flush=True)
        self.build(["dashboard", "storefront"], environment)
        # Pin actual content digests for deployment and retain rollback images.
        image_ids = {name: run(["docker", "image", "inspect", "--format", "{{.Id}}", tag], capture=True).decode().strip() for name, tag in self.images.items()}
        write_json(self.overlay, {"services": {name: {"image": image_id} for name, image_id in image_ids.items()}})
        self.manifest["imageIds"] = image_ids
        self.save("preflight-passed")
        if self.preflight_only:
            print("Preflight passed; production database was not migrated. " + str(self.directory), flush=True)
            return
        print("Stopping application writers for the final backup and migration.", flush=True)
        self.stopped = True
        run(BASE + ["--profile", "support-ai", "--profile", "translations-ai", "stop", *WRITERS])
        self.backup()
        self.migration_started = True
        self.save("migrating")
        run(self.production + ["run", "--rm", "--no-deps", "-T", "--pull", "never", "migrate"])
        run(self.production + ["up", "-d", "--no-build", "--pull", "never", "api", "worker"])
        self.wait_api(self.production)
        run(self.production + ["up", "-d", "--no-build", "--pull", "never", "dashboard", "storefront"])
        self.wait_storefront()
        optional = [service for service in self.previous_running if service in WRITERS and service not in APPLICATIONS]
        if optional:
            run(self.production + ["--profile", "support-ai", "--profile", "translations-ai", "up", "-d", "--no-build", "--pull", "never", *optional])
        self.save("deployed")
        # A private pointer; subsequent recovery/inspection refers to exact IDs.
        write_json(ROOT / ".local" / "releases" / "current.json", {"id": self.id, "imagesFile": str(self.overlay), "gitCommit": self.manifest["gitCommit"]})
        print("Deployment completed; backup and recovery manifest: " + str(self.directory), flush=True)

    def wait_storefront(self):
        environment = self.config["services"]["storefront"]["environment"]
        sites = json.loads(environment.get("STOREFRONT_SITES_JSON") or "null")
        site = sites[0] if sites else None
        host = site["domains"][0] if site else "localhost"
        locale = (site or {}).get("defaultLocale") or environment.get("NEXT_PUBLIC_DEFAULT_LOCALE", "en")
        channel = (site or {}).get("defaultChannel") or environment.get("NEXT_PUBLIC_DEFAULT_CHANNEL", "us")
        script = "const r=await fetch('http://127.0.0.1:3000/" + locale + "/" + channel + "',{headers:{host:" + json.dumps(host) + "}});if(r.status!==200)process.exit(1);await r.text();"
        for _ in range(60):
            result = subprocess.run(self.production + ["exec", "-T", "storefront", "node", "--input-type=module", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT)
            if result.returncode == 0:
                return
            time.sleep(2)
        raise RuntimeError("Storefront did not become healthy")

    def cleanup(self, failed):
        if failed:
            if self.migration_started:
                self.save("failed-after-migration-started")
                subprocess.run(self.production + ["--profile", "support-ai", "--profile", "translations-ai", "stop", *WRITERS], cwd=ROOT)
                print("Migration/application failure: writers remain stopped. Follow docs/release-recovery.md; no automatic database rollback.", file=sys.stderr)
            else:
                self.save("failed-before-production-migration")
                if self.stopped and self.previous_running:
                    # Start existing containers with their exact previous config.
                    previous = BASE + ["--profile", "support-ai", "--profile", "translations-ai"]
                    subprocess.run(previous + ["start", *self.previous_running], cwd=ROOT)
        if self.stage_file.exists():
            # Only the randomly named isolated project; never remove prod volumes.
            subprocess.run(self.stage + ["down", "-v"], cwd=ROOT)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight-only", action="store_true")
    args = parser.parse_args()
    if run(["git", "status", "--porcelain", "--untracked-files=normal"], capture=True).strip():
        raise ValueError("Release requires a clean source checkout")
    lock_dir = ROOT / ".local" / "releases"
    lock_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (lock_dir / "deploy.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        release = Release(preflight_only=args.preflight_only)
        failed = True
        try:
            release.execute()
            failed = False
        finally:
            release.cleanup(failed)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        # Exception details may include environment/config or customer data.
        print("Release aborted (" + type(error).__name__ + "). Check the private manifest and recovery guide.", file=sys.stderr)
        sys.exit(1)
