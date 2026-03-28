# Tech Stack

## Runtime & Language

| Layer | Technology | Version |
|---|---|---|
| Runtime | Bun | 1.3+ |
| Language | TypeScript | 5.7+ |
| Module System | ESM | `verbatimModuleSyntax` |

## Build & Development

| Tool | Purpose |
|---|---|
| Turbo | Monorepo task orchestration |
| Bun | Package manager, script runner, test runner |
| Husky | Git hooks |
| lint-staged | Pre-commit linting |

## Code Quality

| Tool | Purpose |
|---|---|
| ESLint 9 | Linting (@antfu/eslint-config, lib type) |
| Prettier | Code formatting (via Bun) |
| TypeScript strict | Type checking (exactOptionalPropertyTypes, noUncheckedIndexedAccess) |
| Codecov | Code coverage reporting |

## Protocols & SDKs

| Protocol | Library | Purpose |
|---|---|---|
| MCP | @modelcontextprotocol/sdk 1.12+ | AI tool communication |
| LSP | vscode-jsonrpc, vscode-languageserver-types | Language server protocol |

## Infrastructure

| Component | Technology |
|---|---|
| Package registry | npm (@pleaseai scope) |
| Release management | release-please |
| CI/CD | GitHub Actions |
| Monorepo structure | Bun workspaces (packages/*, apps/*, hooks/scripts) |

## Key Dependencies

- `@modelcontextprotocol/sdk` — MCP server/client implementation
- `vscode-jsonrpc` — JSON-RPC communication for LSP
- `vscode-languageserver-types` — LSP type definitions
- `yaml` — YAML config file parsing
