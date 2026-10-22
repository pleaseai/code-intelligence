---
name: lsp-test-patterns
description: Test structure, doubles, and recurring coverage gaps in packages/lsp (multiplexer, client, manager)
metadata:
  type: project
---

LSP package test layout: `packages/lsp/test/unit/{client,multiplexer,index,server}.test.ts`, fixture `packages/lsp/test/fixture/fake-lsp-server.js` (a real spawned JSON-RPC stdio process, not a mock).

**Why:** Tests favor real child-process LSP doubles over mocks for client/multiplexer paths, giving high-fidelity protocol coverage. The fake server tracks `openCounts[uri]` and answers a `test/openCount` request — purpose-built for the concurrent-open regression test.

**How to apply:**
- The multiplexer tests use a hand-written `FakeManager` (in multiplexer.test.ts), NOT the real `LSPManager`. So the multiplexer's upstream protocol + relay wiring are covered, but the real `LSPManager.getClients` spawn/dedup logic and `diagnosticsForFile`/`diagnostics` merge across heterogeneous real servers are NOT exercised by these tests.
- Recurring untested branches to check on any LSP PR: `LSPManager` constructor `serverIds` scoping + the "empty array = no restriction" guard (index.ts ~L267); `getClients` filename matching for extensionless files (Dockerfile/Containerfile, index.ts ~L378-389); `closeFile`/`openWithText` on the real manager; `didChange` empty `contentChanges` early-return (multiplexer.ts ~L209-211).
- Concurrent-open fix lives in client.ts (`files[filePath] = 0` set BEFORE the didOpen await). The regression test in client.test.ts genuinely guards it: reverting the order makes the count assertion fail. Treat this as the reference pattern for async-ordering regression tests here.
- Native TypeScript tests cover resolver behavior (classic/no-tsgo, v7 and file markers, native-preview, missing tsc, parent-hoisted TypeScript), but not `TypescriptServer.spawn` command/arguments or the Windows `.cmd` branch.
- The pull-diagnostics fixture advertises `diagnosticProvider` unconditionally and always returns one fixed `full` report. It does not expose request counts or model `unchanged`, errors, or changing/empty reports; the push fixture answers unknown requests, so current client tests cannot prove capability negotiation/gating, didChange refresh, preservation, failure swallowing, or `onDiagnostics` relay side effects.
