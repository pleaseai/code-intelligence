# Biome LSP Plugin for Claude Code

This plugin provides real-time linting and formatting diagnostics for JavaScript, TypeScript, JSON, and CSS files using [Biome](https://biomejs.dev/).

## Requirements

- Node.js and npm in PATH

The plugin uses `npx` to run Biome on-demand. For better performance, you can install Biome globally or locally in your project:

```bash
# Global installation
npm install -g @biomejs/biome

# Or local installation in your project
npm install --save-dev @biomejs/biome
```

## Supported File Types

- TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`
- JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs`
- JSON: `.json`, `.jsonc`
- CSS: `.css`
- GraphQL: `.graphql`, `.gql`

## Configuration

Biome looks for `biome.json` or `biome.jsonc` in your project root. See [Biome Configuration](https://biomejs.dev/reference/configuration/) for options.
