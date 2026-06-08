---
name: lsp-error-handling-patterns
description: How error handling / silent-failure surfaces work in packages/lsp (multiplexer, manager, client) — what is intentional best-effort vs a real risk
metadata:
  type: project
---

The LSP package (`packages/lsp`) deliberately uses best-effort `.catch` swallowing in several places that are NOT defects, so don't re-flag them:

- `LSPManager.hover/definition/references/completion/workspaceSymbol/documentSymbol` per-client `.sendRequest(...).catch(() => [])` — by design: one downstream failing must not break the merged fan-out. `prepareRename`/`rename` log unexpected errors (filtering `-32601`/"Method not found").
- `multiplexer.ts` `flushDiagnostics` `.catch` only logs: that send is the upstream stdout write to Claude Code; if it fails the connection is already dead, nothing else to do. Acceptable.
- `shutdown()` `await manager.shutdown().catch(() => {})` — documented best-effort teardown. Acceptable.
- Server `root()` functions (`nearestRoot`, deno, gopls) defensively swallow their own `fs` errors and return `undefined` rather than rejecting — so `getClients` rejecting via `server.root` is not a realistic path.

Real risk worth attention:
- `client.ts` `notify.open()` sets `files[filePath] = 0` BEFORE `await sendNotification('didOpen')`. If that send rejects, the file is marked open though the downstream never received didOpen; later edits take the didChange branch → downstream has no open doc → silently emits no/stale diagnostics, which the multiplexer relays upstream as "no errors". Silent-failure-shaped, but only triggers on a mid-flight pipe failure (downstream usually dead anyway).
- `LSPManager.openWithText/closeFile/touchFile` await `getClients(...)` OUTSIDE the `Promise.all(...).catch(...)`. Multiplexer calls them as `void manager.openWithText(...)`. A `getClients` rejection would become an unhandled rejection — but `getClients`'s internal `schedule` try/catch + defensive `root()` make rejection not realistically reachable today.

**Why:** PR #100 added the multiplexer + diagnostics relay; reviewed for swallowed errors.
**How to apply:** When reviewing future LSP changes, focus on the `files`-version state ordering in `client.ts` and on whether `getClients` gains a new un-caught reject path; don't re-flag the intentional fan-out `.catch`es.
