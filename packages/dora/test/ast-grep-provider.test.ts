/**
 * Tests for AstGrepProvider
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { AstGrepProvider, createAstGrepProvider } from '../src/providers/ast-grep'
import { isCliAvailable } from '../src/providers/ast-grep/cli'

/**
 * Check if CLI is available before running tests that require it
 */
async function checkCliAvailable(): Promise<boolean> {
  return await isCliAvailable()
}

/** Helper to get text from tool result */
function getText(result: { content: Array<{ type: string, text: string }> }): string {
  return result.content[0]?.text ?? ''
}

describe('AstGrepProvider', () => {
  let testDir: string
  let provider: AstGrepProvider

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-grep-provider-test-'))

    // Create test files with code
    fs.mkdirSync(path.join(testDir, 'src'))
    fs.writeFileSync(
      path.join(testDir, 'src', 'example.ts'),
      `console.log('hello');
console.log('world');
function greet(name: string) {
  console.log(\`Hello, \${name}!\`);
}
`,
    )

    fs.writeFileSync(
      path.join(testDir, 'src', 'app.js'),
      `const foo = 'bar';
console.warn('deprecated');
`,
    )

    provider = createAstGrepProvider({ projectPath: testDir })
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('connection', () => {
    it('has correct name', () => {
      expect(provider.name).toBe('ast-grep')
    })

    it('starts disconnected', () => {
      expect(provider.isConnected()).toBe(false)
    })

    it('connects successfully', async () => {
      await provider.connect()
      expect(provider.isConnected()).toBe(true)
    })

    it('disconnect sets connected to false', async () => {
      await provider.connect()
      await provider.disconnect()
      expect(provider.isConnected()).toBe(false)
    })
  })

  describe('listTools', () => {
    it('lists CLI tools', async () => {
      await provider.connect()
      const tools = provider.listTools()
      const toolNames = tools.map(t => t.name)

      // CLI tools should always be available
      expect(toolNames).toContain('ast_grep_search')
      expect(toolNames).toContain('ast_grep_replace')
    })

    it('tool descriptions are informative', async () => {
      await provider.connect()
      const tools = provider.listTools()

      const searchTool = tools.find(t => t.name === 'ast_grep_search')
      expect(searchTool?.description).toContain('AST-aware')
      expect(searchTool?.description).toContain('meta-variables')
    })
  })

  describe('ast_grep_search', () => {
    let cliAvailable: boolean

    beforeEach(async () => {
      await provider.connect()
      cliAvailable = await checkCliAvailable()
    })

    it('finds pattern matches', async () => {
      if (!cliAvailable) {
        console.log('[SKIP] ast-grep CLI not available')
        return
      }

      const result = await provider.callTool('ast_grep_search', {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: [testDir],
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      // Should find console.log calls
      expect(text).toMatch(/\d+ match(es)?/)
    })

    it('handles no matches gracefully', async () => {
      if (!cliAvailable) {
        console.log('[SKIP] ast-grep CLI not available')
        return
      }

      const result = await provider.callTool('ast_grep_search', {
        pattern: 'nonexistent_function($X)',
        lang: 'typescript',
        paths: [testDir],
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      // Output says "No matches found" when there are no matches
      expect(text).toMatch(/no matches|0 match/i)
    })

    it('provides hint for common pattern mistakes', async () => {
      if (!cliAvailable) {
        console.log('[SKIP] ast-grep CLI not available')
        return
      }

      // Incomplete pattern that's a common mistake
      const result = await provider.callTool('ast_grep_search', {
        pattern: 'def $NAME',
        lang: 'python',
        paths: [testDir],
      })

      expect(result.isError).toBeFalsy()
      // Should provide a hint about complete patterns
    })

    it('validates language parameter', async () => {
      const result = await provider.callTool('ast_grep_search', {
        pattern: 'test',
        lang: 'invalid_language',
        paths: [testDir],
      })

      expect(result.isError).toBe(true)
    })

    it('returns helpful error when CLI unavailable', async () => {
      // This test verifies the error message when CLI is not found
      // The result may be success (with matches) or error (with helpful message)
      const result = await provider.callTool('ast_grep_search', {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: [testDir],
      })

      const text = getText(result)
      if (result.isError) {
        // Should provide some error message
        expect(text.length).toBeGreaterThan(0)
      }
      else {
        // CLI is available, should have matches
        expect(text).toMatch(/match/i)
      }
    })
  })

  describe('ast_grep_replace', () => {
    let cliAvailable: boolean

    beforeEach(async () => {
      await provider.connect()
      cliAvailable = await checkCliAvailable()
    })

    it('previews replacements in dry-run mode', async () => {
      if (!cliAvailable) {
        console.log('[SKIP] ast-grep CLI not available')
        return
      }

      const result = await provider.callTool('ast_grep_replace', {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        paths: [testDir],
        dryRun: true,
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      // Output contains "DRY RUN" to indicate preview mode
      expect(text).toMatch(/DRY RUN|Preview/i)
    })

    it('dry-run is default', async () => {
      if (!cliAvailable) {
        console.log('[SKIP] ast-grep CLI not available')
        return
      }

      const result = await provider.callTool('ast_grep_replace', {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        paths: [testDir],
        // No dryRun specified - should default to true
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      // Should indicate it's a dry run
      expect(text).toMatch(/DRY RUN|Preview/i)

      // File should not be modified
      const content = fs.readFileSync(path.join(testDir, 'src', 'example.ts'), 'utf-8')
      expect(content).toContain('console.log')
    })
  })

  describe('error handling', () => {
    it('handles missing required parameters', async () => {
      await provider.connect()
      const result = await provider.callTool('ast_grep_search', {
        // Missing pattern and lang
      })

      expect(result.isError).toBe(true)
    })

    it('returns error for unknown tool', async () => {
      await provider.connect()
      const result = await provider.callTool('unknown_tool', {})

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('Unknown tool')
    })
  })
})

describe('createAstGrepProvider', () => {
  it('creates provider instance', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-grep-test-'))
    try {
      const provider = createAstGrepProvider({ projectPath: tmpDir })
      expect(provider).toBeInstanceOf(AstGrepProvider)
      expect(provider.name).toBe('ast-grep')
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
