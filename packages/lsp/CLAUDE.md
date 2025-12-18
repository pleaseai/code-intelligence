# @pleaseai/code-lsp

LSP (Language Server Protocol) client implementation for AI coding tools.

## Overview

This package provides a unified interface for interacting with multiple language servers, enabling real-time diagnostics, code navigation, completions, and symbol navigation.

## Architecture

```
src/
├── index.ts       # Public API, LSPManager class
├── client.ts      # LSP client implementation (JSON-RPC)
├── config.ts      # LSP config from unified config file
├── server.ts      # LSP server definitions
└── language.ts    # Language ID mapping
```

## Supported Language Servers

| Server | ID | Extensions | Root Detection |
|--------|-----|------------|----------------|
| TypeScript | `typescript` | .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts | package-lock.json, bun.lockb, bun.lock, yarn.lock, pnpm-lock.yaml |
| Deno | `deno` | .ts, .tsx, .js, .jsx, .mjs | deno.json, deno.jsonc |
| Vue | `vue` | .vue | package.json, package-lock.json, bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock |
| Oxlint | `oxlint` | .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .vue, .astro, .svelte | .oxlintrc.json, package-lock.json, bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock, package.json |
| Pyright | `pyright` | .py, .pyi | pyproject.toml, setup.py, requirements.txt, pyrightconfig.json |
| Gopls | `gopls` | .go | go.work, go.mod, go.sum |
| Rust Analyzer | `rust-analyzer` | .rs | Cargo.toml, Cargo.lock |
| Kotlin | `kotlin` | .kt, .kts | build.gradle.kts, build.gradle, settings.gradle.kts, settings.gradle, pom.xml |
| Dart | `dart` | .dart | pubspec.yaml, pubspec.lock |
| Prisma | `prisma` | .prisma | schema.prisma, prisma/schema.prisma |

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
// Create manager with auto-loaded config from .please/config.yml
const manager = await LSPManager.fromProject(projectPath)

// Or create with explicit config
const manager = new LSPManager(projectPath, { lspConfig: myConfig })

// Touch file to initialize LSP
await manager.touchFile('src/index.ts', true)

// Get diagnostics
const diags = await manager.diagnostics()

// Get hover info
const hover = await manager.hover({ file, line, character })

// Go to definition
const defs = await manager.definition({ file, line, character })

// Find all references
const refs = await manager.references({ file, line, character, includeDeclaration: true })

// Get code completions
const completions = await manager.completion({ file, line, character })

// Search symbols
const symbols = await manager.workspaceSymbol('query')

// Get document symbols
const docSymbols = await manager.documentSymbol(uri)

// Prepare rename (validate rename is possible)
const prepareResult = await manager.prepareRename({ file, line, character })

// Rename symbol
const workspaceEdit = await manager.rename({ file, line, character, newName: 'newSymbolName' })

// Cleanup
await manager.shutdown()
```

### LSPManager Methods

| Method | LSP Request | Description |
|--------|-------------|-------------|
| `touchFile()` | `textDocument/didOpen` | Open file in LSP servers |
| `diagnostics()` | `textDocument/publishDiagnostics` | Get all diagnostics |
| `hover()` | `textDocument/hover` | Get hover information |
| `definition()` | `textDocument/definition` | Go to definition |
| `references()` | `textDocument/references` | Find all references |
| `completion()` | `textDocument/completion` | Get code completions |
| `workspaceSymbol()` | `workspace/symbol` | Search workspace symbols |
| `documentSymbol()` | `textDocument/documentSymbol` | Get document symbols |
| `prepareRename()` | `textDocument/prepareRename` | Validate rename at position |
| `rename()` | `textDocument/rename` | Rename symbol, returns WorkspaceEdit |
| `shutdown()` | `shutdown` | Close all clients |

### Server Utilities

```typescript
import { getServerById, getServersForExtension } from '@pleaseai/code-lsp'

const server = getServerById('typescript')
const servers = getServersForExtension('.ts')
```

## Configuration

LSP servers can be configured via `.please/config.json` or `.please/config.yml`:

```yaml
lsp:
  # Disable a specific server
  typescript:
    enabled: false

  # Use custom root path
  pyright:
    root: "./backend"

  # Globally disable all LSP servers
  # lsp: false
```

**Config Options per Server:**
- `enabled: boolean` - Enable/disable server (default: true)
- `root: string` - Custom project root path (must be non-empty)
- `command: string[]` - Custom spawn command (must have at least one element)

**Config Utilities:**
```typescript
import { isServerEnabled, getServerRoot, loadLspConfig } from '@pleaseai/code-lsp'

const config = await loadLspConfig(projectDir)
const enabled = isServerEnabled(config, 'typescript')
const customRoot = getServerRoot(config, 'pyright')
```

## Testing

```bash
bun test ./src
```

Tests cover:
- Server definitions (ID, extensions, root, spawn functions)
- LSP client lifecycle
- Manager operations
- Config loading and validation
