/**
 * Tool mapping from Dora unified API to JetBrains MCP tools
 */

import { z } from "zod";
import type { ToolDefinition } from "../provider";
import {
  FindSymbolParams,
  FindReferencingSymbolsParams,
  GetSymbolsOverviewParams,
} from "../../types/tool-params";

/**
 * Mapping entry from Dora tool to JetBrains tool
 */
interface ToolMapping {
  /** Dora tool name */
  doraName: string;
  /** JetBrains MCP tool name */
  jetbrainsName: string;
  /** Description for the Dora tool */
  description: string;
  /** Input schema for the Dora tool */
  inputSchema: z.ZodType;
  /**
   * Transform Dora args to JetBrains args
   */
  transformArgs: (args: unknown) => unknown;
  /**
   * Transform JetBrains result to Dora result
   */
  transformResult?: (result: unknown) => unknown;
}

/**
 * Tool mappings from Dora to JetBrains MCP
 */
export const TOOL_MAPPINGS: ToolMapping[] = [
  {
    doraName: "find_symbol",
    jetbrainsName: "get_symbol",
    description: `Find symbols by name pattern in the codebase.

A name path is a path in the symbol tree within a source file.
For example, the method my_method in class MyClass has path MyClass/my_method.

Pattern types:
- Simple name: "method" matches any symbol with that name
- Relative path: "class/method" matches name path suffixes
- Absolute path: "/class/method" requires exact match
- Overloads: Append [i] for specific overload (e.g., "method[1]")

Returns JSON list of matching symbols with locations.`,
    inputSchema: FindSymbolParams,
    transformArgs: (args: unknown) => {
      const params = args as z.infer<typeof FindSymbolParams>;
      return {
        projectPath: "", // Will be set by provider
        symbol: params.name_path_pattern,
        filePath: params.relative_path ?? undefined,
        includeSource: params.include_body,
      };
    },
  },
  {
    doraName: "find_references",
    jetbrainsName: "find_usages",
    description: `Find all references to a symbol in the codebase.

Provide the name path of the symbol and the file containing it.
Returns a list of locations where the symbol is referenced.`,
    inputSchema: FindReferencingSymbolsParams,
    transformArgs: (args: unknown) => {
      const params = args as z.infer<typeof FindReferencingSymbolsParams>;
      return {
        projectPath: "", // Will be set by provider
        symbol: params.name_path,
        filePath: params.relative_path,
      };
    },
  },
  {
    doraName: "get_symbols_overview",
    jetbrainsName: "get_file_symbols",
    description: `Get an overview of top-level symbols in a file.

Useful for understanding file structure before targeted operations.
Returns JSON object containing the symbols in the file.`,
    inputSchema: GetSymbolsOverviewParams,
    transformArgs: (args: unknown) => {
      const params = args as z.infer<typeof GetSymbolsOverviewParams>;
      return {
        projectPath: "", // Will be set by provider
        filePath: params.relative_path,
      };
    },
  },
];

/**
 * Get Dora tool definitions from mappings
 */
export function getDoraToolDefinitions(): ToolDefinition[] {
  return TOOL_MAPPINGS.map((mapping) => ({
    name: mapping.doraName,
    description: mapping.description,
    inputSchema: mapping.inputSchema,
  }));
}

/**
 * Find mapping by Dora tool name
 */
export function findMapping(doraToolName: string): ToolMapping | undefined {
  return TOOL_MAPPINGS.find((m) => m.doraName === doraToolName);
}
