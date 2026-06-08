# code-intelligence-lsp

Unified **multiplexing** LSP server for Claude Code. A single plugin server that
runs **multiple** downstream language servers per file (a type-checker *and*
several linters on the same `.ts`) and merges their diagnostics, hover,
definitions, references, and rename into one LSP stream.

## Why this exists

Claude Code's native plugin LSP allows only **one server per extension**. If you
install separate `typescript-lsp`, `eslint-lsp`, `oxlint-lsp`, and `biome-lsp`
plugins, only the first to register `.ts` survives — the rest are rejected:

```
LSP server "eslint" is not used for .ts files — plugin "typescript-lsp" already registered a server for that extension
```

This plugin registers a **single** server (`code-intelligence`) that claims every
code extension, then internally multiplexes to the matching downstream servers.
Because there is only one plugin server, there is nothing to conflict with.

## Installation

```bash
/plugin marketplace add pleaseai/code-intelligence
/plugin install code-intelligence-lsp@code-intelligence
```

> **Install this *instead of* the individual `*-lsp` plugins.** It is a superset.
> If both are installed, Claude Code rejects whichever registers an extension
> second. Disable the individual ones: `/plugin disable typescript-lsp`, etc.

Downstream language-server binaries are resolved from your **project's**
`node_modules`/PATH (linters need your project's config and plugin versions).
The type-checker (`typescript-language-server`) is available without a project
install; linters (`eslint`, `oxlint`, `biome`) activate only when present in the
project. Missing servers are skipped silently.

## Configuration

Control which downstream servers run via `.please/config.yml` in your project:

```yaml
lsp:
  eslint:
    enabled: true
  biome:
    enabled: false      # turn a linter off
  deno:
    enabled: false      # avoid double-matching .ts with typescript
  pyright:
    root: ./backend     # custom project root
```

- `enabled: true|false` — toggle a server (default: enabled)
- `root: <path>` — custom project root for a server
- See the repo's main config docs for the full `lsp` schema.

### deno vs typescript

Both match `.ts`. They are normally separated by root detection (deno needs
`deno.json`; typescript needs a lockfile). In a project where both resolve,
disable one via config.

## How it works

The plugin's `.lsp.json` points the `code-intelligence` server at
`code lsp-multiplex`. That command starts an LSP server that:

1. Advertises a static superset of capabilities to Claude Code.
2. On each `didOpen`/`didChange`, fans the buffer text out to every matching
   downstream server (lazily spawned, filtered by `.please/config.yml`).
3. Merges each downstream's `publishDiagnostics` into a single debounced push
   per file (never letting one server erase another's diagnostics).
4. Delegates hover / definition / references / documentSymbol / rename to the
   downstreams and merges the results.

The extension→language map in `.lsp.json` is generated from the server
definitions by `scripts/gen-unified-lsp-json.ts`.
