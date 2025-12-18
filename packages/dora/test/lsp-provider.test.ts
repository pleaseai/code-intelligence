import { afterEach, describe, expect, test } from 'bun:test'
import { createLSPProvider, LSPProvider } from '../src/providers/lsp'

describe('LSPProvider', () => {
  let provider: LSPProvider | null = null

  afterEach(async () => {
    if (provider) {
      await provider.disconnect()
      provider = null
    }
  })

  test('has correct name', () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    expect(provider.name).toBe('lsp')
  })

  test('starts disconnected', () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    expect(provider.isConnected()).toBe(false)
  })

  test('connects successfully', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    await provider.connect()
    expect(provider.isConnected()).toBe(true)
  })

  test('disconnect sets connected to false', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    await provider.connect()
    expect(provider.isConnected()).toBe(true)

    await provider.disconnect()
    expect(provider.isConnected()).toBe(false)
    provider = null // Prevent double disconnect
  })

  test('lists LSP tools', () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    const tools = provider.listTools()

    expect(tools.length).toBeGreaterThan(0)

    const toolNames = tools.map(t => t.name)
    expect(toolNames).toContain('lsp_diagnostics')
    expect(toolNames).toContain('lsp_hover')
    expect(toolNames).toContain('lsp_workspace_symbol')
    expect(toolNames).toContain('lsp_document_symbol')
    expect(toolNames).toContain('lsp_references')
    expect(toolNames).toContain('lsp_status')
  })

  test('returns error when calling tool without connecting', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })

    const result = await provider.callTool('lsp_status', {})
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('not connected')
  })

  test('lsp_status returns no servers when none connected', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    await provider.connect()

    const result = await provider.callTool('lsp_status', {})
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain('No LSP servers connected')
  })

  test('returns error for unknown tool', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    await provider.connect()

    const result = await provider.callTool('unknown_tool', {})
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('Unknown tool')
  })

  test('lsp_references returns error when not connected', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })

    const result = await provider.callTool('lsp_references', {
      file: 'test.ts',
      line: 0,
      character: 0,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('not connected')
  })

  test('lsp_references returns no references for non-symbol position', async () => {
    provider = new LSPProvider({ projectPath: process.cwd() })
    await provider.connect()

    // Call on a position that doesn't have a symbol (no LSP servers connected)
    const result = await provider.callTool('lsp_references', {
      file: 'test.ts',
      line: 0,
      character: 0,
    })
    // Without connected LSP servers, should return "No references found"
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain('No references found')
  })
})

describe('createLSPProvider', () => {
  test('creates provider instance', () => {
    const provider = createLSPProvider({ projectPath: process.cwd() })
    expect(provider).toBeInstanceOf(LSPProvider)
    expect(provider.name).toBe('lsp')
  })
})
