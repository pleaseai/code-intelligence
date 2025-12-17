# Dora

MCP server and CLI tool for AI-assisted coding with auto-formatting and LSP diagnostics.

## Features

- **Auto-formatting hooks** - Automatically format files after Claude Code edits
- **LSP diagnostics** - Real-time type checking feedback for AI coding sessions
- **JetBrains IDE integration** - Symbol finding and navigation via Serena plugin
- **Multi-language support** - TypeScript, Python, Go, Rust, and more

## Installation

```bash
npm install -g @pleaseai/code
# or
bun add -g @pleaseai/code
```

## Quick Start

### Claude Code Hooks

Add to your `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx @pleaseai/code format --stdin"
          },
          {
            "type": "command",
            "command": "npx @pleaseai/code lsp --stdin"
          }
        ]
      }
    ]
  }
}
```

Or copy the example hooks file:

```bash
cp node_modules/@pleaseai/code/hooks/hooks.json .claude/
```

### CLI Usage

```bash
# Format a file
dora format src/index.ts

# Get LSP diagnostics
dora lsp src/index.ts

# Start MCP server
dora serve
```

## Configuration

Create `dora.json` or `opencode.json` in your project root:

```json
{
  "formatter": {
    "biome": {
      "extensions": [".ts", ".tsx", ".js", ".jsx", ".json"]
    },
    "prettier": {
      "disabled": true
    },
    "custom": {
      "command": ["my-formatter", "$FILE"],
      "extensions": [".xyz"]
    }
  }
}
```

### Disable all formatters

```json
{
  "formatter": false
}
```

## Supported Languages

### LSP Diagnostics

| Language | Server | Auto-detected by |
|----------|--------|------------------|
| TypeScript/JavaScript | typescript-language-server | package.json, bun.lock |
| Deno | deno lsp | deno.json |
| Python | pyright | pyproject.toml, requirements.txt |
| Go | gopls | go.mod |
| Rust | rust-analyzer | Cargo.toml |

### Formatters

biome, prettier, dprint, gofmt, goimports, rustfmt, black, ruff, stylua, shfmt, nixfmt, zig fmt, swift-format, clang-format

## MCP Server

Dora can run as an MCP server for JetBrains IDE integration:

```bash
dora serve --project=/path/to/project
```

### Available Tools

- `jet_brains_find_symbol` - Find symbols by name path pattern
- `jet_brains_find_referencing_symbols` - Find references to a symbol
- `jet_brains_get_symbols_overview` - Get overview of symbols in a file
- `lsp_diagnostics` - Get LSP diagnostics for a file
- `lsp_status` - Check LSP server status

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DORA_PROJECT_PATH` | Project directory | cwd |
| `DORA_TIMEOUT` | Request timeout (ms) | 30000 |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Type check
bun run typecheck

# Build
bun run build
```

## License

MIT
