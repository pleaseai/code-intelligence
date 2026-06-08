---
name: project-rules
description: code-intelligence engineering rules used for review, plus known pre-existing exceptions
metadata:
  type: project
---

Review rules (from CLAUDE.md / engineering standards): files ≤500 LOC, YAGNI, DRY, do not weaken or skip tests to make code pass.

**Known pre-existing exception:** `packages/lsp/src/index.ts` was already 947 LOC on `origin/main` and is the `LSPManager` god-class. PRs that add to it push it further over 500 but the violation is pre-existing — do not flag growth here as a NEW violation; note it only if the PR's whole purpose is that file.

**How to apply:** When a file exceeds 500 LOC, check `git show origin/main:<path> | wc -l` before flagging — only report as a violation if the PR itself crossed the threshold or the file is newly added over-limit.
