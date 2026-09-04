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

- [ ] `npm run smoke:install` installs the local marketplace and plugin using a disposable `CODEX_HOME`, discovers both current skills, and verifies MCP, hooks, launchers, and the pinned platform-download contract without embedding receiver archives.
- [ ] On a clean supported host, start a new Codex task and verify OAuth opens without manually editing MCP configuration.
- [ ] Approve the requested Sunear permissions and verify `list_projects` returns projects in stable newest-first order.
- [ ] In the same projectless task, wait for the user to upload a PDF, create the real project from that source, verify every source crop and Engine design, then complete market, pricing, confirmation, translation, formal quotation, and PDF export through the two canonical skills. Do not substitute an arbitrary existing project for this onboarding journey.
- [ ] On macOS Apple Silicon and Windows x64, verify first use downloads only the matching `v0.1.8` asset, rejects a checksum mismatch, uses the installed Desktop host's App Server, completes OAuth when required, and reports ready without a repository checkout, Node.js, Homebrew, or a separate receiver command. macOS Intel, Windows ARM64, and Linux are unsupported and must fail before download.

## Publication

- [ ] The destination is the public `sunear-codex-marketplace` repository, not the private application repository.
- [ ] The small plugin archive plus every platform receiver asset, their SHA-256 values, and the exact plugin inventory are attached to release review evidence.
- [ ] Release approval is recorded before creating the release tag.
- [ ] After publication, repeat clean-profile installation, OAuth, project discovery, and quotation download from the public Git source.
