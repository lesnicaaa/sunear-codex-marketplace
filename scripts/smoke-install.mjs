#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "sunear-designer@sunear";
const SKILL_NAME = "create-sunear-design-from-pdf";
const REVIEW_PATH = /^\/projects\/[0-9a-hjkmnp-tv-z]{12}\/review$/;
const REVIEW_TOKEN = /^rvw_[A-Za-z0-9_-]+$/;

function parseJsonOutput(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
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

function validateReviewUrl(value, expectedOrigin) {
  assert.equal(typeof value, "string", "create must return a Review Link");
  const url = new URL(value);
  assert.equal(url.origin, expectedOrigin, "Review Link must use the staging origin");
  assert.match(url.pathname, REVIEW_PATH, "Review Link has an unexpected path");
  assert.equal(url.search, "", "Review Link must not contain a query string");
  assert.match(url.hash, /^#access=/, "Review Link must carry its secret in the fragment");
  assert.match(url.hash.slice("#access=".length), REVIEW_TOKEN, "Review Link token has an unexpected shape");
  return url;
}

export function smokeSubmission(examples) {
  const example = examples?.examples?.find(({ submission }) =>
    submission?.batchDesign?.items?.some(
      (item) => item?.design?.product && item?.design?.layout && Array.isArray(item?.design?.members),
    ),
  );
  const submission = structuredClone(example?.submission);
  assert.ok(submission && typeof submission === "object", "examples must include a semantic design submission");
  submission.idempotencyKey = `codex-marketplace-smoke-${Date.now()}-${process.pid}`;
  return submission;
}

async function callClient(execute, args) {
  const stdout = [];
  const stderr = [];
  const body = await execute(args, {
    stdout: (line) => stdout.push(String(line)),
    stderr: (line) => stderr.push(String(line)),
  });
  return { body, stdout, stderr };
}

function assertNoSecrets(lines, secrets) {
  const rendered = lines.join("\n");
  for (const secret of secrets.filter(Boolean)) assert.doesNotMatch(rendered, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rendered, /#access=|\brvw_[A-Za-z0-9_-]+\b/);
}

export async function smokeInstall({ log = console.log } = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "sunear-codex-smoke-"));
  const originalAgentKey = process.env.SUNEAR_AGENT_API_KEY;
  const originalBaseUrl = process.env.SUNEAR_AGENT_BASE_URL;
  const originalAllowLocalhost = process.env.SUNEAR_AGENT_ALLOW_LOCALHOST;
  try {
    runCodex(["plugin", "marketplace", "add", root, "--json"], profile, "marketplace install");
    const available = runCodex(["plugin", "list", "--marketplace", "sunear", "--available", "--json"], profile, "marketplace discovery");
    assert.ok(available.available?.some(({ pluginId }) => pluginId === PLUGIN_ID), "plugin is not discoverable in the local marketplace");
    const installed = runCodex(["plugin", "add", PLUGIN_ID, "--json"], profile, "plugin install");
    const installedList = runCodex(["plugin", "list", "--json"], profile, "installed plugin discovery");
    assert.ok(installedList.installed?.some(({ pluginId, enabled }) => pluginId === PLUGIN_ID && enabled), "installed plugin is not enabled");
    const installedSkill = path.join(installed.installedPath, "skills", SKILL_NAME, "SKILL.md");
    await access(installedSkill);
    assert.match(await readFile(installedSkill, "utf8"), new RegExp(`^name: ${SKILL_NAME}$`, "m"));
    log("PASS clean-profile marketplace, plugin, and skill discovery");

    const { execute } = await import(`${pathToFileURL(path.join(installed.installedPath, "scripts/sunear_agent_client.mjs"))}?smoke=${Date.now()}`);
    delete process.env.SUNEAR_AGENT_API_KEY;
    await assert.rejects(() => callClient(execute, ["capabilities"]), /SUNEAR_AGENT_API_KEY is required/);
    log("PASS missing-key API rejection: SUNEAR_AGENT_API_KEY is required");

    const stagingKey = process.env.SUNEAR_STAGING_AGENT_KEY;
    const stagingBaseUrl = process.env.SUNEAR_STAGING_BASE_URL;
    if (!stagingKey || !stagingBaseUrl) {
      log("SKIP authenticated staging smoke: set SUNEAR_STAGING_AGENT_KEY and SUNEAR_STAGING_BASE_URL");
      return { authenticated: "skipped" };
    }

    const origin = new URL(stagingBaseUrl).origin;
    assert.equal(new URL(stagingBaseUrl).href, `${origin}/`, "SUNEAR_STAGING_BASE_URL must contain only an origin");
    process.env["SUNEAR_AGENT_API_KEY"] = stagingKey;
    process.env.SUNEAR_AGENT_BASE_URL = origin;
    if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)) process.env.SUNEAR_AGENT_ALLOW_LOCALHOST = "1";

    const captured = [];
    const capabilities = await callClient(execute, ["capabilities"]); captured.push(...capabilities.stdout, ...capabilities.stderr);
    assert.equal(capabilities.body?.apiVersion, "v1");
    const examples = await callClient(execute, ["examples"]); captured.push(...examples.stdout, ...examples.stderr);
    const submission = smokeSubmission(examples.body);
    const validate = await callClient(execute, ["validate", JSON.stringify(submission)]); captured.push(...validate.stdout, ...validate.stderr);
    assert.notEqual(validate.body?.validation?.valid, false, "staging rejected the smoke submission");
    const created = await callClient(execute, ["create", JSON.stringify(submission)]); captured.push(...created.stdout, ...created.stderr);
    assert.match(created.body?.projectId ?? "", /^[0-9a-hjkmnp-tv-z]{12}$/);
    const reviewUrl = validateReviewUrl(created.body?.reviewUrl, origin);
    const read = await callClient(execute, ["read", created.body.projectId]); captured.push(...read.stdout, ...read.stderr);
    const revision = read.body?.run?.revision;
    assert.ok(Number.isInteger(revision), "project read must return a run revision");
    const revisedSubmission = structuredClone(submission);
    revisedSubmission.batchDesign.summary = `${revisedSubmission.batchDesign.summary ?? "Smoke project"} (revised)`;
    const revised = await callClient(execute, ["revise", created.body.projectId, JSON.stringify({ expectedRevision: revision, submission: revisedSubmission })]);
    captured.push(...revised.stdout, ...revised.stderr);
    assert.equal(revised.body?.run?.revision, revision + 1);
    const opened = await callClient(execute, ["open-review", reviewUrl.href]); captured.push(...opened.stderr);
    assert.equal(opened.body?.reviewUrl, reviewUrl.href);
    assertNoSecrets(captured, [stagingKey, reviewUrl.href, reviewUrl.hash]);
    log("PASS authenticated capabilities, validate, create, read, revise, and Review Link checks");
    return { authenticated: "passed" };
  } finally {
    if (originalAgentKey === undefined) delete process.env.SUNEAR_AGENT_API_KEY; else process.env["SUNEAR_AGENT_API_KEY"] = originalAgentKey;
    if (originalBaseUrl === undefined) delete process.env.SUNEAR_AGENT_BASE_URL; else process.env.SUNEAR_AGENT_BASE_URL = originalBaseUrl;
    if (originalAllowLocalhost === undefined) delete process.env.SUNEAR_AGENT_ALLOW_LOCALHOST; else process.env.SUNEAR_AGENT_ALLOW_LOCALHOST = originalAllowLocalhost;
    await rm(profile, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  smokeInstall().catch((error) => {
    let message = error instanceof Error ? error.message : "Smoke test failed";
    for (const secret of [process.env.SUNEAR_STAGING_AGENT_KEY, process.env.SUNEAR_AGENT_API_KEY]) {
      if (secret) message = message.split(secret).join("[REDACTED]");
    }
    message = message.replace(/#access=[^\s"']+/gi, "#access=[REDACTED]").replace(/\brvw_[A-Za-z0-9_-]+\b/g, "[REDACTED]");
    process.stderr.write(`FAIL ${message}\n`);
    process.exitCode = 1;
  });
}
