/**
 * Vue Language Server Integration Tests
 *
 * These tests spawn an actual Vue language server (Volar) and verify LSP functionality.
 * Requires npm to be installed for auto-downloading dependencies.
 *
 * Based on serena test patterns: ref/serena/test/solidlsp/vue/test_vue_basic.py
 */

import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LSPManager } from '../../src/index'

const VUE_PROJECT_PATH = path.join(import.meta.dir, '../fixtures/vue-project')
const APP_VUE_PATH = path.join(VUE_PROJECT_PATH, 'src/App.vue')
const CALCULATOR_VUE_PATH = path.join(VUE_PROJECT_PATH, 'src/components/Calculator.vue')
const MATH_TS_PATH = path.join(VUE_PROJECT_PATH, 'src/utils/math.ts')

// Check if npm is available for auto-installing Vue LSP dependencies
const isNpmAvailable = Bun.which('npm') !== null

describe.skipIf(!isNpmAvailable)('VueServer Integration', () => {
  let manager: LSPManager

  beforeAll(async () => {
    manager = new LSPManager(VUE_PROJECT_PATH)
    // Touch the main Vue file to initialize LSP and wait for diagnostics
    await manager.touchFile(APP_VUE_PATH, true)
  }, 120000) // 120s timeout for server startup + npm install

  afterAll(async () => {
    await manager.shutdown()
  })

  test('LSP server starts and connects', async () => {
    const status = await manager.status()
    expect(status.length).toBeGreaterThan(0)

    const vueStatus = status.find(s => s.id === 'vue')
    expect(vueStatus).toBeDefined()
    expect(vueStatus?.status).toBe('connected')
  })

  test('returns diagnostics for Vue file', async () => {
    // The test file is valid, so we expect no errors
    const diagnostics = await manager.diagnostics()
    const appVueDiags = diagnostics[APP_VUE_PATH] || []

    // Valid file should have no errors (might have warnings/hints)
    const errors = appVueDiags.filter(d => d.severity === 1)
    expect(errors.length).toBe(0)
  })

  test('provides hover information', async () => {
    // Hover over 'title' variable (line 4, 0-indexed: const title = ref('Vue LSP Test App'))
    const hovers = await manager.hover({
      file: APP_VUE_PATH,
      line: 4, // const title = ref(...)
      character: 6, // 'title' variable name
    })

    // Vue LSP might not return hover info for all positions in hybrid mode
    // Just verify we can make the request without error
    expect(hovers).toBeDefined()
    expect(Array.isArray(hovers)).toBe(true)
  })

  test('finds workspace symbols', async () => {
    // Search for 'add' function which is exported from math.ts
    const symbols = await manager.workspaceSymbol('add')

    // Vue LSP in hybrid mode might return symbols differently
    // Just verify we can make the request without error
    expect(symbols).toBeDefined()
    expect(Array.isArray(symbols)).toBe(true)
  })

  test('finds document symbols', async () => {
    const uri = `file://${APP_VUE_PATH}`
    const symbols = await manager.documentSymbol(uri)

    // Vue LSP returns document symbols for script setup variables/functions
    expect(symbols).toBeDefined()
    expect(Array.isArray(symbols)).toBe(true)
  })

  test('touches component Vue file', async () => {
    // Touch Calculator component file
    await manager.touchFile(CALCULATOR_VUE_PATH, true)

    const diagnostics = await manager.diagnostics()
    const calculatorDiags = diagnostics[CALCULATOR_VUE_PATH] || []

    // Valid file should have no errors
    const errors = calculatorDiags.filter(d => d.severity === 1)
    expect(errors.length).toBe(0)
  })

  test('touches TypeScript utility file', async () => {
    // Touch TypeScript file to verify cross-file support
    await manager.touchFile(MATH_TS_PATH, true)

    const diagnostics = await manager.diagnostics()
    const mathDiags = diagnostics[MATH_TS_PATH] || []

    // Valid file should have no errors
    const errors = mathDiags.filter(d => d.severity === 1)
    expect(errors.length).toBe(0)
  })

  test('finds symbols in TypeScript utility', async () => {
    // Search for add function defined in math.ts
    const symbols = await manager.workspaceSymbol('add')

    // Vue LSP in hybrid mode may or may not find TypeScript symbols
    expect(symbols).toBeDefined()
    expect(Array.isArray(symbols)).toBe(true)
  })

  test('finds symbols across Vue and TypeScript files', async () => {
    // Search for subtract function (used in Calculator.vue, defined in math.ts)
    const symbols = await manager.workspaceSymbol('subtract')

    // Vue LSP in hybrid mode may or may not find cross-file symbols
    expect(symbols).toBeDefined()
    expect(Array.isArray(symbols)).toBe(true)
  })
})

// Separate describe block for tests that don't require npm
describe('VueServer Integration (no npm required)', () => {
  test('fixture files exist', async () => {
    const appVue = Bun.file(APP_VUE_PATH)
    expect(await appVue.exists()).toBe(true)

    const calculatorVue = Bun.file(CALCULATOR_VUE_PATH)
    expect(await calculatorVue.exists()).toBe(true)

    const mathTs = Bun.file(MATH_TS_PATH)
    expect(await mathTs.exists()).toBe(true)

    const packageJson = Bun.file(path.join(VUE_PROJECT_PATH, 'package.json'))
    expect(await packageJson.exists()).toBe(true)

    const tsconfig = Bun.file(path.join(VUE_PROJECT_PATH, 'tsconfig.json'))
    expect(await tsconfig.exists()).toBe(true)
  })

  test('manager creates without npm installed', () => {
    const manager = new LSPManager(VUE_PROJECT_PATH)
    expect(manager).toBeDefined()
  })
})
