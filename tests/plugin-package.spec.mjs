import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins/sunear-designer");

test("plugin owns the complete clean-host workflow", async () => {
  const manifest = JSON.parse(await readFile(path.join(plugin, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");

  const mcp = JSON.parse(await readFile(path.join(plugin, ".mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers.sunear.oauth_resource, mcp.mcpServers.sunear.url);

  const hooks = JSON.parse(await readFile(path.join(plugin, "hooks/hooks.json"), "utf8"));
  const startup = hooks.hooks.SessionStart[0].hooks[0];
  assert.match(startup.command, /sunear-codex-receiver-launch\.sh/);
  assert.match(startup.commandWindows, /sunear-codex-receiver-launch\.ps1/);
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume|clear|compact");

  const receiverCore = await readFile(
    path.join(plugin, "scripts/lib/sunear-codex-receiver-core.mjs"),
    "utf8",
  );
  assert.match(receiverCore, /RECEIVER_VERSION = "0\.7\.0"/);

  const receiverIdentity = await readFile(
    path.join(plugin, "scripts/lib/sunear-codex-receiver-identity.mjs"),
    "utf8",
  );
  assert.match(receiverIdentity, /sunear-designer\/receiver/);
  assert.match(receiverIdentity, /plugins\/cache/);

  for (const relativePath of [
    "skills/sunear-create-design-from-pdf/SKILL.md",
    "skills/sunear-create-quote-from-project/SKILL.md",
    "scripts/sunear-codex-receiver-launch.sh",
    "scripts/sunear-codex-receiver-launch.ps1",
    "bin/sunear-codex-receiver-darwin-arm64.gz",
    "bin/sunear-codex-receiver-darwin-x64.gz",
    "bin/sunear-codex-receiver-linux-arm64.gz",
    "bin/sunear-codex-receiver-linux-x64.gz",
    "bin/sunear-codex-receiver-windows-x64.exe.gz",
  ]) await access(path.join(plugin, relativePath));

  for (const relativePath of [
    "skills/sunear-create-design-from-pdf/SKILL.md",
    "skills/sunear-create-quote-from-project/SKILL.md",
  ]) {
    const contents = await readFile(path.join(plugin, relativePath), "utf8");
    assert.match(contents, /sunear\.agent-connection\/4/);
    assert.match(contents, /Use Chinese for every user-visible progress update/);
  }
});
