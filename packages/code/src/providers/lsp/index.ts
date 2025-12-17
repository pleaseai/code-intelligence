/**
 * LSP Provider
 *
 * Provides language intelligence tools via Language Server Protocol
 */

import { z } from "zod";
import path from "path";
import type { Provider, ToolDefinition, ToolResult } from "../provider";
import { LSPManager, formatDiagnostic } from "@pleaseai/code-lsp";

/**
 * LSP Provider configuration
 */
export interface LSPProviderConfig {
  projectPath: string;
}

/**
 * Tool definitions for LSP provider
 */
const LSP_TOOLS: ToolDefinition[] = [
  {
    name: "lsp_diagnostics",
    description:
      "Get diagnostics (errors, warnings) for a file from language servers. " +
      "Returns type errors, syntax errors, and other issues detected by LSP.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Path to the file to get diagnostics for (relative or absolute)"),
    }),
  },
  {
    name: "lsp_hover",
    description:
      "Get hover information (type, documentation) at a specific position in a file. " +
      "Useful for understanding types, function signatures, and documentation.",
    inputSchema: z.object({
      file: z.string().describe("Path to the file"),
      line: z.number().describe("Line number (0-indexed)"),
      character: z.number().describe("Character position (0-indexed)"),
    }),
  },
  {
    name: "lsp_workspace_symbol",
    description:
      "Search for symbols (functions, classes, variables) across the workspace. " +
      "Returns matching symbols with their locations.",
    inputSchema: z.object({
      query: z.string().describe("Search query for symbol name"),
    }),
  },
  {
    name: "lsp_document_symbol",
    description:
      "Get all symbols defined in a document. " +
      "Returns the structure of a file including functions, classes, and variables.",
    inputSchema: z.object({
      file: z.string().describe("Path to the file to analyze"),
    }),
  },
  {
    name: "lsp_status",
    description:
      "Get the status of connected LSP servers. " +
      "Shows which language servers are running and their connection status.",
    inputSchema: z.object({}),
  },
];

/**
 * LSP Provider implementation
 */
export class LSPProvider implements Provider {
  readonly name = "lsp";

  private manager: LSPManager | null = null;
  private config: LSPProviderConfig;
  private connected = false;

  constructor(config: LSPProviderConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.manager = new LSPManager(this.config.projectPath);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  listTools(): ToolDefinition[] {
    return LSP_TOOLS;
  }

  async callTool(name: string, args: unknown): Promise<ToolResult> {
    if (!this.manager) {
      return {
        content: [{ type: "text", text: "LSP provider not connected" }],
        isError: true,
      };
    }

    try {
      switch (name) {
        case "lsp_diagnostics":
          return await this.handleDiagnostics(args);
        case "lsp_hover":
          return await this.handleHover(args);
        case "lsp_workspace_symbol":
          return await this.handleWorkspaceSymbol(args);
        case "lsp_document_symbol":
          return await this.handleDocumentSymbol(args);
        case "lsp_status":
          return await this.handleStatus();
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `LSP error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleDiagnostics(args: unknown): Promise<ToolResult> {
    const parsed = z.object({ path: z.string() }).parse(args);
    const filePath = path.isAbsolute(parsed.path)
      ? parsed.path
      : path.join(this.config.projectPath, parsed.path);

    await this.manager!.touchFile(filePath, true);
    const allDiagnostics = await this.manager!.diagnostics();
    const fileDiagnostics = allDiagnostics[filePath];

    if (!fileDiagnostics?.length) {
      return {
        content: [{ type: "text", text: "No errors found" }],
      };
    }

    const formatted = fileDiagnostics.map(formatDiagnostic).join("\n");
    return {
      content: [{ type: "text", text: formatted }],
    };
  }

  private async handleHover(args: unknown): Promise<ToolResult> {
    const parsed = z
      .object({
        file: z.string(),
        line: z.number(),
        character: z.number(),
      })
      .parse(args);

    const filePath = path.isAbsolute(parsed.file)
      ? parsed.file
      : path.join(this.config.projectPath, parsed.file);

    await this.manager!.touchFile(filePath, true);
    const results = await this.manager!.hover({
      file: filePath,
      line: parsed.line,
      character: parsed.character,
    });

    const validResults = results.filter(Boolean);
    if (!validResults.length) {
      return {
        content: [
          { type: "text", text: "No hover information available at this position" },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify(validResults, null, 2) },
      ],
    };
  }

  private async handleWorkspaceSymbol(args: unknown): Promise<ToolResult> {
    const parsed = z.object({ query: z.string() }).parse(args);
    const symbols = await this.manager!.workspaceSymbol(parsed.query);

    if (!symbols.length) {
      return {
        content: [{ type: "text", text: `No symbols found matching "${parsed.query}"` }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(symbols, null, 2) }],
    };
  }

  private async handleDocumentSymbol(args: unknown): Promise<ToolResult> {
    const parsed = z.object({ file: z.string() }).parse(args);
    const filePath = path.isAbsolute(parsed.file)
      ? parsed.file
      : path.join(this.config.projectPath, parsed.file);

    await this.manager!.touchFile(filePath, false);
    const uri = `file://${filePath}`;
    const symbols = await this.manager!.documentSymbol(uri);

    if (!symbols.length) {
      return {
        content: [{ type: "text", text: "No symbols found in this document" }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(symbols, null, 2) }],
    };
  }

  private async handleStatus(): Promise<ToolResult> {
    const status = await this.manager!.status();

    if (!status.length) {
      return {
        content: [{ type: "text", text: "No LSP servers connected" }],
      };
    }

    const formatted = status
      .map((s) => `${s.name}: ${s.status} (root: ${s.root})`)
      .join("\n");

    return {
      content: [{ type: "text", text: formatted }],
    };
  }
}

/**
 * Factory function for creating LSPProvider
 */
export function createLSPProvider(config: LSPProviderConfig): LSPProvider {
  return new LSPProvider(config);
}
