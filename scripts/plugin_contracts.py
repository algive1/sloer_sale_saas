"""Read-only compatibility check of restored plugin SQLite snapshots.

This does not migrate a live provider database or prove provider/key recovery.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sqlite3

CONTRACT_PATH = Path(__file__).resolve().parent.parent / "storefront/src/plugins/system/storage-contracts.json"


def load_contract(path=CONTRACT_PATH):
    contract = json.loads(Path(path).read_text())
    if isinstance(contract.get("contractVersion"), bool) or contract.get("contractVersion") != 1:
        raise ValueError("Unsupported plugin storage contract")
    return contract


def quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def check_snapshot(source, expected_plugins):
    contract = load_contract()
    modules = contract["modules"]
    if not isinstance(expected_plugins, list) or any(not isinstance(p, str) or p not in modules for p in expected_plugins) or len(set(expected_plugins)) != len(expected_plugins):
        raise ValueError("SQLite receipt requires unique known plugin IDs (empty list explicitly means no plugin data expected)")
    reports = {}
    with sqlite3.connect(Path(source).resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for module_id, module in modules.items():
            checked, absent, additions = [], [], []
            for table, expected in module["tables"].items():
                if table not in tables:
                    absent.append(table)
                    continue
                columns = {row[1]: row for row in db.execute("PRAGMA table_info(" + quote_identifier(table) + ")")}
                legacy = contract["legacyAdditions"].get(table, {})
                for column, data_type in expected["columns"].items():
                    actual = columns.get(column)
                    if actual is None:
                        if legacy.get(column) == data_type:
                            additions.append(table + "." + column)
                            continue
                        raise ValueError("Plugin snapshot missing required column: " + table + "." + column)
                    if actual[2].upper() != data_type:
                        raise ValueError("Plugin snapshot incompatible column type: " + table + "." + column)
                for column in expected["notNull"]:
                    if column in columns and not columns[column][3]:
                        raise ValueError("Plugin snapshot lost a NOT NULL constraint: " + table + "." + column)
                actual_pk = [row[1] for row in sorted(columns.values(), key=lambda row: row[5]) if row[5]]
                if actual_pk != expected["primaryKey"]:
                    raise ValueError("Plugin snapshot incompatible primary key: " + table)
                for name, row in columns.items():
                    if name not in expected["columns"] and row[3] and row[4] is None:
                        raise ValueError("Plugin snapshot has an unknown mandatory insert column: " + table + "." + name)
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name=? LIMIT 1", (table,)).fetchone():
                    raise ValueError("Plugin snapshot contains undeclared triggers: " + table)
                if table.startswith("storefront_theme_"):
                    for column in ("draft_json", "published_json", "data_json"):
                        if column not in columns:
                            continue
                        for row in db.execute("SELECT " + quote_identifier(column) + " FROM " + quote_identifier(table) + " WHERE " + quote_identifier(column) + " IS NOT NULL"):
                            raw = row[0]
                            if not isinstance(raw, str) or len(raw) > 131072:
                                raise ValueError("Unsupported theme document envelope: " + table)
                            try:
                                doc = json.loads(raw)
                            except (ValueError, TypeError):
                                raise ValueError("Invalid theme document envelope: " + table) from None
                            if not isinstance(doc, dict) or (isinstance(doc.get("version"), bool) or doc.get("version") != 1) or not isinstance(doc.get("data"), dict):
                                raise ValueError("Unsupported theme document version: " + table)
                if table == "analytics_events" and db.execute("SELECT 1 FROM analytics_events WHERE event_id IS NOT NULL GROUP BY event_name,event_id HAVING COUNT(*) > 1 LIMIT 1").fetchone():
                    raise ValueError("Plugin snapshot has duplicate event identities; runtime unique index would fail")
                if table == "ops_translation_items":
                    allowed = ("queued", "processing", "draft", "approved", "rejected", "failed", "publishing", "published", "needs_reconciliation")
                    if db.execute("SELECT 1 FROM ops_translation_items WHERE status NOT IN (" + ",".join("?" for _ in allowed) + ") LIMIT 1", allowed).fetchone():
                        raise ValueError("Plugin snapshot contains unsupported translation state")
                checked.append(table)
            if module_id in expected_plugins and module["tables"] and not checked:
                raise ValueError("Expected plugin data is absent from snapshot: " + module_id)
            reports[module_id] = {"apiVersion": module["apiVersion"], "storageContractVersion": module["storageContractVersion"],
                                  "checkedTables": checked, "uninitializedTables": absent, "runtimeAdditions": additions}
    return {"contractVersion": contract["contractVersion"], "contractSha256": hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest(),
            "expectedPlugins": expected_plugins, "modules": reports}
