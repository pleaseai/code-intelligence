# Prisma LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Prisma schema files using [@prisma/language-server](https://github.com/prisma/language-tools).

## Requirements

- Node.js and npm in PATH

The plugin uses `npx` to run the Prisma language server on-demand. For better performance, you can install it globally:

```bash
npm install -g @prisma/language-server
```

## Supported File Types

- Prisma Schema: `.prisma`

## Features

- Schema syntax validation
- Model and field autocomplete
- Relation validation
- Database connector validation
- Go to definition for models

## Configuration

The Prisma language server looks for `schema.prisma` or `prisma/schema.prisma` in your project root.
