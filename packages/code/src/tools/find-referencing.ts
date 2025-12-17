/**
 * jet_brains_find_referencing_symbols tool implementation
 */

import type { JetBrainsClient } from "../client/jetbrains-client";
import type { FindReferencingSymbolsParamsType } from "../types/tool-params";
import { limitLength } from "./utils";

export const FIND_REFERENCING_DESCRIPTION = `Finds symbols that reference the given symbol using the JetBrains backend.
The result contains metadata about the referencing symbols including their locations.

Use this tool to understand code dependencies and find all usages of a symbol.`;

/**
 * Executes the find_referencing_symbols tool
 */
export async function executeFindReferencingSymbols(
  client: JetBrainsClient,
  params: FindReferencingSymbolsParamsType
): Promise<string> {
  const response = await client.findReferences({
    namePath: params.name_path,
    relativePath: params.relative_path,
  });

  const result = JSON.stringify(response, null, 2);
  return limitLength(result, params.max_answer_chars);
}
