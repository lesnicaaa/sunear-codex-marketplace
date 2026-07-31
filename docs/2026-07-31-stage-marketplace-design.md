# Sunear Stage Marketplace Design

## Purpose

Publish an administrator-only testing plugin from the public Sunear Codex marketplace without changing the production plugin or its release tag. Installation may be public, but successful use requires an authorized account in the isolated Sunear Stage deployment.

## Distribution Boundary

- The `main` branch and `v0.1.0` tag remain the production marketplace.
- The `stage` branch is a separately installable marketplace named `sunear-stage`.
- The Stage plugin is named `sunear-designer-stage`, so it can coexist with `sunear-designer@sunear`.
- The Stage branch contains only the thin Codex plugin, public workflow instructions, marketplace metadata, documentation, and release validation. It contains no private engine, database, deployment, or credential material.

## Authentication And Data Flow

The plugin connects only to `https://www.stage.sunearbuild.com/api/mcp`. Codex discovers the protected MCP resource and completes OAuth authorization through the Stage deployment. The user signs in with an explicitly authorized Stage account, including Google sign-in where configured. No Agent API key is requested, displayed, stored, or accepted by the plugin.

The one-way flow is:

```text
local source document
  -> locally interpreted semantic design facts and evidence
  -> Stage MCP validation
  -> Stage project creation
  -> Stage-only review result
```

Production credentials, projects, users, databases, OAuth issuers, and review links are never reused by Stage.

## Repository Structure

```text
.agents/plugins/marketplace.json
plugins/sunear-designer-stage/
  .codex-plugin/plugin.json
  .mcp.json
  skills/create-sunear-stage-design-from-pdf/SKILL.md
README.md
```

The marketplace entry uses `AVAILABLE` installation and `ON_INSTALL` authentication. The plugin manifest and skill state clearly that Stage is for administrator testing and must not be used for customer production data.

## Installation

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref stage
codex plugin add sunear-designer-stage@sunear-stage
```

The README documents production and Stage as separate choices, explains Google/OAuth sign-in, and includes removal commands that target only the selected marketplace and plugin.

## Validation

Before publication:

1. Validate the plugin manifest and marketplace metadata.
2. Verify the Stage release inventory contains only allowlisted public files.
3. Install the Git marketplace from the local `stage` branch in a disposable Codex profile.
4. Confirm `sunear-designer-stage@sunear-stage` is discoverable and enabled.
5. Confirm the MCP endpoint is Stage-only and starts OAuth rather than requesting an API key.
6. Run repository tests and scan tracked files for credentials or production-only private material.

## Failure Behavior

- Missing or unauthorized Stage identity surfaces as an OAuth authorization failure.
- An unavailable Stage service surfaces as a connection error and never falls back to production.
- Missing structure in a submission remains validation evidence; the skill does not silently infer topology, source identity, or commercial facts.
