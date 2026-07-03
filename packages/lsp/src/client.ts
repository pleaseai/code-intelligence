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
  let diagnosticsListeners: Array<{
    path: string
    resolve: () => void
    timer?: ReturnType<typeof setTimeout>
  }> = []

  // Handle diagnostics notifications
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string, diagnostics: Diagnostic[] }) => {
      const filePath = normalizePath(fileURLToPath(params.uri))
      diagnostics.set(filePath, params.diagnostics)

      // Notify listeners with debounce
      const listener = diagnosticsListeners.find(l => l.path === filePath)
      if (listener) {
        if (listener.timer) { clearTimeout(listener.timer) }
        listener.timer = setTimeout(() => {
          diagnosticsListeners = diagnosticsListeners.filter(
            l => l !== listener,
          )
          listener.resolve()
        }, DIAGNOSTICS_DEBOUNCE_MS)
      }

      input.onDiagnostics?.(filePath, input.serverID)
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
  await withTimeout(
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
          rename: { prepareSupport: true },
        },
      },
    }),
    INITIALIZE_TIMEOUT_MS,
  )

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
        diagnostics.delete(normalizePath(filePath))
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
