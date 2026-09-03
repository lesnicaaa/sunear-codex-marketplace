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

- [ ] `npm run smoke:install` installs the local marketplace and plugin using a disposable `CODEX_HOME`, discovers both current skills, and verifies MCP, hooks, launchers, and every receiver archive.
- [ ] On a clean supported host, start a new Codex task and verify OAuth opens without manually editing MCP configuration.
- [ ] Approve the requested Sunear permissions and verify `list_projects` returns projects in stable newest-first order.
- [ ] Ask Codex to access the first project and download a formal PDF quotation; verify the response contains a downloadable PDF resource.
- [ ] Verify the receiver reports ready without a repository checkout, Node.js, Homebrew, or a separate receiver command.

## Publication

- [ ] The destination is the public `sunear-codex-marketplace` repository, not the private application repository.
- [ ] The archive checksum and exact inventory are attached to release review evidence.
- [ ] Release approval is recorded before creating the release tag.
- [ ] After publication, repeat clean-profile installation, OAuth, project discovery, and quotation download from the public Git source.
