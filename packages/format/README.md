# @pleaseai/code-format

Auto-format hooks for AI coding tools.

## Installation

```bash
bun add @pleaseai/code-format
```

## Features

- Multi-formatter support with automatic detection
- Configuration via `dora.json`, `opencode.json`, or `.please/config.yml`
- Custom formatter support with command templates

## Quick Start

```typescript
import { Format } from '@pleaseai/code-format'

// Initialize from project configuration
await Format.initFromProject('/path/to/project')

// Format a file
await Format.formatFile('src/index.ts')

// Get formatter status
const status = await Format.status()
```

## Supported Formatters

| Formatter | Extensions | Auto-detected by |
|-----------|------------|------------------|
| biome | .ts, .tsx, .js, .jsx, .json, .css, .md, etc. | biome.json |
| prettier | .ts, .tsx, .js, .jsx, .json, .css, .md, etc. | package.json (prettier dep) |
| gofmt | .go | gofmt in PATH |
| mix | .ex, .exs, .eex, .heex | mix in PATH |
| zig | .zig, .zon | zig in PATH |
| clang-format | .c, .cpp, .h, .hpp | .clang-format |
| ktlint | .kt, .kts | ktlint in PATH |
| ruff | .py, .pyi | ruff.toml, pyproject.toml |
| uv format | .py, .pyi | uv in PATH (fallback if no ruff) |
| air | .R | air in PATH |
| rubocop | .rb, .rake, .gemspec | rubocop in PATH |
| standardrb | .rb, .rake, .gemspec | standardrb in PATH |
| htmlbeautifier | .erb, .html.erb | htmlbeautifier in PATH |
| dart | .dart | dart in PATH |
| ocamlformat | .ml, .mli | .ocamlformat |
| terraform | .tf, .tfvars | terraform in PATH |
| latexindent | .tex | latexindent in PATH |
| gleam | .gleam | gleam in PATH |
| prisma | .prisma | schema.prisma |

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

### Configuration options

| Option | Type | Description |
|--------|------|-------------|
| `disabled` | boolean | Disable this formatter |
| `command` | string[] | Command template (`$FILE` = file path) |
| `extensions` | string[] | File extensions to handle |
| `environment` | object | Environment variables |

## API Reference

### Format

| Method | Description |
|--------|-------------|
| `initFromProject(projectDir)` | Initialize from project config files |
| `init(config)` | Initialize with explicit config |
| `formatFile(file)` | Format a file |
| `status()` | Get all formatter statuses |

### Types

```typescript
import type {
  FormatConfig,
  FormatStatus,
  FormatterConfig
} from '@pleaseai/code-format'
```

## License

MIT
