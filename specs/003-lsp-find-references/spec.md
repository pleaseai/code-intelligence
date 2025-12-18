# Specification: LSP Find References Tool

**Spec Number**: 003
**Feature Name**: lsp-find-references
**Created**: 2025-12-19
**Status**: Draft

## Summary

Add an `lsp_references` MCP tool to the `@pleaseai/dora` package that finds all usages/references of a symbol at a given position in a source file using the Language Server Protocol.

## Problem Statement

Developers using AI coding assistants need to understand how symbols (functions, classes, variables) are used across a codebase. Currently, dora provides:
- `lsp_workspace_symbol` - Search by name
- `lsp_document_symbol` - Get file structure

However, there's no way to find all references to a specific symbol at a cursor position, which is essential for:
- Understanding impact of changes
- Refactoring safely
- Navigating codebases
- Learning how APIs are used

## Solution

Add `lsp_references` tool that:
1. Takes a file path and cursor position (line, character)
2. Optionally includes the symbol's declaration in results
3. Returns all locations where the symbol is referenced

## Functional Requirements

### FR-1: Tool Definition
- **Name**: `lsp_references`
- **Input Parameters**:
  - `file` (string, required): Path to the file (relative or absolute)
  - `line` (number, required): Line number (0-indexed)
  - `character` (number, required): Character position (0-indexed)
  - `include_declaration` (boolean, optional, default: false): Include the symbol's declaration

### FR-2: Output Format
Returns JSON array of Location objects:
```json
[
  {
    "uri": "file:///path/to/file.ts",
    "range": {
      "start": { "line": 10, "character": 5 },
      "end": { "line": 10, "character": 15 }
    }
  }
]
```

### FR-3: Empty Result Handling
When no references are found, return user-friendly message:
```
No references found at this position
```

### FR-4: Path Resolution
- Support both relative and absolute paths
- Relative paths resolved from project root (config.projectPath)

## Non-Functional Requirements

### NFR-1: Consistency
Follow existing LSP tool patterns in `packages/dora/src/providers/lsp/index.ts`:
- Zod schema validation
- Path normalization
- Error handling with isError flag
- JSON stringified output

### NFR-2: Performance
- Leverage existing LSPManager connection pooling
- No additional overhead beyond LSP protocol

## Implementation Notes

### Existing Infrastructure
- `LSPManager.references()` already implemented in `@pleaseai/code-lsp`
- Returns `Location[]` from all connected language servers
- Handles multi-server aggregation internally

### Integration Points
1. Add tool definition to `LSP_TOOLS` array
2. Add case to `callTool` switch
3. Implement `handleReferences` method
4. Add unit test

## Test Cases

### TC-1: Tool Listing
Verify `lsp_references` appears in listTools() output

### TC-2: Not Connected Error
Calling tool before connect() returns error with "not connected"

### TC-3: Unknown Position
Calling tool on non-symbol position returns "No references found"

## Out of Scope

- Go to Definition (separate feature)
- Find Implementations (separate feature)
- Code completion (separate feature)
- Symbol renaming (separate feature)

## Acceptance Criteria

1. `lsp_references` tool available via MCP
2. Returns correct reference locations from LSP servers
3. Handles empty results gracefully
4. Handles relative and absolute paths
5. Unit tests pass
6. Documentation updated (CLAUDE.md)
