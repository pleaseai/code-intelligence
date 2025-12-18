/**
 * Provider interface for tool backends (JetBrains MCP, LSP, etc.)
 */

import type { z } from 'zod'

/**
 * Tool definition exposed by a provider
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
}

/**
 * Result of a tool call
 */
export interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text', text: string }>
  isError?: boolean
}

/**
 * Provider interface for different backends
 */
export interface Provider {
  /** Provider name for identification */
  readonly name: string

  /** Connect to the backend */
  connect: () => Promise<void>

  /** Disconnect from the backend */
  disconnect: () => Promise<void>

  /** Check if currently connected */
  isConnected: () => boolean

  /** Get list of available tools */
  listTools: () => ToolDefinition[]

  /**
   * Call a tool with given arguments
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  callTool: (name: string, args: unknown) => Promise<ToolResult>
}

/**
 * Provider type enumeration
 */
export type ProviderType = 'lsp' | 'file'
// TBD: 'jetbrains-mcp' - JetBrains IDE integration via code-please plugin
