# @pleaseai/code-lsp

LSP (Language Server Protocol) client implementation for AI coding tools.

## Overview

This package provides a unified interface for interacting with multiple language servers, enabling real-time diagnostics, hover information, and symbol navigation.

## Architecture

```
src/
├── index.ts       # Public API, LSPManager class
├── client.ts      # LSP client implementation (JSON-RPC)
├── server.ts      # LSP server definitions
└── language.ts    # Language ID mapping
```

## Supported Language Servers

| Server | ID | Extensions | Root Detection |
|--------|-----|------------|----------------|
| TypeScript | `typescript` | .ts, .tsx, .js, .jsx | package-lock.json, bun.lock, yarn.lock, pnpm-lock.yaml |
| Deno | `deno` | .ts, .tsx, .js | deno.json, deno.jsonc |
| Oxlint | `oxlint` | .ts, .tsx, .js, .jsx, .vue, .astro, .svelte | .oxlintrc.json, package.json |
| Pyright | `pyright` | .py, .pyi | pyproject.toml, setup.py, requirements.txt |
| Gopls | `gopls` | .go | go.mod, go.work |
| Rust Analyzer | `rust-analyzer` | .rs | Cargo.toml |
| Kotlin | `kotlin` | .kt, .kts | build.gradle.kts, build.gradle, pom.xml |

## Adding a New Server

1. Define the server in `server.ts`:
```typescript
export const MyServer: LSPServerInfo = {
  id: 'my-server',
  extensions: ['.ext'],
  root: nearestRoot(['config.json']),  // or custom root function
  async spawn(root) {
    const proc = spawn('my-lsp', ['--stdio'], { cwd: root })
    return { process: proc }
  },
}
```

2. Add to `LSP_SERVERS` array in `server.ts`

3. Export from `index.ts`

4. Add tests in `__tests__/server.test.ts`

## Auto-Download Pattern (Kotlin Example)

For servers requiring runtime dependencies:

```typescript
const RUNTIME_DEPS = {
  lsp: { url: '...', version: '...' },
  runtime: { 'platform-id': { url: '...', path: '...' } },
}

async function setupDependencies(platform: PlatformId) {
  const cacheDir = path.join(os.homedir(), '.cache', 'my-lsp')
  // Download and extract if not exists
  return { lspPath, runtimePath }
}
```

## Key APIs

### LSPManager

Main entry point for managing LSP clients:

```typescript
const manager = new LSPManager(projectPath)

// Touch file to initialize LSP
await manager.touchFile('src/index.ts', true)

// Get diagnostics
const diags = await manager.diagnostics()

// Get hover info
const hover = await manager.hover({ file, line, character })

// Search symbols
const symbols = await manager.workspaceSymbol('query')

// Cleanup
await manager.shutdown()
```

### Server Utilities

```typescript
import { getServerById, getServersForExtension } from '@pleaseai/code-lsp'

const server = getServerById('typescript')
const servers = getServersForExtension('.ts')
```

## Testing

```bash
bun test ./src
```

Tests cover:
- Server definitions (ID, extensions, root, spawn functions)
- LSP client lifecycle
- Manager operations
