import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditMessageDirectory, evaluateCoverage, flattenMessages, selectLocales } from "./audit-locale-coverage.mjs";

test("nested UI translations flatten into dot paths", () => {
  assert.deepEqual(flattenMessages({ cart: { title: "Cart", actions: { pay: "Pay {total}" } } }), {
    "cart.title": "Cart", "cart.actions.pay": "Pay {total}",
  });
});

test("empty strings count missing; identical English only advisory", () => {
  const result = evaluateCoverage(
    { nav: { title: "Store", back: "Go back", keep: "SKU" } },
    { nav: { title: "Shop", back: "  ", keep: "SKU", unexpected: "Extra" } },
  );
  assert.deepEqual(result.missing, ["nav.back"]);
  assert.deepEqual(result.unchanged, ["nav.keep"]);
  assert.deepEqual(result.extra, ["nav.unexpected"]);
  assert.equal(result.presentFields, 2);
});

test("only explicitly enabled languages are hard-gated", () => {
  const dir = mkdtempSync(join(tmpdir(), "locale-audit-"));
  try {
    writeFileSync(join(dir, "en.json"), JSON.stringify({ nav: { title: "Store", cart: "Cart" } }));
    writeFileSync(join(dir, "de.json"), JSON.stringify({ nav: { title: "Shop", cart: "Warenkorb" } }));
    writeFileSync(join(dir, "fr.json"), JSON.stringify({ nav: { title: "Boutique" } }));
    const selected = selectLocales({ configured: "de,en,de", all: false, available: ["en", "de", "fr"] });
    assert.deepEqual(selected, ["de", "en"]);
    assert.deepEqual(auditMessageDirectory(dir, selected).map((row) => row.missingCount), [0, 0]);
    assert.deepEqual(auditMessageDirectory(dir, ["fr"])[0].missing, ["nav.cart"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("reject invalid locale paths and missing locale files", () => {
  assert.throws(
    () => selectLocales({ configured: "../secrets", all: false, available: ["en"] }),
    /Invalid locale slug/,
  );
  const dir = mkdtempSync(join(tmpdir(), "locale-bad-"));
  try {
    writeFileSync(join(dir, "en.json"), "{}");
    assert.throws(() => auditMessageDirectory(dir, ["de"]), /Missing or invalid messages/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
