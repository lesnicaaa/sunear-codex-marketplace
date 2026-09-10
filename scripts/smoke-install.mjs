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
  return args.includes("--json") ? JSON.parse(result.stdout) : result.stdout;
}

export async function smokeInstall({ log = console.log } = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "sunear-codex-smoke-"));
  try {
    runCodex(["plugin", "marketplace", "add", root], profile, "marketplace install");
    const available = runCodex(["plugin", "list", "--marketplace", "sunear", "--available", "--json"], profile, "marketplace discovery");
    assert.ok(available.available?.some(({ pluginId: id }) => id === pluginId), "plugin is not discoverable");
    runCodex(["plugin", "add", pluginId], profile, "plugin install");
    const installedList = runCodex(["plugin", "list", "--json"], profile, "plugin discovery");
    assert.ok(installedList.installed?.some(({ pluginId: id, enabled }) => id === pluginId && enabled), "plugin is not enabled");
    const installed = installedList.installed.find(({ pluginId: id }) => id === pluginId);
    installed.installedPath = path.join(profile, "plugins/cache", installed.marketplaceName, installed.name, installed.version);
    for (const skill of ["sunear-create-design-from-pdf", "sunear-create-quote-from-project"]) {
      await access(path.join(installed.installedPath, "skills", skill, "SKILL.md"));
    }
    const mcp = JSON.parse(await readFile(path.join(installed.installedPath, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers?.sunear?.url, "https://stage.sunearbuild.com/api/mcp");
    for (const directory of ["hooks", "scripts", "bin"]) {
      await assert.rejects(stat(path.join(installed.installedPath, directory)), { code: "ENOENT" });
    }
    log("PASS clean-profile plugin install without resident runtime or startup hooks");
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
