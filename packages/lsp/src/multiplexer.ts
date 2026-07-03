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

/** Enqueues a document-sync task for a file path (no-op for non-file uris). */
type Enqueue = (filePath: string | undefined, task: (file: string) => Promise<void>) => void

/**
 * Convert an LSP uri to a filesystem path. Editors query non-file uris
 * (git://, untitled://, output://, …); return undefined for those so callers
 * can fall back to empty/null instead of throwing.
 */
function uriToPath(uri: string): string | undefined {
  try {
    return fileURLToPath(uri)
  }
  catch {
    return undefined
  }
}

/**
 * Wire downstream publishDiagnostics back to the upstream client. Diagnostics
 * are debounced per file and always re-merged across ALL clients (forwarding a
 * single downstream's push would let the last writer erase the others).
 * Returns the timer map so shutdown can clear pending timers.
 */
function setupDiagnosticsRelay(
  connection: MessageConnection,
  manager: LSPManager,
): Map<string, ReturnType<typeof setTimeout>> {
  const publishTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const flushDiagnostics = (filePath: string): void => {
    publishTimers.delete(filePath)
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
    if (existing) { clearTimeout(existing) }
    publishTimers.set(
      filePath,
      setTimeout(flushDiagnostics, DIAGNOSTICS_PUBLISH_DEBOUNCE_MS, filePath),
    )
  }

  manager.onDiagnostics = (filePath: string) => schedulePublish(filePath)
  return publishTimers
}

/**
 * Per-file sequential task queue for document-sync notifications.
 *
 * didOpen/didChange/didClose must apply in arrival order per file. They are
 * fire-and-forget notifications, so without serialization an in-flight
 * openWithText could interleave with a later didChange/didClose and corrupt
 * downstream document state. Chain each file's tasks on a per-path promise.
 */
function createSyncQueue(): Enqueue {
  const fileQueues = new Map<string, Promise<void>>()
  return (filePath, task) => {
    if (!filePath) { return }
    const fp = filePath
    const previous = fileQueues.get(fp) ?? Promise.resolve()
    const next = previous.then(() => task(fp)).catch((err: unknown) => {
      log.error({ err, filePath: fp }, 'Document sync task failed')
    }).finally(() => {
      // Drop the entry once it settles, but only if no newer task was chained
      // in the meantime — otherwise we'd evict a still-pending tail. Keeps the
      // map bounded by the number of in-flight files, not files-ever-seen.
      if (fileQueues.get(fp) === next) { fileQueues.delete(fp) }
    })
    fileQueues.set(fp, next)
  }
}

/**
 * Build the idempotent shutdown routine: clear pending publish timers and shut
 * the manager (and all downstreams) down exactly once.
 */
function createShutdown(
  manager: LSPManager,
  publishTimers: Map<string, ReturnType<typeof setTimeout>>,
): () => Promise<void> {
  let shuttingDown = false
  return async () => {
    if (shuttingDown) { return }
    shuttingDown = true
    for (const timer of publishTimers.values()) { clearTimeout(timer) }
    publishTimers.clear()
    await manager.shutdown().catch(() => {})
  }
}

/** Register upstream request handlers (read-only queries + shutdown). */
function registerRequestHandlers(
  connection: MessageConnection,
  manager: LSPManager,
  shutdown: () => Promise<void>,
): void {
  connection.onRequest('initialize', () => {
    // Do NOT eagerly spawn downstreams here — they spawn lazily on first
    // didOpen, off the initialize critical path (avoids init-timeout stalls).
    return {
      capabilities: SERVER_CAPABILITIES,
      serverInfo: { name: 'code-lsp-multiplexer' },
    }
  })

  connection.onRequest('textDocument/hover', async (params: PositionParams) => {
    const file = uriToPath(params.textDocument.uri)
    if (file === undefined) { return null }
    const results = await manager.hover({
      file,
      line: params.position.line,
      character: params.position.character,
    })
    // Upstream expects a single Hover (or null), not an array.
    return results.find(h => h != null) ?? null
  })

  connection.onRequest('textDocument/definition', async (params: PositionParams) => {
    const file = uriToPath(params.textDocument.uri)
    if (file === undefined) { return [] }
    return manager.definition({
      file,
      line: params.position.line,
      character: params.position.character,
    })
  })

  connection.onRequest(
    'textDocument/references',
    async (params: PositionParams & { context?: { includeDeclaration?: boolean } }) => {
      const file = uriToPath(params.textDocument.uri)
      if (file === undefined) { return [] }
      return manager.references({
        file,
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
    const file = uriToPath(params.textDocument.uri)
    if (file === undefined) { return null }
    return manager.prepareRename({
      file,
      line: params.position.line,
      character: params.position.character,
    })
  })

  connection.onRequest(
    'textDocument/rename',
    async (params: PositionParams & { newName: string }) => {
      const file = uriToPath(params.textDocument.uri)
      if (file === undefined) { return null }
      return manager.rename({
        file,
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
}

/** Register upstream notification handlers (document sync + exit). */
function registerNotificationHandlers(
  connection: MessageConnection,
  manager: LSPManager,
  enqueue: Enqueue,
  shutdown: () => Promise<void>,
  exit: () => void,
): void {
  connection.onNotification('initialized', () => {})

  connection.onNotification(
    'textDocument/didOpen',
    (params: { textDocument: { uri: string, text: string } }) => {
      const { text } = params.textDocument
      enqueue(uriToPath(params.textDocument.uri), file => manager.openWithText(file, text))
    },
  )

  connection.onNotification(
    'textDocument/didChange',
    (params: { textDocument: { uri: string }, contentChanges: Array<{ text: string }> }) => {
      // Full sync: the last change entry is the complete document.
      const text = params.contentChanges.at(-1)?.text
      if (text === undefined) { return }
      enqueue(uriToPath(params.textDocument.uri), file => manager.openWithText(file, text))
    },
  )

  connection.onNotification(
    'textDocument/didClose',
    (params: { textDocument: { uri: string } }) => {
      enqueue(uriToPath(params.textDocument.uri), file => manager.closeFile(file))
    },
  )

  connection.onNotification('exit', async () => {
    await shutdown()
    exit()
  })
}

/** Wire connection teardown + process signals to the shutdown routine. */
function registerLifecycle(
  connection: MessageConnection,
  shutdown: () => Promise<void>,
  exit: () => void,
): void {
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

  const publishTimers = setupDiagnosticsRelay(connection, manager)
  const enqueue = createSyncQueue()
  const shutdown = createShutdown(manager, publishTimers)

  registerRequestHandlers(connection, manager, shutdown)
  registerNotificationHandlers(connection, manager, enqueue, shutdown, exit)
  registerLifecycle(connection, shutdown, exit)

  connection.listen()
  log.debug('Multiplexer LSP server started')

  // Resolve when the connection is disposed (close event fires shutdown).
  await new Promise<void>((resolve) => {
    connection.onClose(() => resolve())
  })
}
