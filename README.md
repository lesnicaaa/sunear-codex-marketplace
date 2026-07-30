# Sunear Codex Marketplace

This public marketplace distributes the Sunear Designer plugin for Codex. Installation is public, but using the Sunear service is invite-only and requires an organization key issued by a Sunear administrator.

## Install

```sh
codex plugin marketplace add lesnicaaa/sunear-codex-marketplace --ref main
codex plugin add sunear-designer@sunear
```

An invited organization must provide its administrator-issued key as `SUNEAR_AGENT_API_KEY`. Do not put the key in prompts, command arguments, URLs, documents, screenshots, or support messages.

## Release verification

Maintainers can verify installation from a disposable Codex profile without changing their normal Codex configuration:

```sh
npm run smoke:install
```

This always verifies local marketplace installation, plugin and skill discovery, and the documented missing-key failure. Authenticated checks are reported as `SKIP` unless both `SUNEAR_STAGING_AGENT_KEY` and `SUNEAR_STAGING_BASE_URL` are present; a skip is not an authenticated pass.

```sh
SUNEAR_STAGING_AGENT_KEY="..." \
SUNEAR_STAGING_BASE_URL="https://staging.example" \
npm run smoke:install
```

The smoke test captures service responses and validates Review Links without printing the key, the full link, or its access fragment. See [the release checklist](docs/release-checklist.md) before tagging.

## Data boundary

Codex reads source documents locally. The plugin sends only bounded project facts needed for the requested Sunear operation, together with source references when supported. It does not send the original document bytes.

Sunear returns a capability-bearing Review Link for a project. Treat that full link, including its fragment or token, as a secret: do not paste it into prompts, logs, issues, analytics, or public messages. Share it only with the intended reviewer through an appropriate private channel.

See [PRIVACY.md](PRIVACY.md) for data handling and [SECURITY.md](SECURITY.md) for reporting and credential guidance.

## License

The public marketplace scaffold is available under the [MIT License](LICENSE). The Sunear service and access credentials are provided separately.
