# Code Please

CLI and Claude Code plugin for AI-assisted coding with auto-formatting and LSP diagnostics.

## Features

- **Auto-formatting hooks** - Automatically format files after Claude Code edits
- **LSP diagnostics** - Real-time type checking feedback for AI coding sessions
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
code format src/index.ts

# Get LSP diagnostics
code lsp src/index.ts
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

| Language              | Server                     | Auto-detected by                 |
|-----------------------|----------------------------|----------------------------------|
| TypeScript/JavaScript | typescript-language-server | package.json, bun.lock           |
| TypeScript/JavaScript | oxlint                     | .oxlintrc.json, package.json     |
| Deno                  | deno lsp                   | deno.json                        |
| Python                | pyright                    | pyproject.toml, requirements.txt |
| Go                    | gopls                      | go.mod                           |
| Rust                  | rust-analyzer              | Cargo.toml                       |

### Formatters

biome, prettier, gofmt, mix, zig fmt, clang-format, ktlint, ruff, air (R), uv format, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam

## MCP Server

(TBD)

## Environment Variables

| Variable             | Description       | Default |
|----------------------|-------------------|---------|
| `CODE_PROJECT_PATH`  | Project directory | cwd     |
| `CLAUDE_PROJECT_DIR` | Used in hook mode | -       |

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
