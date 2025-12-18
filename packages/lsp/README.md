# @pleaseai/code-lsp

LSP (Language Server Protocol) client implementation for AI coding tools.

## Installation

```bash
bun add @pleaseai/code-lsp
```

## Features

- Multi-server support with automatic lifecycle management
- Code navigation (definition, references)
- Code completions
- Diagnostics and hover information
- Symbol search (workspace and document)
- Auto-download for Kotlin, Dart, and Vue language servers

## Quick Start

```typescript
import { LSPManager } from '@pleaseai/code-lsp'

const manager = new LSPManager('/path/to/project')

// Open a file to initialize LSP
await manager.touchFile('src/index.ts', true)

// Get diagnostics
const diagnostics = await manager.diagnostics()

// Go to definition
const definitions = await manager.definition({
  file: 'src/index.ts',
  line: 10,
  character: 5,
})

// Find all references
const references = await manager.references({
  file: 'src/index.ts',
  line: 10,
  character: 5,
  includeDeclaration: true,
})

// Get completions
const completions = await manager.completion({
  file: 'src/index.ts',
  line: 10,
  character: 5,
})

// Cleanup
await manager.shutdown()
```

## Supported Language Servers

| Language | Server | Auto-download |
|----------|--------|---------------|
| TypeScript/JavaScript | typescript-language-server | No |
| Deno | deno lsp | No |
| Vue | @vue/language-server | Yes |
| Python | pyright-langserver | No |
| Go | gopls | No |
| Rust | rust-analyzer | No |
| Kotlin | JetBrains Kotlin LSP | Yes |
| Dart | dart language-server | Yes |
| Linting | oxlint | No |

## API Reference

### LSPManager

| Method | Description |
|--------|-------------|
| `touchFile(file, waitForDiagnostics?)` | Open file in LSP servers |
| `diagnostics()` | Get all diagnostics |
| `hover({ file, line, character })` | Get hover information |
| `definition({ file, line, character })` | Go to definition |
| `references({ file, line, character, includeDeclaration? })` | Find all references |
| `completion({ file, line, character })` | Get code completions |
| `workspaceSymbol(query)` | Search workspace symbols |
| `documentSymbol(uri)` | Get document symbols |
| `status()` | Get connected server status |
| `shutdown()` | Close all clients |

### Types

```typescript
import {
  // Position and Range
  Position,
  Range,
  Location,
  LocationLink,

  // Symbols
  Symbol,
  DocumentSymbol,
  SymbolKind,

  // Completions
  CompletionItem,
  CompletionList,
  CompletionItemKind,

  // Diagnostics
  Diagnostic,
} from '@pleaseai/code-lsp'
```

## Server Utilities

```typescript
import { getServerById, getServersForExtension } from '@pleaseai/code-lsp'

// Get server by ID
const tsServer = getServerById('typescript')

// Get servers for file extension
const servers = getServersForExtension('.ts')
```

## License

MIT
