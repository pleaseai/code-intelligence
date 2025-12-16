/**
 * Dora MCP Server - Entry Point
 *
 * A Bun-based MCP server for JetBrains IDE integration,
 * providing symbol finding and navigation tools.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDoraServer } from "./server";

async function main(): Promise<void> {
  // Get project path from environment or arguments
  const projectPath =
    process.env["DORA_PROJECT_PATH"] ?? process.argv[2] ?? process.cwd();

  const timeout = process.env["DORA_TIMEOUT"]
    ? parseInt(process.env["DORA_TIMEOUT"], 10)
    : 30000;

  console.error(`[dora] Starting MCP server for project: ${projectPath}`);

  try {
    const server = await createDoraServer({ projectPath, timeout });
    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error("[dora] MCP server connected and ready");
  } catch (error) {
    console.error("[dora] Failed to start server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[dora] Unhandled error:", error);
  process.exit(1);
});
