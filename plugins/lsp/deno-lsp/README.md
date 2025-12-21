# Deno LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Deno projects using the built-in [Deno LSP](https://deno.land/manual@v1.40/getting_started/setup_your_environment#using-an-lsp-client).

## Requirements

- Deno installed and in PATH

Install Deno following the [official installation guide](https://deno.land/manual@v1.40/getting_started/installation).

## Supported File Types

- TypeScript: `.ts`, `.tsx`
- JavaScript: `.js`, `.jsx`, `.mjs`

## Features

- Deno-specific import resolution (URL imports, npm: specifiers)
- TypeScript type checking
- Built-in formatter and linter integration
- Remote module caching

## Configuration

The Deno language server looks for `deno.json` or `deno.jsonc` in your project root. This file enables Deno mode for the directory.

```json
{
  "compilerOptions": {
    "lib": ["deno.window"]
  }
}
```
