import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  return JSON.parse(contents);
}

const marketplace = await readJson(".agents/plugins/marketplace.json");
const plugin = await readJson("plugins/sunear-designer/.codex-plugin/plugin.json");

assert.equal(marketplace.name, "sunear");
assert.equal(plugin.name, "sunear-designer");
assert.equal(plugin.version, "0.1.0");
assert.match(plugin.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);

const entry = marketplace.plugins?.find(({ name }) => name === "sunear-designer");
assert.ok(entry, "marketplace must list sunear-designer");
assert.equal(entry.source?.source, "local");
assert.equal(entry.source?.path, "./plugins/sunear-designer");
assert.equal(entry.policy?.installation, "AVAILABLE");
assert.equal(entry.policy?.authentication, "ON_INSTALL");
assert.equal(entry.category, "Productivity");

for (const document of ["README.md", "LICENSE", "SECURITY.md", "PRIVACY.md"]) {
  const contents = await readFile(path.join(root, document), "utf8");
  assert.ok(contents.trim(), `${document} must not be empty`);
}

console.log("Plugin manifest and public documents are valid.");
