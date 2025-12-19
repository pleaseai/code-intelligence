# @pleaseai/code-lsp Feature Comparison & TODO

> Comparison analysis between Serena SolidLSP and @pleaseai/code-lsp
> Generated: 2025-12-18

## Currently Implemented in @pleaseai/code-lsp

| Feature | LSP Method | Status |
|---------|-----------|--------|
| Diagnostics | `textDocument/publishDiagnostics` | ✅ |
| Hover | `textDocument/hover` | ✅ |
| Definition | `textDocument/definition` | ✅ |
| References | `textDocument/references` | ✅ |
| Completion | `textDocument/completion` | ✅ |
| Workspace Symbols | `workspace/symbol` | ✅ |
| Document Symbols | `textDocument/documentSymbol` | ✅ |
| Document Open/Change | `textDocument/didOpen`, `textDocument/didChange` | ✅ |

---

## Missing Features (Available in Serena)

### High Priority

#### 1. ~~Rename Symbol~~ ✅ Implemented
- **LSP Methods**: `textDocument/rename`, `textDocument/prepareRename`
- **Description**: Allows renaming symbols across the project
- **Reference**: Serena `ls.py:1834-1859`
- **Returns**: `WorkspaceEdit` with all changes needed
- **Use Case**: Refactoring variable/function/class names safely
- **Implementation**: PR #19 (merged)

#### 2. Code Actions
- **LSP Methods**: `textDocument/codeAction`, `codeAction/resolve`
- **Description**: Provides quick fixes, refactoring suggestions
- **Reference**: Serena `ls_request.py:304-313`
- **Use Case**: Essential for AI-assisted coding (auto-imports, fix suggestions)

#### 3. File Close Notification
- **LSP Method**: `textDocument/didClose`
- **Description**: Notify server when file is closed
- **Current State**: Files are never explicitly closed in @pleaseai/code-lsp
- **Impact**: Proper resource management, memory cleanup

---

### Medium Priority

#### 4. Signature Help
- **LSP Method**: `textDocument/signatureHelp`
- **Description**: Shows function/method signatures while typing
- **Reference**: Serena `ls_request.py:266-267`
- **Use Case**: Useful for AI to understand function parameters

#### 5. Type Definition
- **LSP Method**: `textDocument/typeDefinition`
- **Description**: Go to the type definition of a symbol
- **Reference**: Serena `ls_request.py:24-32`
- **Use Case**: Navigate from variable to its type definition

#### 6. Implementation
- **LSP Method**: `textDocument/implementation`
- **Description**: Find interface/abstract class implementations
- **Reference**: Serena `ls_request.py:16-22`
- **Use Case**: Navigate from interface to concrete implementations

#### 7. Call Hierarchy
- **LSP Methods**: `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, `callHierarchy/outgoingCalls`
- **Description**: Find callers and callees of a function
- **Reference**: Serena `ls_request.py:75-95`
- **Use Case**: Understanding code flow, impact analysis

#### 8. Symbol Caching
- **Description**: Cache document symbols with hash-based invalidation
- **Reference**: Serena `ls.py:279-295`
- **Current State**: No caching in @pleaseai/code-lsp
- **Impact**: Performance improvement for repeated queries

---

### Low Priority

#### 9. Declaration
- **LSP Method**: `textDocument/declaration`
- **Description**: Similar to definition but for declarations
- **Reference**: Serena `ls_request.py:58-65`
- **Use Case**: Rarely needed, mostly covered by definition

#### 10. Type Hierarchy
- **LSP Methods**: `textDocument/prepareTypeHierarchy`, `typeHierarchy/supertypes`, `typeHierarchy/subtypes`
- **Description**: Navigate class inheritance hierarchy
- **Reference**: Serena `ls_request.py:149-169`
- **Use Case**: Class navigation in OOP codebases

#### 11. Inlay Hints
- **LSP Method**: `textDocument/inlayHint`
- **Description**: Show inline hints (parameter names, types)
- **Reference**: Serena `ls_request.py:180-196`
- **Use Case**: Visual enhancement, nice to have

#### 12. Document Formatting
- **LSP Methods**: `textDocument/formatting`, `textDocument/rangeFormatting`
- **Description**: Format entire document or range
- **Reference**: Serena `ls_request.py:356-362`
- **Note**: Already handled by `@pleaseai/code-format` package

---

## Architectural Improvements

### 1. File Buffer Management with Reference Counting

**Serena Implementation** (`ls.py:62-91`):
```python
@dataclass
class LSPFileBuffer:
    uri: str
    contents: str
    version: int
    language_id: str
    ref_count: int  # Reference counting for proper cleanup
    content_hash: str  # MD5 hash for cache invalidation
```

**Current Issue**: No `textDocument/didClose`, files are never explicitly closed

**Recommendation**: Add reference counting and proper file closing

---

### 2. Two-Level Symbol Caching

**Serena Implementation** (`ls.py:279-295`):
```python
# Raw symbols from language server
self._raw_document_symbols_cache: dict[str, tuple[str, list[DocumentSymbol]]]

# Processed unified symbols
self._document_symbols_cache: dict[str, tuple[str, DocumentSymbols]]
```

**Current Issue**: No caching in @pleaseai/code-lsp

**Recommendation**: Add hash-based invalidation caching for performance

---

### 3. Context Manager for File Operations

**Serena Implementation** (`ls.py:477-527`):
```python
@contextmanager
def open_file(self, relative_file_path: str) -> Iterator[LSPFileBuffer]:
    # Automatic reference counting and cleanup
    try:
        yield file_buffer
    finally:
        self._close_file(uri)
```

**Recommendation**: Implement similar pattern for automatic resource cleanup

---

### 4. Cross-File Reference Waiting

**Serena Implementation** (`ls.py:640-644`):
```python
if not self._has_waited_for_cross_file_references:
    sleep(self._get_wait_time_for_cross_file_referencing())
    self._has_waited_for_cross_file_references = True
```

**Issue**: Some language servers need time to index before providing cross-file results

**Recommendation**: Add configurable wait time for cross-file operations

---

### 5. Enhanced Capability Declaration

**Current Client Capabilities**:
```typescript
capabilities: {
  window: { workDoneProgress: true },
  workspace: { configuration: true },
  textDocument: {
    synchronization: { didOpen: true, didChange: true },
    publishDiagnostics: { versionSupport: true },
  },
}
```

**Recommendation**: Declare additional capabilities for advanced features:
- `textDocument.rename`
- `textDocument.codeAction`
- `textDocument.signatureHelp`
- `textDocument.typeDefinition`
- `textDocument.implementation`
- `textDocument.callHierarchy`

---

## Implementation Priority Matrix

| Priority | Feature | Effort | Value | Status |
|----------|---------|--------|-------|--------|
| **High** | Rename Symbol | Medium | High | ✅ Done |
| **High** | Code Actions | Medium | High | ⬜ TODO |
| **High** | File Close (`didClose`) | Low | Medium | ⬜ TODO |
| **Medium** | Signature Help | Low | Medium | ⬜ TODO |
| **Medium** | Type Definition | Low | Medium | ⬜ TODO |
| **Medium** | Implementation | Low | Medium | ⬜ TODO |
| **Medium** | Call Hierarchy | Medium | Medium | ⬜ TODO |
| **Medium** | Symbol Caching | Medium | High | ⬜ TODO |
| **Low** | Declaration | Low | Low | ⬜ TODO |
| **Low** | Type Hierarchy | Low | Low | ⬜ TODO |
| **Low** | Inlay Hints | Low | Low | ⬜ TODO |

---

## References

- **Serena SolidLSP**: `/ref/serena/src/solidlsp/`
- **@pleaseai/code-lsp**: `/packages/lsp/`
- **LSP Specification**: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
