---
name: feedback_cubic_clean
description: cubic returns 0 issues on this project even for non-trivial refactors; manual code review is still valuable
metadata:
  type: feedback
---

cubic has returned an empty `issues` array on every run observed so far (both `-b` branch scans and working-tree scans), including after a substantial structural refactor of `packages/lsp/src/multiplexer.ts` on `feat/multiplexing-lsp-server` (PR #100).

**Why:** The codebase is well-typed TypeScript with thorough inline documentation; cubic may not surface style-level or architecture-level issues that a human reviewer would catch.

**How to apply:** When cubic returns no issues, do a manual pass over the diff, focusing on correctness of async patterns, signal handler cleanup, and LSP protocol compliance — these are the areas most likely to have subtle bugs that static analysis misses.
