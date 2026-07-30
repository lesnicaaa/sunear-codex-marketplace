---
name: create-sunear-design-from-pdf
description: Create or revise a reviewable Sunear door and window project from local PDFs, images, schedules, or explicit project facts.
---

# Create a Sunear design

Use this skill when the user wants Sunear designs or a review project from local source documents. Read source files locally. Never send original PDF, image, or document bytes to Sunear.

## Workflow

1. Prefer the authenticated Sunear MCP tools when available. Start with capabilities, schema, and examples; do not rely on remembered formats. If MCP is unavailable, use `../../scripts/sunear_agent_client.mjs` with the matching command.
2. Extract only source-backed facts. Preserve concise source references such as document name, page, drawing label, and region. Keep evidence bounded and relevant.
3. Build at most 20 designs and 20 sources per request. Follow the live schema and capability response rather than guessing topology, units, product selections, ownership, pricing, or missing dimensions.
4. Ask the user to clarify required facts that the source does not establish. Never turn uncertain text or visual ordering into structural facts.
5. Run `validate` before `create` or `revise`. Repair only from source-backed facts and structured validation evidence.
6. Create the project, then read its public state or run state when needed. Use `revise` for corrections. Use `rotate` only when the user explicitly approves review-link rotation and the key has that capability.
7. Return the exact server-provided `reviewUrl` for the user to open. Mark it as secret and never place it in logs, prompts, issues, or diagnostics.

Authentication comes only from `SUNEAR_AGENT_API_KEY`. Never request or accept it in a prompt, command argument, or URL. Production uses the canonical HTTPS service. Local development requires both `SUNEAR_AGENT_BASE_URL=http://localhost:<port>` and `SUNEAR_AGENT_ALLOW_LOCALHOST=1`.

See [API reference](references/api.md) and [payload boundaries](references/schema.md).
