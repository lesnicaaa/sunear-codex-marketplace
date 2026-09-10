# Release checklist

## Artifact

- [ ] Validate manifests and both skills with `npm test`.
- [ ] Build the allowlisted archive and inventory with `npm run release:build`.
- [ ] Run release-boundary and secret scans; no private application files may be copied.
- [ ] Verify there are no startup hooks, resident-runtime scripts or native executable artifacts.

## Installation

- [ ] Install into a disposable Codex profile with `npm run smoke:install`.
- [ ] Refresh the public Git marketplace, install the exact public version and start a new task.
- [ ] Complete host-managed OAuth and read an authorized project through the authenticated tools.
- [ ] Verify source images come from private persisted Storage without a local image server.
- [ ] For an existing installation, explicitly remove its retired Sunear OS login service and verify a new task does not restore it. Preserve source files.

## Publication evidence

- [ ] Record application SHA, marketplace SHA, exact plugin version, inventory/archive checksums and clean-install results together.
- [ ] Record uncompleted hosted acceptance as pending. A local package pass is not cross-device release evidence.
