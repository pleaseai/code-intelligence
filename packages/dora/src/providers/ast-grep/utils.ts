/**
 * Utility functions for ast-grep provider
 */

import type { AnalyzeResult, CliLanguage, SgResult } from './types'

/**
 * Format search result for display
 */
export function formatSearchResult(result: SgResult): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.matches.length === 0) {
    return 'No matches found'
  }

  const lines: string[] = []

  if (result.truncated) {
    const reason
      = result.truncatedReason === 'max_matches'
        ? `showing first ${result.matches.length} of ${result.totalMatches}`
        : result.truncatedReason === 'max_output_bytes'
          ? 'output exceeded 1MB limit'
          : 'search timed out'
    lines.push(`Warning: Results truncated (${reason})\n`)
  }

  lines.push(
    `Found ${result.matches.length} match(es)${result.truncated ? ` (truncated from ${result.totalMatches})` : ''}:\n`,
  )

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.lines.trim()}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format replace result for display
 */
export function formatReplaceResult(result: SgResult, isDryRun: boolean): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.matches.length === 0) {
    return 'No matches found to replace'
  }

  const prefix = isDryRun ? '[DRY RUN] ' : ''
  const lines: string[] = []

  if (result.truncated) {
    const reason
      = result.truncatedReason === 'max_matches'
        ? `showing first ${result.matches.length} of ${result.totalMatches}`
        : result.truncatedReason === 'max_output_bytes'
          ? 'output exceeded 1MB limit'
          : 'search timed out'
    lines.push(`Warning: Results truncated (${reason})\n`)
  }

  lines.push(`${prefix}${result.matches.length} replacement(s):\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.text}`)
    lines.push('')
  }

  if (isDryRun) {
    lines.push('Use dryRun=false to apply changes')
  }

  return lines.join('\n')
}

/**
 * Format NAPI analyze result for display
 */
export function formatAnalyzeResult(results: AnalyzeResult[], extractedMetaVars: boolean): string {
  if (results.length === 0) {
    return 'No matches found'
  }

  const lines: string[] = [`Found ${results.length} match(es):\n`]

  for (const result of results) {
    const loc = `L${result.range.start.line + 1}:${result.range.start.column + 1}`
    lines.push(`[${loc}] (${result.kind})`)
    lines.push(`  ${result.text}`)

    if (extractedMetaVars && result.metaVariables.length > 0) {
      lines.push('  Meta-variables:')
      for (const mv of result.metaVariables) {
        lines.push(`    $${mv.name} = "${mv.text}" (${mv.kind})`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format NAPI transform result for display
 */
export function formatTransformResult(_original: string, transformed: string, editCount: number): string {
  if (editCount === 0) {
    return 'No matches found to transform'
  }

  return `Transformed (${editCount} edit(s)):\n\`\`\`\n${transformed}\n\`\`\``
}

/**
 * Get hint for empty result based on pattern
 */
export function getEmptyResultHint(pattern: string, lang: CliLanguage): string | null {
  const src = pattern.trim()

  if (lang === 'python') {
    if (src.startsWith('class ') && src.endsWith(':')) {
      const withoutColon = src.slice(0, -1)
      return `Hint: Remove trailing colon. Try: "${withoutColon}"`
    }
    if ((src.startsWith('def ') || src.startsWith('async def ')) && src.endsWith(':')) {
      const withoutColon = src.slice(0, -1)
      return `Hint: Remove trailing colon. Try: "${withoutColon}"`
    }
  }

  if (['javascript', 'typescript', 'tsx'].includes(lang)) {
    if (/^(export\s+)?(async\s+)?function\s+\$[A-Z_]+\s*$/i.test(src)) {
      return `Hint: Function patterns need params and body. Try "function $NAME($$$) { $$$ }"`
    }
  }

  return null
}
