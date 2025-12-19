/**
 * ast-grep Provider for dora MCP server
 *
 * Provides AST-aware code search and transformation tools
 */

import { z, ZodError } from 'zod'
import type { Provider, ToolDefinition, ToolResult } from '../provider'
import type { RegistryConfig } from '../registry'
import { CLI_LANGUAGES, NAPI_LANGUAGES } from './constants'
import { runSg, isCliAvailable } from './cli'
import { isNapiAvailable, getNapiError, analyzeCode, transformCode } from './napi'
import { formatSearchResult, formatReplaceResult, formatAnalyzeResult, formatTransformResult, getEmptyResultHint } from './utils'
import type { NapiLanguage } from './types'

/**
 * Format error for tool result, with special handling for Zod validation errors
 */
function formatToolError(e: unknown): string {
  if (e instanceof ZodError) {
    const issues = e.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    return `Invalid arguments:\n${issues}`
  }
  return `Error: ${e instanceof Error ? e.message : String(e)}`
}

// Tool definitions
const AST_GREP_TOOLS: ToolDefinition[] = [
  {
    name: 'ast_grep_search',
    description:
      'Search code patterns across filesystem using AST-aware matching. Supports 25 languages. '
      + 'Use meta-variables: $VAR (single node), $$$ (multiple nodes). '
      + 'IMPORTANT: Patterns must be complete AST nodes (valid code). '
      + 'For functions, include params and body: \'export async function $NAME($$$) { $$$ }\' not \'export async function $NAME\'. '
      + 'Examples: \'console.log($MSG)\', \'def $FUNC($$$)\', \'async function $NAME($$$)\'',
    inputSchema: z.object({
      pattern: z
        .string()
        .describe('AST pattern with meta-variables ($VAR, $$$). Must be complete AST node.'),
      lang: z
        .enum(CLI_LANGUAGES)
        .describe('Target language'),
      paths: z
        .array(z.string())
        .optional()
        .describe('Paths to search (default: [\'.\'])'),
      globs: z
        .array(z.string())
        .optional()
        .describe('Include/exclude globs (prefix ! to exclude)'),
      context: z
        .number()
        .optional()
        .describe('Context lines around match'),
      ruleFile: z
        .string()
        .optional()
        .describe('Path to YAML rule file (alternative to pattern)'),
    }),
  },
  {
    name: 'ast_grep_replace',
    description:
      'Replace code patterns across filesystem with AST-aware rewriting. '
      + 'Dry-run by default. Use meta-variables in rewrite to preserve matched content. '
      + 'Example: pattern=\'console.log($MSG)\' rewrite=\'logger.info($MSG)\'',
    inputSchema: z.object({
      pattern: z
        .string()
        .describe('AST pattern to match'),
      rewrite: z
        .string()
        .describe('Replacement pattern (can use $VAR from pattern)'),
      lang: z
        .enum(CLI_LANGUAGES)
        .describe('Target language'),
      paths: z
        .array(z.string())
        .optional()
        .describe('Paths to search'),
      globs: z
        .array(z.string())
        .optional()
        .describe('Include/exclude globs'),
      dryRun: z
        .boolean()
        .optional()
        .describe('Preview changes without applying (default: true)'),
    }),
  },
  {
    name: 'ast_grep_analyze',
    description:
      'Analyze code in-memory using NAPI (faster, no file I/O). '
      + 'Supports 5 languages: html, javascript, tsx, css, typescript. '
      + 'Returns matches with optional meta-variable extraction. '
      + 'Use for single-file analysis or code transformation preview.',
    inputSchema: z.object({
      code: z
        .string()
        .describe('Source code to analyze'),
      pattern: z
        .string()
        .describe('AST pattern to match'),
      lang: z
        .enum(NAPI_LANGUAGES)
        .describe('Target language (html, javascript, tsx, css, typescript)'),
      extractMetaVars: z
        .boolean()
        .optional()
        .describe('Extract meta-variable values (default: false)'),
    }),
  },
  {
    name: 'ast_grep_transform',
    description:
      'Transform code in-memory using NAPI (faster, no file I/O). '
      + 'Supports 5 languages: html, javascript, tsx, css, typescript. '
      + 'Returns transformed code without modifying files.',
    inputSchema: z.object({
      code: z
        .string()
        .describe('Source code to transform'),
      pattern: z
        .string()
        .describe('AST pattern to match'),
      rewrite: z
        .string()
        .describe('Replacement pattern'),
      lang: z
        .enum(NAPI_LANGUAGES)
        .describe('Target language (html, javascript, tsx, css, typescript)'),
    }),
  },
]

/**
 * ast-grep Provider implementation
 */
export class AstGrepProvider implements Provider {
  readonly name = 'ast-grep'
  private connected = false

  constructor(_config: RegistryConfig) {
    // Config reserved for future use (e.g., custom cache paths)
  }

  async connect(): Promise<void> {
    // Pre-check CLI availability (don't fail, just log)
    const cliAvailable = await isCliAvailable()
    if (!cliAvailable) {
      console.log('[ast-grep] CLI not found, will download on first use')
    }

    // Check NAPI availability
    const napiAvailable = isNapiAvailable()
    if (!napiAvailable) {
      const error = getNapiError()
      console.log(`[ast-grep] NAPI not available: ${error ?? 'unknown'}`)
      console.log('[ast-grep] In-memory tools (analyze/transform) disabled')
    }

    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  listTools(): ToolDefinition[] {
    // Filter out NAPI tools if not available
    if (!isNapiAvailable()) {
      return AST_GREP_TOOLS.filter(
        t => t.name !== 'ast_grep_analyze' && t.name !== 'ast_grep_transform',
      )
    }
    return AST_GREP_TOOLS
  }

  async callTool(name: string, args: unknown): Promise<ToolResult> {
    switch (name) {
      case 'ast_grep_search':
        return this.handleSearch(args)
      case 'ast_grep_replace':
        return this.handleReplace(args)
      case 'ast_grep_analyze':
        return this.handleAnalyze(args)
      case 'ast_grep_transform':
        return this.handleTransform(args)
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
  }

  private async handleSearch(args: unknown): Promise<ToolResult> {
    try {
      const parsed = z
        .object({
          pattern: z.string(),
          lang: z.enum(CLI_LANGUAGES),
          paths: z.array(z.string()).optional(),
          globs: z.array(z.string()).optional(),
          context: z.number().optional(),
          ruleFile: z.string().optional(),
        })
        .parse(args)

      const result = await runSg({
        pattern: parsed.pattern,
        lang: parsed.lang,
        ...(parsed.paths && { paths: parsed.paths }),
        ...(parsed.globs && { globs: parsed.globs }),
        ...(parsed.context !== undefined && { context: parsed.context }),
        ...(parsed.ruleFile && { ruleFile: parsed.ruleFile }),
      })

      let output = formatSearchResult(result)

      // Add hint for empty results
      if (result.matches.length === 0 && !result.error) {
        const hint = getEmptyResultHint(parsed.pattern, parsed.lang)
        if (hint) {
          output += `\n\n${hint}`
        }
      }

      return {
        content: [{ type: 'text', text: output }],
        isError: !!result.error,
      }
    }
    catch (e) {
      return {
        content: [{ type: 'text', text: formatToolError(e) }],
        isError: true,
      }
    }
  }

  private async handleReplace(args: unknown): Promise<ToolResult> {
    try {
      const parsed = z
        .object({
          pattern: z.string(),
          rewrite: z.string(),
          lang: z.enum(CLI_LANGUAGES),
          paths: z.array(z.string()).optional(),
          globs: z.array(z.string()).optional(),
          dryRun: z.boolean().optional(),
        })
        .parse(args)

      const isDryRun = parsed.dryRun !== false // Default to true

      const result = await runSg({
        pattern: parsed.pattern,
        rewrite: parsed.rewrite,
        lang: parsed.lang,
        ...(parsed.paths && { paths: parsed.paths }),
        ...(parsed.globs && { globs: parsed.globs }),
        updateAll: !isDryRun,
      })

      const output = formatReplaceResult(result, isDryRun)

      return {
        content: [{ type: 'text', text: output }],
        isError: !!result.error,
      }
    }
    catch (e) {
      return {
        content: [{ type: 'text', text: formatToolError(e) }],
        isError: true,
      }
    }
  }

  private async handleAnalyze(args: unknown): Promise<ToolResult> {
    try {
      if (!isNapiAvailable()) {
        const error = getNapiError()
        return {
          content: [{
            type: 'text',
            text: `NAPI not available: ${error ?? 'unknown'}\n`
              + 'Install with: bun add -D @ast-grep/napi\n\n'
              + 'Use ast_grep_search for file-based search instead.',
          }],
          isError: true,
        }
      }

      const parsed = z
        .object({
          code: z.string(),
          pattern: z.string(),
          lang: z.enum(NAPI_LANGUAGES),
          extractMetaVars: z.boolean().optional(),
        })
        .parse(args)

      const results = analyzeCode(
        parsed.code,
        parsed.lang as NapiLanguage,
        parsed.pattern,
        parsed.extractMetaVars ?? false,
      )

      const output = formatAnalyzeResult(results, parsed.extractMetaVars ?? false)

      return {
        content: [{ type: 'text', text: output }],
      }
    }
    catch (e) {
      return {
        content: [{ type: 'text', text: formatToolError(e) }],
        isError: true,
      }
    }
  }

  private async handleTransform(args: unknown): Promise<ToolResult> {
    try {
      if (!isNapiAvailable()) {
        const error = getNapiError()
        return {
          content: [{
            type: 'text',
            text: `NAPI not available: ${error ?? 'unknown'}\n`
              + 'Install with: bun add -D @ast-grep/napi\n\n'
              + 'Use ast_grep_replace for file-based replacement instead.',
          }],
          isError: true,
        }
      }

      const parsed = z
        .object({
          code: z.string(),
          pattern: z.string(),
          rewrite: z.string(),
          lang: z.enum(NAPI_LANGUAGES),
        })
        .parse(args)

      const result = transformCode(
        parsed.code,
        parsed.lang as NapiLanguage,
        parsed.pattern,
        parsed.rewrite,
      )

      const output = formatTransformResult(parsed.code, result.transformed, result.editCount)

      return {
        content: [{ type: 'text', text: output }],
      }
    }
    catch (e) {
      return {
        content: [{ type: 'text', text: formatToolError(e) }],
        isError: true,
      }
    }
  }
}

/**
 * Factory function to create AstGrepProvider
 */
export function createAstGrepProvider(config: RegistryConfig): AstGrepProvider {
  return new AstGrepProvider(config)
}

// Re-export types and utilities
export { CLI_LANGUAGES, NAPI_LANGUAGES } from './constants'
export type { CliLanguage, NapiLanguage, SgResult } from './types'
