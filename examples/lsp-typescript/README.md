# LSP TypeScript Example

This example demonstrates how to use `@pleaseai/code-lsp` to interact with TypeScript language servers.

## Features Demonstrated

- **LSPManager initialization** - Set up the LSP client for a project
- **File opening & diagnostics** - Get type errors and warnings
- **Hover information** - Get type info and documentation at cursor position
- **Go to definition** - Navigate to where symbols are defined
- **Find references** - Find all usages of a symbol
- **Code completion** - Get intelligent code suggestions
- **Document symbols** - List all symbols in a file
- **Workspace symbol search** - Search for symbols across the project

## Project Structure

```
examples/lsp-typescript/
├── README.md           # This file
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
├── demo.ts             # LSP demo script
└── src/
    ├── index.ts        # Entry point with classes and interfaces
    └── utils/
        └── math.ts     # Utility functions with JSDoc
```

## Quick Start

### 1. Install Dependencies

From the project root:

```bash
cd examples/lsp-typescript
bun install
```

### 2. Run the Demo

```bash
bun run demo
# or directly:
bun run demo.ts
```

### 3. Expected Output

The demo will show:
- Connected LSP servers
- Diagnostics (type errors/warnings)
- Hover information for imports
- Definition locations
- Reference locations
- Code completions
- Document symbols
- Workspace symbols

## Using LSPManager in Your Code

```typescript
import { formatDiagnostic, LSPManager } from '@pleaseai/code-lsp'

// Initialize manager with project path
const manager = new LSPManager('/path/to/project')

// Open a file and wait for diagnostics
await manager.touchFile('src/index.ts', true)

// Get diagnostics
const diagnostics = await manager.diagnostics()
for (const [file, diags] of Object.entries(diagnostics)) {
  for (const diag of diags) {
    console.log(formatDiagnostic(diag))
  }
}

// Get hover info
const hovers = await manager.hover({
  file: 'src/index.ts',
  line: 10, // 0-indexed
  character: 5, // 0-indexed
})

// Go to definition
const definitions = await manager.definition({
  file: 'src/index.ts',
  line: 10,
  character: 5,
})

// Find references
const references = await manager.references({
  file: 'src/index.ts',
  line: 10,
  character: 5,
  includeDeclaration: true,
})

// Code completion
const completions = await manager.completion({
  file: 'src/index.ts',
  line: 10,
  character: 5,
})

// Document symbols
const symbols = await manager.documentSymbol('file:///path/to/src/index.ts')

// Workspace symbol search
const wsSymbols = await manager.workspaceSymbol('User')

// Always cleanup
await manager.shutdown()
```

## Testing with Intentional Errors

To test diagnostic detection, uncomment the error example in `src/utils/math.ts`:

```typescript
// Uncomment this line to test LSP diagnostics:
export const errorExample: string = 42
```

Then run the demo again to see the type error reported.

## API Reference

| Method | Description |
|--------|-------------|
| `touchFile(file, waitForDiagnostics?)` | Open file in LSP server |
| `diagnostics()` | Get all diagnostics |
| `hover({ file, line, character })` | Get hover info |
| `definition({ file, line, character })` | Go to definition |
| `references({ file, line, character, includeDeclaration? })` | Find references |
| `completion({ file, line, character })` | Get completions |
| `documentSymbol(uri)` | Get document symbols |
| `workspaceSymbol(query)` | Search workspace symbols |
| `status()` | Get connected server status |
| `shutdown()` | Close all LSP connections |

## Related

- [packages/lsp/README.md](../../packages/lsp/README.md) - Full LSP package documentation
- [packages/lsp/CLAUDE.md](../../packages/lsp/CLAUDE.md) - Detailed API reference
