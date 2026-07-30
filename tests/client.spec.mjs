import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(root, "plugins/sunear-designer/scripts/sunear_agent_client.mjs");

async function loadClient() {
  return import(`${new URL(`file://${clientPath}`)}?test=${Date.now()}-${Math.random()}`);
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("all discovery commands use Bearer authentication", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "sk_live_test-secret";
  const requests = [];
  const { execute } = await loadClient();
  for (const command of ["capabilities", "schema", "examples"]) {
    await execute([command], {
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return jsonResponse({ command });
      },
      stdout: () => {},
      stderr: () => {},
    });
  }
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/api/agent/v1/capabilities",
    "/api/agent/v1/schema",
    "/api/agent/v1/examples",
  ]);
  for (const { url, init } of requests) {
    assert.equal(init.headers.authorization, "Bearer sk_live_test-secret");
    assert.equal(new URL(url).search, "");
  }
});

test("localhost base URL requires an explicit development opt-in", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "key";
  process.env.SUNEAR_AGENT_BASE_URL = "http://localhost:3000";
  delete process.env.SUNEAR_AGENT_ALLOW_LOCALHOST;
  const { execute } = await loadClient();
  await assert.rejects(() => execute(["capabilities"], { fetch: async () => jsonResponse({}) }), /ALLOW_LOCALHOST/);
  process.env.SUNEAR_AGENT_ALLOW_LOCALHOST = "1";
  let called = false;
  await execute(["capabilities"], { fetch: async () => { called = true; return jsonResponse({}); }, stdout: () => {} });
  assert.equal(called, true);
  delete process.env.SUNEAR_AGENT_BASE_URL;
  delete process.env.SUNEAR_AGENT_ALLOW_LOCALHOST;
});

test("rejects input above 2 MB before fetch", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "key";
  const { execute, MAX_INPUT_BYTES } = await loadClient();
  let called = false;
  await assert.rejects(
    () => execute(["validate", JSON.stringify({ value: "x".repeat(MAX_INPUT_BYTES) })], { fetch: async () => { called = true; } }),
    /2 MB/,
  );
  assert.equal(called, false);
});

test("rejects PDF bytes and unbounded project facts before fetch", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "key";
  const { execute } = await loadClient();
  const fetch = async () => assert.fail("fetch must not run");
  await assert.rejects(() => execute(["create", JSON.stringify({ pdf: "JVBERi0xLjQ=" })], { fetch }), /document bytes/i);
  await assert.rejects(() => execute(["create", JSON.stringify({ designs: Array.from({ length: 21 }, (_, i) => ({ id: i })) })], { fetch }), /20 designs/);
  await assert.rejects(() => execute(["create", JSON.stringify({ sources: Array.from({ length: 21 }, (_, i) => ({ id: i })) })], { fetch }), /20 sources/);
  await assert.rejects(() => execute(["create", JSON.stringify({ evidence: [{ text: "x".repeat(4097) }] })], { fetch }), /evidence/i);
});

test("routes validate, create, read, run, revise, and rotate commands", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "key";
  const requests = [];
  const { execute } = await loadClient();
  const fetch = async (url, init) => {
    requests.push({ path: new URL(url).pathname, method: init.method, body: init.body && JSON.parse(init.body) });
    return jsonResponse({ projectId: "project-public", runId: "run-public", reviewUrl: "https://example.test/review#access=secret" });
  };
  const io = { fetch, stdout: () => {}, stderr: () => {} };
  await execute(["validate", "{}"], io);
  await execute(["create", "{}"], io);
  await execute(["read", "project-public"], io);
  await execute(["run", "project-public", "run-public"], io);
  await execute(["revise", "project-public", "{}"], io);
  await execute(["rotate", "project-public"], io);
  assert.deepEqual(requests, [
    { path: "/api/agent/v1/validate", method: "POST", body: {} },
    { path: "/api/agent/v1/projects", method: "POST", body: {} },
    { path: "/api/agent/v1/projects/project-public", method: "GET", body: undefined },
    { path: "/api/agent/v1/projects/project-public/runs/run-public", method: "GET", body: undefined },
    { path: "/api/agent/v1/projects/project-public/revisions", method: "POST", body: {} },
    { path: "/api/agent/v1/projects/project-public/review-link/rotate", method: "POST", body: {} },
  ]);
});

test("open-review emits only the supplied canonical review URL", async () => {
  const { execute } = await loadClient();
  const output = [];
  const url = "https://www.sunearbuild.com/projects/public/review#access=rvw_secret";
  await execute(["open-review", url], { stdout: (line) => output.push(line) });
  assert.deepEqual(output, [url]);
});

test("errors retain requestId while redacting credentials and review tokens", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "sk_live_do-not-print";
  const { execute } = await loadClient();
  const stderr = [];
  await assert.rejects(
    () => execute(["capabilities"], {
      fetch: async () => jsonResponse({ error: "bad sk_live_do-not-print https://x.test/review#access=rvw_leak", requestId: "req_public_123" }, 403, { "x-request-id": "req_public_123" }),
      stderr: (line) => stderr.push(line),
    }),
    /req_public_123/,
  );
  const rendered = stderr.join("\n");
  assert.match(rendered, /req_public_123/);
  assert.doesNotMatch(rendered, /do-not-print|rvw_leak|#access=/);
});

test("successful diagnostic output redacts embedded credentials and review tokens", async () => {
  process.env.SUNEAR_AGENT_API_KEY = "sk_live_success-secret";
  const { execute } = await loadClient();
  const stdout = [];
  await execute(["read", "project-public"], {
    fetch: async () => jsonResponse({
      requestId: "req_safe",
      debug: "key=sk_live_success-secret link=https://x.test/review#access=rvw_success-leak",
      reviewUrl: "https://x.test/review#access=rvw_direct-leak",
    }),
    stdout: (line) => stdout.push(line),
  });
  const rendered = stdout.join("\n");
  assert.match(rendered, /req_safe/);
  assert.doesNotMatch(rendered, /success-secret|rvw_success|rvw_direct|#access=/);
});

test("CLI does not accept authentication or base URL flags", () => {
  const result = spawnSync(process.execPath, [clientPath, "capabilities", "--api-key", "cli-secret"], {
    cwd: root,
    env: { ...process.env, SUNEAR_AGENT_API_KEY: "env-key" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /cli-secret|env-key/);
});

test("staging smoke requires a semantic design example", async () => {
  const { smokeSubmission } = await import(`${new URL(`file://${path.join(root, "scripts/smoke-install.mjs")}`)}?test=${Date.now()}`);
  assert.throws(() => smokeSubmission({ examples: [{ submission: { batchDesign: { items: [{}] } } }] }), /semantic design/);
  const submission = smokeSubmission({ examples: [{ submission: {
    idempotencyKey: "example-semantic-design",
    batchDesign: { items: [{ design: { product: {}, layout: {}, members: [] } }] },
  } }] });
  assert.match(submission.idempotencyKey, /^codex-marketplace-smoke-/);
  assert.deepEqual(submission.batchDesign.items[0].design.members, []);
});
