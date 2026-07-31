# Stage release checklist

Do not push the `stage` branch until every required check below passes. Do not create a production release tag from this branch.

## Public artifact

- [ ] Stage plugin and marketplace manifests pass `npm test`.
- [ ] The marketplace name is `sunear-stage` and contains only `sunear-designer-stage`.
- [ ] The plugin contains only its manifest, OAuth MCP configuration, and Stage workflow skill.
- [ ] `npm run release:build` produces the expected sorted inventory and deterministic archive.
- [ ] The archive contains no production client, API-key workflow, private implementation, fixtures, credentials, source maps, or unlisted files.
- [ ] A credential-pattern scan reports no credentials in the tracked tree or release artifact.

## Installation and OAuth

- [ ] `npm run smoke:install` installs the local marketplace in a disposable `CODEX_HOME`.
- [ ] Codex discovers and enables `sunear-designer-stage@sunear-stage`.
- [ ] Codex discovers `create-sunear-stage-design-from-pdf` and the bundled `sunear-stage` MCP server.
- [ ] Both MCP URL fields equal `https://www.stage.sunearbuild.com/api/mcp`.
- [ ] Interactive authorization uses the isolated Stage OAuth issuer and succeeds with an approved administrator account, including Google sign-in where configured.
- [ ] Unauthorized users are rejected and the plugin never falls back to production.
- [ ] A bounded non-customer test submission validates and creates a project only in the Stage database.

## Publication

- [ ] The destination is the `stage` branch of the public `sunear-codex-marketplace` repository.
- [ ] Production `main` and `v0.1.0` remain unchanged.
- [ ] The branch diff contains no files from the private application repository.
- [ ] After pushing, repeat installation from `--ref stage` and confirm the remote marketplace identity is `sunear-stage`.
