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
 * LSP Position schema
 */
export const PositionSchema = z.object({
  line: z.number(),
  character: z.number(),
})
export type Position = z.infer<typeof PositionSchema>

/**
 * LSP Range schema
 */
export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
})
export type Range = z.infer<typeof RangeSchema>

/**
 * LSP Location schema
 * Represents a location inside a resource (file URI + range)
 */
export const LocationSchema = z.object({
  uri: z.string(),
  range: RangeSchema,
})
export type Location = z.infer<typeof LocationSchema>

/**
 * LSP LocationLink schema
 * Used by some servers for definition responses with origin information
 */
export const LocationLinkSchema = z.object({
  originSelectionRange: RangeSchema.optional(),
  targetUri: z.string(),
  targetRange: RangeSchema,
  targetSelectionRange: RangeSchema,
})
export type LocationLink = z.infer<typeof LocationLinkSchema>

/**
 * Completion item kind mapping
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionItemKind
 */
export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

/**
 * LSP CompletionItem schema
 * A completion item represents a text snippet that is proposed to complete text being typed.
 */
export const CompletionItemSchema = z.object({
  label: z.string(),
  kind: z.number().optional(),
  detail: z.string().optional(),
  documentation: z.union([z.string(), z.object({ kind: z.string(), value: z.string() })]).optional(),
  sortText: z.string().optional(),
  filterText: z.string().optional(),
  insertText: z.string().optional(),
  insertTextFormat: z.number().optional(),
})
export type CompletionItem = z.infer<typeof CompletionItemSchema>

/**
 * LSP CompletionList schema
 * Represents a collection of completion items to be presented in the editor.
 */
export const CompletionListSchema = z.object({
  isIncomplete: z.boolean(),
  items: z.array(CompletionItemSchema),
})
export type CompletionList = z.infer<typeof CompletionListSchema>

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
 * LSP TextEdit schema
 * A textual edit applicable to a text document.
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textEdit
 */
export const TextEditSchema = z.object({
  range: RangeSchema,
  newText: z.string(),
})
export type TextEdit = z.infer<typeof TextEditSchema>

/**
 * LSP WorkspaceEdit schema
 * A workspace edit represents changes to many resources managed in the workspace.
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspaceEdit
 */
export const WorkspaceEditSchema = z.object({
  changes: z.record(z.string(), z.array(TextEditSchema)).optional(),
})
export type WorkspaceEdit = z.infer<typeof WorkspaceEditSchema>

/**
 * LSP PrepareRenameResult schema
 * The result of a prepareRename request.
 * Can be: Range, { range, placeholder }, or { defaultBehavior }
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_prepareRename
 */
export const PrepareRenameResultSchema = z.union([
  RangeSchema,
  z.object({ range: RangeSchema, placeholder: z.string() }),
  z.object({ defaultBehavior: z.boolean() }),
])
export type PrepareRenameResult = z.infer<typeof PrepareRenameResultSchema>

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
   * Go to definition
   * Returns the location(s) where the symbol at the given position is defined
   *
   * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition
   */
  async definition(input: {
    file: string
    line: number
    character: number
  }): Promise<Location[]> {
    const clients = await this.getClients(input.file)

    const results = await Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/definition', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
          })
          .then((result: unknown) => this.normalizeLocations(result))
          .catch(() => []),
      ),
    )

    return results.flat()
  }

  /**
   * Find all references to the symbol at the given position
   *
   * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references
   */
  async references(input: {
    file: string
    line: number
    character: number
    includeDeclaration?: boolean
  }): Promise<Location[]> {
    const clients = await this.getClients(input.file)

    const results = await Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/references', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
            context: {
              includeDeclaration: input.includeDeclaration ?? false,
            },
          })
          .then((result: unknown) => {
            if (!result || !Array.isArray(result))
              return []
            return result as Location[]
          })
          .catch(() => []),
      ),
    )

    return results.flat()
  }

  /**
   * Get code completion suggestions at the given position
   *
   * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion
   */
  async completion(input: {
    file: string
    line: number
    character: number
  }): Promise<CompletionItem[]> {
    const clients = await this.getClients(input.file)

    const results = await Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/completion', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
          })
          .then((result: unknown) => this.normalizeCompletions(result))
          .catch(() => []),
      ),
    )

    return results.flat()
  }

  /**
   * Normalize completion response to CompletionItem[]
   * Handles CompletionList and CompletionItem[] responses
   */
  private normalizeCompletions(result: unknown): CompletionItem[] {
    if (!result)
      return []

    // CompletionList format
    if (this.isCompletionList(result)) {
      return result.items
    }

    // Direct CompletionItem[] format
    if (Array.isArray(result)) {
      return result.filter((item): item is CompletionItem =>
        typeof item === 'object' && item !== null && 'label' in item,
      )
    }

    return []
  }

  /**
   * Type guard for CompletionList
   */
  private isCompletionList(obj: unknown): obj is CompletionList {
    return (
      typeof obj === 'object'
      && obj !== null
      && 'items' in obj
      && Array.isArray((obj as CompletionList).items)
    )
  }

  /**
   * Normalize definition response to Location[]
   * Handles Location, Location[], and LocationLink[] responses
   */
  private normalizeLocations(result: unknown): Location[] {
    if (!result)
      return []

    // Single Location
    if (this.isLocation(result)) {
      return [result]
    }

    // Array of Location or LocationLink
    if (Array.isArray(result)) {
      return result
        .map((item) => {
          if (this.isLocation(item)) {
            return item
          }
          if (this.isLocationLink(item)) {
            // Convert LocationLink to Location
            return {
              uri: item.targetUri,
              range: item.targetSelectionRange,
            }
          }
          return null
        })
        .filter((x): x is Location => x !== null)
    }

    return []
  }

  /**
   * Type guard for Location
   */
  private isLocation(obj: unknown): obj is Location {
    return (
      typeof obj === 'object'
      && obj !== null
      && 'uri' in obj
      && 'range' in obj
      && typeof (obj as Location).uri === 'string'
    )
  }

  /**
   * Type guard for LocationLink
   */
  private isLocationLink(obj: unknown): obj is LocationLink {
    return (
      typeof obj === 'object'
      && obj !== null
      && 'targetUri' in obj
      && 'targetRange' in obj
      && 'targetSelectionRange' in obj
    )
  }

  /**
   * Type guard for Range
   */
  private isRange(obj: unknown): obj is Range {
    return (
      typeof obj === 'object'
      && obj !== null
      && 'start' in obj
      && 'end' in obj
    )
  }

  /**
   * Normalize WorkspaceEdit response
   * Handles both 'changes' and 'documentChanges' formats
   * Based on Serena: ls_types.py:extract_text_edits
   */
  private normalizeWorkspaceEdit(result: unknown): WorkspaceEdit | null {
    if (!result || typeof result !== 'object')
      return null

    const edit = result as Record<string, unknown>

    // Handle 'changes' format (preferred, simpler)
    if ('changes' in edit && edit.changes) {
      return { changes: edit.changes as Record<string, TextEdit[]> }
    }

    // Handle 'documentChanges' format - normalize to 'changes'
    if ('documentChanges' in edit && Array.isArray(edit.documentChanges)) {
      const changes: Record<string, TextEdit[]> = {}
      for (const change of edit.documentChanges) {
        if (
          typeof change === 'object'
          && change !== null
          && 'textDocument' in change
          && 'edits' in change
        ) {
          const uri = (change as { textDocument: { uri: string } }).textDocument.uri
          changes[uri] = (change as { edits: TextEdit[] }).edits
        }
      }
      if (Object.keys(changes).length > 0) {
        return { changes }
      }
    }

    return null
  }

  /**
   * Normalize PrepareRenameResult response
   * Handles: Range, { range, placeholder }, or { defaultBehavior }
   */
  private normalizePrepareRename(result: unknown): PrepareRenameResult | null {
    if (!result)
      return null

    // Format 1: Just a Range
    if (this.isRange(result)) {
      return result
    }

    // Format 2: { range, placeholder }
    if (
      typeof result === 'object'
      && 'range' in result
      && 'placeholder' in result
    ) {
      return result as { range: Range, placeholder: string }
    }

    // Format 3: { defaultBehavior }
    if (typeof result === 'object' && 'defaultBehavior' in result) {
      return result as { defaultBehavior: boolean }
    }

    return null
  }

  /**
   * Prepare rename at the given position
   * Validates if the symbol at the position can be renamed
   *
   * @returns PrepareRenameResult if symbol can be renamed, null if:
   *          - Symbol cannot be renamed (LSP server returned null)
   *          - Position is not on a renameable symbol
   *          - All LSP servers failed (errors are logged)
   *
   * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_prepareRename
   */
  async prepareRename(input: {
    file: string
    line: number
    character: number
  }): Promise<PrepareRenameResult | null> {
    const clients = await this.getClients(input.file)

    const results = await Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/prepareRename', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
          })
          .then((result: unknown) => this.normalizePrepareRename(result))
          .catch((err: unknown) => {
            // Log unexpected errors (not "method not found" which is expected for some servers)
            const message = err instanceof Error ? err.message : String(err)
            if (!message.includes('-32601') && !message.includes('Method not found')) {
              console.error(`[lsp:${client.serverID}] prepareRename failed:`, message)
            }
            return null
          }),
      ),
    )

    // Return first non-null result (only one server typically owns rename)
    return results.find(r => r !== null) ?? null
  }

  /**
   * Rename the symbol at the given position
   * Returns a WorkspaceEdit with all changes needed
   *
   * @param input.newName - The new name for the symbol (must be non-empty)
   * @returns WorkspaceEdit if rename succeeded, null if:
   *          - Symbol cannot be renamed
   *          - newName is empty or whitespace-only
   *          - All LSP servers failed (errors are logged)
   *
   * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_rename
   */
  async rename(input: {
    file: string
    line: number
    character: number
    newName: string
  }): Promise<WorkspaceEdit | null> {
    // Validate newName
    if (!input.newName || input.newName.trim() === '') {
      console.warn('[lsp] rename called with empty newName')
      return null
    }

    const clients = await this.getClients(input.file)

    const results = await Promise.all(
      clients.map(client =>
        client.connection
          .sendRequest('textDocument/rename', {
            textDocument: {
              uri: pathToFileURL(input.file).href,
            },
            position: {
              line: input.line,
              character: input.character,
            },
            newName: input.newName,
          })
          .then((result: unknown) => this.normalizeWorkspaceEdit(result))
          .catch((err: unknown) => {
            // Log rename errors - these are more serious since rename is a mutating operation
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[lsp:${client.serverID}] rename failed:`, message)
            return null
          }),
      ),
    )

    // Return first non-null result (only one server typically owns rename)
    return results.find(r => r !== null) ?? null
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
  VueServer,
} from './server'
