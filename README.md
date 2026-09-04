# Sunear Codex Marketplace

This public marketplace distributes the Sunear Designer plugin for Codex. Installation is public; using Sunear requires an invited Sunear account and OAuth consent.

## Install

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref main
codex plugin add sunear-designer@sunear
```

Restart or open a new Codex task after installation. Codex will ask you to authorize the Sunear MCP connection in the browser. Approve the requested project and workflow permissions, then start the primary workflow in Chinese:

For interactive authorization, Codex Desktop uses its host-managed plugin or MCP authentication surface; it does not launch `codex mcp login` from a restricted task shell. Codex CLI keeps its own native login path. The plugin opens the official authorization URL in the connected Chrome profile when available, otherwise the operating system's default daily browser. It must not silently fall back to Codex's isolated in-app browser, import browser cookies, or request browser credentials.

OAuth consent and local credential persistence are separate security facts. A Keychain or keyring failure after consent is reported as a credential-persistence failure, not as a denial. The operating-system keyring remains preferred; Codex's supported file store is used only after the user explicitly accepts the weaker local-storage boundary, and the Agent never reads or displays stored credentials.

```text
我要上传 PDF 创建一个 Sunear 项目，逐项核对原图与 Engine 设计，再完成正式报价单。请全程使用中文。
```

The main workflow waits for the customer's PDF, creates the real project and verified Engine designs, then completes the market-backed quotation and returns it as a downloadable MCP resource. Accessing the newest existing project, re-exporting a document, or another focused operation remains a separate shortcut and runs only when explicitly requested. The session hook downloads the already-published checksum-pinned receiver `0.7.3` for the current platform on first use and starts it automatically; this plugin-only release does not upload the compiler runtime again. No project checkout, Node.js, Homebrew, or separate receiver command is required.

Device pairing, receiver heartbeat, and verified Codex execution are separate states. Ending a Codex task does not shut down the device receiver. The account page reports readiness only after the current receiver's latest terminal diagnostic succeeds; a failed diagnostic remains visible as an error until a later successful verification.

Supported receiver hosts: macOS Apple Silicon and Windows x64. macOS Intel, Windows ARM64, and Linux are unsupported.

## Release verification

Maintainers can verify the self-contained package from a disposable Codex profile without changing their normal Codex configuration:

```sh
npm run smoke:install
```

This verifies marketplace installation, both skills, the Stage MCP definition, lifecycle hooks, and the checksum-pinned platform downloader. Receiver assets are published separately on the matching immutable release tag. OAuth consent and an authenticated quotation download remain interactive release checks. See [the release checklist](docs/release-checklist.md) before tagging.

## Data boundary

Codex reads source documents locally. The plugin sends bounded project facts and source evidence needed for the requested Sunear operation. Formal quotation bytes are returned from Sunear as an MCP resource.

Sunear returns a capability-bearing Review Link for a project. Treat that full link, including its fragment or token, as a secret: do not paste it into prompts, logs, issues, analytics, or public messages. Share it only with the intended reviewer through an appropriate private channel.

See [PRIVACY.md](PRIVACY.md) for data handling and [SECURITY.md](SECURITY.md) for reporting and credential guidance.

## License

The public marketplace scaffold is available under the [MIT License](LICENSE). The Sunear service and access credentials are provided separately.
