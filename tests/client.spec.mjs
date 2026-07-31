import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugins/sunear-designer-stage");
const stageMcpUrl = "https://www.stage.sunearbuild.com/api/mcp";

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(pluginRoot, relativePath), "utf8"));
}

test("Stage plugin uses one fixed OAuth-protected MCP endpoint", async () => {
  const mcp = await readJson(".mcp.json");
  assert.deepEqual(mcp, {
    mcpServers: {
      "sunear-stage": {
        type: "http",
        url: stageMcpUrl,
        oauth_resource: stageMcpUrl,
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(mcp), /sunearbuild\.com\/api\/agent|localhost|127\.0\.0\.1/);
});

test("Stage manifest discovers only its Stage skill and MCP companion", async () => {
  const manifest = await readJson(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "sunear-designer-stage");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.match(manifest.interface.shortDescription, /Internal testing only/);
});

test("Stage workflow requires OAuth and forbids production fallback", async () => {
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.match(skill, /Use only the bundled `sunear-stage` MCP connection/);
  assert.match(skill, /Never substitute the production Sunear connection/);
  assert.match(skill, /Complete authentication through the OAuth sign-in flow/);
  assert.match(skill, /Never claim that the page opened unless its browser or callback state was observed/);
  assert.match(skill, /Compute the source file SHA-256 before visual work/);
  assert.match(skill, /Do not re-render or re-read completed pages/);
  assert.doesNotMatch(skill, /SUNEAR_AGENT_API_KEY|SUNEAR_AGENT_BASE_URL/);
});

test("Stage plugin contains no executable API-key client", async () => {
  const manifest = await readFile(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8");
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.doesNotMatch(`${manifest}\n${skill}`, /Bearer authentication|administrator-issued key|organization key/i);
});
