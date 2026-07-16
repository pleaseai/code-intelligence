/**
 * LSP Client implementation using JSON-RPC
 * Based on opencode reference implementation
 */

import type { ChildProcess } from 'node:child_process'
import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { Diagnostic } from 'vscode-languageserver-types'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createMessageConnection,

  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'
import { getLanguageId } from './language'

const DIAGNOSTICS_DEBOUNCE_MS = 150
const INITIALIZE_TIMEOUT_MS = 45_000
const DIAGNOSTICS_WAIT_TIMEOUT_MS = 3_000

export interface LSPServerHandle {
  process: ChildProcess
  initialization?: Record<string, unknown>
}

export interface LSPClientInfo {
  serverID: string
  root: string
  connection: MessageConnection
  diagnostics: Map<string, Diagnostic[]>
  notify: {
    open: (input: { path: string, text?: string }) => Promise<void>
    close: (input: { path: string }) => Promise<void>
  }
  waitForDiagnostics: (input: { path: string }) => Promise<void>
  shutdown: () => Promise<void>
}

type DiagnosticsCallback = (path: string, serverID: string) => void

/**
 * Create an LSP client from a server handle
 */
export async function createLSPClient(input: {
  serverID: string
  server: LSPServerHandle
  root: string
  projectPath: string
  onDiagnostics?: DiagnosticsCallback
}): Promise<LSPClientInfo> {
  const { stdout, stdin } = input.server.process
  if (!stdout || !stdin) {
    throw new Error(`LSP server ${input.serverID} has no stdio`)
  }

  const connection = createMessageConnection(
    new StreamMessageReader(stdout),
    new StreamMessageWriter(stdin),
  )

  const diagnostics = new Map<string, Diagnostic[]>()
  const files: Record<string, number> = {}
  const diagnosticPulls: Record<string, number> = {}
  let diagnosticsListeners: Array<{
    path: string
    resolve: () => void
    timer?: ReturnType<typeof setTimeout>
  }> = []

  // Whether the server reports diagnostics via the pull model
  // (textDocument/diagnostic) rather than pushing publishDiagnostics.
  // Populated from the initialize result below.
  let supportsPullDiagnostics = false

  // Store diagnostics for a file and notify any waiters. Shared by the push
  // (publishDiagnostics) handler and the pull (textDocument/diagnostic) path.
  const applyDiagnostics = (filePath: string, diags: Diagnostic[]): void => {
    diagnostics.set(filePath, diags)

    // Notify listeners with debounce
    const listeners = diagnosticsListeners.filter(l => l.path === filePath)
    for (const listener of listeners) {
      if (listener.timer) { clearTimeout(listener.timer) }
      listener.timer = setTimeout(() => {
        diagnosticsListeners = diagnosticsListeners.filter(
          l => l !== listener,
        )
        listener.resolve()
      }, DIAGNOSTICS_DEBOUNCE_MS)
    }

    input.onDiagnostics?.(filePath, input.serverID)
  }

  // Pull diagnostics for a single file (LSP textDocument/diagnostic). Used for
  // servers that advertise a diagnostic provider instead of pushing them
  // (e.g. typescript-go / tsgo). Failures are swallowed — absent diagnostics
  // must never break opening a file. `pullID` uniquely identifies this request;
  // the response is discarded if a newer open/change/close superseded it, so an
  // out-of-order reply can't overwrite fresher diagnostics with stale ones.
  const pullDiagnostics = async (filePath: string): Promise<void> => {
    if (!supportsPullDiagnostics) { return }
    const normalizedPath = normalizePath(filePath)
    const pullID = (diagnosticPulls[normalizedPath] ?? 0) + 1
    diagnosticPulls[normalizedPath] = pullID
    try {
      const report = (await withTimeout(
        connection.sendRequest('textDocument/diagnostic', {
          textDocument: { uri: pathToFileURL(normalizedPath).href },
        }),
        DIAGNOSTICS_WAIT_TIMEOUT_MS,
      )) as { kind?: string, items?: Diagnostic[] } | null
      // Drop a response superseded by a newer pull or close.
      if (diagnosticPulls[normalizedPath] !== pullID) { return }
      // A "full" report carries items; an "unchanged" report means keep the
      // previously reported set, so leave the map as-is.
      if (report?.kind === 'full' && Array.isArray(report.items)) {
        applyDiagnostics(normalizedPath, report.items)
      }
      else {
        applyDiagnostics(normalizedPath, diagnostics.get(normalizedPath) ?? [])
      }
    }
    catch {
      // Settle waiters with the latest known diagnostics when the server is not
      // ready or the request fails, unless a newer pull/close superseded it.
      if (diagnosticPulls[normalizedPath] === pullID) {
        applyDiagnostics(normalizedPath, diagnostics.get(normalizedPath) ?? [])
      }
    }
  }

  // Handle diagnostics notifications
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string, diagnostics: Diagnostic[] }) => {
      applyDiagnostics(normalizePath(fileURLToPath(params.uri)), params.diagnostics)
    },
  )

  // Handle capability requests
  connection.onRequest('window/workDoneProgress/create', () => null)
  connection.onRequest('workspace/configuration', () => [
    input.server.initialization ?? {},
  ])
  connection.onRequest('client/registerCapability', () => {})
  connection.onRequest('client/unregisterCapability', () => {})
  connection.onRequest('workspace/workspaceFolders', () => [
    {
      name: 'workspace',
      uri: pathToFileURL(input.root).href,
    },
  ])

  connection.listen()

  // Initialize LSP connection
  const initializeResult = (await withTimeout(
    connection.sendRequest('initialize', {
      rootUri: pathToFileURL(input.root).href,
      processId: input.server.process.pid,
      workspaceFolders: [
        {
          name: 'workspace',
          uri: pathToFileURL(input.root).href,
        },
      ],
      initializationOptions: input.server.initialization ?? {},
      capabilities: {
        window: { workDoneProgress: true },
        workspace: { configuration: true },
        textDocument: {
          synchronization: { didOpen: true, didChange: true },
          publishDiagnostics: { versionSupport: true },
          // Advertise pull-diagnostics support so servers that report via the
          // pull model (e.g. typescript-go / tsgo) enable their provider.
          diagnostic: { dynamicRegistration: false },
          rename: { prepareSupport: true },
        },
      },
    }),
    INITIALIZE_TIMEOUT_MS,
  )) as { capabilities?: { diagnosticProvider?: unknown } } | undefined

  // A server that advertises a diagnostic provider reports diagnostics via the
  // pull model (textDocument/diagnostic) instead of pushing publishDiagnostics.
  supportsPullDiagnostics = Boolean(initializeResult?.capabilities?.diagnosticProvider)

  await connection.sendNotification('initialized', {})

  if (input.server.initialization) {
    await connection.sendNotification('workspace/didChangeConfiguration', {
      settings: input.server.initialization,
    })
  }

  const client: LSPClientInfo = {
    serverID: input.serverID,
    root: input.root,
    connection,
    diagnostics,

    notify: {
      async open(fileInput: { path: string, text?: string }) {
        const filePath = path.isAbsolute(fileInput.path)
          ? fileInput.path
          : path.resolve(input.projectPath, fileInput.path)

        // Use explicit buffer text when provided (e.g. unsaved editor buffer
        // forwarded by the multiplexer); otherwise read from disk.
        const text = fileInput.text ?? (await Bun.file(filePath).text())
        const extension = path.extname(filePath)
        const languageId = getLanguageId(extension)

        const version = files[filePath]
        if (version !== undefined) {
          const next = version + 1
          files[filePath] = next
          await connection.sendNotification('textDocument/didChange', {
            textDocument: {
              uri: pathToFileURL(filePath).href,
              version: next,
            },
            contentChanges: [{ text }],
          })
          void pullDiagnostics(filePath)
          return
        }

        // Mark open BEFORE awaiting so a concurrent open() for the same file
        // (e.g. didOpen + didChange forwarded back-to-back by the multiplexer)
        // takes the didChange branch instead of emitting a second didOpen.
        files[filePath] = 0
        diagnostics.delete(normalizePath(filePath))
        await connection.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri: pathToFileURL(filePath).href,
            languageId,
            version: 0,
            text,
          },
        })
        void pullDiagnostics(filePath)
      },

      async close(fileInput: { path: string }) {
        const filePath = path.isAbsolute(fileInput.path)
          ? fileInput.path
          : path.resolve(input.projectPath, fileInput.path)

        if (files[filePath] === undefined) { return }

        await connection.sendNotification('textDocument/didClose', {
          textDocument: {
            uri: pathToFileURL(filePath).href,
          },
        })
        delete files[filePath]
        const normalizedPath = normalizePath(filePath)
        diagnosticPulls[normalizedPath] = (diagnosticPulls[normalizedPath] ?? 0) + 1
        diagnostics.delete(normalizedPath)
      },
    },

    async waitForDiagnostics(fileInput: { path: string }) {
      const normalizedPath = normalizePath(
        path.isAbsolute(fileInput.path)
          ? fileInput.path
          : path.resolve(input.projectPath, fileInput.path),
      )

      await withTimeout(
        new Promise<void>((resolve) => {
          diagnosticsListeners.push({ path: normalizedPath, resolve })
        }),
        DIAGNOSTICS_WAIT_TIMEOUT_MS,
      ).catch(() => {
        // Timeout - remove listener
        diagnosticsListeners = diagnosticsListeners.filter(
          l => l.path !== normalizedPath,
        )
      })
    },

    async shutdown() {
      connection.end()
      connection.dispose()
      input.server.process.kill()
    },
  }

  return client
}

/**
 * Normalize path for consistent lookups
 */
function normalizePath(p: string): string {
  return path.normalize(p)
}

/**
 * Promise with timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ])
}
