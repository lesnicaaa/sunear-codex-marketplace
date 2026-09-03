# Security Policy

## Access credentials

Using the Sunear service requires an invited account and OAuth consent in the browser opened by Codex. Do not copy access or refresh tokens into prompts, documents, command arguments, URLs, logs, issues, screenshots, or source files. Revoke the Codex connection from the Sunear account page after suspected account or device exposure.

Review Links grant access to a project. Treat the complete link, including any fragment or access token, as a secret. Send it only to the intended reviewer through a private channel. Redact it from logs and reports. Ask a Sunear administrator to rotate access after suspected disclosure.

## Reporting a vulnerability

Do not open a public issue for a vulnerability or include credentials, Review Links, customer documents, or project facts in a report. Contact your Sunear administrator through the private support channel supplied with your organization invitation. Include only the minimum information needed to reproduce the issue, with secrets and customer data removed.

This repository contains a public plugin boundary and no private Sunear engine or quotation implementation.
