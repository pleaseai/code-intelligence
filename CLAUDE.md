# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Documents

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Bird's-eye view of the codebase (module structure, data flow, invariants)
- [`.please/INDEX.md`](.please/INDEX.md) — Workspace navigation (tracks, specs, decisions, knowledge)
- [`.please/config.yml`](.please/config.yml) — Workspace and tool configuration

## Project Overview

Monorepo with four packages:

**@pleaseai/code** (`packages/code`) - CLI tool for AI-assisted coding:
- Auto-formatting hooks for Claude Code (Write/Edit tool triggers)
- LSP diagnostics for real-time type checking feedback

**@pleaseai/code-format** (`packages/format`) - Formatter orchestration:
- Auto-format hooks for AI coding
- Support for multiple formatters (biome, prettier, gofmt, etc.)

**@pleaseai/code-lsp** (`packages/lsp`) - LSP client implementation:
- LSP client for AI coding tools
- Support for multiple language servers

**@pleaseai/dora** (`packages/dora`) - MCP server for AI-assisted IDE integration:
- LSP tools via language servers (diagnostics, navigation, symbols)
- File tools (read, search, directory structure)
- AST-grep tools (structural search and transform)

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
code lsp-multiplex [id...] # Run a multiplexing LSP server (merges multiple servers per file)
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
├── hooks/           # Claude Code hook handlers
├── launcher/        # CLI launcher
└── providers/lsp/   # LSP provider
```

### packages/format

```
packages/format/
├── index.ts         # Public API
├── formatter.ts     # Formatter definitions (biome, prettier, etc.)
└── config/          # Config loading (.please/config.json or .please/config.yml)
```

### packages/lsp

```
packages/lsp/
├── index.ts         # Public API
├── client.ts        # LSP client implementation
├── server.ts        # Re-exports from server/ directory
├── server/          # Per-language server definitions (one file per server)
├── config.ts        # LSP config from unified config file
└── language.ts      # Language detection
```

### packages/dora

```
packages/dora/
├── cli.ts           # MCP server CLI
├── server.ts        # MCP server setup
├── client/          # JetBrains HTTP client
├── providers/       # LSP, File, and AstGrep providers
├── tools/           # MCP tool implementations
└── errors/          # Error handling
```

### Communication Flow (dora)

```
Claude/MCP Client <-> StdioTransport <-> McpServer <-> Providers
                                                        ├── LSPProvider <-> Language Servers
                                                        ├── FileProvider <-> File System
                                                        └── AstGrepProvider <-> ast-grep CLI
```

### Supported Language Servers

| Language | Server | Root Detection |
|----------|--------|----------------|
| TypeScript/JavaScript | typescript-language-server (auto-upgrades to native TypeScript 7 `tsc --lsp` when the project ships it) | package-lock.json, bun.lock, etc. |
| TypeScript/JavaScript | oxlint | .oxlintrc.json, package.json |
| Deno | deno lsp | deno.json, deno.jsonc |
| Python | pyright-langserver | pyproject.toml, setup.py, requirements.txt |
| Go | gopls | go.mod, go.work |
| Rust | rust-analyzer | Cargo.toml |
| Kotlin | JetBrains Kotlin LSP (auto-download) | build.gradle.kts, build.gradle, pom.xml |
| Dart | dart language-server (auto-download) | pubspec.yaml, pubspec.lock |
| Prisma | @prisma/language-server (auto-download) | schema.prisma, prisma/schema.prisma |
| Vue | @vue/language-server (auto-download) | package.json (with vue) |

### Built-in Formatters

biome, prettier, gofmt, mix (Elixir), zig fmt, clang-format, ktlint (Kotlin), ruff, air (R), uv format, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam, prisma

### Configuration

Configuration is loaded from `.please/config.json` or `.please/config.yml` in the project root.

```yaml
# .please/config.yml

# Shared settings
language: en
ignore_patterns:
  - node_modules
  - dist

# Formatter settings
formatter:
  biome:
    command: [biome, format, --write, $FILE]
    extensions: [.ts, .tsx, .js, .jsx]
  prettier:
    disabled: true # Disable a built-in formatter

# LSP settings
lsp:
  typescript:
    enabled: true
  vue:
    enabled: false # Disable a specific LSP server
  pyright:
    root: ./backend # Custom root path
```

**Formatter Config:**
- `disabled: true` - Disable a built-in formatter
- `command: [...]` - Override command (use `$FILE` placeholder)
- `extensions: [...]` - Override file extensions
- `environment: {...}` - Environment variables

**LSP Config:**
- `enabled: true/false` - Enable/disable specific LSP servers
- `root: "path"` - Custom project root path
- `command: [...]` - Custom spawn command

Set `lsp: false` or `formatter: false` to globally disable.

### Name Path Convention (JetBrains)

Symbols are identified by "name paths" - paths in the symbol tree within a source file:
- `MyClass/myMethod` - method inside a class
- `MyClass/myMethod[0]` - first overload of a method
- Patterns: simple name, relative path suffix, or absolute path (prefix with `/`)
