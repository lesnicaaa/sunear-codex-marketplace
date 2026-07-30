# Payload boundaries

The live authenticated `schema` and `examples` responses are authoritative. Discover them for each workflow and submit JSON objects containing facts, never documents.

- Maximum serialized input: 2 MB.
- Maximum designs per request: 20.
- Maximum sources per request: 20.
- Maximum evidence entries: 100.
- Maximum evidence text per entry: 4096 UTF-8 bytes.
- Forbidden: PDF/image/document bytes, base64 file data, data URLs, uploads, cached previews, and guessed facts.

Each design fact should cite the local source that establishes it. Useful references include a source label plus page, schedule row, drawing label, or region. Keep quotations short. If a required fact is absent or ambiguous, stop and ask the user rather than filling a default.

Validation evidence and machine-readable paths are guidance for correction. User-facing messages, array order, renderer order, and document text order are not business semantics.
