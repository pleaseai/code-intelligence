import { z } from "zod";

/**
 * Schema for jet_brains_find_symbol tool parameters
 */
export const FindSymbolParams = z.object({
  name_path_pattern: z
    .string()
    .describe(
      "The name path matching pattern. Can be: " +
        '(1) a simple name like "method" matching any symbol with that name, ' +
        '(2) a relative path like "class/method" matching name path suffixes, or ' +
        '(3) an absolute path like "/class/method" requiring exact match. ' +
        'Append [i] to match a specific overload (e.g., "MyClass/method[1]").'
    ),
  depth: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      "Depth up to which descendants shall be retrieved. " +
        "Use 1 to also retrieve immediate children (e.g., methods of a class). Default 0."
    ),
  relative_path: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Optional. Restrict search to this file or directory. " +
        "If None, searches entire codebase. Using this significantly speeds up the search."
    ),
  include_body: z
    .boolean()
    .default(false)
    .describe("If true, include the symbol source code. Use judiciously."),
  search_deps: z
    .boolean()
    .default(false)
    .describe(
      "If true, also search in project dependencies (e.g., libraries)."
    ),
  max_answer_chars: z
    .number()
    .int()
    .default(-1)
    .describe("Max characters for the JSON result. -1 means no limit."),
});

export type FindSymbolParamsType = z.infer<typeof FindSymbolParams>;

/**
 * Schema for jet_brains_find_referencing_symbols tool parameters
 */
export const FindReferencingSymbolsParams = z.object({
  name_path: z
    .string()
    .describe(
      "Name path of the symbol for which to find references. " +
        "Uses same matching logic as find_symbol tool."
    ),
  relative_path: z
    .string()
    .describe(
      "The relative path to the file containing the symbol. " +
        "Must be a file path, not a directory."
    ),
  max_answer_chars: z
    .number()
    .int()
    .default(-1)
    .describe("Max characters for the JSON result. -1 means no limit."),
});

export type FindReferencingSymbolsParamsType = z.infer<
  typeof FindReferencingSymbolsParams
>;

/**
 * Schema for jet_brains_get_symbols_overview tool parameters
 */
export const GetSymbolsOverviewParams = z.object({
  relative_path: z
    .string()
    .describe("The relative path to the file to get the overview of."),
  max_answer_chars: z
    .number()
    .int()
    .default(-1)
    .describe("Max characters for the JSON result. -1 means no limit."),
});

export type GetSymbolsOverviewParamsType = z.infer<
  typeof GetSymbolsOverviewParams
>;
