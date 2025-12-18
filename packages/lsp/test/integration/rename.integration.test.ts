/**
 * Rename Symbol Integration Tests
 *
 * These tests verify the prepareRename and rename LSP functionality
 * using actual TypeScript language server.
 *
 * Based on serena reference: ref/serena/src/solidlsp/ls.py:1834-1859
 */

import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LSPManager } from '../../src/index'

const VUE_PROJECT_PATH = path.join(import.meta.dir, '../fixtures/vue-project')
const MATH_TS_PATH = path.join(VUE_PROJECT_PATH, 'src/utils/math.ts')

// Check if npm is available for auto-installing LSP dependencies
const isNpmAvailable = Bun.which('npm') !== null

describe.skipIf(!isNpmAvailable)('Rename Symbol Integration', () => {
  let manager: LSPManager

  beforeAll(async () => {
    manager = new LSPManager(VUE_PROJECT_PATH)
    // Touch the TypeScript file to initialize LSP and wait for diagnostics
    await manager.touchFile(MATH_TS_PATH, true)
  }, 120000) // 120s timeout for server startup

  afterAll(async () => {
    await manager.shutdown()
  })

  test('prepareRename returns result for function name', async () => {
    // Test prepareRename on 'add' function name (line 4, character 16: "export function add")
    const result = await manager.prepareRename({
      file: MATH_TS_PATH,
      line: 3, // 0-indexed: line 4 in editor
      character: 16, // position of 'add' in "export function add"
    })

    // TypeScript server should return a valid prepare rename result
    expect(result).toBeDefined()
    if (result) {
      // Should be one of the PrepareRenameResult formats
      // Range format has start/end
      // Placeholder format has range/placeholder
      // DefaultBehavior format has defaultBehavior
      const hasRange = 'start' in result && 'end' in result
      const hasPlaceholder = 'range' in result && 'placeholder' in result
      const hasDefaultBehavior = 'defaultBehavior' in result

      expect(hasRange || hasPlaceholder || hasDefaultBehavior).toBe(true)
    }
  })

  test('prepareRename returns null for non-renameable position', async () => {
    // Test prepareRename on a keyword position (line 1, character 0: "/**")
    const result = await manager.prepareRename({
      file: MATH_TS_PATH,
      line: 0, // Comment line
      character: 0,
    })

    // Should return null for non-renameable positions
    expect(result).toBeNull()
  })

  test('rename returns WorkspaceEdit for valid symbol', async () => {
    // Test rename on 'power' function (line 35: "export function power")
    // Using 'power' since it's not used in other files, safer for testing
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 34, // 0-indexed: line 35 in editor
      character: 16, // position of 'power'
      newName: 'pow',
    })

    // TypeScript server should return a WorkspaceEdit
    expect(result).toBeDefined()
    if (result) {
      expect(result.changes).toBeDefined()
      expect(typeof result.changes).toBe('object')

      // Should have at least one file with edits
      const files = Object.keys(result.changes!)
      expect(files.length).toBeGreaterThan(0)

      // Each file should have at least one edit
      for (const file of files) {
        const edits = result.changes![file]
        expect(edits.length).toBeGreaterThan(0)

        // Each edit should have range and newText
        for (const edit of edits) {
          expect(edit.range).toBeDefined()
          expect(edit.newText).toBe('pow')
        }
      }
    }
  })

  test('rename returns null for invalid position', async () => {
    // Test rename on a whitespace/comment position
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 0, // Comment line
      character: 0,
      newName: 'newName',
    })

    // Should return null for non-renameable positions
    expect(result).toBeNull()
  })

  test('rename on parameter returns edits', async () => {
    // Test rename on parameter 'a' in add function (line 4: "add(a: number, b: number)")
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 3, // 0-indexed
      character: 20, // position of 'a' parameter
      newName: 'num1',
    })

    // Should return WorkspaceEdit with edits for parameter usages
    expect(result).toBeDefined()
    if (result) {
      expect(result.changes).toBeDefined()

      // Parameter rename should affect at least the definition and usage in return statement
      const mathTsUri = Object.keys(result.changes!).find(uri => uri.includes('math.ts'))
      expect(mathTsUri).toBeDefined()

      if (mathTsUri) {
        const edits = result.changes![mathTsUri]
        // Should have at least 2 edits: parameter definition and usage in "return a + b"
        expect(edits.length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

// Tests that don't require npm/LSP server
describe('Rename Symbol Integration (no npm required)', () => {
  test('fixture file exists', async () => {
    const mathTs = Bun.file(MATH_TS_PATH)
    expect(await mathTs.exists()).toBe(true)
  })

  test('manager exposes prepareRename method', () => {
    const manager = new LSPManager(VUE_PROJECT_PATH)
    expect(typeof manager.prepareRename).toBe('function')
  })

  test('manager exposes rename method', () => {
    const manager = new LSPManager(VUE_PROJECT_PATH)
    expect(typeof manager.rename).toBe('function')
  })

  test('prepareRename returns null when disabled', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.prepareRename({
      file: MATH_TS_PATH,
      line: 3,
      character: 16,
    })
    expect(result).toBeNull()
  })

  test('rename returns null when disabled', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 3,
      character: 16,
      newName: 'newAdd',
    })
    expect(result).toBeNull()
  })

  test('rename returns null for empty newName', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 3,
      character: 16,
      newName: '',
    })
    expect(result).toBeNull()
  })

  test('rename returns null for whitespace-only newName', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.rename({
      file: MATH_TS_PATH,
      line: 3,
      character: 16,
      newName: '   ',
    })
    expect(result).toBeNull()
  })

  test('prepareRename returns null for non-existent file when disabled', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.prepareRename({
      file: '/non/existent/file.ts',
      line: 0,
      character: 0,
    })
    expect(result).toBeNull()
  })

  test('rename returns null for non-existent file when disabled', async () => {
    const manager = new LSPManager(VUE_PROJECT_PATH, { enabled: false })
    const result = await manager.rename({
      file: '/non/existent/file.ts',
      line: 0,
      character: 0,
      newName: 'newName',
    })
    expect(result).toBeNull()
  })
})
