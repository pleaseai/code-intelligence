/**
 * jet_brains_get_symbols_overview tool implementation
 */

import type { JetBrainsClient } from "../client/jetbrains-client";
import type { GetSymbolsOverviewParamsType } from "../types/tool-params";
import { limitLength } from "./utils";

export const GET_SYMBOLS_OVERVIEW_DESCRIPTION = `Gets an overview of the top-level symbols in the given file using the JetBrains backend.
Calling this is often a good idea before more targeted reading, searching or editing operations.

Before requesting a symbol overview, narrow down the scope by first understanding
the basic directory structure of the repository.

Returns a JSON object containing the symbols in the file.`;

/**
 * Executes the get_symbols_overview tool
 */
export async function executeGetSymbolsOverview(
  client: JetBrainsClient,
  params: GetSymbolsOverviewParamsType
): Promise<string> {
  const response = await client.getSymbolsOverview({
    relativePath: params.relative_path,
  });

  const result = JSON.stringify(response, null, 2);
  return limitLength(result, params.max_answer_chars);
}
