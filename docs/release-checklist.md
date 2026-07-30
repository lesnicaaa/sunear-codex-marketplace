# Release checklist

Do not create or push a tag until every required check below passes. Record the release commit and archive SHA-256 in the release review.

## Public artifact

- [ ] Plugin and marketplace manifests pass `npm test`.
- [ ] `npm run release:build` produces the expected sorted inventory and archive.
- [ ] The inventory matches `release-allowlist.txt`; the archive contains no extra files, symlinks, source maps, private implementation, fixtures, or non-public planning material.
- [ ] `npm run release:check` passes the path, byte-content, credential-pattern, and public-boundary scans.
- [ ] A separate secret scanner reports no credentials in the git tree, release inventory, or unpacked archive.
- [ ] The release commit is clean and contains no unrelated or private-repository files.

## Installation and staging

- [ ] `npm run smoke:install` installs the local marketplace and plugin using a disposable `CODEX_HOME` and discovers `create-sunear-design-from-pdf`.
- [ ] The no-key run prints the documented missing-key rejection and an explicit authenticated `SKIP`, not a pass.
- [ ] With `SUNEAR_STAGING_AGENT_KEY` and `SUNEAR_STAGING_BASE_URL`, the smoke passes capabilities, validate, create, read, revise, and Review Link shape checks.
- [ ] Smoke output contains neither the organization key nor a complete Review Link or `rvw_` token.
- [ ] Reusing the initially issued Review Link succeeds before rotation.
- [ ] Explicit Review Link rotation issues a different link, invalidates the old link, and the replacement succeeds.
- [ ] The staging smoke project is identified for cleanup according to the staging retention policy.

## Publication

- [ ] The destination is the public `sunear-codex-marketplace` repository, not the private application repository.
- [ ] The archive checksum and exact inventory are attached to release review evidence.
- [ ] Release approval is recorded before creating `v0.1.0`.
- [ ] After publication, repeat installation and both missing-key and authenticated smoke checks from the public Git source.
