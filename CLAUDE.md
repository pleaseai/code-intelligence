# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo with two packages:

**@pleaseai/code** (`packages/code`) - CLI tool for AI-assisted coding:
- Auto-formatting hooks for Claude Code (Write/Edit tool triggers)
- LSP diagnostics for real-time type checking feedback

**@pleaseai/dora** (`packages/dora`) - MCP server for JetBrains IDE integration:
- Symbol finding and navigation via Serena plugin
- LSP tools via language servers

## Build & Development Commands

```bash
bun run build        # Build for distribution (outputs to dist/)
bun run dev          # Development mode with watch
bun run typecheck    # Type check with TypeScript
bun run test         # Run tests with Bun
bun run build:npm    # Generate npm packages for distribution
```

## CLI Commands

### @pleaseai/code

```bash
code format <file>      # Format a file using configured formatters
code format --stdin     # Format via Claude Code hook (JSON input)
code lsp <file>         # Get LSP diagnostics for a file
code lsp --stdin        # LSP diagnostics via Claude Code hook
code version            # Show version
code help               # Show help
```

### @pleaseai/dora

```bash
dora serve              # Start MCP server (default)
dora version            # Show version
dora help               # Show help
```

## Environment Variables

### @pleaseai/code
- `CODE_PROJECT_PATH` - Project path (defaults to cwd)
- `CLAUDE_PROJECT_DIR` - Used in hook mode to determine project directory

### @pleaseai/dora
- `DORA_PROJECT_PATH` - Project path (defaults to cwd)
- `DORA_TIMEOUT` - Request timeout in ms (default: 30000)

## Architecture

### packages/code

```
packages/code/
├── cli.ts           # CLI entry point (format, lsp commands)
├── format/          # Formatter orchestration
├── lsp/             # LSP client implementation
├── config/          # Config loading
├── hooks/           # Claude Code hook handlers
└── providers/lsp/   # LSP provider
```

### packages/dora

```
packages/dora/
├── cli.ts           # MCP server CLI
├── server.ts        # MCP server setup
├── client/          # JetBrains HTTP client
├── providers/       # JetBrains + LSP providers
├── tools/           # MCP tool implementations
├── lsp/             # LSP client implementation
└── errors/          # Error handling
```

### Communication Flow (dora)

```
Claude/MCP Client <-> StdioTransport <-> McpServer <-> Providers
                                                        ├── JetBrainsProvider <-> JetBrains IDE (Serena Plugin)
                                                        └── LSPProvider <-> Language Servers
```

### Supported Language Servers

| Language | Server | Root Detection |
|----------|--------|----------------|
| TypeScript/JavaScript | typescript-language-server | package-lock.json, bun.lock, etc. |
| Deno | deno lsp | deno.json, deno.jsonc |
| Python | pyright-langserver | pyproject.toml, setup.py, requirements.txt |
| Go | gopls | go.mod, go.work |
| Rust | rust-analyzer | Cargo.toml |

### Built-in Formatters

biome, prettier, dprint, gofmt, goimports, rustfmt, black, ruff, stylua, shfmt, nixfmt, zig fmt, swift-format, clang-format

### Name Path Convention (JetBrains)

Symbols are identified by "name paths" - paths in the symbol tree within a source file:
- `MyClass/myMethod` - method inside a class
- `MyClass/myMethod[0]` - first overload of a method
- Patterns: simple name, relative path suffix, or absolute path (prefix with `/`)
