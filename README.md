# Sunear Codex Marketplace

This public marketplace distributes the Sunear Designer plugin for Codex. Installation is public; using Sunear requires an invited Sunear account and OAuth consent.

## Install

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref main
codex plugin add sunear-designer@sunear
```

Restart or open a new Codex task after installation. Codex will ask you to authorize the Sunear MCP connection in the browser. Approve the requested project and workflow permissions, then ask:

```text
访问我最近更新的 Sunear 项目，并下载正式 PDF 报价单。
```

The plugin discovers projects in stable newest-first order, selects the first only when the request explicitly says so, and returns the generated quotation as a downloadable MCP resource. Its session hook starts the local execution receiver automatically; no project checkout, Node.js, Homebrew, or separate receiver command is required.

Supported receiver hosts: macOS Apple silicon and Intel, Linux ARM64 and x64, and Windows x64 (including Windows ARM64 through x64 emulation).

## Release verification

Maintainers can verify the self-contained package from a disposable Codex profile without changing their normal Codex configuration:

```sh
npm run smoke:install
```

This verifies marketplace installation, both skills, the Stage MCP definition, lifecycle hooks, launchers, and all packaged receiver targets. OAuth consent and an authenticated quotation download remain interactive release checks. See [the release checklist](docs/release-checklist.md) before tagging.

## Data boundary

Codex reads source documents locally. The plugin sends bounded project facts and source evidence needed for the requested Sunear operation. Formal quotation bytes are returned from Sunear as an MCP resource.

Sunear returns a capability-bearing Review Link for a project. Treat that full link, including its fragment or token, as a secret: do not paste it into prompts, logs, issues, analytics, or public messages. Share it only with the intended reviewer through an appropriate private channel.

See [PRIVACY.md](PRIVACY.md) for data handling and [SECURITY.md](SECURITY.md) for reporting and credential guidance.

## License

The public marketplace scaffold is available under the [MIT License](LICENSE). The Sunear service and access credentials are provided separately.
