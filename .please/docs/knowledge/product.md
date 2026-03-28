# Product Guide

## Vision

Code Please is a CLI tool and Claude Code plugin suite that brings **code intelligence** (auto-formatting and LSP diagnostics) directly into AI-assisted coding workflows. The goal is to ensure that AI-generated code meets the same quality standards as human-written code — properly formatted, type-safe, and lint-clean — without manual intervention.

## Target Users

- **AI-assisted developers** using Claude Code, Dora (MCP), or similar AI coding tools
- **Teams adopting AI coding** who need guardrails for code quality
- **IDE power users** who want JetBrains integration with AI workflows via MCP

## Core Value Proposition

1. **Automatic code formatting** — Files are formatted immediately after AI edits via PostToolUse hooks
2. **Real-time LSP diagnostics** — Type errors and lint issues surface as AI writes code, not after
3. **Multi-language support** — TypeScript, Python, Go, Rust, Kotlin, Dart, and 15+ more languages
4. **Zero-config defaults** — Built-in formatters and LSP servers with sensible defaults; opt-in customization via `.please/config.yml`
5. **IDE bridge** — Dora MCP server connects JetBrains IDEs to AI workflows for symbol navigation and diagnostics

## Product Scope

| In Scope | Out of Scope |
|---|---|
| CLI formatting & LSP diagnostics | Full IDE replacement |
| Claude Code hook integration | Non-AI code editing workflows |
| JetBrains MCP bridge (Dora) | VS Code extension (separate project) |
| Plugin architecture for LSP servers | Custom language server development |
| `.please/config.yml` configuration | GUI configuration interface |

## Success Metrics

- Formatting hook runs in < 2s per file
- LSP diagnostics available within 5s of server startup
- Zero false-positive type errors from supported LSP servers
- Plugin installation works with `npm install -g` or `bun add -g`
