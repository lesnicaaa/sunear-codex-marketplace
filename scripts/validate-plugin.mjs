import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = "plugins/sunear-designer-stage";
const stageMcpUrl = "https://www.stage.sunearbuild.com/api/mcp";

async function readJson(relativePath) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  return JSON.parse(contents);
}

const marketplace = await readJson(".agents/plugins/marketplace.json");
const plugin = await readJson(`${pluginRoot}/.codex-plugin/plugin.json`);
const mcp = await readJson(`${pluginRoot}/.mcp.json`);

assert.equal(marketplace.name, "sunear-stage");
assert.equal(plugin.name, "sunear-designer-stage");
assert.equal(plugin.version, "0.1.0");
assert.match(plugin.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
assert.equal(plugin.mcpServers, "./.mcp.json");
assert.equal(plugin.skills, "./skills/");

const entry = marketplace.plugins?.find(({ name }) => name === "sunear-designer-stage");
assert.ok(entry, "marketplace must list sunear-designer-stage");
assert.equal(entry.source?.source, "local");
assert.equal(entry.source?.path, "./plugins/sunear-designer-stage");
assert.equal(entry.policy?.installation, "AVAILABLE");
assert.equal(entry.policy?.authentication, "ON_INSTALL");
assert.equal(entry.category, "Productivity");
assert.equal(marketplace.plugins.length, 1, "Stage marketplace must contain only the Stage plugin");

assert.deepEqual(Object.keys(mcp.mcpServers ?? {}), ["sunear-stage"]);
assert.deepEqual(mcp.mcpServers["sunear-stage"], {
  type: "http",
  url: stageMcpUrl,
  oauth_resource: stageMcpUrl,
});

const skill = await readFile(path.join(root, pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
assert.match(skill, /^name: create-sunear-stage-design-from-pdf$/m);
assert.match(skill, /Complete authentication through the OAuth sign-in flow\./);
assert.doesNotMatch(skill, /SUNEAR_AGENT_API_KEY|API key issued/i);

for (const document of ["README.md", "LICENSE", "SECURITY.md", "PRIVACY.md"]) {
  const contents = await readFile(path.join(root, document), "utf8");
  assert.ok(contents.trim(), `${document} must not be empty`);
}

console.log("Stage plugin manifest, OAuth MCP configuration, and public documents are valid.");
