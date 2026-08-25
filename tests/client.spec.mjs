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
  assert.equal(manifest.version, "0.2.0");
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
  assert.match(skill, /Compute a SHA-256 for every source file/);
  assert.match(skill, /Do not re-render or re-read completed pages/);
  assert.match(skill, /sunear_get_capabilities/);
  assert.match(skill, /sunear_get_standard_workflow/);
  assert.match(skill, /sunear_get_commercial_pricing_contract/);
  assert.match(skill, /live standard workflow as authoritative/);
  assert.doesNotMatch(skill, /SUNEAR_AGENT_API_KEY|SUNEAR_AGENT_BASE_URL/);
});

test("Stage workflow creates one Project from a multi-file source set", async () => {
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.match(skill, /all files supplied for the same customer task as one source set and one business Project/);
  assert.match(skill, /file boundaries are source groups inside that Project, never reasons to create separate Projects/);
  assert.match(skill, /Merge repeated evidence and multiple views of the same product/);
  assert.match(skill, /never use filename, page number, extracted text, source-group position, or array order as product identity/);
});

test("Stage workflow selects one creation path and binds later designs", async () => {
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.match(skill, /Choose exactly one creation path for the Project/);
  assert.match(skill, /sunear_create_project_product_list/);
  assert.match(skill, /sunear_submit_batch_design/);
  assert.match(skill, /Never call both creation tools for the same Project/);
  assert.match(skill, /existing stable `productItemId` and matching `itemCode`/);
  assert.match(skill, /every slot a member, every operable member complete opening facts/);
});

test("Stage workflow uses canonical project handoff without legacy Web intake", async () => {
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.match(skill, /canonical `projectPath` and `reviewUrl` provided by Sunear/);
  assert.match(skill, /`\/projects\/\{projectId\}`/);
  assert.match(skill, /`\/projects\/\{projectId\}\/commercial`/);
  assert.match(skill, /`\/projects\/\{projectId\}\/commercial\/result`/);
  assert.match(skill, /`\/projects\/\{projectId\}\/commercial\/document`/);
  assert.match(skill, /Do not create or refer to an Inquiry/);
  assert.match(skill, /Web AI Chat/);
  assert.match(skill, /Do not upload the PDFs again on the Web/);
  assert.match(skill, /Do not equate Project creation with quotation completion/);
});

test("Stage plugin contains no executable API-key client", async () => {
  const manifest = await readFile(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8");
  const skill = await readFile(path.join(pluginRoot, "skills/create-sunear-stage-design-from-pdf/SKILL.md"), "utf8");
  assert.doesNotMatch(`${manifest}\n${skill}`, /Bearer authentication|administrator-issued key|organization key/i);
});
