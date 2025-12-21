# Vue LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Vue 3 Single File Components using [@vue/language-server](https://github.com/vuejs/language-tools).

## Requirements

- Node.js and npm in PATH

The plugin uses `npx` to run the Vue language server on-demand. For better performance, you can install it globally:

```bash
npm install -g @vue/language-server
```

## Supported File Types

- Vue SFC: `.vue`

## Features

- Full Hybrid Mode enabled (recommended for Vue 3)
- TypeScript support in `<script setup>`
- Template syntax checking
- Component prop validation

## Configuration

The Vue language server automatically detects your project's TypeScript configuration. Ensure you have a `tsconfig.json` in your project root.
