# Spec 002: Add Prisma Language Server Support

## Overview

Add support for the Prisma Language Server (`@prisma/language-server`) to `@pleaseai/code-lsp` package, enabling LSP features for `.prisma` schema files.

## Problem Statement

Prisma is a popular ORM for Node.js and TypeScript. Developers working with Prisma schema files (`.prisma`) need language intelligence features like diagnostics, completions, hover information, go-to-definition, and formatting. The `@pleaseai/code-lsp` package currently doesn't support Prisma files.

## Requirements

### Functional Requirements

1. **Auto-Download**: The Prisma Language Server must be automatically downloaded and installed when needed (similar to Vue LS pattern)
   - Store in `~/.cache/dora/prisma-lsp/`
   - Use version marker file for tracking installed version
   - Install via `npm install --prefix`

2. **Root Detection**: Detect Prisma projects by looking for:
   - `schema.prisma` in project root
   - `prisma/schema.prisma` (conventional location)
   - Should find nearest match, supporting monorepo structures

3. **File Extension Support**: Support `.prisma` file extension

4. **LSP Features**: Enable standard LSP features provided by Prisma LS:
   - Diagnostics (real-time error highlighting)
   - Code completions
   - Hover information
   - Go-to-definition
   - Document formatting
   - Code actions
   - Rename symbol
   - Document symbols

### Non-Functional Requirements

1. **Version Pinning**: Pin to a specific stable version of `@prisma/language-server` for reproducibility
2. **Error Handling**: Graceful degradation if npm/node not available or installation fails
3. **Logging**: Consistent logging with `[prisma]` prefix for debugging

## Technical Design

### Server Definition

```typescript
export const PrismaServer: LSPServerInfo = {
  id: 'prisma',
  extensions: ['.prisma'],
  root: nearestRoot(['schema.prisma', 'prisma/schema.prisma']),
  spawn: async (root) => { ... }
}
```

### Auto-Download Pattern

Follow Vue LS pattern:
1. Check if `prisma-language-server` binary exists in cache directory
2. Compare version marker file with expected version
3. If mismatch or not found, run `npm install --prefix ~/.cache/dora/prisma-lsp @prisma/language-server@<version>`
4. Write version marker after successful install
5. Return path to binary

### Language ID Mapping

Add to `language.ts`:
```typescript
'.prisma': 'prisma'
```

## Test Plan

1. **Unit Tests**:
   - Test server ID and extensions
   - Test root detection with schema.prisma
   - Test root detection with prisma/schema.prisma
   - Test monorepo nested package detection
   - Verify spawn function signature

2. **Integration Tests** (optional, requires npm):
   - Test auto-download mechanism
   - Test actual LSP communication

## Out of Scope

- Prisma Client generation integration
- Database migration features
- Multi-schema support (Prisma 5.0+ feature)

## References

- [Prisma Language Server](https://github.com/prisma/language-tools/tree/main/packages/language-server)
- [npm: @prisma/language-server](https://www.npmjs.com/package/@prisma/language-server)
