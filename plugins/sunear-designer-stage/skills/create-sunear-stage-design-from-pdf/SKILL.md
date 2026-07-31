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

1. Read every supplied file visually when dimensions, item codes, opening guides, handles, or page regions matter.
2. Inventory every independent door/window design. Preserve source item codes; never use page or array order as identity.
3. Call `sunear_get_capabilities`, then `sunear_get_submission_schema`. Call `sunear_get_submission_examples` when format guidance is needed.
4. Build one `sunear.batch-design/1` submission with source-backed evidence. Put uncertain facts in `unresolvedQuestions`; never guess dimensions, topology, opening side, catalog ownership, or prices.
5. Call `sunear_validate_submission`. Repair returned errors and revalidate. Ask the administrator only for facts marked as requiring user input.
6. Call `sunear_submit_batch_design` only after validation succeeds. Keep the same `idempotencyKey` when retrying the same project.
7. Return the first-created `reviewUrl` with the label `View test project in Sunear Stage`. Mention the item count and validation result, and remind the administrator that the project is test data.

## Product stages

- This workflow creates drawing/design facts only.
- Leave profile, glass, hardware, color, price, tax, freight, and commercial terms for the web configuration and quotation workspaces.
- Use the default rendering catalog published by `sunear_get_capabilities`; do not ask the user to choose a profile catalog during drawing creation.

## Evidence rules

- Give every source a stable ID and retain filename, media type, page, and normalized region when available.
- Distinguish direct glazing from a fixed sash.
- Preserve observed versus inferred hinge, handle, guide, track, and viewing-direction facts.
- When documents conflict, record the conflict and ask for clarification instead of choosing silently.
