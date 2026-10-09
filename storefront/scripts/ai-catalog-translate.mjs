#!/usr/bin/env node
/**
 * Operator-only offline AI catalog draft workflow. NEVER imported into shopper
 * pages. It sends merchant catalog copy to a configured AI API only on explicit
 * --generate; neither that mode nor --export-approved calls Saleor mutations.
 */
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import {
  CATALOG_LOCALES_DIR, CATALOG_SOURCE_FILE, loadEnvFromArgs,
} from "./lib/catalog-translations.mjs";
import {
  SALEOR_LANGUAGE_CODES, approvedFixture, digest, getBrandForSource,
  reconcileDraftItems, sourceEntries, translateEntry, validateDraftIdentity,
} from "./lib/ai-catalog-drafts.mjs";

function flagValue(name, args) {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1] ?? null;
}

function safeWrite(path, contents) {
  const temp = path + ".tmp";
  writeFileSync(temp, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--generate") ? "generate"
    : args.includes("--export-approved") ? "export" : "plan";
  if (args.includes("--generate") && args.includes("--export-approved")) {
    throw new Error("Choose --generate OR --export-approved");
  }
  for (const arg of args) {
    if (arg.startsWith("--") && !["--", "--generate", "--export-approved", "--locale",
      "--site", "--max-items", "--glossary", "--env", "--acknowledge-global-saleor-translations"].includes(arg)) {
      throw new Error("Unknown flag: " + arg);
    }
  }
  loadEnvFromArgs(args);
  const locale = flagValue("--locale", args);
  if (!SALEOR_LANGUAGE_CODES[locale]) throw new Error("Choose --locale from supported non-English languages");
  const siteId = flagValue("--site", args) ?? process.env.STOREFRONT_SITE_ID ?? "primary";
  const maxRaw = flagValue("--max-items", args) ?? "10";
  if (!/^[0-9]{1,3}$/.test(maxRaw)) throw new Error("Invalid --max-items");
  const maxItems = Number(maxRaw);
  const source = JSON.parse(readFileSync(CATALOG_SOURCE_FILE, "utf8"));
  getBrandForSource(process.env.STOREFRONT_SITES_JSON, source.channel, siteId);

  let glossary = {};
  const glossaryPath = flagValue("--glossary", args);
  if (glossaryPath) {
    glossary = JSON.parse(readFileSync(glossaryPath, "utf8"));
    if (!glossary || Array.isArray(glossary) || typeof glossary !== "object") {
      throw new Error("Glossary must be an object with approved brand terms");
    }
    if (JSON.stringify(glossary).length > 16000) throw new Error("Oversized glossary");
  }
  const glossaryHash = digest(glossary);
  const sources = sourceEntries(source, { maxItems });
  const draftPath = join(CATALOG_LOCALES_DIR, "ai-draft." + locale + "." + siteId + ".json");
  const existing = existsSync(draftPath) ? JSON.parse(readFileSync(draftPath, "utf8")) : null;
  if (existing) validateDraftIdentity(existing, { locale, siteId, channel: source.channel, glossaryHash });

  if (mode === "export") {
    // Saleor's translation rows are product-global, even when channels are
    // brand-exclusive. The operator must inspect overlapping product catalogs.
    const sites = process.env.STOREFRONT_SITES_JSON?.trim()
      ? JSON.parse(process.env.STOREFRONT_SITES_JSON) : [];
    if (Array.isArray(sites) && sites.length > 1 &&
        !args.includes("--acknowledge-global-saleor-translations")) {
      throw new Error("Shared Saleor product translations affect multiple brands. " +
        "Review catalog overlaps, then pass --acknowledge-global-saleor-translations to export.");
    }
    if (!existing) throw new Error("No AI draft. Generate and review one first.");
    const fixture = approvedFixture(existing, source);
    const exportPath = join(CATALOG_LOCALES_DIR, locale + ".ai-approved." + siteId + ".yaml");
    if (existsSync(exportPath)) throw new Error("Approved fixture exists. Resolve duplicates manually before exporting.");
    safeWrite(exportPath, stringify(fixture));
    console.log("[AI drafts] Wrote reviewed Saleor fixture: " + exportPath);
    console.log("[AI drafts] Next: pnpm catalog:translations:plan; deploy is separate and create-only");
    return;
  }

  const items = reconcileDraftItems(existing?.items, sources);
  const pending = items.filter((item) => item.status === "pending");
  console.log("[AI drafts] Site " + siteId + " / channel " + source.channel + " / " + locale +
    ": " + items.length + " entities, " + pending.length + " pending, " +
    items.filter((item) => item.status === "approved").length + " approved");
  if (mode === "plan") {
    console.log("[AI drafts] Plan only: add --generate to send merchant copy to configured AI provider");
    return;
  }

  const baseUrl = process.env.TRANSLATION_AI_BASE_URL?.trim();
  const apiKey = process.env.TRANSLATION_AI_API_KEY?.trim();
  const model = process.env.TRANSLATION_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) throw new Error("Set TRANSLATION_AI_BASE_URL/API_KEY/MODEL to generate");
  mkdirSync(CATALOG_LOCALES_DIR, { recursive: true, mode: 0o700 });
  const draft = {
    schemaVersion: 1, locale, siteId, sourceChannel: source.channel,
    glossaryHash, model, generatedAt: new Date().toISOString(), items,
  };
  const persist = () => safeWrite(draftPath, JSON.stringify(draft, null, 2) + "\n");
  persist();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.status !== "pending") continue;
    // Serial, bounded operator batch: no per-page AI calls and no unbounded fan-out.
    let translation;
    for (let attempt = 0; ; attempt++) {
      try {
        translation = await translateEntry({ entry: item, locale, glossary, baseUrl, apiKey, model });
        break;
      } catch (error) {
        if (attempt >= 2 || !/HTTP (429|5\d\d)/.test(String(error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
      }
    }
    items[index] = { ...item, translation, status: "draft" };
    persist();
    console.log("[AI drafts] Prepared " + (index + 1) + "/" + items.length + " " + item.kind);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  console.log("[AI drafts] Review " + draftPath + ": adjust translation and set approved items' status to approved");
  console.log("[AI drafts] Export ONLY approved items with --export-approved (never deploys automatically)");
}

main().catch((error) => {
  console.error("[AI drafts] " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
