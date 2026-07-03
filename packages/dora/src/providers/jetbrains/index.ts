/**
 * JetBrains MCP Provider
 *
 * Connects to JetBrains IDE's built-in MCP server via SSE transport.
 */

import type { Provider, ToolDefinition, ToolResult } from '../provider'
import type { RegistryConfig } from '../registry'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { discoverJetBrainsMcp } from './discovery'
import { findMapping, getDoraToolDefinitions } from './tool-mapping'

/**
 * JetBrains MCP Provider implementation
 */
export class JetBrainsMcpProvider implements Provider {
  readonly name = 'jetbrains-mcp'

  private client: Client | null = null
  private transport: SSEClientTransport | null = null
  private config: RegistryConfig
  private connected = false

  constructor(config: RegistryConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) { return }

    // Discover JetBrains MCP endpoint
    const discovery = await discoverJetBrainsMcp(this.config.projectPath)

    // Create SSE transport with project path header
    this.transport = new SSEClientTransport(new URL(discovery.url), {
      requestInit: {
        headers: {
          IJ_MCP_SERVER_PROJECT_PATH: this.config.projectPath,
        },
      },
    })

    // Create MCP client
    this.client = new Client(
      { name: 'dora', version: '0.1.0' },
      { capabilities: {} },
    )

    // Connect
    await this.client.connect(this.transport)
    this.connected = true
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
    if (this.transport) {
      await this.transport.close()
      this.transport = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  listTools(): ToolDefinition[] {
    return getDoraToolDefinitions()
  }

  async callTool(name: string, args: unknown): Promise<ToolResult> {
    if (!this.client) {
      throw new Error('Not connected to JetBrains MCP')
    }

    // Find mapping for this tool
    const mapping = findMapping(name)
    if (!mapping) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }

    // Transform args for JetBrains
    const jetbrainsArgs = mapping.transformArgs(args) as Record<string, unknown>

    // Set project path
    jetbrainsArgs.projectPath = this.config.projectPath

    try {
      // Call JetBrains MCP tool
      const result = await this.client.callTool({
        name: mapping.jetbrainsName,
        arguments: jetbrainsArgs,
      })

      // Extract text content from result
      const content = result.content as Array<{ type: string, text?: string }>
      const textContent = content
        .filter((c): c is { type: 'text', text: string } => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      // Apply result transformation if defined
      let finalText = textContent
      if (mapping.transformResult) {
        try {
          const parsed = JSON.parse(textContent)
          const transformed = mapping.transformResult(parsed)
          finalText = JSON.stringify(transformed, null, 2)
        }
        catch {
          // Keep original text if transformation fails
        }
      }

      return {
        content: [{ type: 'text', text: finalText }],
        isError: Boolean(result.isError),
      }
    }
    catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling JetBrains MCP: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }
}

/**
 * Factory function for creating JetBrainsMcpProvider
 */
export function createJetBrainsMcpProvider(
  config: RegistryConfig,
): JetBrainsMcpProvider {
  return new JetBrainsMcpProvider(config)
}
