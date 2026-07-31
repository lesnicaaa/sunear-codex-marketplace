# Sunear Stage Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an independently installable `sunear-stage` Codex marketplace branch whose OAuth-only Stage plugin can coexist with production.

**Architecture:** Replace the production plugin payload on the `stage` branch with the bounded Stage MCP plugin, while keeping shared release-boundary tooling. Make validation and smoke installation assert the Stage marketplace/plugin/skill identities and the fixed Stage OAuth resource.

**Tech Stack:** Codex plugin manifests, JSON, Markdown skills, Node.js built-in test runner, Git marketplace installation.

---

### Task 1: Add Stage plugin and marketplace metadata

**Files:**
- Modify: `.agents/plugins/marketplace.json`
- Create: `plugins/sunear-designer-stage/.codex-plugin/plugin.json`
- Create: `plugins/sunear-designer-stage/.mcp.json`
- Create: `plugins/sunear-designer-stage/skills/create-sunear-stage-design-from-pdf/SKILL.md`
- Delete: `plugins/sunear-designer/**`

- [ ] Copy the reviewed Stage plugin files from `/Users/han/Code/sunear-designer/tmp/plugins/sunear-designer-stage`.
- [ ] Set marketplace identity to `sunear-stage` and its only entry to `sunear-designer-stage` with `AVAILABLE` and `ON_INSTALL` policies.
- [ ] Confirm no production HTTP client or API-key workflow remains in the Stage payload.

### Task 2: Protect the Stage contract with tests

**Files:**
- Modify: `scripts/validate-plugin.mjs`
- Modify: `tests/client.spec.mjs`
- Modify: `scripts/smoke-install.mjs`

- [ ] Update manifest assertions for `sunear-stage`, `sunear-designer-stage`, and `create-sunear-stage-design-from-pdf`.
- [ ] Assert `.mcp.json` contains exactly one HTTP MCP server whose URL and OAuth resource are `https://www.stage.sunearbuild.com/api/mcp`.
- [ ] Replace API-key client tests with Stage plugin contract tests.
- [ ] Make disposable-profile smoke installation verify Stage marketplace, plugin, skill, and MCP discovery without requiring secrets.
- [ ] Run `npm test` and require all assertions to pass.

### Task 3: Update administrator documentation and release inventory

**Files:**
- Modify: `README.md`
- Modify: `docs/release-checklist.md`
- Modify: `release-allowlist.txt`

- [ ] Document production and Stage installation as separate refs and marketplace names.
- [ ] Explain Google/OAuth authorization, administrator-only Stage use, environment isolation, coexistence, and targeted removal.
- [ ] Replace production plugin paths in the release allowlist with the three Stage plugin files.
- [ ] Run `npm run release:check` and inspect the generated inventory.

### Task 4: Verify actual Codex installation and publish

**Files:**
- No source files added.

- [ ] Run `npm run smoke:install` in a disposable Codex profile and confirm the Stage plugin is installed and enabled.
- [ ] Run a credential-pattern scan over tracked files and confirm no credential material is present.
- [ ] Review `git diff --check`, repository status, and the complete branch diff against `main`.
- [ ] Commit only the Stage marketplace changes.
- [ ] Push `stage` to `origin` and verify the remote branch exists.
