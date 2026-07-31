---
name: create-sunear-stage-design-from-pdf
description: Create and validate internal test door/window projects in Sunear Stage from uploaded PDFs, images, schedules, or explicit design facts. Use only when an administrator is testing the isolated Sunear Stage environment; never use this skill for real customer or production projects.
---

# Create Sunear Stage Design From PDF

## Safety boundary

- State clearly that the result belongs to Sunear Stage (test environment).
- Use only the bundled `sunear-stage` MCP connection. Never substitute the production Sunear connection.
- Never use Stage for real customer projects or production data.
- Never request, display, or store API keys. Complete authentication through the OAuth sign-in flow.

## Workflow

1. Verify that the bundled `sunear-stage` MCP tools are available. If authentication is required, start `codex mcp login sunear-stage`, verify that the authorization page actually opened, and wait for a successful callback. If Codex only prints a one-time authorization URL, open that exact URL with the operating-system browser without repeating it in chat. Never claim that the page opened unless its browser or callback state was observed. Reload the Codex task after successful login when its MCP tool catalog was captured before authentication.
2. Compute the source file SHA-256 before visual work. Search the active workspace for a matching scan checkpoint. Reuse it only when its recorded fingerprint, source filename, page count, inventory version, and asset manifest validate; otherwise surface the mismatch instead of silently accepting stale assets.
3. Resume from a valid checkpoint's inventory, page renders, source crops, evidence regions, and unresolved questions. Do not re-render or re-read completed pages. Treat cached previews and guessed drafts as derived artifacts, never as source facts.
4. For pages not covered by a valid checkpoint, read the supplied file visually when dimensions, item codes, opening guides, handles, or page regions matter. Persist progress after each bounded page or item batch so an MCP, OAuth, or network retry does not repeat document recognition.
5. Inventory every independent door/window design. Preserve source item codes and stable evidence IDs; never use page or array order as identity.
6. Call `sunear_get_capabilities`, then `sunear_get_submission_schema`. Call `sunear_get_submission_examples` when format guidance is needed.
7. Build one `sunear.batch-design/1` submission with source-backed evidence. Put uncertain facts in `unresolvedQuestions`; never guess dimensions, topology, opening side, catalog ownership, or prices.
8. Call `sunear_validate_submission`. Repair returned errors and revalidate. Ask the administrator only for facts marked as requiring user input.
9. Call `sunear_submit_batch_design` only after validation succeeds. Keep the same source-fingerprint-derived `idempotencyKey` when retrying the same project.
10. Return the first-created `reviewUrl` with the label `View test project in Sunear Stage`. Mention the item count and validation result, and remind the administrator that the project is test data.

## Checkpoint boundary

- A checkpoint separates source inventory from Sunear submission state. OAuth and MCP retries may resume submission without touching completed visual analysis.
- A checkpoint records the content fingerprint, source metadata, schema version, completed page/item ranges, source evidence IDs and normalized regions, asset hashes and relative paths, inventory facts, unresolved questions, and the stable submission idempotency key.
- Original source files and local render/crop assets remain local. Send only bounded semantic facts and evidence references required by the Sunear schema.
- Reject missing, hash-mismatched, path-escaping, or version-incompatible assets as validation evidence. Never silently fall back to an unrelated crop, page render, cached preview, or inferred item.

## Product stages

- This workflow creates drawing/design facts only.
- Leave profile, glass, hardware, color, price, tax, freight, and commercial terms for the web configuration and quotation workspaces.
- Use the default rendering catalog published by `sunear_get_capabilities`; do not ask the user to choose a profile catalog during drawing creation.

## Evidence rules

- Give every source a stable ID and retain filename, media type, page, and normalized region when available.
- Distinguish direct glazing from a fixed sash.
- Preserve observed versus inferred hinge, handle, guide, track, and viewing-direction facts.
- When documents conflict, record the conflict and ask for clarification instead of choosing silently.
