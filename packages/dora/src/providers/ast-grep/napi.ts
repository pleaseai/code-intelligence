/**
 * NAPI bindings for ast-grep (in-memory transforms)
 *
 * Supports 5 languages: html, javascript, tsx, css, typescript
 * Provides faster in-memory analysis and transformation without spawning CLI
 */

import type { AnalyzeResult, MetaVariable, NapiLanguage, Range } from './types'
import { createLogger } from '@pleaseai/logger'
import { NAPI_LANGUAGES } from './constants'

const log = createLogger('ast-grep')

type AstGrepNapiModule = any

type SgNode = any

// Dynamic import for @ast-grep/napi (optional dependency)
let napiModule: AstGrepNapiModule | null = null
let napiLoadError: Error | null = null

/**
 * Check if NAPI is available
 */
export function isNapiAvailable(): boolean {
  if (napiModule !== null)
    return true
  if (napiLoadError !== null)
    return false

  try {
    // eslint-disable-next-line ts/no-require-imports
    napiModule = require('@ast-grep/napi')
    return true
  }
  catch (e) {
    napiLoadError = e instanceof Error ? e : new Error(String(e))
    // Log full error on first load failure for diagnostics
    log.debug({ err: e }, 'NAPI module load failed')
    return false
  }
}

/**
 * Get NAPI load error if any
 */
export function getNapiError(): string | null {
  return napiLoadError?.message ?? null
}

/**
 * Language to NAPI Lang enum mapping
 */
function getLangEnum(lang: NapiLanguage): unknown {
  if (!napiModule) {
    throw new Error('NAPI module not loaded')
  }

  const { Lang } = napiModule
  const langMap: Record<NapiLanguage, unknown> = {
    html: Lang.Html,
    javascript: Lang.JavaScript,
    tsx: Lang.Tsx,
    css: Lang.Css,
    typescript: Lang.TypeScript,
  }

  return langMap[lang]
}

/**
 * Parse code using NAPI
 */
// eslint-disable-next-line ts/explicit-function-return-type
export function parseCode(code: string, lang: NapiLanguage) {
  if (!isNapiAvailable()) {
    throw new Error(
      `@ast-grep/napi not available: ${napiLoadError?.message ?? 'unknown error'}\n`
      + 'Install with: bun add -D @ast-grep/napi',
    )
  }

  if (!NAPI_LANGUAGES.includes(lang)) {
    const supportedLangs = NAPI_LANGUAGES.join(', ')
    throw new Error(
      `Unsupported language for NAPI: "${lang}"\n`
      + `Supported languages: ${supportedLangs}\n\n`
      + `Use ast_grep_search for other languages (25 supported via CLI).`,
    )
  }

  const parseLang = getLangEnum(lang)
  return napiModule!.parse(parseLang as Parameters<typeof napiModule.parse>[0], code)
}

/**
 * Find pattern matches in parsed tree
 */
// eslint-disable-next-line ts/explicit-function-return-type
export function findPattern(root: ReturnType<typeof parseCode>, pattern: string) {
  return root.root().findAll(pattern)
}

/**
 * Convert NAPI node to Range
 */
function nodeToRange(node: SgNode): Range {
  const range = node.range()
  return {
    start: { line: range.start.line, column: range.start.column },
    end: { line: range.end.line, column: range.end.column },
  }
}

/**
 * Extract meta-variable names from pattern
 */
function extractMetaVariablesFromPattern(pattern: string): string[] {
  const matches = pattern.match(/\$[A-Z_][A-Z0-9_]*/g) || []
  return Array.from(new Set(matches.map(m => m.slice(1))))
}

/**
 * Extract meta-variables from a matched node
 */
export function extractMetaVariables(
  node: SgNode,
  pattern: string,
): MetaVariable[] {
  const varNames = extractMetaVariablesFromPattern(pattern)
  const result: MetaVariable[] = []

  for (const name of varNames) {
    const match = node.getMatch(name)
    if (match) {
      result.push({
        name,
        text: match.text(),
        kind: String(match.kind()),
      })
    }
  }

  return result
}

/**
 * Analyze code with pattern matching
 */
export function analyzeCode(
  code: string,
  lang: NapiLanguage,
  pattern: string,
  shouldExtractMetaVars: boolean,
): AnalyzeResult[] {
  const root = parseCode(code, lang)
  const matches = findPattern(root, pattern)

  return matches.map((node: SgNode) => ({
    text: node.text(),
    range: nodeToRange(node),
    kind: String(node.kind()),
    metaVariables: shouldExtractMetaVars ? extractMetaVariables(node, pattern) : [],
  }))
}

/**
 * Transform code with pattern replacement
 */
export function transformCode(
  code: string,
  lang: NapiLanguage,
  pattern: string,
  rewrite: string,
): { transformed: string, editCount: number } {
  const root = parseCode(code, lang)
  const matches = findPattern(root, pattern)

  if (matches.length === 0) {
    return { transformed: code, editCount: 0 }
  }

  const edits = matches.map((node: SgNode) => {
    const metaVars = extractMetaVariables(node, pattern)
    let replacement = rewrite

    for (const mv of metaVars) {
      replacement = replacement.replace(new RegExp(`\\$${mv.name}`, 'g'), mv.text)
    }

    return node.replace(replacement)
  })

  const transformed = root.root().commitEdits(edits)
  return { transformed, editCount: edits.length }
}

/**
 * Get root node info for debugging
 */
export function getRootInfo(code: string, lang: NapiLanguage): { kind: string, childCount: number } {
  const root = parseCode(code, lang)
  const rootNode = root.root()
  return {
    kind: String(rootNode.kind()),
    childCount: rootNode.children().length,
  }
}
