/**
 * MCP server setup and tool registration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  createAstGrepProvider,
  createFileProvider,
  createLSPProvider,
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

  // Initialize providers
  const lspProvider = createLSPProvider(config)
  const fileProvider = createFileProvider(config)
  const astGrepProvider = createAstGrepProvider(config)

  // Connect providers immediately
  await lspProvider.connect()
  await fileProvider.connect()
  await astGrepProvider.connect()

  // Collect tools from all providers
  const lspTools = lspProvider.listTools()
  const fileTools = fileProvider.listTools()
  const astGrepTools = astGrepProvider.listTools()
  const allTools = [...lspTools, ...fileTools, ...astGrepTools]

  // Map tool names to their providers
  const lspToolNames = new Set(lspTools.map(t => t.name))
  const fileToolNames = new Set(fileTools.map(t => t.name))
  const astGrepToolNames = new Set(astGrepTools.map(t => t.name))

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
          if (fileToolNames.has(tool.name)) {
            return await fileProvider.callTool(tool.name, params)
          }
          else if (lspToolNames.has(tool.name)) {
            return await lspProvider.callTool(tool.name, params)
          }
          else if (astGrepToolNames.has(tool.name)) {
            return await astGrepProvider.callTool(tool.name, params)
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
