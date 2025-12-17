/**
 * jet_brains_find_symbol tool implementation
 */

import type { JetBrainsClient } from '../client/jetbrains-client'
import type { FindSymbolParamsType } from '../types/tool-params'
import { limitLength } from './utils'

export const FIND_SYMBOL_DESCRIPTION = `Retrieves information on all symbols/code entities (classes, methods, etc.) based on the given name path pattern.
The returned symbol information can be used for edits or further queries.
Specify depth > 0 to retrieve children (e.g., methods of a class).

A name path is a path in the symbol tree *within a source file*.
For example, the method my_method defined in class MyClass would have the name path MyClass/my_method.
If a symbol is overloaded (e.g., in Java), a 0-based index is appended (e.g. "MyClass/my_method[0]").

To search for a symbol, provide a name path pattern:
- A simple name (e.g., "method") matches any symbol with that name
- A relative path like "class/method" matches any symbol with that name path suffix
- An absolute path "/class/method" requires exact match of the full name path

Returns a JSON list of symbols with locations matching the pattern.`

/**
 * Executes the find_symbol tool
 */
export async function executeFindSymbol(
  client: JetBrainsClient,
  params: FindSymbolParamsType,
): Promise<string> {
  const response = await client.findSymbol({
    namePath: params.name_path_pattern,
    relativePath: params.relative_path ?? null,
    includeBody: params.include_body,
    depth: params.depth,
    includeLocation: true, // Always include location for useful output
    searchDeps: params.search_deps,
  })

  const result = JSON.stringify(response, null, 2)
  return limitLength(result, params.max_answer_chars)
}
