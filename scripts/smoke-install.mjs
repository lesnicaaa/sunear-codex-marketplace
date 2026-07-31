#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKETPLACE = "sunear-stage";
const PLUGIN_ID = "sunear-designer-stage@sunear-stage";
const SKILL_NAME = "create-sunear-stage-design-from-pdf";
const STAGE_MCP_URL = "https://www.stage.sunearbuild.com/api/mcp";

function parseJsonOutput(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}: ${result.stderr.trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function runCodex(args, profile, label) {
  const result = spawnSync("codex", args, {
    cwd: root,
    env: { ...process.env, CODEX_HOME: profile },
    encoding: "utf8",
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  return parseJsonOutput(result, label);
}

export async function smokeInstall({ log = console.log } = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "sunear-stage-codex-smoke-"));
  try {
    runCodex(["plugin", "marketplace", "add", root, "--json"], profile, "marketplace install");
    const available = runCodex(["plugin", "list", "--marketplace", MARKETPLACE, "--available", "--json"], profile, "marketplace discovery");
    assert.ok(available.available?.some(({ pluginId }) => pluginId === PLUGIN_ID), "Stage plugin is not discoverable");

    const installed = runCodex(["plugin", "add", PLUGIN_ID, "--json"], profile, "plugin install");
    const installedList = runCodex(["plugin", "list", "--json"], profile, "installed plugin discovery");
    assert.ok(installedList.installed?.some(({ pluginId, enabled }) => pluginId === PLUGIN_ID && enabled), "Stage plugin is not enabled");

    const installedSkill = path.join(installed.installedPath, "skills", SKILL_NAME, "SKILL.md");
    const installedMcp = path.join(installed.installedPath, ".mcp.json");
    await access(installedSkill);
    await access(installedMcp);
    assert.match(await readFile(installedSkill, "utf8"), new RegExp(`^name: ${SKILL_NAME}$`, "m"));
    const mcp = JSON.parse(await readFile(installedMcp, "utf8"));
    assert.equal(mcp.mcpServers?.["sunear-stage"]?.url, STAGE_MCP_URL);
    assert.equal(mcp.mcpServers?.["sunear-stage"]?.oauth_resource, STAGE_MCP_URL);
    log("PASS clean-profile Stage marketplace, plugin, skill, and OAuth MCP discovery");
    return { installed: true, pluginId: PLUGIN_ID };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  smokeInstall().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "Smoke test failed"}\n`);
    process.exitCode = 1;
  });
}
