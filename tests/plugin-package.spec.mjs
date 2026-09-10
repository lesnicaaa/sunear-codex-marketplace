import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins/sunear-designer");

test("plugin owns the complete clean-host workflow", async () => {
  const manifest = JSON.parse(await readFile(path.join(plugin, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.version, "0.7.0+codex.20260910103000");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");

  const mcp = JSON.parse(await readFile(path.join(plugin, ".mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers.sunear.oauth_resource, mcp.mcpServers.sunear.url);

  for (const directory of ["hooks", "scripts", "bin"]) {
    await assert.rejects(stat(path.join(plugin, directory)), { code: "ENOENT" });
  }
  for (const name of ["sunear-create-design-from-pdf", "sunear-create-quote-from-project"]) {
    const contents = await readFile(path.join(plugin, "skills", name, "SKILL.md"), "utf8");
    assert.match(contents, /sunear.agent-connection\/7/);
    assert.match(contents, /host-managed/);
    assert.match(contents, /explicit user consent/);
    assert.doesNotMatch(contents, /cache-image|SessionStart|pageLocalAssetKeys|productLocalAssetKeys/);
  }
  const designSkill = await readFile(path.join(plugin, "skills/sunear-create-design-from-pdf/SKILL.md"), "utf8");
  assert.match(designSkill, /audit_project_design/);
  assert.match(designSkill, /source_vs_engine_bidirectional/);
  assert.match(designSkill, /save_project_interpretation/);
  assert.match(designSkill, /only the user does that on the project interpretation page/);

  const quoteSkill = await readFile(path.join(plugin, "skills/sunear-create-quote-from-project/SKILL.md"), "utf8");
  assert.match(quoteSkill, /current design-audit, market, pricing, climate, local-preference, and foreign-trade evidence/);
  assert.match(quoteSkill, /accepted requirements are inputs for later explicit normal project commands/);
});
