#!/usr/bin/env bun
/**
 * LSP TypeScript Demo
 *
 * This script demonstrates how to use @pleaseai/code-lsp to interact with
 * TypeScript language servers. Run it with: bun run demo.ts
 *
 * Features demonstrated:
 * - LSPManager initialization
 * - File opening and diagnostics
 * - Hover information
 * - Go to definition
 * - Find references
 * - Code completion
 * - Document symbols
 * - Workspace symbol search
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CompletionItemKind, formatDiagnostic, LSPManager, SymbolKind } from '@pleaseai/code-lsp'

// Get project path
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_PATH = __dirname

// File paths
const INDEX_FILE = path.join(PROJECT_PATH, 'src/index.ts')
const MATH_FILE = path.join(PROJECT_PATH, 'src/utils/math.ts')

// Helper to print section headers
function printSection(title: string): void {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

// Helper to print JSON with truncation
function printJson(obj: unknown, maxLength = 500): void {
  const json = JSON.stringify(obj, null, 2)
  if (json.length > maxLength) {
    console.log(`${json.substring(0, maxLength)}\n... (truncated)`)
  }
  else {
    console.log(json)
  }
}

// Symbol kind name mapping
const SYMBOL_KIND_NAMES: Record<number, string> = {
  [SymbolKind.File]: 'File',
  [SymbolKind.Module]: 'Module',
  [SymbolKind.Class]: 'Class',
  [SymbolKind.Method]: 'Method',
  [SymbolKind.Property]: 'Property',
  [SymbolKind.Function]: 'Function',
  [SymbolKind.Variable]: 'Variable',
  [SymbolKind.Interface]: 'Interface',
  [SymbolKind.Enum]: 'Enum',
}

// Completion item kind name mapping
const COMPLETION_KIND_NAMES: Record<number, string> = {
  [CompletionItemKind.Function]: 'Function',
  [CompletionItemKind.Variable]: 'Variable',
  [CompletionItemKind.Class]: 'Class',
  [CompletionItemKind.Interface]: 'Interface',
  [CompletionItemKind.Method]: 'Method',
  [CompletionItemKind.Property]: 'Property',
  [CompletionItemKind.Keyword]: 'Keyword',
}

async function main(): Promise<void> {
  console.log('🚀 LSP TypeScript Demo')
  console.log(`Project: ${PROJECT_PATH}`)

  // Initialize LSP Manager
  printSection('1. Initializing LSP Manager')
  const manager = new LSPManager(PROJECT_PATH)
  console.log('✅ LSPManager created')

  try {
    // Touch file to initialize LSP server
    printSection('2. Opening Files & Getting Diagnostics')
    console.log(`Opening: ${path.relative(PROJECT_PATH, INDEX_FILE)}`)
    await manager.touchFile(INDEX_FILE, true)
    console.log('✅ File opened, waiting for diagnostics...')

    // Also touch the math file
    console.log(`Opening: ${path.relative(PROJECT_PATH, MATH_FILE)}`)
    await manager.touchFile(MATH_FILE, true)

    // Check server status
    const status = await manager.status()
    console.log('\n📊 Connected LSP Servers:')
    for (const s of status) {
      console.log(`  - ${s.id}: ${s.status} (root: ${s.root})`)
    }

    // Get diagnostics
    const diagnostics = await manager.diagnostics()
    const indexDiags = diagnostics[INDEX_FILE] || []
    const mathDiags = diagnostics[MATH_FILE] || []

    console.log(`\n📋 Diagnostics for index.ts: ${indexDiags.length} issues`)
    for (const diag of indexDiags.slice(0, 5)) {
      console.log(`  ${formatDiagnostic(diag)}`)
    }

    console.log(`\n📋 Diagnostics for math.ts: ${mathDiags.length} issues`)
    for (const diag of mathDiags.slice(0, 5)) {
      console.log(`  ${formatDiagnostic(diag)}`)
    }

    // Hover information
    printSection('3. Hover Information')
    // Hover over 'add' function in index.ts (line 9, position of 'add')
    const hovers = await manager.hover({
      file: INDEX_FILE,
      line: 9, // import { add, ... }
      character: 9, // position of 'add'
    })
    console.log('Hover over "add" import:')
    if (hovers.length > 0 && hovers[0]) {
      printJson(hovers[0])
    }
    else {
      console.log('  (No hover info available)')
    }

    // Go to definition
    printSection('4. Go to Definition')
    // Go to definition of 'add' from index.ts
    const definitions = await manager.definition({
      file: INDEX_FILE,
      line: 9,
      character: 9,
    })
    console.log('Definition of "add":')
    for (const def of definitions) {
      const relativePath = def.uri.replace('file://', '').replace(PROJECT_PATH, '.')
      console.log(`  📍 ${relativePath}:${def.range.start.line + 1}:${def.range.start.character + 1}`)
    }

    // Find references
    printSection('5. Find References')
    // Find all references to 'add' function
    const refs = await manager.references({
      file: MATH_FILE,
      line: 24, // export function add(...)
      character: 16, // 'add' function name
      includeDeclaration: true,
    })
    console.log(`References to "add" function: ${refs.length} locations`)
    for (const ref of refs.slice(0, 5)) {
      const relativePath = ref.uri.replace('file://', '').replace(PROJECT_PATH, '.')
      console.log(`  📍 ${relativePath}:${ref.range.start.line + 1}:${ref.range.start.character + 1}`)
    }

    // Code completion
    printSection('6. Code Completion')
    // Get completions after 'Math.' in math.ts
    const completions = await manager.completion({
      file: MATH_FILE,
      line: 76, // return Math.abs(value) line
      character: 14, // after 'Math.'
    })
    console.log(`Completions at Math.: ${completions.length} items`)
    console.log('First 10 completions:')
    for (const item of completions.slice(0, 10)) {
      const kindName = item.kind ? COMPLETION_KIND_NAMES[item.kind] || `Kind(${item.kind})` : 'Unknown'
      console.log(`  ${kindName.padEnd(12)} ${item.label}`)
    }

    // Document symbols
    printSection('7. Document Symbols')
    const docSymbols = await manager.documentSymbol(`file://${MATH_FILE}`)
    console.log(`Symbols in math.ts: ${docSymbols.length}`)
    for (const sym of docSymbols) {
      const kindName = SYMBOL_KIND_NAMES[sym.kind] || `Kind(${sym.kind})`
      console.log(`  ${kindName.padEnd(12)} ${sym.name}`)
    }

    // Workspace symbol search
    printSection('8. Workspace Symbol Search')
    const wsSymbols = await manager.workspaceSymbol('User')
    console.log(`Workspace symbols matching "User": ${wsSymbols.length}`)
    for (const sym of wsSymbols) {
      const kindName = SYMBOL_KIND_NAMES[sym.kind] || `Kind(${sym.kind})`
      const relativePath = sym.location.uri.replace('file://', '').replace(PROJECT_PATH, '.')
      console.log(`  ${kindName.padEnd(12)} ${sym.name.padEnd(20)} ${relativePath}`)
    }

    // Summary
    printSection('✅ Demo Complete!')
    console.log('\nThis demo showed:')
    console.log('  1. LSPManager initialization')
    console.log('  2. File opening and diagnostics')
    console.log('  3. Hover information')
    console.log('  4. Go to definition')
    console.log('  5. Find references')
    console.log('  6. Code completion')
    console.log('  7. Document symbols')
    console.log('  8. Workspace symbol search')
    console.log('\nFor more advanced usage, see the README.md')
  }
  finally {
    // Cleanup
    printSection('Cleanup')
    await manager.shutdown()
    console.log('✅ LSP servers shut down')
  }
}

// Run the demo
main().catch(console.error)
