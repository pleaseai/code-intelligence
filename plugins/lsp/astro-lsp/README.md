# Astro LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Astro components using [@astrojs/language-server](https://github.com/withastro/language-tools).

## Requirements

- Node.js and npm in PATH

The plugin uses `npx` to run the Astro language server on-demand. For better performance, you can install it globally:

```bash
npm install -g @astrojs/language-server
```

## Supported File Types

- Astro: `.astro`

## Features

- Astro component syntax validation
- TypeScript support in frontmatter
- Props and slots validation
- Integration with framework components (React, Vue, Svelte)

## Configuration

The Astro language server automatically integrates with your project's configuration. Ensure you have `astro.config.mjs` in your project root.
