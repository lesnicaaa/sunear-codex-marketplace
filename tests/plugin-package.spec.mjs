import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins/sunear-designer");

test("plugin owns the complete clean-host workflow", async () => {
  const manifest = JSON.parse(await readFile(path.join(plugin, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.version, "0.6.0+codex.20260908043637");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");

  const mcp = JSON.parse(await readFile(path.join(plugin, ".mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers.sunear.oauth_resource, mcp.mcpServers.sunear.url);

  const hooks = JSON.parse(await readFile(path.join(plugin, "hooks/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks.hooks), ["SessionStart"]);
  const startup = hooks.hooks.SessionStart[0].hooks[0];
  assert.match(startup.command, /sunear-codex-receiver-launch\.sh/);
  assert.match(startup.commandWindows, /sunear-codex-receiver-launch\.ps1/);
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume|clear|compact");

  const receiverCore = await readFile(
    path.join(plugin, "scripts/lib/sunear-codex-receiver-core.mjs"),
    "utf8",
  );
  assert.match(receiverCore, /RECEIVER_VERSION = "0\.8\.0"/);

  const receiverSupervisor = await readFile(
    path.join(plugin, "scripts/sunear-codex-receiver-supervisor.mjs"),
    "utf8",
  );
  assert.match(receiverSupervisor, /receiverRuntimeMatches/);
  assert.match(receiverSupervisor, /pluginSource === pluginIdentity\.pluginSource/);
  assert.match(receiverSupervisor, /Google Chrome/);

  const appServerClient = await readFile(
    path.join(plugin, "scripts/lib/codex-app-server-client.mjs"),
    "utf8",
  );
  assert.match(appServerClient, /ChatGPT\.app\/Contents\/Resources\/codex/);

  const receiver = await readFile(path.join(plugin, "scripts/lib/sunear-codex-receiver.mjs"), "utf8");
  assert.match(receiver, /mcpServer\/oauth\/login/);

  const receiverIdentity = await readFile(
    path.join(plugin, "scripts/lib/sunear-codex-receiver-identity.mjs"),
    "utf8",
  );
  assert.match(receiverIdentity, /sunear-designer\/receiver/);
  assert.match(receiverIdentity, /plugins\/cache/);

  const posixLauncher = await readFile(path.join(plugin, "scripts/sunear-codex-receiver-launch.sh"), "utf8");
  assert.match(posixLauncher, /release_tag="v0\.1\.13"/);
  assert.match(posixLauncher, /Darwin:arm64/);
  assert.doesNotMatch(posixLauncher, /Darwin:x86_64/);
  assert.doesNotMatch(posixLauncher, /Linux:/);
  assert.match(posixLauncher, /expected_sha256="[a-f0-9]{64}"/);
  assert.match(posixLauncher, /SUNEAR_RECEIVER_ARCHIVE_CHECKSUM_MISMATCH/);
  const windowsLauncher = await readFile(path.join(plugin, "scripts/sunear-codex-receiver-launch.ps1"), "utf8");
  assert.match(windowsLauncher, /PROCESSOR_ARCHITECTURE -ne "AMD64"/);
  assert.match(windowsLauncher, /releases\/download\/v0\.1\.13/);
  assert.match(windowsLauncher, /sunear-codex-receiver-0\.8\.0\.exe/);
  assert.match(windowsLauncher, /Get-FileHash/);
  await assert.rejects(stat(path.join(plugin, "bin")), { code: "ENOENT" });

  for (const relativePath of [
    "skills/sunear-create-design-from-pdf/SKILL.md",
    "skills/sunear-create-quote-from-project/SKILL.md",
    "scripts/sunear-codex-receiver-launch.sh",
    "scripts/sunear-codex-receiver-launch.ps1",
  ]) await access(path.join(plugin, relativePath));

  for (const relativePath of [
    "skills/sunear-create-design-from-pdf/SKILL.md",
    "skills/sunear-create-quote-from-project/SKILL.md",
  ]) {
    const contents = await readFile(path.join(plugin, relativePath), "utf8");
    assert.match(contents, /sunear\.agent-connection\/6/);
    assert.match(contents, /Codex Desktop, initiate OAuth only through the host-managed plugin or MCP authentication surface/);
    assert.match(contents, /never run `codex mcp login sunear` from the task shell or sandbox/);
    assert.match(contents, /connected user Chrome profile/);
    assert.match(contents, /never silently use Codex's isolated in-app browser/);
    assert.match(contents, /present the exact URL as a clickable link and state that it has not opened/);
    assert.match(contents, /credential_persistence_failed/);
    assert.match(contents, /supported file credential store only after explicitly explaining its weaker local-storage boundary/);
    assert.match(contents, /Use Chinese for every user-visible progress update/);
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
