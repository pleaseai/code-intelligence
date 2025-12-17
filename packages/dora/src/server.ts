/**
 * MCP server setup and tool registration
 */

import type { Provider } from './providers'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  createJetBrainsMcpProvider,
  createLSPProvider,

  ProviderRegistry,
} from './providers'

export interface ServerConfig {
  projectPath: string
  timeout?: number
}

/**
 * Creates and configures the Dora MCP server
 */
export async function createDoraServer(
  config: ServerConfig,
): Promise<McpServer> {
  const server = new McpServer({
    name: 'dora',
    version: '0.1.0',
  })

  // Create provider registry and register providers
  const registry = new ProviderRegistry(config)
  registry.register('jetbrains-mcp', createJetBrainsMcpProvider)
  registry.register('lsp', createLSPProvider)

  // Initialize providers
  const jetbrainsProvider = createJetBrainsMcpProvider(config)
  const lspProvider = createLSPProvider(config)

  // Connect LSP provider immediately (it doesn't require external service)
  await lspProvider.connect()

  // Lazy JetBrains provider initialization
  let activeJetbrainsProvider: Provider | null = null

  async function getJetbrainsProvider(): Promise<Provider> {
    if (activeJetbrainsProvider === null) {
      await jetbrainsProvider.connect()
      activeJetbrainsProvider = jetbrainsProvider
    }
    return activeJetbrainsProvider
  }

  // Collect tools from all providers
  const jetbrainsTools = jetbrainsProvider.listTools()
  const lspTools = lspProvider.listTools()
  const allTools = [...jetbrainsTools, ...lspTools]

  // Map tool names to their providers
  const jetbrainsToolNames = new Set(jetbrainsTools.map(t => t.name))
  const lspToolNames = new Set(lspTools.map(t => t.name))

  // Register each tool dynamically
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (params) => {
        try {
          // Route to appropriate provider
          if (lspToolNames.has(tool.name)) {
            return await lspProvider.callTool(tool.name, params)
          }
          else if (jetbrainsToolNames.has(tool.name)) {
            const provider = await getJetbrainsProvider()
            return await provider.callTool(tool.name, params)
          }

          return {
            content: [{ type: 'text', text: `Unknown tool: ${tool.name}` }],
            isError: true,
          }
        }
        catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          }
        }
      },
    )
  }

  return server
}
