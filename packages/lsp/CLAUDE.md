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
| TypeScript | `typescript` | .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts | package-lock.json, bun.lockb, bun.lock, yarn.lock, pnpm-lock.yaml |
| Deno | `deno` | .ts, .tsx, .js, .jsx, .mjs | deno.json, deno.jsonc |
| Oxlint | `oxlint` | .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .vue, .astro, .svelte | .oxlintrc.json, package-lock.json, bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock, package.json |
| Pyright | `pyright` | .py, .pyi | pyproject.toml, setup.py, requirements.txt, pyrightconfig.json |
| Gopls | `gopls` | .go | go.work, go.mod, go.sum |
| Rust Analyzer | `rust-analyzer` | .rs | Cargo.toml, Cargo.lock |
| Kotlin | `kotlin` | .kt, .kts | build.gradle.kts, build.gradle, settings.gradle.kts, settings.gradle, pom.xml |

## Adding a New Server

1. Define the server in `server.ts`:
```typescript
export const MyServer: LSPServerInfo = {
  id: 'my-server',
  extensions: ['.ext'],
  root: nearestRoot(['config.json']), // or custom root function
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
const KOTLIN_RUNTIME_DEPS = {
  kotlinLsp: { url: '...', version: '...' },
  java: {
    'win-x64': { url: '...', javaHomePath: '...', javaPath: '...' },
    'linux-x64': { url: '...', javaHomePath: '...', javaPath: '...' },
    // ... other platforms
  } as Record<PlatformId, { url: string, javaHomePath: string, javaPath: string }>,
}

async function setupKotlinDependencies(platformId: PlatformId) {
  const cacheDir = path.join(os.homedir(), '.cache', 'dora', 'kotlin-lsp')
  // Check if exists, download and extract if not
  // Verify files exist after download
  return { javaHomePath, kotlinLspPath }
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
