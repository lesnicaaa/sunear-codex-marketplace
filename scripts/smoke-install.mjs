#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginId = "sunear-designer@sunear";

function runCodex(args, profile, label) {
  const result = spawnSync("codex", args, { cwd: root, env: { ...process.env, CODEX_HOME: profile }, encoding: "utf8" });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  return JSON.parse(result.stdout);
}

export async function smokeInstall({ log = console.log } = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "sunear-codex-smoke-"));
  try {
    runCodex(["plugin", "marketplace", "add", root, "--json"], profile, "marketplace install");
    const available = runCodex(["plugin", "list", "--marketplace", "sunear", "--available", "--json"], profile, "marketplace discovery");
    assert.ok(available.available?.some(({ pluginId: id }) => id === pluginId), "plugin is not discoverable");
    const installed = runCodex(["plugin", "add", pluginId, "--json"], profile, "plugin install");
    const installedList = runCodex(["plugin", "list", "--json"], profile, "plugin discovery");
    assert.ok(installedList.installed?.some(({ pluginId: id, enabled }) => id === pluginId && enabled), "plugin is not enabled");
    for (const skill of ["sunear-create-design-from-pdf", "sunear-create-quote-from-project"]) {
      await access(path.join(installed.installedPath, "skills", skill, "SKILL.md"));
    }
    const mcp = JSON.parse(await readFile(path.join(installed.installedPath, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers?.sunear?.url, "https://stage.sunearbuild.com/api/mcp");
    const hooks = JSON.parse(await readFile(path.join(installed.installedPath, "hooks/hooks.json"), "utf8"));
    assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /receiver-launch\.sh/);
    assert.match(hooks.hooks.SessionStart[0].hooks[0].commandWindows, /receiver-launch\.ps1/);
    const launcher = await readFile(path.join(installed.installedPath, "scripts/sunear-codex-receiver-launch.sh"), "utf8");
    assert.match(launcher, /release_tag="v0\.1\.12"/);
    assert.match(launcher, /Darwin:arm64/);
    assert.doesNotMatch(launcher, /Darwin:x86_64|Linux:/);
    assert.match(launcher, /expected_sha256="[a-f0-9]{64}"/);
    assert.match(launcher, /\$\{1:-\}" = "session-end" \]; then exit 0/);
    const windowsLauncher = await readFile(path.join(installed.installedPath, "scripts/sunear-codex-receiver-launch.ps1"), "utf8");
    assert.match(windowsLauncher, /PROCESSOR_ARCHITECTURE -ne "AMD64"/);
    assert.match(windowsLauncher, /releases\/download\/v0\.1\.12/);
    await assert.rejects(stat(path.join(installed.installedPath, "bin")), { code: "ENOENT" });
    log("PASS clean-profile marketplace install and platform-specific receiver discovery");
    log("MANUAL OAuth consent and authenticated PDF quotation download are required before release");
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  smokeInstall().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "Smoke test failed"}\n`);
    process.exitCode = 1;
  });
}
