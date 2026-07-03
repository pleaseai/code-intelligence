# Architecture

This document describes the high-level architecture of the **code-intelligence** monorepo.
If you want to familiarize yourself with the codebase, you are in the right place.

## Bird's-Eye View

code-intelligence provides language intelligence tooling for AI-assisted coding.
It bridges the gap between AI code editors (like Claude Code) and the rich ecosystem
of language servers and formatters, giving AI agents real-time diagnostics, code
navigation, and auto-formatting without requiring IDE integration.

The system operates in three modes:

1. **Hook mode** — Claude Code invokes `code format --stdin` after every Write/Edit
   tool call, auto-formatting files and returning LSP diagnostics as context.
2. **CLI mode** — Developers run `code format <file>` or `code lsp <file>` directly.
3. **MCP server mode** — `dora serve` exposes LSP and file tools via the Model Context
   Protocol, enabling any MCP-compatible client (JetBrains, Claude Desktop) to use
   language intelligence.

```
                    ┌─────────────────────────────────┐
                    │          AI Code Editor          │
                    │  (Claude Code / MCP Client)      │
                    └──────┬──────────────┬────────────┘
                           │              │
              PostToolUse hook        MCP protocol (stdio)
                           │              │
                    ┌──────▼──────┐ ┌─────▼──────┐
                    │  code CLI   │ │  dora MCP   │
                    │  (hooks)    │ │  server     │
                    └──────┬──────┘ └─────┬──────┘
                           │              │
                    ┌──────▼──────────────▼──────┐
                    │     Shared Libraries        │
                    │  ┌──────────┐ ┌──────────┐  │
                    │  │  format  │ │   lsp    │  │
                    │  └──────────┘ └──────────┘  │
                    │  ┌──────────┐ ┌──────────┐  │
                    │  │ binaries │ │  logger  │  │
                    │  └──────────┘ └──────────┘  │
                    └─────────────────────────────┘
                           │              │
              Subprocess (stdio)    JSON-RPC (stdio)
                           │              │
                    ┌──────▼──────┐ ┌─────▼──────────┐
                    │ Formatters  │ │ Language Servers │
                    │ (biome,     │ │ (tsserver,      │
                    │  prettier,  │ │  pyright,       │
                    │  gofmt ...) │ │  gopls ...)     │
                    └─────────────┘ └─────────────────┘
```

## Entry Points

If you're looking at the codebase for the first time, start here:

| Entry Point | Path | What it does |
|---|---|---|
| **code CLI** | `packages/code/src/cli.ts` | Main CLI dispatcher for `format`, `lsp`, `lsp-server`, `setup` commands |
| **dora CLI** | `packages/dora/src/cli.ts` | MCP server entry — `dora serve` starts stdio transport |
| **Hook runner** | `hooks/scripts/code-runner.ts` | Claude Code PostToolUse hook — runs `@pleaseai/code format --stdin` via bunx |
| **Hook config** | `hooks/hooks.json` | Declares PostToolUse hooks triggered on Write/Edit tool calls |
| **Build config** | `turbo.json` | Turborepo task definitions — build, typecheck, test, dev |

## Module Structure

### `packages/code` — CLI Tool (`@pleaseai/code`)

The CLI orchestrator. Thin wrapper that delegates to `code-format` and `code-lsp`.

```
packages/code/src/
├── cli.ts              # Command dispatcher (format, lsp, lsp-server, setup)
├── index.ts            # Public API re-exports
├── commands/setup.ts   # Tool installation verification
├── hooks/lsp.ts        # PostToolUse LSP diagnostics reporting
├── providers/lsp/      # LSP provider for MCP tools
└── utils.ts            # Argument parsing, platform detection
```

**Key behavior**: In hook mode (`--stdin`), reads JSON from stdin containing
`tool_input.file_path`, runs the formatter, and outputs JSON with
`suppressOutput: true` (format) or `additionalContext` (lsp diagnostics).

### `packages/format` — Formatter Orchestration (`@pleaseai/code-format`)

Detects and runs the right formatter for any file extension.

```
packages/format/src/
├── index.ts            # Format object (initFromProject, formatFile, status)
├── formatter.ts        # Built-in formatter definitions (35+ languages)
└── config/             # Config loading from .please/config.yml
    ├── index.ts        # Public config API
    ├── loader.ts       # YAML/JSON config file discovery
    └── schema.ts       # Zod validation schemas
```

**Core API**:
```typescript
await Format.initFromProject(projectDir) // Load config, register formatters
await Format.formatFile(filePath) // Find matching formatter, execute
await Format.status() // List all formatters and their state
```

**Formatter lifecycle**: Extension match → enabled check (does config file exist
in project?) → spawn subprocess → replace `$FILE` placeholder in command.

### `packages/lsp` — LSP Client (`@pleaseai/code-lsp`)

Manages multiple language server processes and provides a unified API for
diagnostics, navigation, completions, and rename.

```
packages/lsp/src/
├── index.ts            # LSPManager class — main public API
├── client.ts           # JSON-RPC client over stdio
├── config.ts           # LSP config loading and validation
├── language.ts         # File extension → language ID mapping
└── server/             # Server definitions (30+ files)
    ├── index.ts        # LSP_SERVERS registry array
    ├── typescript.ts   # TypeScript/JavaScript server
    ├── pyright.ts      # Python server
    └── ...             # One file per language server
```

**LSPManager** is the central abstraction. It lazily spawns language servers on
first file touch, caches clients by `(root, serverId)`, and fans out requests
to all relevant servers for a given file extension.

**Server definition pattern** — each server declares:

<!-- eslint-skip -->

```typescript
{
  id: string           // e.g. 'typescript'
  extensions: string[] // e.g. ['.ts', '.tsx', '.js']
  root: (filePath, projectDir) => Promise<string | null>  // Project detection
  spawn: (root) => Promise<LSPServerHandle | null>         // Start server
}
```

Root detection searches upward for config files (e.g., `package-lock.json` for
TypeScript, `go.mod` for Go). If no root is found, the server is not started.

### `packages/dora` — MCP Server (`@pleaseai/dora`)

Exposes language intelligence as MCP tools for AI clients.

```
packages/dora/src/
├── cli.ts              # Entry point — starts stdio MCP transport
├── server.ts           # McpServer setup, tool registration, request routing
├── providers/
│   ├── provider.ts     # Provider interface definition
│   ├── lsp/            # LSP tools (diagnostics, hover, definition, references)
│   ├── file/           # File tools (read, search, directory structure)
│   ├── ast-grep/       # AST-aware search and transform tools
│   └── jetbrains/      # JetBrains IDE integration (TBD — not yet active)
└── errors/             # Typed error classes
```

**Provider pattern** — the key architectural abstraction:
```typescript
interface Provider {
  readonly name: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isConnected: () => boolean
  listTools: () => ToolDefinition[]
  callTool: (name: string, args: unknown) => Promise<ToolResult>
}
```

The MCP server collects tools from all providers at startup, then routes
`tools/call` requests to the owning provider by tool name lookup.

**MCP tools exposed**:
- `lsp_diagnostics`, `lsp_hover`, `lsp_definition`, `lsp_references`,
  `lsp_document_symbol`, `lsp_workspace_symbol`
- `read_file`, `search_files`, `get_directory_structure`, `list_files`
- `ast_grep_search`, `ast_grep_transform`, `ast_grep_analyze`

### `packages/logger` — Structured Logging (`@pleaseai/logger`)

Thin wrapper around `pino`. All packages use `createLogger('module-name')`.

### `packages/binaries` — Binary Management (`@pleaseai/binaries`)

Downloads, caches, and extracts language server binaries. Handles platform
detection (`darwin-x64`, `linux-arm64`, etc.) and cache directory management
under `~/.cache/dora/`.

### `plugins/` — LSP Server Plugins

32 LSP server plugin directories (plus `dora-jetbrains-plugin` for IDE
integration), each containing a `package.json` that declares dependencies.
LSP plugins are auto-installed via `npm install` into `$CLAUDE_PLUGIN_DATA`
on first session start.

Example (`plugins/typescript-lsp/package.json`):
```json
{
  "dependencies": {
    "typescript-language-server": "^5.1.0",
    "typescript": "^5.7.0"
  }
}
```

### `hooks/` — Claude Code Integration

- `hooks.json` — Declares PostToolUse hooks for Write/Edit events
- `hooks/scripts/code-runner.ts` — Spawns `@pleaseai/code` via `bunx` at
  the version pinned in `.release-please-manifest.json`

### Other Directories

| Directory | Purpose |
|---|---|
| `apps/` | Documentation site |
| `docs/` | Project documentation |
| `examples/` | Example projects demonstrating LSP integration |
| `npm/` | Generated npm package output (build artifact) |
| `scripts/` | Build utilities (`generate-packages.ts`) |
| `specs/` | Feature specifications |
| `ref/` | Reference repository checkouts (gitignored, local only) |

## Data Flow

### Hook Mode (Primary Use Case)

```
1. Claude Code writes/edits a file
2. PostToolUse hook triggers
3. hooks/scripts/code-runner.ts spawns: bunx @pleaseai/code format --stdin
4. code CLI reads JSON from stdin: { tool_input: { file_path: "src/app.ts" } }
5. Format.initFromProject() loads .please/config.yml
6. Format.formatFile() finds biome for .ts, spawns: biome format --write src/app.ts
7. Output: { suppressOutput: true }
8. (If LSP hook enabled) code lsp --stdin
9. LSPManager.touchFile() → spawns typescript-language-server if not running
10. Collects diagnostics → formats top 5 issues
11. Output: { hookSpecificOutput: { additionalContext: "[code lsp]: 2 errors..." } }
12. Claude Code receives diagnostics in its context window
```

### MCP Server Mode

```
1. MCP client sends: tools/call { name: "lsp_definition", arguments: {...} }
2. StdioServerTransport deserializes MCP message
3. McpServer routes to LSPProvider by tool name lookup
4. LSPProvider.callTool() delegates to LSPManager.definition()
5. LSPManager finds/spawns appropriate language server for file extension
6. JSON-RPC request: textDocument/definition → language server process
7. Response normalized to Location[] (handles Location, LocationLink variants)
8. ToolResult returned to MCP client
```

## Configuration

All configuration lives in `.please/config.yml` (or `.please/config.json`):

```yaml
formatter:
  biome:
    command: [biome, format, --write, $FILE]
    extensions: [.ts, .tsx]
  prettier:
    disabled: true

lsp:
  typescript:
    enabled: true
  pyright:
    root: ./backend
    enabled: false
```

Config loading (`packages/format/src/config/loader.ts`) searches upward from
the project directory for `.please/config.yml` or `.please/config.json`.
Both formatter and LSP configs share the same file and are validated with Zod.

Set `formatter: false` or `lsp: false` to globally disable either subsystem.

## Architecture Invariants

These are constraints that must be maintained. Violating them will break things.

1. **Packages must not import from `packages/code` or `packages/dora`**.
   Dependency flow is: `code` → `format`, `lsp`, `logger`. `dora` → `lsp`, `logger`.
   The shared libraries (`format`, `lsp`, `logger`, `binaries`) must not depend on
   the CLI or MCP packages.

2. **Language servers communicate exclusively via stdio JSON-RPC**.
   Never use TCP, HTTP, or shared memory for LSP communication. The `LSPServerHandle`
   type enforces this — it wraps a `ChildProcess` with stdin/stdout pipes.

3. **Hook output must be valid JSON on a single stdout line**.
   Claude Code parses hook output as JSON. Any non-JSON output (logs, warnings)
   must go to stderr. The `suppressOutput` and `hookSpecificOutput` shapes are
   part of Claude Code's hook protocol.

4. **Server root detection must be deterministic and side-effect-free**.
   The `root()` function on `LSPServerInfo` searches for config files to determine
   if a language server should be started. It must never create files, install
   packages, or modify state.

5. **One server definition per file in `packages/lsp/src/server/`**.
   Each language server has its own file exporting a const (e.g., `TypescriptServer`).
   All are aggregated in `server/index.ts` into the `LSP_SERVERS` array.

6. **Plugin directories contain only `package.json`**.
   Plugin directories under `plugins/` declare dependencies only. Server logic
   lives in `packages/lsp/src/server/`. Plugins are install targets, not code.

7. **Formatters use `$FILE` placeholder, never stdin**.
   Formatter commands receive the file path via `$FILE` substitution in the
   command array. They operate on the file in-place (write mode).

## Cross-Cutting Concerns

### Error Handling

- All packages use structured logging via `@pleaseai/logger` (pino).
- LSP client errors are caught per-server — a broken server does not take down
  others. Failed servers are added to a `broken` set and not retried.
- Hook mode errors output valid JSON to stdout and exit cleanly. The hook
  command is wrapped with `|| true` in `hooks.json` to prevent blocking
  Claude Code on formatter failures.

### Testing

- **Framework**: Bun test (native, no external test runner).
- **Location**: `packages/*/test/` with `unit/` and `integration/` subdirectories.
- **Pattern**: Unit tests mock child processes; integration tests may spawn real
  language servers.
- **Run**: `bun run test` (via Turborepo) or `bun test` in individual packages.

### Build & Release

- **Package manager**: Bun 1.3.5+
- **Build orchestration**: Turborepo with `build → typecheck → test` pipeline.
  Package builds depend on their upstream packages (`^build`).
- **Release**: release-please for changelog generation and version bumps.
  `bun run build:npm` generates distributable packages under `npm/`.
- **Linting**: ESLint with `@antfu/eslint-config`, enforced via `lint-staged`
  and Husky pre-commit hooks.

### Language Support Matrix

The system supports 30+ languages. Adding a new language requires:

1. Create server definition in `packages/lsp/src/server/<lang>.ts`
2. Add to `LSP_SERVERS` array in `server/index.ts`
3. Create plugin directory `plugins/<lang>-lsp/package.json` with dependencies
4. (Optional) Add formatter entry in `packages/format/src/formatter.ts`
