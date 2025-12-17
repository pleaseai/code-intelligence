/**
 * Dart Language Server Integration Tests
 *
 * These tests spawn an actual Dart language server and verify LSP functionality.
 * Requires Dart SDK to be installed or will auto-download.
 *
 * Based on serena test patterns: ref/serena/test/solidlsp/dart/test_dart_basic.py
 */

import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LSPManager } from '../../src/index'

const DART_PROJECT_PATH = path.join(import.meta.dir, '../fixtures/dart-project')
const MAIN_DART_PATH = path.join(DART_PROJECT_PATH, 'lib/main.dart')
const HELPER_DART_PATH = path.join(DART_PROJECT_PATH, 'lib/helper.dart')

// Check if Dart is available
const isDartAvailable = Bun.which('dart') !== null

describe.skipIf(!isDartAvailable)('DartServer Integration', () => {
  let manager: LSPManager

  beforeAll(async () => {
    manager = new LSPManager(DART_PROJECT_PATH)
    // Touch the main file to initialize LSP and wait for diagnostics
    await manager.touchFile(MAIN_DART_PATH, true)
  }, 60000) // 60s timeout for server startup

  afterAll(async () => {
    await manager.shutdown()
  })

  test('LSP server starts and connects', async () => {
    const status = await manager.status()
    expect(status.length).toBeGreaterThan(0)

    const dartStatus = status.find(s => s.id === 'dart')
    expect(dartStatus).toBeDefined()
    expect(dartStatus?.status).toBe('connected')
  })

  test('returns diagnostics for Dart file', async () => {
    // The test file is valid, so we expect no errors
    const diagnostics = await manager.diagnostics()
    const mainDartDiags = diagnostics[MAIN_DART_PATH] || []

    // Valid file should have no errors (might have warnings/hints)
    const errors = mainDartDiags.filter(d => d.severity === 1)
    expect(errors.length).toBe(0)
  })

  test('provides hover information', async () => {
    // Hover over 'Calculator' class name (line 1, char 6)
    const hovers = await manager.hover({
      file: MAIN_DART_PATH,
      line: 1, // class Calculator {
      character: 6,
    })

    expect(hovers.length).toBeGreaterThan(0)
    // At least one hover response should be non-null
    const validHovers = hovers.filter(h => h !== null)
    expect(validHovers.length).toBeGreaterThan(0)
  })

  test('finds workspace symbols', async () => {
    const symbols = await manager.workspaceSymbol('Calculator')

    expect(symbols.length).toBeGreaterThan(0)

    // Should find the Calculator class
    const calculatorSymbol = symbols.find(s => s.name === 'Calculator')
    expect(calculatorSymbol).toBeDefined()
  })

  test('finds document symbols', async () => {
    const uri = `file://${MAIN_DART_PATH}`
    const symbols = await manager.documentSymbol(uri)

    expect(symbols.length).toBeGreaterThan(0)

    // Should find classes and methods
    const symbolNames = symbols.map(s => s.name)
    expect(symbolNames).toContain('Calculator')
  })

  test('touches multiple Dart files', async () => {
    // Touch helper file
    await manager.touchFile(HELPER_DART_PATH, true)

    const diagnostics = await manager.diagnostics()
    const helperDiags = diagnostics[HELPER_DART_PATH] || []

    // Valid file should have no errors
    const errors = helperDiags.filter(d => d.severity === 1)
    expect(errors.length).toBe(0)
  })

  test('finds symbols across files', async () => {
    // Search for subtract function defined in helper.dart
    const symbols = await manager.workspaceSymbol('subtract')

    // Should find it in helper.dart
    expect(symbols.length).toBeGreaterThan(0)
    const subtractSymbol = symbols.find(s => s.name === 'subtract')
    expect(subtractSymbol).toBeDefined()
  })
})

// Separate describe block for tests that don't require Dart
describe('DartServer Integration (no Dart required)', () => {
  test('fixture files exist', async () => {
    const mainDart = Bun.file(MAIN_DART_PATH)
    expect(await mainDart.exists()).toBe(true)

    const helperDart = Bun.file(HELPER_DART_PATH)
    expect(await helperDart.exists()).toBe(true)

    const pubspec = Bun.file(path.join(DART_PROJECT_PATH, 'pubspec.yaml'))
    expect(await pubspec.exists()).toBe(true)
  })

  test('manager creates without Dart installed', () => {
    const manager = new LSPManager(DART_PROJECT_PATH)
    expect(manager).toBeDefined()
  })
})
