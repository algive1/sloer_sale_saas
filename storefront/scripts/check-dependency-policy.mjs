// Keep security overrides consistent for both the project's pinned pnpm 10
// (package.json#pnpm.overrides) and pnpm 11 (pnpm-workspace.yaml).
// pnpm's frozen install only catches differences for the executing major.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = (name) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const readYAML = (name) => parse(readFileSync(resolve(root, name), "utf8"));

const manifest = readJSON("package.json");
const rootManifest = readJSON("../package.json");
const workspace = readYAML("pnpm-workspace.yaml");
const lockfile = readYAML("pnpm-lock.yaml");

assert.equal(manifest.packageManager, "pnpm@10.28.1", "Unexpected storefront pnpm version");
assert.equal(rootManifest.packageManager, manifest.packageManager, "Root/storefront pnpm mismatch");
assert.ok(manifest.pnpm?.overrides, "pnpm 10 safety overrides missing");
assert.ok(workspace.overrides, "pnpm 11 safety overrides missing");
assert.deepEqual(manifest.pnpm.overrides, workspace.overrides, "pnpm 10/11 safety overrides diverged");
assert.deepEqual(workspace.overrides, lockfile.overrides, "Lockfile safety overrides diverged");

assert.equal(workspace.trustPolicy, "no-downgrade", "Package provenance downgrade guard disabled");
assert.equal(workspace.blockExoticSubdeps, true, "Exotic subdependencies must remain blocked");
assert.equal(workspace.minimumReleaseAge, 1440, "Minimum package release age unexpectedly changed");
for (const dependency of workspace.ignoredBuiltDependencies ?? []) {
  assert.equal(
    workspace.allowBuilds?.[dependency],
    false,
    `Native fallback script policy diverged for ${dependency}`,
  );
}

console.log("Dependency policy consistent across pnpm 10, pnpm 11 and frozen lockfile.");
