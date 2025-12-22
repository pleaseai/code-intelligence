/**
 * Type definitions for ast-grep provider
 */

import type { CLI_LANGUAGES, NAPI_LANGUAGES } from './constants'

/** CLI supported language type */
export type CliLanguage = (typeof CLI_LANGUAGES)[number]

/** NAPI supported language type (subset of CLI languages) */
export type NapiLanguage = (typeof NAPI_LANGUAGES)[number]

/** Position in source code */
export interface Position {
  line: number
  column: number
}

/** Range in source code */
export interface Range {
  start: Position
  end: Position
}

/** Match result from CLI */
export interface CliMatch {
  text: string
  range: {
    byteOffset: { start: number, end: number }
    start: Position
    end: Position
  }
  file: string
  lines: string
  charCount: { leading: number, trailing: number }
  language: string
}

/** Simplified search match */
export interface SearchMatch {
  file: string
  text: string
  range: Range
  lines: string
}

/** Meta-variable extracted from pattern */
export interface MetaVariable {
  name: string
  text: string
  kind: string
}

/** Result from NAPI analyze */
export interface AnalyzeResult {
  text: string
  range: Range
  kind: string
  metaVariables: MetaVariable[]
}

/** Result from NAPI transform */
export interface TransformResult {
  original: string
  transformed: string
  editCount: number
}

/** Result from sg CLI */
export interface SgResult {
  matches: CliMatch[]
  totalMatches: number
  truncated: boolean
  truncatedReason?: 'max_matches' | 'max_output_bytes' | 'timeout'
  error?: string
}

/** Options for running sg CLI */
export interface RunSgOptions {
  /** AST pattern to match */
  pattern: string
  /** Target language */
  lang: CliLanguage
  /** Paths to search (default: ['.']) */
  paths?: string[]
  /** Glob patterns to include/exclude (prefix ! to exclude) */
  globs?: string[]
  /** Rewrite pattern for replacements */
  rewrite?: string
  /** Context lines around match */
  context?: number
  /** Apply changes (for replace) */
  updateAll?: boolean
  /** Path to YAML rule file */
  ruleFile?: string
}

// Re-export PlatformId from binaries for consistency
export type { PlatformId } from '@pleaseai/binaries'

/** Platform-specific binary configuration */
export interface PlatformConfig {
  url: string
  binaryPath: string
}

/** Environment check result */
export interface EnvironmentCheckResult {
  cli: {
    available: boolean
    path: string
    error?: string
  }
  napi: {
    available: boolean
    error?: string
  }
}
