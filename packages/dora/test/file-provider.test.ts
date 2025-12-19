/**
 * Tests for FileProvider
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createFileProvider, FileProvider } from '../src/providers/file'

/** Helper to get text from tool result */
function getText(result: { content: Array<{ type: string, text: string }> }): string {
  return result.content[0]?.text ?? ''
}

describe('FileProvider', () => {
  let testDir: string
  let provider: FileProvider

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-provider-test-'))

    // Create some test files
    fs.mkdirSync(path.join(testDir, 'src'))
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'Hello World\nLine 2\nLine 3')
    fs.writeFileSync(path.join(testDir, 'src', 'app.ts'), 'export const foo = "bar";\n')

    provider = createFileProvider({ projectPath: testDir })
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('connection', () => {
    it('has correct name', () => {
      expect(provider.name).toBe('file')
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
    it('lists file tools', () => {
      const tools = provider.listTools()
      const toolNames = tools.map(t => t.name)

      expect(toolNames).toContain('read_file')
      expect(toolNames).toContain('create_text_file')
      expect(toolNames).toContain('list_dir')
      expect(toolNames).toContain('find_file')
      expect(toolNames).toContain('search_for_pattern')
      expect(toolNames).toContain('replace_content')
    })
  })

  describe('read_file', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('reads entire file', async () => {
      const result = await provider.callTool('read_file', {
        relative_path: 'test.txt',
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      expect(text).toContain('Hello World')
      expect(text).toContain('Line 2')
      expect(text).toContain('Line 3')
    })

    it('reads specific lines', async () => {
      const result = await provider.callTool('read_file', {
        relative_path: 'test.txt',
        start_line: 1,
        end_line: 1,
      })

      expect(result.isError).toBeFalsy()
      const text = getText(result)
      expect(text).toContain('Line 2')
      expect(text).not.toContain('Hello World')
    })

    it('returns error for non-existent file', async () => {
      const result = await provider.callTool('read_file', {
        relative_path: 'nonexistent.txt',
      })

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('not found')
    })
  })

  describe('create_text_file', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('creates new file', async () => {
      const result = await provider.callTool('create_text_file', {
        relative_path: 'new-file.txt',
        content: 'New content',
      })

      expect(result.isError).toBeFalsy()
      expect(getText(result)).toContain('created')

      const content = fs.readFileSync(path.join(testDir, 'new-file.txt'), 'utf-8')
      expect(content).toBe('New content')
    })

    it('creates file in new directory', async () => {
      const result = await provider.callTool('create_text_file', {
        relative_path: 'new-dir/nested/file.txt',
        content: 'Nested content',
      })

      expect(result.isError).toBeFalsy()
      const content = fs.readFileSync(path.join(testDir, 'new-dir/nested/file.txt'), 'utf-8')
      expect(content).toBe('Nested content')
    })

    it('overwrites existing file', async () => {
      const result = await provider.callTool('create_text_file', {
        relative_path: 'test.txt',
        content: 'Overwritten',
      })

      expect(result.isError).toBeFalsy()
      expect(getText(result)).toContain('overwrote')

      const content = fs.readFileSync(path.join(testDir, 'test.txt'), 'utf-8')
      expect(content).toBe('Overwritten')
    })
  })

  describe('list_dir', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('lists directory contents non-recursively', async () => {
      const result = await provider.callTool('list_dir', {
        relative_path: '.',
        recursive: false,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))

      expect(data.dirs).toContain('src')
      expect(data.files).toContain('test.txt')
    })

    it('lists directory contents recursively', async () => {
      const result = await provider.callTool('list_dir', {
        relative_path: '.',
        recursive: true,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))

      expect(data.dirs).toContain('src')
      expect(data.files).toContain('test.txt')
      expect(data.files).toContain(path.join('src', 'app.ts'))
    })

    it('returns error for non-existent directory', async () => {
      const result = await provider.callTool('list_dir', {
        relative_path: 'nonexistent',
        recursive: false,
      })

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('not found')
    })
  })

  describe('find_file', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('finds files by exact name', async () => {
      const result = await provider.callTool('find_file', {
        file_mask: 'test.txt',
        relative_path: '.',
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))
      expect(data.files).toContain('test.txt')
    })

    it('finds files by wildcard', async () => {
      const result = await provider.callTool('find_file', {
        file_mask: '*.ts',
        relative_path: '.',
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))
      expect(data.files.length).toBeGreaterThan(0)
      expect(data.files.some((f: string) => f.endsWith('.ts'))).toBe(true)
    })
  })

  describe('search_for_pattern', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('finds pattern in files', async () => {
      const result = await provider.callTool('search_for_pattern', {
        pattern: 'Hello',
        relative_path: '.',
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))
      expect(data['test.txt']).toBeDefined()
    })

    it('finds pattern with context', async () => {
      const result = await provider.callTool('search_for_pattern', {
        pattern: 'Line 2',
        relative_path: '.',
        context_lines_before: 1,
        context_lines_after: 1,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))
      expect(data['test.txt'][0]).toContain('Hello')
      expect(data['test.txt'][0]).toContain('Line 3')
    })

    it('finds regex pattern', async () => {
      const result = await provider.callTool('search_for_pattern', {
        pattern: 'Line \\d+',
        relative_path: '.',
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(getText(result))
      expect(data['test.txt']).toBeDefined()
      expect(data['test.txt'].length).toBeGreaterThan(0)
    })
  })

  describe('replace_content', () => {
    beforeEach(async () => {
      await provider.connect()
    })

    it('replaces literal string', async () => {
      const result = await provider.callTool('replace_content', {
        relative_path: 'test.txt',
        needle: 'Hello World',
        repl: 'Goodbye World',
        mode: 'literal',
      })

      expect(result.isError).toBeFalsy()
      expect(getText(result)).toContain('OK')

      const content = fs.readFileSync(path.join(testDir, 'test.txt'), 'utf-8')
      expect(content).toContain('Goodbye World')
      expect(content).not.toContain('Hello World')
    })

    it('replaces regex pattern', async () => {
      const result = await provider.callTool('replace_content', {
        relative_path: 'test.txt',
        needle: 'Line \\d+',
        repl: 'Row',
        mode: 'regex',
        allow_multiple: true,
      })

      expect(result.isError).toBeFalsy()

      const content = fs.readFileSync(path.join(testDir, 'test.txt'), 'utf-8')
      expect(content).toContain('Row')
      expect(content).not.toContain('Line 2')
    })

    it('returns error when multiple matches without allow_multiple', async () => {
      const result = await provider.callTool('replace_content', {
        relative_path: 'test.txt',
        needle: 'Line',
        repl: 'Row',
        mode: 'literal',
        allow_multiple: false,
      })

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('matches')
    })

    it('returns error when no match found', async () => {
      const result = await provider.callTool('replace_content', {
        relative_path: 'test.txt',
        needle: 'NonexistentText',
        repl: 'Replacement',
        mode: 'literal',
      })

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('No matches')
    })
  })

  describe('error handling', () => {
    it('returns error when not connected', async () => {
      const result = await provider.callTool('read_file', {
        relative_path: 'test.txt',
      })

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('not connected')
    })

    it('returns error for unknown tool', async () => {
      await provider.connect()
      const result = await provider.callTool('unknown_tool', {})

      expect(result.isError).toBe(true)
      expect(getText(result)).toContain('Unknown tool')
    })
  })
})

describe('createFileProvider', () => {
  it('creates provider instance', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-test-'))
    try {
      const provider = createFileProvider({ projectPath: tmpDir })
      expect(provider).toBeInstanceOf(FileProvider)
      expect(provider.name).toBe('file')
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
