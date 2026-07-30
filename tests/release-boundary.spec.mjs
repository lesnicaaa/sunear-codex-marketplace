import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildRelease } from "../scripts/build-release.mjs";
import { scanReleaseDirectory } from "../scripts/scan-release.mjs";

const SCANNER_FIXTURE_ALLOWLIST = ["public/plugin.json", "release-allowlist.txt"];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sunear-release-test-"));
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "public/plugin.json"), "{\"name\":\"public\"}\n");
  await writeFile(path.join(root, "release-allowlist.txt"), "public/plugin.json\n");
  return root;
}

test("scanner rejects a file that is not in the release allowlist", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "public/unlisted.txt"), "ordinary text\n");
  await assert.rejects(
    scanReleaseDirectory(root, SCANNER_FIXTURE_ALLOWLIST),
    /not present in release allowlist.*public\/unlisted\.txt/i,
  );
});

test("scanner rejects private implementation paths", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "public/topology"), { recursive: true });
  await writeFile(path.join(root, "public/topology/model.js"), "export {};\n");
  await assert.rejects(
    scanReleaseDirectory(root, [...SCANNER_FIXTURE_ALLOWLIST, "public/topology/model.js"]),
    /forbidden release path.*topology/i,
  );
});

test("scanner rejects legacy identifiers and secret-shaped bytes", async () => {
  for (const bytes of [
    "const submissionId = request.id;\n",
    "const importPath = '/private/source';\n",
    "secret-key: do-not-release\n",
    "SUNEAR_AGENT_API_KEY=sk_live_actualcredentialvalue\n",
  ]) {
    const root = await fixture();
    await writeFile(path.join(root, "public/plugin.json"), bytes);
    await assert.rejects(
      scanReleaseDirectory(root, SCANNER_FIXTURE_ALLOWLIST),
      /forbidden release content|credential/i,
    );
  }
});

test("security documentation may name concepts without embedding credentials", async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, "SECURITY.md"),
    "This public boundary contains no private engine or quotation implementation. Never expose credentials or tokens.\n",
  );
  await scanReleaseDirectory(root, [...SCANNER_FIXTURE_ALLOWLIST, "SECURITY.md"]);
});

test("builder copies only allowlisted files and creates a deterministic archive", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "private-notes.md"), "must stay outside\n");
  const output = path.join(root, "release");

  const first = await buildRelease({ root, output });
  const firstArchive = await readFile(first.archivePath);
  const second = await buildRelease({ root, output });
  const secondArchive = await readFile(second.archivePath);

  assert.deepEqual(first.inventory, ["public/plugin.json"]);
  assert.deepEqual(second.inventory, first.inventory);
  assert.deepEqual(secondArchive, firstArchive);
  assert.doesNotMatch(firstArchive.toString("latin1"), /private-notes/);
});

test("builder refuses forbidden bytes in an allowlisted source file", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "public/plugin.json"), "internalPrompt = 'do not publish';\n");
  await assert.rejects(buildRelease({ root, output: path.join(root, "release") }), /forbidden release content/i);
});

test("builder rejects traversal paths before staging", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "release-allowlist.txt"), "../outside.txt\n");
  await assert.rejects(buildRelease({ root, output: path.join(root, "release") }), /invalid release path/i);
});

test("builder rejects an allowlisted source symlink", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "target.json"), "{}\n");
  await symlink(path.join(root, "target.json"), path.join(root, "public/plugin.json.new"));
  await writeFile(path.join(root, "release-allowlist.txt"), "public/plugin.json.new\n");
  await assert.rejects(buildRelease({ root, output: path.join(root, "release") }), /not a regular file|symlink/i);
});
