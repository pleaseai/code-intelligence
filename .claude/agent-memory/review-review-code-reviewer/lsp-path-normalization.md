---
name: lsp-path-normalization
description: How the LSP multiplexer, LSPManager, and LSP client keep diagnostic-map keys consistent so merged diagnostics resolve correctly
metadata:
  type: project
---

The LSP diagnostics path is keyed consistently across three layers — verify any change keeps them aligned:

- `client.ts`: diagnostics map keyed by `normalizePath(fileURLToPath(uri))` where `normalizePath = path.normalize`. `notify.open`/`close` also delete via `normalizePath(filePath)`.
- `index.ts` `diagnosticsForFile(file)`: looks up `client.diagnostics.get(path.normalize(file))`. Matches because `path.normalize` is idempotent.
- `multiplexer.ts`: `onDiagnostics` callback receives the already-normalized filePath, re-merges across ALL clients via `manager.diagnosticsForFile`, then publishes `pathToFileURL(filePath).href` upstream (debounced 120ms).

**Why:** A previous review round fixed a path-normalization mismatch that caused merged diagnostics to silently miss. The re-merge-across-all-clients design exists so one downstream's push cannot erase others' diagnostics.

**How to apply:** When reviewing changes to diagnostic keying or any new method that reads `client.diagnostics`, confirm the lookup key is `path.normalize`d. Concurrency-safe single-didOpen only holds when buffer `text` is provided (multiplexer always does); the disk-read path has an await before the version-flag set.
