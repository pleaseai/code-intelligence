# Svelte LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Svelte components using [svelte-language-server](https://github.com/sveltejs/language-tools).

## Requirements

- Node.js and npm in PATH

The plugin uses `npx` to run the Svelte language server on-demand. For better performance, you can install it globally:

```bash
npm install -g svelte-language-server
```

## Supported File Types

- Svelte: `.svelte`

## Features

- Svelte component diagnostics
- TypeScript support in `<script lang="ts">`
- Template syntax checking
- Props and slots validation

## Configuration

The Svelte language server automatically integrates with your project's configuration. Ensure you have `svelte.config.js` in your project root if you use custom preprocessors.
