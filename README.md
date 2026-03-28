# Code Please

English | [한국어](README.ko.md)

Auto-formatting and LSP diagnostics plugin for Claude Code. Get real-time type checking feedback and automatic code formatting during AI coding sessions.

## Features

- **Auto-formatting hooks** — Automatically format files after Claude Code edits (35+ formatters)
- **LSP diagnostics** — Real-time type errors and warnings fed back to Claude as context
- **30+ language servers** — TypeScript, Python, Go, Rust, Kotlin, Dart, and more
- **Zero config** — Language servers are auto-detected from project files

## Plugin Installation (Claude Code)

### Step 1: Add the marketplace

```bash
/plugin marketplace add pleaseai/code-intelligence
```

### Step 2: Install the plugin

```bash
# Install core plugin (auto-formatting hooks + LSP diagnostics)
/plugin install code-please@code-intelligence

# Install to project scope (shared with team via .claude/settings.json)
/plugin install code-please@code-intelligence --scope project
```

This installs the `code-please` plugin which provides:
- PostToolUse hooks for auto-formatting on Write/Edit
- LSP diagnostics fed back as context to Claude

### Install language-specific LSP plugins

Install only the language servers you need:

```bash
# TypeScript/JavaScript
/plugin install typescript-lsp@code-intelligence

# Python
/plugin install pyright-lsp@code-intelligence

# Go
/plugin install gopls-lsp@code-intelligence

# Rust
/plugin install rust-analyzer-lsp@code-intelligence
```

> **Note:** Language server binaries are auto-installed via `npm install` on first session start.
> No manual binary installation is required.

### Plugin management

```bash
# Update marketplace and plugins
/plugin marketplace update code-intelligence

# Disable without removing
/plugin disable code-please@code-intelligence

# Re-enable
/plugin enable code-please@code-intelligence

# Uninstall
/plugin uninstall code-please@code-intelligence

# Reload after changes (no restart needed)
/reload-plugins
```

### Available LSP plugins

| Plugin | Language | Server |
|--------|----------|--------|
| `typescript-lsp` | TypeScript/JavaScript | typescript-language-server |
| `pyright-lsp` | Python | pyright |
| `gopls-lsp` | Go | gopls |
| `rust-analyzer-lsp` | Rust | rust-analyzer |
| `kotlin-lsp` | Kotlin | JetBrains Kotlin LSP |
| `dart-lsp` | Dart | dart language-server |
| `vue-lsp` | Vue | @vue/language-server |
| `svelte-lsp` | Svelte | svelte-language-server |
| `astro-lsp` | Astro | @astrojs/language-server |
| `deno-lsp` | Deno | deno lsp |
| `biome-lsp` | JS/TS (linter) | biome |
| `oxlint-lsp` | JS/TS (linter) | oxlint |
| `eslint-lsp` | JS/TS (linter) | eslint |
| `prisma-lsp` | Prisma | @prisma/language-server |
| `graphql-lsp` | GraphQL | graphql-language-service-cli |
| `yaml-lsp` | YAML | yaml-language-server |
| `bash-lsp` | Bash/Shell | bash-language-server |
| `dockerfile-lsp` | Dockerfile | dockerfile-language-server |
| `php-lsp` | PHP | intelephense |
| `jdtls-lsp` | Java | Eclipse JDTLS |
| `clangd-lsp` | C/C++ | clangd |
| `csharp-lsp` | C# | OmniSharp |
| `fsharp-lsp` | F# | fsautocomplete |
| `swift-lsp` | Swift | SourceKit-LSP |
| `rubocop-lsp` | Ruby (linter) | rubocop |
| `elixir-lsp` | Elixir | elixir-ls |
| `lua-lsp` | Lua | lua-language-server |
| `ocaml-lsp` | OCaml | ocaml-lsp |
| `terraform-lsp` | Terraform | terraform-ls |
| `texlab-lsp` | LaTeX | TexLab |
| `gleam-lsp` | Gleam | gleam |
| `zls-lsp` | Zig | zls |

## CLI Usage

```bash
# Install globally
npm install -g @pleaseai/code

# Format a file
code format src/index.ts

# Get LSP diagnostics
code lsp src/index.ts

# Check and install tools
code setup
```

## Configuration

Create `.please/config.yml` in your project root:

```yaml
# Formatter settings
formatter:
  biome:
    command: [biome, format, --write, $FILE]
    extensions: [.ts, .tsx, .js, .jsx]
  prettier:
    disabled: true    # Disable a built-in formatter
  custom:
    command: [my-formatter, $FILE]
    extensions: [.xyz]

# LSP settings
lsp:
  typescript:
    enabled: true
  pyright:
    root: ./backend   # Custom root path
  vue:
    enabled: false     # Disable a specific server
```

Set `formatter: false` or `lsp: false` to globally disable either subsystem.

## Built-in Formatters

biome, prettier, gofmt, mix (Elixir), zig fmt, clang-format, ktlint (Kotlin), ruff, air (R), uv format, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam, prisma

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CODE_PROJECT_PATH` | Project directory | cwd |
| `CLAUDE_PROJECT_DIR` | Used in hook mode | - |

## Development

```bash
bun install       # Install dependencies
bun run test      # Run tests
bun run typecheck # Type check
bun run build     # Build
```

## License

MIT
