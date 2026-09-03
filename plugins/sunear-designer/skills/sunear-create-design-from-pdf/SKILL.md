---
name: sunear-create-design-from-pdf
description: Create or repair the evidence-backed design list of a Sunear door/window project from related PDFs, images, schedules, or explicit design facts using the live Sunear MCP contract and Engine. Use for source inventory, item-specific drawing crops, topology recognition, Engine design attachment, source-versus-drawing review, and revision-scoped design confirmation when the live workflow and the user's task authorize it; do not apply markets, confirm quotes, or produce formal quotations.
---

# Create Sunear Design From PDF

Create one persisted Sunear project whose product list, source evidence, and Engine drawings can be reviewed against the supplied documents. This is a project-design skill, not a quotation skill.

Use Chinese for every user-visible progress update, question, error, and final response unless the user explicitly requests another language.

## Contract and access

1. Complete the `sunear.agent-connection/4` preflight before project access. Select the branch from verified client capabilities, not its display name or prompt wording. In a Web-launched local Codex task, perform supported plugin and MCP setup yourself. After installing or updating the plugin, create a fresh local projectless task carrying the same Chinese setup status and upload-PDF objective so the new skills, tools, and `SessionStart` hook load without asking the user to retype the request. Run `codex mcp login sunear` only when authorization is required, leave the final OAuth consent decision to the user, and verify the authenticated tool inventory. Call `get_personal_agent_connection`; only when autonomy is off, explain the exact permission in Chinese and ask whether this Agent may confirm designs, confirm quotations, translate, and export on the user's behalf. Call `grant_personal_agent_autonomy` only after an explicit affirmative response in the current conversation. The trusted plugin `SessionStart` hook owns startup and registers the current device plus the current Agent instance; do not ask for a second start confirmation, but require that exact receiver instance to be ready before Web dispatch. ChatGPT plugins, WorkBuddy, and generic MCP clients use their declared connection, delegation, and receiver branches. Never infer delegation, extract credentials, bypass consent, or substitute direct project access.
2. Call the authenticated Sunear MCP tool `workflow_context` with one client-stable `agentWorkId` before interpreting or mutating a project. Preserve the returned `agentWorkBindingId` and include it in every later business-workflow tool call for this work. Connection-level execution-request claim/finish calls occur outside that binding. Reusing the same `agentWorkId` resumes the contract revision already bound to this work; do not replace it merely because a newer revision is published. Use the returned connection workflow, business workflow, schemas, examples, tool names, and completion evidence as the authority.
3. Operate through MCP. Do not read or write the database, browser storage, application internals, or local project files. Do not use Node as a transport adapter.
4. When MCP is unavailable after verified authorization and a fresh task, an authenticated Agent API may be used only through a client-provided HTTP capability and only as a transport for the same live contract. Do not invent endpoints or reconstruct a private contract from repository code. If neither transport is available, report the interrupted stage and preserve the project checkpoint.
5. Do not add deployment-environment restrictions. Authentication and organization scope come from the connected service.

## Source interpretation

Inspect every supplied source at readable resolution before creating the product list. A PDF page, file, text block, or page order is not a product identity. Reconcile drawings, schedules, sections, elevations, repeated type marks, and notes into stable item codes.

For every engineered product, create two item-specific evidence projections from the same source facts:

- The forensic recognition crop is rendered locally from a high-resolution page image. Inspect it at native pixels; its long edge must be at least 1200 pixels, and 240–400 DPI is preferred for vector PDFs. It may include nearby labels, dimensions, or schedule columns needed to interpret the drawing.
- The primary review crop is the smallest safe crop around exactly one product drawing: include the complete product outline and direct opening or hardware marks, with visible background between every meaningful mark and the crop boundary. Keep item code, dimensions, quantity, orientation, repeated schedule rows, and cross-page notes in structured or supporting evidence outside this image.
- Open and inspect every generated crop before persistence. If a product line, dimension, arrow, label, opening guide, handle, hinge, or other meaningful mark is cut off or touches an edge, expand only that item's region and render it again.
- Derive every crop from the item's visible evidence. Never reuse a fixed page band, row height, coordinate template, or another product's region merely because document pages look repetitive.
- Include enough margin in the forensic crop to preserve dimensions, mullions/transoms, sash boundaries, handles, hinges, locks, opening lines/arrows, tracks, and labels. Do not widen the primary review crop merely to repeat metadata already shown by the design-list header.
- Exclude the right-side configuration table, totals, and unrelated page content.
- Persist the item's own normalized `sourceEvidence.region`; never reuse a fixed page band across products whose positions or sizes differ.
- Keep every original PDF on the Agent or local client. Render the needed page and item regions locally, inspect them, and register only PNG, JPEG, or WebP evidence through `register_source_assets`; never submit a PDF data URL or persist the original PDF in Sunear.
- Bind reviewable raster assets when the live contract supplies asset IDs. Never invent an asset ID or substitute a whole-page image for a missing product crop.

Extract excluded schedule rows, configuration areas, plans, elevations, and notes separately as supporting evidence, not drawing topology. Preserve explicit profile system, hardware, glass/fill, finish/color, quantity, and notes as structured facts or source excerpts supported by the current schema. A repeated row for the same item code contributes quantity or opening context; it does not make the primary crop a multi-product image. Conflicts and absent values remain unresolved evidence.

Read [references/recognition.md](references/recognition.md) while interpreting door/window structure.

## Project and Engine workflow

1. Inventory the complete source set and every independent product before mutation. Report file count, PDF page count, independent product count, and per-page item regions separately.
2. Call `create_project_product_list` once with one stable idempotency key. Include all related files and engineered, catalog, or temporary products in the same project. A catalog item must carry the exact stable member ID of a known published standard product; never infer it from a name, array position, or first match. If that identity is unknown, keep the item temporary and name the unresolved fact. When the user already named a market, include the live schema's `marketIntent`; this records intent only and does not apply commercial policy before design confirmation. Preserve the returned `projectId`, `projectPath`, and stable `productItemId` values.
3. Build each engineered design from explicit evidence using the live semantic `DesignIntent` schema and examples returned by `workflow_context`. The public input contains dimensions, region ownership, structural members, sashes, mechanisms, viewed side, and source evidence. Do not invent fields outside that live contract.
4. Submit semantic facts through `compile_design_intent` or the `designIntent` field of `attach_project_product_designs`. MCP and Engine deterministically compile those facts into the internal `sunear.engine-action-source/1` action source; the action identities and replay format are implementation details, not Agent input. Do not submit a screenshot trace, SVG, cached preview, or hand-authored Engine action history.
5. Call `attach_project_product_designs` with exact `productItemId` and `itemCode` bindings. Transport batches do not create extra projects.
6. If a persisted crop or normalized region is wrong, call `update_project_source_evidence` to replace that evidence projection while preserving the project, source IDs, filenames, item codes, and product identities.
7. Compare every persisted Engine drawing with its product crop. Repair upstream evidence or semantic `DesignIntent` facts and attach a new valid Engine revision when the comparison exposes a mismatch.
8. Call `get_project_workflow_status` after every project mutation. Continue repairing while `furthestLegalStageId` is `design_list` and the blocker is Agent-owned. Every temporary item must become an evidence-backed engineered item or an exact catalog member before handoff. Catalog items do not require or receive an Engine drawing; engineered items still require source-versus-drawing review. At `design_confirmation_gate`, call `confirm_project_designs` only when the current Agent connection has personal autonomous-execution authority and every exact current engineered revision passes the live item-complete verification contract. Otherwise return the canonical design-list path, or stop earlier only when one concrete unresolved fact requires human input.

## Completion boundary

A structurally valid Engine document is necessary but not sufficient. Completion requires crop coverage, design attachment coverage, and source-versus-drawing review covering dimensions, members, sash grouping, mechanisms, hardware marks, and opening lines. Preserve MCP validation codes and blockers verbatim. A missing opening direction is non-blocking only when mechanism family and sash ownership are supported; record filled direction fields as provisional. This skill may complete the exact current design confirmation only under the current connection's personal autonomous-execution authority through `confirm_project_designs`; it never treats a stale revision or unresolved structural fact as confirmation.

Stop after design review handoff. Product selection, price books, markets, commercial revision freezing, translation, and document export belong to `sunear-create-quote-from-project`.
