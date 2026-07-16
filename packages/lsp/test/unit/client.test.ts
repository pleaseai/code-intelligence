import type { LSPClientInfo } from '../../src/client'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { createLSPClient } from '../../src/client'

function spawnFakeServer() {
  const serverPath = path.join(import.meta.dir, '../fixture/fake-lsp-server.js')
  return {
    process: spawn(process.execPath, [serverPath], {
      stdio: 'pipe',
    }),
  }
}

function spawnFakePullServer() {
  const serverPath = path.join(import.meta.dir, '../fixture/fake-pull-lsp-server.js')
  return {
    process: spawn(process.execPath, [serverPath], {
      stdio: 'pipe',
    }),
  }
}

describe('LSPClient', () => {
  let client: LSPClientInfo | null = null

  afterEach(async () => {
    if (client) {
      await client.shutdown()
      client = null
    }
  })

  test('creates client and initializes connection', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    expect(client).toBeDefined()
    expect(client.serverID).toBe('fake')
    expect(client.root).toBe(process.cwd())
    expect(client.connection).toBeDefined()
  })

  test('handles workspace/workspaceFolders request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    // Trigger the request via notification
    await client.connection.sendNotification('test/trigger', {
      method: 'workspace/workspaceFolders',
    })

    await new Promise(r => setTimeout(r, 100))

    expect(client.connection).toBeDefined()
  })

  test('handles client/registerCapability request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    await client.connection.sendNotification('test/trigger', {
      method: 'client/registerCapability',
    })

    await new Promise(r => setTimeout(r, 100))

    expect(client.connection).toBeDefined()
  })

  test('handles client/unregisterCapability request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    await client.connection.sendNotification('test/trigger', {
      method: 'client/unregisterCapability',
    })

    await new Promise(r => setTimeout(r, 100))

    expect(client.connection).toBeDefined()
  })

  test('opens file and receives diagnostics', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    // Create a temporary test file
    const testFile = path.join(process.cwd(), 'package.json')
    await client.notify.open({ path: testFile })

    // Wait for diagnostics
    await new Promise(r => setTimeout(r, 200))

    expect(client.diagnostics.size).toBeGreaterThan(0)
  })

  test('pulls diagnostics for servers that advertise a diagnostic provider', async () => {
    const handle = spawnFakePullServer()

    client = await createLSPClient({
      serverID: 'fake-pull',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const testFile = path.join(process.cwd(), 'package.json')
    // The pull server never pushes publishDiagnostics; diagnostics must be
    // fetched asynchronously via textDocument/diagnostic during open().
    const wait = client.waitForDiagnostics({ path: testFile })
    await client.notify.open({ path: testFile })
    await wait

    const diags = client.diagnostics.get(path.normalize(testFile)) ?? []
    expect(diags.length).toBeGreaterThan(0)
    expect(diags[0]?.severity).toBe(1)
    expect(diags[0]?.message).toContain('Pull diagnostic')
  })

  test('waitForDiagnostics resolves for pull-model servers', async () => {
    const handle = spawnFakePullServer()

    client = await createLSPClient({
      serverID: 'fake-pull',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const testFile = path.join(process.cwd(), 'package.json')
    const wait = client.waitForDiagnostics({ path: testFile })
    await client.notify.open({ path: testFile })
    await wait

    expect(client.diagnostics.get(path.normalize(testFile))?.length).toBeGreaterThan(0)
  })

  test('opens file with explicit buffer text (no disk read)', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    // A path that does not exist on disk: would throw if text were read from
    // disk. With explicit text, didOpen succeeds and diagnostics arrive.
    const virtualFile = path.join(process.cwd(), 'does-not-exist-on-disk.ts')
    await client.notify.open({ path: virtualFile, text: 'const x: number = "oops"' })

    await new Promise(r => setTimeout(r, 200))

    expect(client.diagnostics.size).toBeGreaterThan(0)
  })

  test('concurrent opens of the same file emit a single didOpen', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const virtualFile = path.join(process.cwd(), 'concurrent-open.ts')
    const uri = `file://${virtualFile}`

    // Fire two opens without awaiting the first. The second must take the
    // didChange path, not emit a duplicate didOpen.
    await Promise.all([
      client.notify.open({ path: virtualFile, text: 'const a = 1' }),
      client.notify.open({ path: virtualFile, text: 'const a = 2' }),
    ])

    const result = await client.connection.sendRequest('test/openCount', { uri }) as {
      count: number
    }
    expect(result.count).toBe(1)
  })

  test('closes an opened file', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const virtualFile = path.join(process.cwd(), 'close-me.ts')
    await client.notify.open({ path: virtualFile, text: 'const y = 1' })
    await new Promise(r => setTimeout(r, 100))

    // close clears the stored diagnostics for the file
    await client.notify.close({ path: virtualFile })
    expect(client.diagnostics.get(path.normalize(virtualFile))).toBeUndefined()
  })

  test('sends hover request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const result = await client.connection.sendRequest('textDocument/hover', {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 5 },
    })

    expect(result).toBeDefined()
    expect((result as { contents: { value: string } }).contents.value).toContain(
      'Test hover',
    )
  })

  test('sends workspace symbol request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const result = (await client.connection.sendRequest('workspace/symbol', {
      query: 'test',
    })) as Array<{ name: string }>

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.name).toBe('testFunction')
  })

  test('sends document symbol request', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    const result = (await client.connection.sendRequest(
      'textDocument/documentSymbol',
      {
        textDocument: { uri: 'file:///test.ts' },
      },
    )) as Array<{ name: string }>

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.name).toBe('TestClass')
  })

  test('shuts down cleanly', async () => {
    const handle = spawnFakeServer()

    client = await createLSPClient({
      serverID: 'fake',
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
    })

    await client.shutdown()
    client = null // Prevent double shutdown in afterEach

    // Process should be killed
    expect(handle.process.killed).toBe(true)
  })
})
