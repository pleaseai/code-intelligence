/**
 * LSP (Language Server Protocol) Module
 * Provides language intelligence via LSP servers
 *
 * Based on opencode reference implementation
 */

import type { Diagnostic as VSCodeDiagnostic } from 'vscode-languageserver-types'
import type { LSPClientInfo, LSPServerHandle } from './client'
import type { LSPServerInfo } from './server'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import {
  createLSPClient,

} from './client'
import { LSP_SERVERS } from './server'

export type Diagnostic = VSCodeDiagnostic

/**
 * LSP Range schema
 */
export const RangeSchema = z.object({
  start: z.object({
    line: z.number(),
    character: z.number(),
  }),
  end: z.object({
    line: z.number(),
    character: z.number(),
  }),
})
export type Range = z.infer<typeof RangeSchema>

/**
 * LSP Symbol schema
 */
export const SymbolSchema = z.object({
  name: z.string(),
  kind: z.number(),
  location: z.object({
    uri: z.string(),
    range: RangeSchema,
  }),
})
export type Symbol = z.infer<typeof SymbolSchema>

/**
 * LSP Document Symbol schema
 */
export const DocumentSymbolSchema = z.object({
  name: z.string(),
  detail: z.string().optional(),
  kind: z.number(),
  range: RangeSchema,
  selectionRange: RangeSchema,
})
export type DocumentSymbol = z.infer<typeof DocumentSymbolSchema>

/**
 * LSP Status
 */
export interface LSPStatus {
  id: string
  name: string
  root: string
  status: 'connected' | 'error'
}

/**
 * Symbol kind mapping
 */
export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/**
 * LSP Manager - handles client lifecycle and operations
 */
export class LSPManager {
  private clients: LSPClientInfo[] = []
  private servers: Map<string, LSPServerInfo> = new Map()
  private broken: Set<string> = new Set()
  private spawning: Map<string, Promise<LSPClientInfo | undefined>>
    = new Map()

  private projectPath: string
  private enabled: boolean = true

  constructor(projectPath: string, options?: { enabled?: boolean }) {
    this.projectPath = projectPath
    this.enabled = options?.enabled ?? true

    // Register servers
    for (const server of LSP_SERVERS) {
      this.servers.set(server.id, server)
    }
  }

  /**
   * Get status of connected LSP servers
   */
  async status(): Promise<LSPStatus[]> {
    return this.clients.map(client => ({
      id: client.serverID,
      name: this.servers.get(client.serverID)?.id ?? client.serverID,
      root: path.relative(this.projectPath, client.root),
      status: 'connected' as const,
    }))
  }

  /**
   * Get clients for a file
   */
  private async getClients(file: string): Promise<LSPClientInfo[]> {
    if (!this.enabled)
      return []

    const extension = path.extname(file) || file
    const result: LSPClientInfo[] = []

    const schedule = async (
      server: LSPServerInfo,
      root: string,
      key: string,
    ): Promise<LSPClientInfo | undefined> => {
      let handle: LSPServerHandle | undefined

      try {
        handle = await server.spawn(root)
        if (!handle) {
          this.broken.add(key)
          return undefined
        }
      }
      catch (err) {
        this.broken.add(key)
        console.error(`Failed to spawn LSP server ${server.id}:`, err)
        return undefined
      }

      try {
        const client = await createLSPClient({
          serverID: server.id,
          server: handle,
          root,
          projectPath: this.projectPath,
        })

        // Check if another client was created in parallel
        const existing = this.clients.find(
          x => x.root === root && x.serverID === server.id,
        )
        if (existing) {
          handle.process.kill()
          return existing
        }

        this.clients.push(client)
        return client
      }
      catch (err) {
        this.broken.add(key)
        handle.process.kill()
        console.error(`Failed to initialize LSP client ${server.id}:`, err)
        return undefined
      }
    }

    for (const server of this.servers.values()) {
      if (
        server.extensions.length
        && !server.extensions.includes(extension)
      ) {
        continue
      }

      const root = await server.root(file, this.projectPath)
      if (!root)
        continue

      const key = root + server.id
      if (this.broken.has(key))
        continue

      // Check for existing client
      const match = this.clients.find(
        x => x.root === root && x.serverID === server.id,
      )
      if (match) {
        result.push(match)
        continue
      }

      // Check for in-flight spawn
      const inflight = this.spawning.get(key)
      if (inflight) {
        const client = await inflight
        if (client)
          result.push(client)
        continue
      }

      // Schedule new spawn
      const task = schedule(server, root, key)
      this.spawning.set(key, task)

      task.finally(() => {
        if (this.spawning.get(key) === task) {
          this.spawning.delete(key)
        }
      })

      const client = await task
      if (client)
        result.push(client)
    }

    return result
  }

  /**
   * Touch a file (open it in LSP servers)
   */
  async touchFile(
    file: string,
    waitForDiagnostics?: boolean,
  ): Promise<void> {
    const clients = await this.getClients(file)

    await Promise.all(
      clients.map(async (client) => {
        const wait = waitForDiagnostics
          ? client.waitForDiagnostics({ path: file })
          : Promise.resolve()
        await client.notify.open({ path: file })
        return wait
      }),
    ).catch((err) => {
      console.error('Failed to touch file:', err)
    })
  }

  /**
   * Get diagnostics from all clients
   */
  async diagnostics(): Promise<Record<string, Diagnostic[]>> {
    const results: Record<string, Diagnostic[]> = {}

    for (const client of this.clients) {
      for (const [filePath, diags] of client.diagnostics.entries()) {
        const arr = results[filePath] || []
        arr.push(...diags)
        results[filePath] = arr
      }
    }

    return results
  }

  /**
   * Get hover information
   */
  async hover(input: {
    file: string
    line: number
    character: number
  }): Promise<unknown[]> {
    const clients = await this.getClients(input.file)

    return Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/hover', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
          })
          .catch(() => null),
      ),
    )
  }

  /**
   * Search for workspace symbols
   */
  async workspaceSymbol(query: string): Promise<Symbol[]> {
    const relevantKinds = [
      SymbolKind.Class,
      SymbolKind.Function,
      SymbolKind.Method,
      SymbolKind.Interface,
      SymbolKind.Variable,
      SymbolKind.Constant,
      SymbolKind.Struct,
      SymbolKind.Enum,
    ]

    const results = await Promise.all(
      this.clients.map(client =>
        client.connection
          .sendRequest('workspace/symbol', { query })
          .then((result: unknown) => {
            const symbols = result as Symbol[]
            return symbols
              .filter(x => relevantKinds.includes(x.kind))
              .slice(0, 10)
          })
          .catch(() => []),
      ),
    )

    return results.flat()
  }

  /**
   * Get document symbols
   */
  async documentSymbol(uri: string): Promise<(DocumentSymbol | Symbol)[]> {
    const results = await Promise.all(
      this.clients.map(client =>
        client.connection
          .sendRequest('textDocument/documentSymbol', {
            textDocument: { uri },
          })
          .catch(() => []),
      ),
    )

    return results.flat().filter(Boolean) as (DocumentSymbol | Symbol)[]
  }

  /**
   * Shutdown all clients
   */
  async shutdown(): Promise<void> {
    await Promise.all(this.clients.map(client => client.shutdown()))
    this.clients = []
  }
}

/**
 * Format diagnostic for human-readable output
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const severityMap: Record<number, string> = {
    1: 'ERROR',
    2: 'WARN',
    3: 'INFO',
    4: 'HINT',
  }

  const severity = severityMap[diagnostic.severity || 1]
  const line = diagnostic.range.start.line + 1
  const col = diagnostic.range.start.character + 1

  return `${severity} [${line}:${col}] ${diagnostic.message}`
}

export { createLSPClient, type LSPClientInfo } from './client'
// Re-export specific items to avoid conflicts
export { getLanguageId, LANGUAGE_EXTENSIONS } from './language'
export {
  DartServer,
  DenoServer,
  getServerById,
  getServersForExtension,
  GoplsServer,
  KotlinServer,
  LSP_SERVERS,
  type LSPServerHandle,
  type LSPServerInfo,
  OxlintServer,
  PyrightServer,
  RustAnalyzerServer,
  TypescriptServer,
} from './server'
