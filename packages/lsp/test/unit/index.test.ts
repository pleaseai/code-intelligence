import type { Diagnostic } from 'vscode-languageserver-types'
import type { LSPServerInfo } from '../../src/index'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  formatDiagnostic,
  getLanguageId,
  LANGUAGE_EXTENSIONS,
  LSPManager,
  PrepareRenameResultSchema,
  SymbolKind,
  TextEditSchema,
  WorkspaceEditSchema,
} from '../../src/index'

const FAKE_SERVER_PATH = path.join(import.meta.dir, '../fixture/fake-lsp-server.js')

/** A fake .ts LSP server backed by the test fixture (publishes 1 diagnostic on open). */
function fakeServer(id: string): LSPServerInfo {
  return {
    id,
    extensions: ['.ts'],
    root: async () => process.cwd(),
    spawn: async () => ({
      process: spawn(process.execPath, [FAKE_SERVER_PATH], { stdio: 'pipe' }),
    }),
  }
}

describe('LSPManager', () => {
  test('creates manager with project path', () => {
    const manager = new LSPManager('/test/project')
    expect(manager).toBeDefined()
  })

  test('creates disabled manager', () => {
    const manager = new LSPManager('/test/project', { enabled: false })
    expect(manager).toBeDefined()
  })

  test('returns empty status when no clients connected', async () => {
    const manager = new LSPManager('/test/project')
    const status = await manager.status()
    expect(status).toEqual([])
  })

  test('returns empty diagnostics when no clients connected', async () => {
    const manager = new LSPManager('/test/project')
    const diagnostics = await manager.diagnostics()
    expect(diagnostics).toEqual({})
  })

  test('shuts down cleanly with no clients', async () => {
    const manager = new LSPManager('/test/project')
    await manager.shutdown()
    // Should not throw
  })

  test('rename returns null for empty newName', async () => {
    const manager = new LSPManager('/test/project')
    const result = await manager.rename({
      file: '/test/project/test.ts',
      line: 0,
      character: 0,
      newName: '',
    })
    expect(result).toBeNull()
  })

  test('rename returns null for whitespace-only newName', async () => {
    const manager = new LSPManager('/test/project')
    const result = await manager.rename({
      file: '/test/project/test.ts',
      line: 0,
      character: 0,
      newName: '   ',
    })
    expect(result).toBeNull()
  })

  test('serverIds restricts registered servers to the given subset', () => {
    const manager = new LSPManager('/test/project', {
      serverIds: ['typescript', 'eslint'],
    })
    expect(manager.registeredServerIds().sort()).toEqual(['eslint', 'typescript'])
  })

  test('empty serverIds registers all servers (treated as no restriction)', () => {
    const all = new LSPManager('/test/project').registeredServerIds()
    const empty = new LSPManager('/test/project', { serverIds: [] }).registeredServerIds()
    expect(empty).toEqual(all)
    expect(empty.length).toBeGreaterThan(1)
  })

  test('diagnosticsForFile merges diagnostics across multiple clients', async () => {
    const manager = new LSPManager(process.cwd(), {
      servers: [fakeServer('fakeA'), fakeServer('fakeB')],
    })
    try {
      const file = path.join(process.cwd(), 'merge-test.ts')
      await manager.openWithText(file, 'const x = 1')
      // Fake servers publish diagnostics ~50ms after didOpen.
      await new Promise(r => setTimeout(r, 300))

      const diags = manager.diagnosticsForFile(file)
      // Two servers, one diagnostic each, merged into a single list.
      expect(diags.length).toBe(2)
    }
    finally {
      await manager.shutdown()
    }
  })
})

describe('formatDiagnostic', () => {
  test('formats error diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
      message: 'Test error message',
      severity: 1,
    }

    const result = formatDiagnostic(diagnostic)
    expect(result).toBe('ERROR [1:6] Test error message')
  })

  test('formats warning diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 4, character: 0 },
        end: { line: 4, character: 10 },
      },
      message: 'Test warning',
      severity: 2,
    }

    const result = formatDiagnostic(diagnostic)
    expect(result).toBe('WARN [5:1] Test warning')
  })

  test('formats info diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 9, character: 3 },
        end: { line: 9, character: 8 },
      },
      message: 'Test info',
      severity: 3,
    }

    const result = formatDiagnostic(diagnostic)
    expect(result).toBe('INFO [10:4] Test info')
  })

  test('formats hint diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      message: 'Test hint',
      severity: 4,
    }

    const result = formatDiagnostic(diagnostic)
    expect(result).toBe('HINT [1:1] Test hint')
  })

  test('defaults to ERROR when severity not specified', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      message: 'No severity',
    }

    const result = formatDiagnostic(diagnostic)
    expect(result).toBe('ERROR [1:1] No severity')
  })
})

describe('SymbolKind', () => {
  test('has correct enum values', () => {
    expect(SymbolKind.File).toBe(1)
    expect(SymbolKind.Module).toBe(2)
    expect(SymbolKind.Class).toBe(5)
    expect(SymbolKind.Method).toBe(6)
    expect(SymbolKind.Function).toBe(12)
    expect(SymbolKind.Variable).toBe(13)
  })
})

describe('getLanguageId', () => {
  test('returns correct language for TypeScript', () => {
    expect(getLanguageId('.ts')).toBe('typescript')
  })

  test('returns correct language for TypeScript React', () => {
    expect(getLanguageId('.tsx')).toBe('typescriptreact')
  })

  test('returns correct language for JavaScript', () => {
    expect(getLanguageId('.js')).toBe('javascript')
  })

  test('returns correct language for Python', () => {
    expect(getLanguageId('.py')).toBe('python')
  })

  test('returns correct language for Go', () => {
    expect(getLanguageId('.go')).toBe('go')
  })

  test('returns correct language for Rust', () => {
    expect(getLanguageId('.rs')).toBe('rust')
  })

  test('returns plaintext for unknown extensions', () => {
    expect(getLanguageId('.unknown')).toBe('plaintext')
  })
})

describe('LANGUAGE_EXTENSIONS', () => {
  test('contains common languages', () => {
    expect(LANGUAGE_EXTENSIONS['.ts']).toBe('typescript')
    expect(LANGUAGE_EXTENSIONS['.js']).toBe('javascript')
    expect(LANGUAGE_EXTENSIONS['.py']).toBe('python')
    expect(LANGUAGE_EXTENSIONS['.go']).toBe('go')
    expect(LANGUAGE_EXTENSIONS['.rs']).toBe('rust')
    expect(LANGUAGE_EXTENSIONS['.java']).toBe('java')
    expect(LANGUAGE_EXTENSIONS['.kt']).toBe('kotlin')
  })

  test('contains web languages', () => {
    expect(LANGUAGE_EXTENSIONS['.html']).toBe('html')
    expect(LANGUAGE_EXTENSIONS['.css']).toBe('css')
    expect(LANGUAGE_EXTENSIONS['.vue']).toBe('vue')
    expect(LANGUAGE_EXTENSIONS['.svelte']).toBe('svelte')
  })

  test('contains config files', () => {
    expect(LANGUAGE_EXTENSIONS['.json']).toBe('json')
    expect(LANGUAGE_EXTENSIONS['.yaml']).toBe('yaml')
    expect(LANGUAGE_EXTENSIONS['.yml']).toBe('yaml')
  })
})

describe('TextEditSchema', () => {
  test('validates valid TextEdit', () => {
    const textEdit = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
      newText: 'newName',
    }

    const result = TextEditSchema.safeParse(textEdit)
    expect(result.success).toBe(true)
  })

  test('rejects TextEdit without range', () => {
    const invalid = { newText: 'newName' }

    const result = TextEditSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  test('rejects TextEdit without newText', () => {
    const invalid = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
    }

    const result = TextEditSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('WorkspaceEditSchema', () => {
  test('validates WorkspaceEdit with changes', () => {
    const workspaceEdit = {
      changes: {
        'file:///test.ts': [
          {
            range: {
              start: { line: 0, character: 5 },
              end: { line: 0, character: 10 },
            },
            newText: 'newName',
          },
        ],
      },
    }

    const result = WorkspaceEditSchema.safeParse(workspaceEdit)
    expect(result.success).toBe(true)
  })

  test('validates empty WorkspaceEdit', () => {
    const emptyEdit = {}

    const result = WorkspaceEditSchema.safeParse(emptyEdit)
    expect(result.success).toBe(true)
  })

  test('validates WorkspaceEdit with multiple files', () => {
    const multiFileEdit = {
      changes: {
        'file:///a.ts': [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'new1' },
        ],
        'file:///b.ts': [
          { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: 'new2' },
        ],
      },
    }

    const result = WorkspaceEditSchema.safeParse(multiFileEdit)
    expect(result.success).toBe(true)
  })

  /**
   * Note: LSP servers can return WorkspaceEdit in two formats:
   * 1. 'changes' format: { changes: { [uri]: TextEdit[] } }
   * 2. 'documentChanges' format: { documentChanges: TextDocumentEdit[] }
   *
   * The schema only validates the normalized 'changes' format output.
   * LSPManager.normalizeWorkspaceEdit() converts 'documentChanges' to 'changes' at runtime.
   */
  test('schema validates normalized changes format (documentChanges is normalized at runtime)', () => {
    // This test documents that the schema validates the normalized output format
    // documentChanges format from LSP servers:
    // { documentChanges: [{ textDocument: { uri: 'file:///test.ts' }, edits: [...] }] }
    // gets normalized to:
    // { changes: { 'file:///test.ts': [...] } }

    const normalizedFromDocumentChanges = {
      changes: {
        'file:///test.ts': [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'renamed' },
        ],
        'file:///other.ts': [
          { range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } }, newText: 'renamed' },
        ],
      },
    }

    const result = WorkspaceEditSchema.safeParse(normalizedFromDocumentChanges)
    expect(result.success).toBe(true)
  })
})

describe('PrepareRenameResultSchema', () => {
  test('validates Range format', () => {
    const rangeResult = {
      start: { line: 0, character: 5 },
      end: { line: 0, character: 10 },
    }

    const result = PrepareRenameResultSchema.safeParse(rangeResult)
    expect(result.success).toBe(true)
  })

  test('validates range + placeholder format', () => {
    const placeholderResult = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
      placeholder: 'oldName',
    }

    const result = PrepareRenameResultSchema.safeParse(placeholderResult)
    expect(result.success).toBe(true)
  })

  test('validates defaultBehavior format', () => {
    const defaultResult = { defaultBehavior: true }

    const result = PrepareRenameResultSchema.safeParse(defaultResult)
    expect(result.success).toBe(true)
  })

  test('rejects invalid format', () => {
    const invalid = { invalid: 'format' }

    const result = PrepareRenameResultSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})
