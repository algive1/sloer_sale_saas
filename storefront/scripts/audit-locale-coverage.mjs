#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Audits UI JSON only. Saleor catalog, Puck content and merchant policy
// translations need separate review before a language can be called launch-ready.
const MESSAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../messages");
const VALID_SLUG = /^[a-z]{2}$/;

export function flattenMessages(value, prefix = "", output = {}) {
  if (typeof value === "string") {
    output[prefix] = value;
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenMessages(child, prefix ? prefix + "." + key : key, output);
    }
  }
  return output;
}

export function evaluateCoverage(english, translated) {
  const source = flattenMessages(english);
  const target = flattenMessages(translated);
  const keys = Object.keys(source);
  const missing = keys.filter((key) => !target[key]?.trim());
  // Advisory only: technical terms, URLs and product names may be identical.
  const unchanged = keys.filter((key) =>
    Boolean(target[key]) && source[key] === target[key] && /[A-Za-z]{3}/.test(source[key]));
  const extra = Object.keys(target).filter((key) => !(key in source));
  return { referenceFields: keys.length, presentFields: keys.length - missing.length, missing, unchanged, extra };
}

export function selectLocales({ configured, all, available }) {
  const choices = all ? available : (configured?.trim() ? configured.split(",") : ["en"]);
  const selected = [...new Set(choices.map((slug) => slug.trim().toLowerCase()).filter(Boolean))];
  for (const slug of selected) {
    if (!VALID_SLUG.test(slug)) throw new Error("Invalid locale slug: " + slug);
  }
  return selected;
}

export function auditMessageDirectory(dir, requested) {
  const english = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
  return requested.map((locale) => {
    if (!VALID_SLUG.test(locale)) throw new Error("Invalid locale slug: " + locale);
    let localized;
    try {
      localized = JSON.parse(readFileSync(join(dir, locale + ".json"), "utf8"));
    } catch (error) {
      throw new Error("Missing or invalid messages for " + locale + ": " + String(error));
    }
    const result = evaluateCoverage(english, localized);
    return { locale, ...result, missingCount: result.missing.length, unchangedCount: result.unchanged.length };
  });
}

function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (!["--all", "--fail-incomplete", "--json"].includes(arg)) throw new Error("Unknown flag: " + arg);
  }
  const available = readdirSync(MESSAGES_DIR)
    .filter((filename) => /^[a-z]{2}\.json$/.test(filename))
    .map((filename) => filename.slice(0, -5)).sort();
  const locales = selectLocales({
    configured: process.env.NEXT_PUBLIC_STOREFRONT_LOCALES,
    all: args.has("--all"),
    available,
  });
  const rows = auditMessageDirectory(MESSAGES_DIR, locales);
  const incomplete = rows.filter((row) => row.missingCount > 0);
  if (args.has("--json")) {
    process.stdout.write(JSON.stringify({ locales: rows, incomplete: incomplete.map((row) => row.locale) }, null, 2) + "\n");
  } else {
    for (const row of rows) {
      console.log(row.locale + ": " + row.presentFields + "/" + row.referenceFields +
        " fields; " + row.missingCount + " missing; " + row.unchangedCount + " English-equal candidates");
      if (row.missingCount) console.log("  Missing samples: " + row.missing.slice(0, 8).join(", "));
    }
  }
  if (args.has("--fail-incomplete") && incomplete.length) {
    console.error("Enabled locale catalogs incomplete: " + incomplete.map((row) => row.locale).join(", "));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error("[locale:coverage] " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
