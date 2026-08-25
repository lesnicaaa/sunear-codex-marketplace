---
name: create-sunear-stage-design-from-pdf
description: Create one internal test door/window project in Sunear Stage from one or more related PDFs, images, schedules, or explicit design facts. Use when Codex must inventory a complete source set, create either a project product list or a validated batch design, attach later designs, and hand the project to the Stage web workflow. Use only for administrator testing in the isolated Sunear Stage environment; never use for real customer or production projects.
---

# Create Sunear Stage Design From PDF

## Safety boundary

- State clearly that the result belongs to Sunear Stage (test environment).
- Use only the bundled `sunear-stage` MCP connection. Never substitute the production Sunear connection.
- Never use Stage for real customer projects or production data.
- Never request, display, or store API keys. Complete authentication through the OAuth sign-in flow.

## Workflow

1. Verify that the bundled `sunear-stage` MCP tools are available. If authentication is required, start `codex mcp login sunear-stage`, verify that the authorization page actually opened, and wait for a successful callback. If Codex only prints a one-time authorization URL, open that exact URL with the operating-system browser without repeating it in chat. Never claim that the page opened unless its browser or callback state was observed. Reload the Codex task after successful login when its MCP tool catalog was captured before authentication.
2. Before interpreting any source, call `sunear_get_capabilities`, `sunear_get_standard_workflow`, and `sunear_get_commercial_pricing_contract`. Use their current schemas, routes, inference rules, and defaults as the contract for the rest of the run. Treat the live standard workflow as authoritative when it differs from this skill.
3. Treat all files supplied for the same customer task as one source set and one business Project. Compute a SHA-256 for every source file and a deterministic fingerprint for the ordered set of file hashes. Floors, entrances, elevations, sheets, and file boundaries are source groups inside that Project, never reasons to create separate Projects.
4. Search the active workspace for a matching scan checkpoint. Reuse it only when its source-set fingerprint, source filenames, file hashes, page counts, inventory version, and asset manifest validate. Surface any mismatch instead of accepting stale assets.
5. Resume a valid checkpoint's inventory, page renders, source crops, evidence regions, and unresolved questions. For uncovered pages, inspect the source visually when dimensions, item codes, opening guides, handles, or page regions matter. Persist progress after each bounded page or item batch. Do not re-render or re-read completed pages.
6. Build one complete project product list across the whole source set. Join each item to every matching plan, elevation, section, detail, schedule row, repeated floor, and note. Merge repeated evidence and multiple views of the same product. Preserve explicit item codes and assign stable `itemCode` and `sourceId` values from source-backed identity; never use filename, page number, extracted text, source-group position, or array order as product identity.
7. Choose exactly one creation path for the Project:
   - If any project product lacks complete structural facts, call `sunear_get_project_product_list_schema`, build one evidence-backed `sunear.project-inventory/1` envelope, and call `sunear_create_project_product_list`. Engineered, catalog, and temporary products may coexist. Return explicit missing facts. Do not create placeholder designs, Review access, or another Project with the batch-design tool.
   - If every project product has a complete compilable design, call `sunear_get_submission_schema` and, when useful, `sunear_get_submission_examples`. Build one `sunear.batch-design/1` submission. Give every slot a member, every operable member complete opening facts, and every sliding member a consistent sliding group. Call `sunear_validate_submission`, repair errors, and revalidate. Ask the administrator only for facts marked as requiring user input. Call `sunear_submit_batch_design` only after validation returns `valid: true`.
8. Keep one source-set-fingerprint-derived `idempotencyKey` when retrying the selected creation path. Never call both creation tools for the same Project. When an engineered product in an existing project product list later becomes complete, call `sunear_get_product_design_attachment_schema` and `sunear_attach_project_product_designs`; bind the design to the existing stable `productItemId` and matching `itemCode`. Keep its quantity and confirmed dimensions consistent with the project product list.
9. Return the canonical `projectPath` and `reviewUrl` provided by Sunear; never construct or rewrite them. Label the result as Sunear Stage test data, report product count, attached-design count, blockers, and readiness or validation status, and link it as `View test project in Sunear Stage`.
10. State the Web handoff explicitly: `/projects/{projectId}` for recognition review and project configuration, then `/projects/{projectId}/commercial`, `/projects/{projectId}/commercial/result`, and `/projects/{projectId}/commercial/document`. Do not upload the PDFs again on the Web.

## Checkpoint boundary

- A checkpoint separates source inventory from Sunear submission state. OAuth and MCP retries may resume submission without touching completed visual analysis.
- A checkpoint records the source-set fingerprint, per-file hashes and metadata, schema version, completed file/page/item ranges, source groups, source evidence IDs and normalized regions, asset hashes and relative paths, inventory facts, unresolved questions, and the stable submission idempotency key.
- Original source files and local render/crop assets remain local. Send only bounded semantic facts and evidence references required by the Sunear schema.
- Reject missing, hash-mismatched, path-escaping, or version-incompatible assets as validation evidence. Never silently fall back to an unrelated crop, page render, cached preview, or inferred item.

## Product stages

- Use Codex as the PDF entry point. Use the Web only for necessary recognition review, project configuration, quotation confirmation, and the formal quotation document.
- Create one complete project product list first. Create drawing/design facts only for products whose structures are complete.
- Leave profile, glass, hardware, color, price, tax, freight, and commercial terms for the web configuration and quotation workspaces.
- Use the default rendering catalog published by `sunear_get_capabilities`; do not ask the user to choose a profile catalog during drawing creation.
- Do not create or refer to an Inquiry, an inquiry route, Web AI Chat, or Web attachment upload. Do not ask the user to upload source files again after Codex has created the Project.

## Evidence rules

- Give every source a stable ID and retain filename, media type, page, and normalized region when available.
- Distinguish direct glazing from a fixed sash.
- Preserve observed versus inferred hinge, handle, guide, track, and viewing-direction facts.
- Apply professional evidence in order: explicit labels and dimensions; matching multi-view drawings; complete dimension chains and repeated families; standard door/window symbols and construction rules; then published mechanism defaults. Record inferred structural facts in `design.sourceEvidence` with `state: inferred`, the rule, pages, and note. Use `design.assumptions` only for presentation. Put only conflicts or ambiguity remaining after this pass in `unresolvedQuestions`.
- Treat published inference rules as contract evidence, not guesses. For a drawing explicitly labeled sliding with visible arrows, use the arrows for movement. If the track section is unavailable, use the capability or standard-workflow default interleave and mark it inferred.
- When documents conflict, record the conflict and ask for clarification instead of choosing silently.

## Completion boundary

- Complete Codex document processing only when every source file belongs to the same source set, every independent product has a stable identity and evidence, and every structurally complete engineered product is attached to its Project product item.
- Do not equate Project creation with quotation completion. Do not claim a quote exists until Sunear returns a commercial revision. Do not claim formal files exist until the confirmed revision exposes immutable export artifacts.
