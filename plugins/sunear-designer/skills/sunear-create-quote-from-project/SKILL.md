---
name: sunear-create-quote-from-project
description: Advance an existing Sunear project through its canonical quote-list and formal-quote stages using persisted market intent, exact published markets, project-owned pricing, user confirmation or personally delegated Agent confirmation, prepared formal settings, all required market-language translations, and export. Use after the design list exists; stop at any unauthorized gate or exception, and do not recognize or repair drawing topology.
---

# Create Sunear Quote From Project

Continue an existing confirmed Sunear project through commercial configuration, pricing, frozen quotation, every required market-language translation, and document handoff. This skill never creates or repairs drawing topology.

## Contract and prerequisites

1. Complete the `sunear.agent-connection/2` preflight before project access. Select the branch from verified client capabilities, not its display name or prompt wording. When Web launches an installed local Codex app, complete the same ordered preparation there: install or update the supported Sunear plugin, configure or repair MCP, run `codex mcp login sunear` only when authorization is required, leave the final OAuth consent decision to the user, verify with `codex mcp list`, start a fresh task when tools cannot reload, call `get_personal_agent_connection`, and—only when autonomy is off—explain the exact permission and ask whether this Agent may confirm designs, confirm quotations, translate, and export on the user's behalf. Call `grant_personal_agent_autonomy` only after an explicit affirmative response in the current conversation. Then install or enable the approved execution receiver and report a current ready heartbeat. ChatGPT plugins, WorkBuddy, and generic MCP clients use their declared connection, delegation, and receiver branches. Never infer delegation, extract credentials, bypass consent, or substitute direct project access.
2. Call the authenticated Sunear MCP tool `workflow_context` with one client-stable `agentWorkId` before any project mutation. Preserve the returned `agentWorkBindingId` and include it in every later business-workflow tool call for this work. Connection-level execution-request claim/finish calls occur outside that binding. Reusing the same `agentWorkId` resumes the contract revision already bound to this work; do not replace it merely because a newer revision is published. Follow the returned connection workflow, business workflow, commercial contract, schemas, tool order, and completion evidence.
3. Require an existing project. When the user did not supply an exact `projectId`, call `list_projects` and present its explicit `updated_at_desc_project_id_asc` result; select the first entry only when the user explicitly asked for the first or most recently updated project. Then call `get_project_workflow_status`. If the current design list is incomplete, return to the design skill. If it is waiting at `design_confirmation_gate`, return to the design skill so it can perform live revision-scoped verification only under this connection's current personal autonomous-execution authority or return the canonical design-list path for user confirmation. This quote skill never creates design confirmation.
4. Operate through MCP. Do not read or write the database, browser storage, catalog tables, project files, or computed quote rows directly. Do not use Node as a transport adapter.
5. When MCP is unavailable after verified authorization and a fresh task, an authenticated Agent API may be used only through a client-provided HTTP capability and only as a transport for the same live contract. Do not invent endpoints, formulas, revisions, or internal identifiers.
6. Do not add deployment-environment restrictions. The connected service owns authentication, organization scope, available catalogs, and published revisions.

Read [references/commercial-contract.md](references/commercial-contract.md) before choosing or applying a market.

## Quote-list checkpoint

1. If the user names or changes the market, call `set_project_market_intent` first. An intake `marketIntent` is already persisted; do not replace it merely because another market appears first.
2. Call `list_project_markets` only after status reports the current design list as ready: every engineered item has revision-scoped user confirmation or authorized Agent verification, every catalog item carries one exact stable published standard-product member ID, and no temporary item remains. Catalog items do not need Engine drawings. Match the persisted intent to exactly one returned published market. Never infer from location, currency, language, product name, member name, or array order; ask when absent or ambiguous.
3. Call `apply_project_market` with the exact `projectRevision`, market revision ID, and fingerprint returned by that listing. Use a stable command ID for retries. This application is not quotation approval and is not formal-document completion.
4. Call `get_project_workflow_status` again. Preserve explicit project overrides and report every incompatible, missing, unpriced, stale, or processing item from the quote-list status. Standard products use their typed per-unit quantity on the same production DAG and project quantity is applied exactly once. Do not substitute an Engine metric with zero, a product, option, formula, amount, or parallel total.
5. Continue only when status identifies a current `commercialRevisionId`, `consistencyFingerprint`, no quote exception, and `quote_confirmation_gate`. Call `confirm_project_quote` only when the current Agent connection has personal autonomous-execution authority; otherwise return the quote-list path for user confirmation.
6. Submit the exact current revision and fingerprint, then read status again. The server rechecks delegation at action time; never reuse a prior status after a design, quantity, market, option, snapshot, or project revision change.

## Formal-quote checkpoint

1. Verify the quote number, validity, payment terms, notes, languages, currency, and exchange-rate projection prepared from the organization and applied market. Collect only the customer recipient and presentation choices accepted by the live schema; do not author upstream market facts.
2. Call `save_formal_quote_settings` only when those accepted recipient or presentation values need to change. It delegates to the project document owners and must not change design, directory, market, pricing, or the confirmed commercial total.
3. Call `get_project_workflow_status`. Missing formal facts remain blockers. Any outstanding non-Chinese market language advances to the exact translation checkpoint below; the selected preview language does not narrow the required set.
4. When status reaches `formal_quote_export`, call `export_formal_quote` with the requested `pdf` or `xlsx` format. Deliver the returned embedded MCP resource directly to the user and use its artifact revision, template version, content hash, filename and media type as completion evidence. Use the canonical formal-quote path only for interactive Web preview or print.
5. Do not claim end-to-end completion from `apply_project_market`, a processing result, or an unconfirmed quote list. Completion is the furthest legal state reported by `get_project_workflow_status`; any remaining unauthorized gate, exception, translation, or Web output must be named explicitly.

## Translation stage

Translation remains a stage of quotation delivery because its source is an immutable formal commercial document. It does not own product facts, pricing, totals, or a second quotation revision.

Run it whenever `get_project_workflow_status` reports `formal_quote_translation`. Quote confirmation prepares one job for every non-Chinese language configured by the applied market; the workflow owns completing that whole set:

1. Call `get_translation_request` without `jobId`, then select only requests whose `projectId` matches the current project and whose `sourceHash` matches an outstanding language reported by current workflow status. Never consume another project's organization-wide queue entry by position.
2. Claim one selected request with its explicit `jobId`. Translate every returned source field into that request's target language. Preserve stable keys and do not change product identity, quantities, dimensions, currency, numeric amounts, formulas, source hash, or revision evidence.
3. Submit the complete field set with `apply_commercial_document_translation` using `sunear.commercial-document-translation/1`, the exact `jobId`, `sourceHash`, and target language.
4. Read `get_project_workflow_status` after each applied translation. If it still reports `formal_quote_translation`, list again and complete the next exact outstanding language; do not stop because the page currently displays a different language.
5. Treat missing, duplicate, unknown, stale, cross-organization, or revision-conflict errors as blockers. Never overwrite the Chinese source or apply a translation to a different revision.
6. Completion means Sunear reports `formal_quote_export`, which proves every configured non-Chinese market language is attached to its exact current source revision. Export remains a separate projection of the confirmed revision.

Do not split translation into a third skill unless it becomes an independently requested organization-wide queue operation with its own operator, permissions, or delivery lifecycle.
