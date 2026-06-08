import type { ChildProcess } from 'node:child_process'
import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { LSPClientInfo } from '../../src/client'
import type { LSPManager } from '../../src/index'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'
import { createLSPClient } from '../../src/client'
import { runMultiplexer } from '../../src/multiplexer'

function spawnFakeServer() {
  const serverPath = path.join(import.meta.dir, '../fixture/fake-lsp-server.js')
  return { process: spawn(process.execPath, [serverPath], { stdio: 'pipe' }) }
}

/**
 * Minimal manager backed by real fake-LSP clients. Mirrors the subset of
 * LSPManager the multiplexer uses, so we can test the upstream protocol and
 * diagnostics merge without depending on LSP_SERVERS definitions.
 */
class FakeManager {
  onDiagnostics?: (filePath: string, serverID: string) => void
  clients: LSPClientInfo[] = []
  processes: ChildProcess[] = []

  async addFakeClient(id: string): Promise<void> {
    const handle = spawnFakeServer()
    this.processes.push(handle.process)
    const client = await createLSPClient({
      serverID: id,
      server: handle,
      root: process.cwd(),
      projectPath: process.cwd(),
      onDiagnostics: (fp, sid) => this.onDiagnostics?.(fp, sid),
    })
    this.clients.push(client)
  }

  async openWithText(file: string, text: string): Promise<void> {
    await Promise.all(this.clients.map(c => c.notify.open({ path: file, text })))
  }

  async closeFile(file: string): Promise<void> {
    await Promise.all(this.clients.map(c => c.notify.close({ path: file })))
  }

  diagnosticsForFile(file: string) {
    const norm = path.normalize(file)
    return this.clients.flatMap(c => c.diagnostics.get(norm) ?? [])
  }

  async hover(input: { file: string, line: number, character: number }) {
    return Promise.all(
      this.clients.map(c =>
        c.connection
          .sendRequest('textDocument/hover', {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      ),
    )
  }

  async definition() {
    return []
  }

  async references() {
    return []
  }

  async documentSymbol() {
    return []
  }

  async prepareRename() {
    return null
  }

  async rename() {
    return null
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.clients.map(c => c.shutdown()))
    this.clients = []
  }
}

interface Harness {
  conn: MessageConnection
  manager: FakeManager
  stop: () => Promise<void>
}

async function startHarness(fakeCount: number): Promise<Harness> {
  const manager = new FakeManager()
  for (let i = 0; i < fakeCount; i++)
    await manager.addFakeClient(`fake${i}`)

  // Two pipes: client writes -> server reads; server writes -> client reads.
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()

  const exited = { value: false }
  const run = runMultiplexer({
    manager: manager as unknown as LSPManager,
    input: clientToServer,
    output: serverToClient,
    onExit: () => {
      exited.value = true
    },
  })

  const conn = createMessageConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  )
  conn.listen()

  return {
    conn,
    manager,
    stop: async () => {
      conn.dispose()
      clientToServer.end()
      await manager.shutdown()
      await run.catch(() => {})
    },
  }
}

describe('runMultiplexer', () => {
  let harness: Harness | null = null

  afterEach(async () => {
    if (harness) {
      await harness.stop()
      harness = null
    }
  })

  test('responds to initialize with merged capabilities', async () => {
    harness = await startHarness(1)
    const result = await harness.conn.sendRequest('initialize', {
      rootUri: pathToFileURL(process.cwd()).href,
      capabilities: {},
    }) as { capabilities: Record<string, unknown> }

    expect(result.capabilities.hoverProvider).toBe(true)
    expect(result.capabilities.definitionProvider).toBe(true)
    expect(result.capabilities.referencesProvider).toBe(true)
    expect(result.capabilities.documentSymbolProvider).toBe(true)
    expect((result.capabilities.renameProvider as { prepareProvider: boolean }).prepareProvider).toBe(true)
    expect((result.capabilities.textDocumentSync as { openClose: boolean }).openClose).toBe(true)
  })

  test('merges diagnostics from multiple downstream servers into one push', async () => {
    harness = await startHarness(2)
    await harness.conn.sendRequest('initialize', { capabilities: {} })
    await harness.conn.sendNotification('initialized', {})

    const file = path.join(process.cwd(), 'mux-test.ts')
    const uri = pathToFileURL(file).href

    const received = new Promise<{ uri: string, diagnostics: unknown[] }>((resolve) => {
      harness!.conn.onNotification(
        'textDocument/publishDiagnostics',
        (params: { uri: string, diagnostics: unknown[] }) => {
          if (params.uri === uri && params.diagnostics.length >= 2)
            resolve(params)
        },
      )
    })

    await harness.conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 0, text: 'const x = 1' },
    })

    const params = await received
    // Two fake servers each publish one diagnostic for this uri -> merged to 2.
    expect(params.diagnostics.length).toBe(2)
  })

  test('returns a single hover (not an array)', async () => {
    harness = await startHarness(2)
    await harness.conn.sendRequest('initialize', { capabilities: {} })
    await harness.conn.sendNotification('initialized', {})

    const file = path.join(process.cwd(), 'mux-hover.ts')
    const uri = pathToFileURL(file).href
    await harness.conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 0, text: 'const x = 1' },
    })

    const hover = await harness.conn.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    }) as { contents: { value: string } } | null

    expect(hover).not.toBeNull()
    expect(hover?.contents.value).toContain('Test hover info')
  })

  test('shutdown stops downstream clients', async () => {
    harness = await startHarness(1)
    await harness.conn.sendRequest('initialize', { capabilities: {} })
    const proc = harness.manager.processes[0]!

    await harness.conn.sendRequest('shutdown')
    await new Promise(r => setTimeout(r, 50))

    expect(proc.killed).toBe(true)
  })
})
