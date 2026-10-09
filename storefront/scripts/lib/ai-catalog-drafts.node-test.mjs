import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SALEOR_LANGUAGE_CODES, approvedFixture, digest, getBrandForSource,
  reconcileDraftItems, sourceEntries, translateEntry, validateDraftIdentity,
  validateModelTranslation,
} from "./ai-catalog-drafts.mjs";

const catalog = () => ({
  channel: "fashion-eu",
  categories: { clothing: { name: "Clothing", description: "Shop now" } },
  collections: {},
  products: { "linen-shirt": { name: "Linen Shirt", seoDescription: "Organic cotton", category: "clothing" } },
});

test("snapshot selects and hashes bounded, known catalog entities", () => {
  const s = sourceEntries(catalog(), { maxItems: 2 });
  assert.deepEqual(s.map((v) => v.kind + "/" + v.slug), ["categories/clothing", "products/linen-shirt"]);
  assert.equal(s[1].source.category, undefined);
  assert.equal(s[1].sourceHash, digest({ kind: s[1].kind, slug: s[1].slug, source: s[1].source }));
  assert.throws(() => sourceEntries(catalog(), { maxItems: 1000 }), /maxItems/);
  assert.throws(() => sourceEntries({ ...catalog(), channel: "fr/evil" }), /channel/);
});

test("prevents cross-brand source reuse in a shared Saleor instance", () => {
  const sites = JSON.stringify([
    { id: "fashion", channels: ["fashion-eu"] },
    { id: "jewelry", channels: ["jewelry-eu"] },
  ]);
  assert.equal(getBrandForSource(sites, "fashion-eu", "fashion"), "fashion");
  assert.throws(() => getBrandForSource(sites, "fashion-eu", "jewelry"), /not exclusively/);
  assert.throws(() => getBrandForSource(sites, "unknown", "fashion"), /not exclusively/);
  assert.throws(() => getBrandForSource(sites, "fashion-eu", "../../prod"), /Invalid site/);
});

test("validates model JSON field parity and protected placeholders", () => {
  const source = { name: "Hello {firstName}", description: "Total: %s, {{currency}}" };
  assert.deepEqual(validateModelTranslation(source, {
    name: "Hallo {firstName}", description: "Gesamt: %s, {{currency}}",
  }), { name: "Hallo {firstName}", description: "Gesamt: %s, {{currency}}" });
  assert.throws(() => validateModelTranslation(source, {
    name: "Hallo", description: "Gesamt: %s, {{currency}}",
  }), /placeholders/);
  assert.throws(() => validateModelTranslation(source, {
    name: "<script>bad</script>", description: "Gesamt: %s, {{currency}}",
  }), /HTML/);
  assert.throws(() => validateModelTranslation(source, {
    name: "Hallo {firstName}", description: "Gesamt: %s, {{currency}}", slug: "injected",
  }), /fields differ/);
});

test("regeneration retains human-approved drafts, but stale approved entries block", () => {
  const [entry] = sourceEntries(catalog(), { maxItems: 1 });
  const saved = { ...entry, status: "approved", translation: { name: "Bekleidung", description: "Jetzt shoppen" } };
  assert.deepEqual(reconcileDraftItems([saved], [entry]), [saved]);
  assert.throws(() => reconcileDraftItems([saved], [{ ...entry, sourceHash: "changed" }]), /stale source/);
  assert.equal(reconcileDraftItems([], [entry])[0].status, "pending");
  assert.throws(() => reconcileDraftItems([saved], []), /outside this batch/);
});

test("validates site, locale, channel and glossary before reusing a draft", () => {
  const identity = { locale: "de", siteId: "fashion", channel: "fashion-eu", glossaryHash: digest({}) };
  const file = { schemaVersion: 1, locale: "de", siteId: "fashion", sourceChannel: "fashion-eu",
    glossaryHash: digest({}), items: [] };
  assert.doesNotThrow(() => validateDraftIdentity(file, identity));
  assert.throws(() => validateDraftIdentity(file, { ...identity, siteId: "jewelry" }), /identity/);
  assert.throws(() => validateDraftIdentity(file, { ...identity, glossaryHash: "changed" }), /glossary/);
});

test("exports only human-approved and current-source translations to existing Saleor fixture shape", () => {
  const sources = sourceEntries(catalog(), { maxItems: 2 });
  const items = sources.map((entry, index) => ({
    ...entry,
    status: index === 0 ? "approved" : "draft",
    translation: index === 0 ? { name: "Bekleidung", description: "Jetzt shoppen" } : { name: "Leinenhemd", seoDescription: "Bio-Baumwolle" },
  }));
  const fixture = approvedFixture({ schemaVersion: 1, locale: "de", sourceChannel: "fashion-eu", items }, catalog());
  assert.deepEqual(fixture, { languageCode: "DE", categories: { clothing: {
    name: "Bekleidung", description: "Jetzt shoppen",
  } }, collections: {}, products: {} });
  assert.throws(() => approvedFixture({ schemaVersion: 1, locale: "de", sourceChannel: "different", items }, catalog()), /channel/);
  assert.throws(() => approvedFixture({ schemaVersion: 1, locale: "de", sourceChannel: "fashion-eu", items: items.map(i=>({...i,status:"draft"})) }, catalog()), /No approved/);
  assert.equal(SALEOR_LANGUAGE_CODES.en, undefined);
});

test("rejects stale source at export even if marked approved", () => {
  const original = catalog(), [entry] = sourceEntries(original, { maxItems: 1 });
  const changed = catalog();
  changed.categories.clothing.name = "New English name";
  assert.throws(() => approvedFixture({ schemaVersion: 1, locale: "de", sourceChannel: "fashion-eu",
    items: [{ ...entry, status: "approved", translation: { name: "Bekleidung", description: "Jetzt shoppen" } }],
  }, changed), /stale/);
});

test("AI calls are HTTPS-only, validate output, and do not talk to Saleor", async () => {
  const [entry] = sourceEntries(catalog(), { maxItems: 1 });
  let sent;
  const fetchFn = async (url, request) => {
    sent = { url, request };
    return { ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ name: "Bekleidung", description: "Jetzt shoppen" }),
    } }] }) };
  };
  const out = await translateEntry({
    entry, locale: "de", glossary: { Linen: "Leinen" },
    baseUrl: "https://models.example.test/v1", apiKey: "secret", model: "mock", fetchFn,
  });
  assert.deepEqual(out, { name: "Bekleidung", description: "Jetzt shoppen" });
  assert.equal(sent.url, "https://models.example.test/v1/chat/completions");
  assert.equal(JSON.parse(sent.request.body).messages[1].role, "user");
  assert.throws(() => new URL("not-a-url"), /Invalid URL/);
  await assert.rejects(() => translateEntry({
    entry, locale: "de", glossary: {}, baseUrl: "http://untrusted.test/v1",
    apiKey: "secret", model: "mock", fetchFn,
  }), /HTTPS/);
});
