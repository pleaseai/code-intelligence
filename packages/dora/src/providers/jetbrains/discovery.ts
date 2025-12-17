/**
 * JetBrains MCP port discovery
 *
 * JetBrains IDE exposes MCP server on a dynamic port.
 * This module discovers the port by checking known port ranges.
 */

const DEFAULT_PORT = 64342;
const PORT_RANGE_START = 63342;
const PORT_RANGE_END = 63352;
const DISCOVERY_TIMEOUT = 2000;

interface DiscoveryResult {
  port: number;
  url: string;
}

/**
 * Check if JetBrains MCP is available on a given port
 */
async function checkPort(port: number, projectPath: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

  try {
    // JetBrains MCP uses SSE, but we can check if the endpoint responds
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "GET",
      headers: {
        IJ_MCP_SERVER_PROJECT_PATH: projectPath,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 405; // 405 = method not allowed, but server is there
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Discover JetBrains MCP server port
 *
 * @param projectPath Project path to match
 * @returns Discovery result with port and URL
 * @throws Error if no MCP server found
 */
export async function discoverJetBrainsMcp(
  projectPath: string
): Promise<DiscoveryResult> {
  // First try the default port
  if (await checkPort(DEFAULT_PORT, projectPath)) {
    return {
      port: DEFAULT_PORT,
      url: `http://127.0.0.1:${DEFAULT_PORT}/sse`,
    };
  }

  // Scan port range
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (await checkPort(port, projectPath)) {
      return {
        port,
        url: `http://127.0.0.1:${port}/sse`,
      };
    }
  }

  throw new Error(
    `JetBrains MCP server not found. Ensure JetBrains IDE 2025.2+ is running ` +
      `and MCP Server is enabled in Settings | Tools | MCP Server.`
  );
}
