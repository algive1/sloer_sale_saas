"""Snapshot compatibility and contract drift; never use customer/provider data."""
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest

from plugin_contracts import CONTRACT_PATH, check_snapshot, load_contract

ROOT = CONTRACT_PATH.parents[3]


def source_tables(contract):
    definitions = {}
    for module in [*contract["modules"].values(), *contract.get("core", {}).values()]:
        for expected in module["tables"].values():
            path = ROOT / "src" / expected["source"]
            text = path.read_text()
            for match in re.finditer(r'(?:sql:\s*|=\s*)(`\s*CREATE TABLE[^`]*`|"CREATE TABLE(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*)', text):
                literal = match[1]
                sql = literal[1:-1] if literal.startswith("`") else "".join(json.loads(x[0]) for x in re.finditer(r'("(?:[^"\\]|\\.)*")', literal))
                name = re.match(r"CREATE TABLE IF NOT EXISTS (\w+)", sql)
                if name:
                    definitions[name[1]] = sql
    return definitions


class PluginContractTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / "snapshot.sqlite"
        self.contract = load_contract()
        self.ddl = source_tables(self.contract)
        with sqlite3.connect(self.db) as db:
            for sql in self.ddl.values():
                db.execute(sql)

    def fingerprint(self):
        return hashlib.sha256(self.db.read_bytes()).hexdigest()

    def test_declarations_match_real_module_sql_and_cover_seven_modules(self):
        self.assertEqual(len(self.contract["modules"]), 7)
        self.assertEqual(len(self.ddl), 20)
        with sqlite3.connect(self.db) as db:
            for module in [*self.contract["modules"].values(), *self.contract["core"].values()]:
                for table, expected in module["tables"].items():
                    rows = db.execute('PRAGMA table_info("' + table + '")').fetchall()
                    self.assertEqual({r[1]: r[2] for r in rows}, expected["columns"])
                    self.assertEqual([r[1] for r in rows if r[3]], expected["notNull"])
                    self.assertEqual([r[1] for r in sorted(rows, key=lambda row: row[5]) if r[5]], expected["primaryKey"])

    def test_real_snapshot_checks_are_read_only_and_preserve_opaque_provider_keys(self):
        with sqlite3.connect(self.db) as db:
            db.execute("INSERT INTO storefront_theme_ai_profiles VALUES ('site','profile','Name','https://model.example','model','opaque-encrypted-key',0,'date')")
            db.execute("INSERT INTO storefront_theme_homepages VALUES ('site','us','en',?,NULL,1,0,'date')", (json.dumps({"version": 1, "data": {"content": []}}),))
        before = self.fingerprint()
        report = check_snapshot(self.db, list(self.contract["modules"]))
        self.assertEqual(before, self.fingerprint())
        self.assertEqual(len(report["modules"]["theme-builder"]["checkedTables"]), 4)
        self.assertNotIn("opaque-encrypted-key", json.dumps(report))

    def test_missing_scope_key_wrong_primary_key_and_unknown_required_column_fail(self):
        for ddl in ("CREATE TABLE ops_reminder_site_delivery(site_id TEXT,order_id TEXT PRIMARY KEY)",
                    self.ddl["ops_reminder_site_delivery"].replace("PRIMARY KEY(site_id,order_id,stage)", "PRIMARY KEY(order_id,stage)"),
                    self.ddl["ops_reminder_site_delivery"].replace("site_id TEXT NOT NULL", "site_id TEXT"),
                    self.ddl["ops_reminder_site_delivery"].replace("PRIMARY KEY(site_id,order_id,stage)", "future_required TEXT NOT NULL, PRIMARY KEY(site_id,order_id,stage)")):
            with sqlite3.connect(self.db) as db:
                db.execute("DROP TABLE ops_reminder_site_delivery")
                db.execute(ddl)
            with self.assertRaises(ValueError):
                check_snapshot(self.db, ["payment-reminders"])

    def test_optional_additive_columns_are_compatible_but_undeclared_triggers_fail(self):
        with sqlite3.connect(self.db) as db:
            db.execute("ALTER TABLE analytics_ad_deliveries ADD COLUMN future_optional TEXT")
        check_snapshot(self.db, ["ads-tracking"])
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE TRIGGER future_guard BEFORE INSERT ON analytics_ad_deliveries BEGIN SELECT RAISE(ABORT,'private data'); END")
        with self.assertRaisesRegex(ValueError, "undeclared triggers"):
            check_snapshot(self.db, ["ads-tracking"])

    def test_future_document_version_and_duplicate_event_ids_cannot_be_accepted(self):
        with sqlite3.connect(self.db) as db:
            db.execute("INSERT INTO storefront_theme_homepages VALUES ('site','us','en',?,NULL,1,0,'date')", (json.dumps({"version": 2, "data": {}}),))
        with self.assertRaisesRegex(ValueError, "document version"):
            check_snapshot(self.db, ["theme-builder"])
        with sqlite3.connect(self.db) as db:
            db.execute("DELETE FROM storefront_theme_homepages")
            for id in ("one", "two"):
                db.execute("INSERT INTO analytics_events(id,occurred_at,event_name,event_id,payload_json) VALUES (?, 'date','checkout_completed','same','{}')", (id,))
        with self.assertRaisesRegex(ValueError, "duplicate event identities"):
            check_snapshot(self.db, ["analytics"])

    def test_known_legacy_additions_are_reported_without_migrating_source(self):
        with sqlite3.connect(self.db) as db:
            db.execute("ALTER TABLE analytics_events DROP COLUMN failure_reason")
        before = self.fingerprint()
        report = check_snapshot(self.db, ["analytics"])
        self.assertIn("analytics_events.failure_reason", report["modules"]["analytics"]["runtimeAdditions"])
        self.assertEqual(before, self.fingerprint())

    def test_explicit_uninitialized_snapshot_never_proves_active_plugin_data(self):
        blank = Path(self.directory.name) / "blank.sqlite"
        with sqlite3.connect(blank) as db:
            db.execute("CREATE TABLE unrelated(value TEXT)")
        report = check_snapshot(blank, [])
        self.assertEqual(report["modules"]["analytics"]["checkedTables"], [])
        with self.assertRaisesRegex(ValueError, "Expected plugin data is absent"):
            check_snapshot(blank, ["analytics"])
        for plugins in (None, ["unknown"], ["analytics", "analytics"]):
            with self.assertRaises(ValueError):
                check_snapshot(blank, plugins)

    def test_tracking_claim_state_duplicates_and_wrong_index_fail_closed(self):
        def insert(db, id, state):
            db.execute("INSERT INTO ops_tracking_attempts VALUES (?,'site','us','actor','order','fulfillment','digest',?,'reason','date',NULL)", (id, state))
        with sqlite3.connect(self.db) as db:
            insert(db, 'one', 'future')
        with self.assertRaisesRegex(ValueError, 'unsupported tracking state'):
            check_snapshot(self.db, [])
        with sqlite3.connect(self.db) as db:
            db.execute("DELETE FROM ops_tracking_attempts")
            insert(db, 'one', 'sending'); insert(db, 'two', 'uncertain')
        with self.assertRaisesRegex(ValueError, 'duplicate active tracking claims'):
            check_snapshot(self.db, [])
        with sqlite3.connect(self.db) as db:
            db.execute("DELETE FROM ops_tracking_attempts")
            insert(db, 'one', 'sending'); insert(db, 'two', 'rejected')
        before = self.fingerprint()
        report = check_snapshot(self.db, [])
        self.assertIn('ops_tracking_active_claim', report['core']['operations']['runtimeAdditions'])
        self.assertEqual(before, self.fingerprint())
        with sqlite3.connect(self.db) as db:
            db.execute("CREATE INDEX ops_tracking_active_claim ON ops_tracking_attempts(id)")
        with self.assertRaisesRegex(ValueError, 'incompatible tracking claim index'):
            check_snapshot(self.db, [])
        with sqlite3.connect(self.db) as db:
            db.execute("DROP INDEX ops_tracking_active_claim")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS ops_tracking_active_claim ON ops_tracking_attempts(site_id,fulfillment_id) WHERE state IN ('sending','applied','uncertain')")
        report = check_snapshot(self.db, [])
        self.assertEqual(len(report['core']['operations']['checkedTables']), 3)


if __name__ == "__main__":
    unittest.main()
