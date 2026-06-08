/**
 * Multiplexing LSP server.
 *
 * Acts as a single upstream LSP server (talking to Claude Code over stdio)
 * that fans every request out to multiple downstream language servers via
 * LSPManager and merges their results into one LSP stream. This works around
 * Claude Code's "one server per extension" constraint: a single plugin server
 * can run a type-checker AND several linters on the same file.
 */

import type { Readable, Writable } from 'node:stream'
import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { Diagnostic } from 'vscode-languageserver-types'
import type { LSPManager } from './index'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLogger } from '@pleaseai/logger'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'

const log = createLogger('lsp-multiplex')

const DIAGNOSTICS_PUBLISH_DEBOUNCE_MS = 120

/**
 * Static capabilities advertised to the upstream client.
 *
 * We do not negotiate a union of downstream capabilities: downstreams spawn
 * lazily/asynchronously, so their capabilities are unknown at initialize time.
 * Methods no downstream supports simply return empty/null (the manager already
 * swallows "method not found").
 *
 * textDocumentSync.change = 1 (Full) matches what createLSPClient sends
 * downstream (always full-text contentChanges).
 */
const SERVER_CAPABILITIES = {
  textDocumentSync: { openClose: true, change: 1 },
  hoverProvider: true,
  definitionProvider: true,
  referencesProvider: true,
  documentSymbolProvider: true,
  renameProvider: { prepareProvider: true },
}

export interface MultiplexerOptions {
  /** Pre-built manager (CLI builds from project config; tests inject a fake). */
  manager: LSPManager
  /** Upstream input stream (default: process.stdin). */
  input?: Readable
  /** Upstream output stream (default: process.stdout). */
  output?: Writable
  /** Called on `exit`/shutdown. Default: process.exit(0). Overridable for tests. */
  onExit?: () => void
}

interface PositionParams {
  textDocument: { uri: string }
  position: { line: number, character: number }
}

function uriToPath(uri: string): string {
  return fileURLToPath(uri)
}

/**
 * Run the multiplexing LSP server until the upstream connection closes.
 * Resolves when the connection is disposed.
 */
export async function runMultiplexer(opts: MultiplexerOptions): Promise<void> {
  const { manager } = opts
  const input = opts.input ?? process.stdin
  const output = opts.output ?? process.stdout
  const exit = opts.onExit ?? (() => process.exit(0))

  const connection: MessageConnection = createMessageConnection(
    new StreamMessageReader(input),
    new StreamMessageWriter(output),
  )

  // --- Diagnostics relay (downstream publishDiagnostics -> upstream) ---------
  const publishTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const flushDiagnostics = (filePath: string): void => {
    publishTimers.delete(filePath)
    // Always re-merge across ALL clients for this file. Forwarding a single
    // downstream's push would let the last writer erase the others.
    const diagnostics: Diagnostic[] = manager.diagnosticsForFile(filePath)
    connection.sendNotification('textDocument/publishDiagnostics', {
      uri: pathToFileURL(filePath).href,
      diagnostics,
    }).catch((err: unknown) => {
      log.error({ err, filePath }, 'Failed to publish diagnostics upstream')
    })
  }

  const schedulePublish = (filePath: string): void => {
    const existing = publishTimers.get(filePath)
    if (existing)
      clearTimeout(existing)
    publishTimers.set(
      filePath,
      setTimeout(() => flushDiagnostics(filePath), DIAGNOSTICS_PUBLISH_DEBOUNCE_MS),
    )
  }

  manager.onDiagnostics = (filePath: string) => schedulePublish(filePath)

  // --- Lifecycle -------------------------------------------------------------
  let shuttingDown = false
  const shutdown = async (): Promise<void> => {
    if (shuttingDown)
      return
    shuttingDown = true
    for (const timer of publishTimers.values())
      clearTimeout(timer)
    publishTimers.clear()
    await manager.shutdown().catch(() => {})
  }

  // --- Requests --------------------------------------------------------------
  connection.onRequest('initialize', () => {
    // Do NOT eagerly spawn downstreams here — they spawn lazily on first
    // didOpen, off the initialize critical path (avoids init-timeout stalls).
    return {
      capabilities: SERVER_CAPABILITIES,
      serverInfo: { name: 'code-lsp-multiplexer' },
    }
  })

  connection.onRequest('textDocument/hover', async (params: PositionParams) => {
    const results = await manager.hover({
      file: uriToPath(params.textDocument.uri),
      line: params.position.line,
      character: params.position.character,
    })
    // Upstream expects a single Hover (or null), not an array.
    return results.find(h => h != null) ?? null
  })

  connection.onRequest('textDocument/definition', async (params: PositionParams) => {
    return manager.definition({
      file: uriToPath(params.textDocument.uri),
      line: params.position.line,
      character: params.position.character,
    })
  })

  connection.onRequest(
    'textDocument/references',
    async (params: PositionParams & { context?: { includeDeclaration?: boolean } }) => {
      return manager.references({
        file: uriToPath(params.textDocument.uri),
        line: params.position.line,
        character: params.position.character,
        includeDeclaration: params.context?.includeDeclaration ?? false,
      })
    },
  )

  connection.onRequest(
    'textDocument/documentSymbol',
    async (params: { textDocument: { uri: string } }) => {
      return manager.documentSymbol(params.textDocument.uri)
    },
  )

  connection.onRequest('textDocument/prepareRename', async (params: PositionParams) => {
    return manager.prepareRename({
      file: uriToPath(params.textDocument.uri),
      line: params.position.line,
      character: params.position.character,
    })
  })

  connection.onRequest(
    'textDocument/rename',
    async (params: PositionParams & { newName: string }) => {
      return manager.rename({
        file: uriToPath(params.textDocument.uri),
        line: params.position.line,
        character: params.position.character,
        newName: params.newName,
      })
    },
  )

  connection.onRequest('shutdown', async () => {
    await shutdown()
    return null
  })

  // --- Notifications ---------------------------------------------------------
  connection.onNotification('initialized', () => {})

  connection.onNotification(
    'textDocument/didOpen',
    (params: { textDocument: { uri: string, text: string } }) => {
      void manager.openWithText(uriToPath(params.textDocument.uri), params.textDocument.text)
    },
  )

  connection.onNotification(
    'textDocument/didChange',
    (params: { textDocument: { uri: string }, contentChanges: Array<{ text: string }> }) => {
      // Full sync: the last change entry is the complete document.
      const text = params.contentChanges.at(-1)?.text
      if (text === undefined)
        return
      void manager.openWithText(uriToPath(params.textDocument.uri), text)
    },
  )

  connection.onNotification(
    'textDocument/didClose',
    (params: { textDocument: { uri: string } }) => {
      void manager.closeFile(uriToPath(params.textDocument.uri))
    },
  )

  connection.onNotification('exit', async () => {
    await shutdown()
    exit()
  })

  // --- Connection teardown ---------------------------------------------------
  connection.onClose(() => {
    void shutdown()
  })
  connection.onError((err: unknown) => {
    log.error({ err }, 'Upstream connection error')
  })

  const onSignal = (): void => {
    void shutdown().finally(() => exit())
  }
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)

  connection.listen()
  log.debug('Multiplexer LSP server started')

  // Resolve when the connection is disposed (close event fires shutdown).
  await new Promise<void>((resolve) => {
    connection.onClose(() => resolve())
  })
}
