# Sunear Codex Marketplace

This repository distributes two isolated Sunear Designer plugins for Codex:

- The `main` branch is the production marketplace for invited customer organizations.
- The `stage` branch is the administrator testing marketplace and connects only to Sunear Stage.

Installation is public. Service access remains restricted by Sunear authentication and organization authorization.

## Production installation

Use production for real customer projects:

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref main
codex plugin add sunear-designer@sunear
```

## Administrator Stage installation

Use Stage only for internal testing with non-production data:

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref stage
codex plugin add sunear-designer-stage@sunear-stage
```

Codex opens the Sunear Stage OAuth authorization flow during installation or first use. Sign in with an administrator-approved Stage account; Google sign-in is available when enabled for that account. Do not provide an API key in Codex, a prompt, a command, a URL, a document, a screenshot, or a support message.

Stage uses a separate origin, OAuth issuer, user and connection records, database, projects, and review links. The Stage plugin connects only to `https://www.stage.sunearbuild.com/api/mcp` and never falls back to production.

The production and Stage plugins use different marketplace and plugin names, so both may be installed at the same time. Select **Sunear Stage** only for administrator tests.

## Remove Stage

Remove only the Stage plugin and marketplace with:

```sh
codex plugin remove sunear-designer-stage@sunear-stage
codex plugin marketplace remove sunear-stage
```

These commands do not remove `sunear-designer@sunear`.

## Release verification

Maintainers can validate the Stage branch and install it from a disposable Codex profile without changing their normal configuration:

```sh
npm test
npm run release:check
npm run smoke:install
```

The smoke test verifies marketplace, plugin, skill, and OAuth MCP discovery. It does not store credentials or create a Stage project. Complete an interactive Google/OAuth sign-in and a bounded test project separately before approving the branch for administrator use.

## Data boundary

Codex reads source documents locally. The Stage workflow sends only bounded semantic project facts and source evidence needed for validation and project creation. It does not send original document bytes.

Treat every Stage review link as a secret. Do not paste a complete review link, access fragment, OAuth code, token, or session value into prompts, logs, issues, analytics, or public messages.

See [PRIVACY.md](PRIVACY.md) for data handling and [SECURITY.md](SECURITY.md) for reporting and credential guidance.

## License

The public marketplace scaffold is available under the [MIT License](LICENSE). The Sunear service and authorized accounts are provided separately.
