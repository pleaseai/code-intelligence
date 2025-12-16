/**
 * MCP server setup and tool registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JetBrainsClient, discoverPort } from "./client";
import { DoraError } from "./errors";
import {
  FIND_SYMBOL_DESCRIPTION,
  executeFindSymbol,
  FIND_REFERENCING_DESCRIPTION,
  executeFindReferencingSymbols,
  GET_SYMBOLS_OVERVIEW_DESCRIPTION,
  executeGetSymbolsOverview,
} from "./tools";
import {
  FindSymbolParams,
  FindReferencingSymbolsParams,
  GetSymbolsOverviewParams,
} from "./types/tool-params";

export interface ServerConfig {
  projectPath: string;
  timeout?: number;
}

/**
 * Creates and configures the Dora MCP server
 */
export async function createDoraServer(config: ServerConfig): Promise<McpServer> {
  const server = new McpServer({
    name: "dora",
    version: "0.1.0",
  });

  // Lazy client initialization - discover port on first tool use
  let client: JetBrainsClient | null = null;

  async function getClient(): Promise<JetBrainsClient> {
    if (client === null) {
      const port = await discoverPort(config.projectPath);
      client = new JetBrainsClient(port, config.timeout);
    }
    return client;
  }

  // Register jet_brains_find_symbol tool
  server.registerTool(
    "jet_brains_find_symbol",
    {
      description: FIND_SYMBOL_DESCRIPTION,
      inputSchema: FindSymbolParams,
    },
    async (params) => {
      try {
        const jetbrainsClient = await getClient();
        const result = await executeFindSymbol(jetbrainsClient, params);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        const message =
          error instanceof DoraError ? error.message : `Error: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    }
  );

  // Register jet_brains_find_referencing_symbols tool
  server.registerTool(
    "jet_brains_find_referencing_symbols",
    {
      description: FIND_REFERENCING_DESCRIPTION,
      inputSchema: FindReferencingSymbolsParams,
    },
    async (params) => {
      try {
        const jetbrainsClient = await getClient();
        const result = await executeFindReferencingSymbols(jetbrainsClient, params);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        const message =
          error instanceof DoraError ? error.message : `Error: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    }
  );

  // Register jet_brains_get_symbols_overview tool
  server.registerTool(
    "jet_brains_get_symbols_overview",
    {
      description: GET_SYMBOLS_OVERVIEW_DESCRIPTION,
      inputSchema: GetSymbolsOverviewParams,
    },
    async (params) => {
      try {
        const jetbrainsClient = await getClient();
        const result = await executeGetSymbolsOverview(jetbrainsClient, params);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        const message =
          error instanceof DoraError ? error.message : `Error: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    }
  );

  return server;
}
