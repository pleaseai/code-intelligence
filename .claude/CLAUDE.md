# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dora is an MCP (Model Context Protocol) server and CLI tool for AI-assisted coding. It provides:
- **JetBrains IDE integration** via Serena plugin for symbol finding and navigation
- **Auto-formatting hooks** for Claude Code (Write/Edit tool triggers)
- **LSP diagnostics** for real-time type checking feedback

## Build & Development Commands

```bash
bun run build        # Build for distribution (outputs to dist/)
bun run dev          # Development mode with watch
bun run typecheck    # Type check with TypeScript
bun run test         # Run tests with Bun
bun run start        # Start the MCP server
bun run build:npm    # Generate npm packages for distribution
```

## CLI Commands

```bash
code serve              # Start MCP server (default)
code format <file>      # Format a file using configured formatters
code format --stdin     # Format via Claude Code hook (JSON input)
code lsp <file>         # Get LSP diagnostics for a file
code lsp --stdin        # LSP diagnostics via Claude Code hook
code version            # Show version
code help               # Show help
```

## Environment Variables

- `CODE_PROJECT_PATH` - Project path (defaults to argv[2] or cwd)
- `CODE_TIMEOUT` - Request timeout in ms (default: 30000)
- `CLAUDE_PROJECT_DIR` - Used in hook mode to determine project directory

## Architecture

### Communication Flow

```
Claude/MCP Client <-> StdioTransport <-> McpServer <-> Providers
                                                        ├── JetBrainsProvider <-> JetBrains IDE (Serena Plugin)
                                                        └── LSPProvider <-> Language Servers
```

### Key Components

**Entry Point** (`src/cli.ts`): CLI with commands for serve, format, lsp, version, help. Supports `--stdin` for Claude Code hook integration.

**Server** (`src/server.ts`): Creates the MCP server and registers tools from providers.

**Providers** (`src/providers/`):
- `JetBrainsProvider` - Symbol finding via JetBrains IDE
- `LSPProvider` - Diagnostics via language servers

**LSP Layer** (`src/lsp/`):
- `client.ts` - JSON-RPC client for LSP protocol
- `server.ts` - Server definitions (TypeScript, Deno, Pyright, gopls, rust-analyzer)
- `language.ts` - File extension to language ID mapping

**Format Layer** (`src/format/`):
- `index.ts` - Format orchestration with config loading
- `formatter.ts` - Built-in formatter definitions (biome, prettier, dprint, etc.)

**Config** (`src/config/`): Loads configuration from `opencode.json`, `dora.json`, or `.please/config.yml`

**Client Layer** (`src/client/`):
- `JetBrainsClient` - HTTP client for JetBrains plugin API (127.0.0.1)
- `port-discovery.ts` - Scans ports 24226-24245 to find running IDE

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

### Name Path Convention

Symbols are identified by "name paths" - paths in the symbol tree within a source file:
- `MyClass/myMethod` - method inside a class
- `MyClass/myMethod[0]` - first overload of a method
- Patterns: simple name, relative path suffix, or absolute path (prefix with `/`)
