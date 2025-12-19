/**
 * CLI wrapper for ast-grep
 *
 * Executes sg CLI commands and parses results
 */

import type { CliMatch, RunSgOptions, SgResult } from './types'
import { existsSync } from 'node:fs'
import { spawn } from 'bun'
import {
  CLI_LANGUAGES,
  DEFAULT_MAX_MATCHES,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
} from './constants'
import { ensureAstGrepBinary, getInstallInstructions } from './downloader'

// Cached binary path
let resolvedCliPath: string | null = null

/**
 * Get ast-grep binary path
 */
export async function getAstGrepPath(): Promise<string | null> {
  if (resolvedCliPath !== null && existsSync(resolvedCliPath)) {
    return resolvedCliPath
  }

  const binaryPath = await ensureAstGrepBinary()
  if (binaryPath) {
    resolvedCliPath = binaryPath
  }

  return resolvedCliPath
}

/**
 * Check if CLI is available
 */
export async function isCliAvailable(): Promise<boolean> {
  const path = await getAstGrepPath()
  return path !== null && existsSync(path)
}

/**
 * Run ast-grep CLI command
 *
 * @param options - Command options
 * @param retried - Internal flag to prevent infinite retry loops
 */
export async function runSg(options: RunSgOptions, retried = false): Promise<SgResult> {
  const cliPath = await getAstGrepPath()

  if (!cliPath) {
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: getInstallInstructions(),
    }
  }

  // Validate language
  if (!CLI_LANGUAGES.includes(options.lang)) {
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: `Unsupported language: ${options.lang}\nSupported: ${CLI_LANGUAGES.join(', ')}`,
    }
  }

  // Build command arguments
  const args: string[] = []

  if (options.ruleFile) {
    // Use rule file
    args.push('scan', '--rule', options.ruleFile, '--json=compact')
  }
  else {
    // Use inline pattern
    args.push('run', '-p', options.pattern, '--lang', options.lang, '--json=compact')
  }

  // Add rewrite if specified
  if (options.rewrite) {
    args.push('-r', options.rewrite)
    if (options.updateAll) {
      args.push('--update-all')
    }
  }

  // Add context lines
  if (options.context && options.context > 0) {
    args.push('-C', String(options.context))
  }

  // Add glob filters
  if (options.globs) {
    for (const glob of options.globs) {
      args.push('--globs', glob)
    }
  }

  // Add paths (default to current directory)
  const paths = options.paths && options.paths.length > 0 ? options.paths : ['.']
  args.push(...paths)

  // Spawn process
  const timeout = DEFAULT_TIMEOUT_MS

  const proc = spawn([cliPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      proc.kill()
      reject(new Error(`Search timeout after ${timeout}ms`))
    }, timeout)
    // Use .finally() to ensure cleanup even if proc.exited rejects
    proc.exited.finally(() => clearTimeout(id))
  })

  let stdout: string
  let stderr: string
  let exitCode: number

  try {
    stdout = await Promise.race([new Response(proc.stdout).text(), timeoutPromise])
    stderr = await new Response(proc.stderr).text()
    exitCode = await proc.exited
  }
  catch (e) {
    const error = e as Error
    if (error.message?.includes('timeout')) {
      return {
        matches: [],
        totalMatches: 0,
        truncated: true,
        truncatedReason: 'timeout',
        error: error.message,
      }
    }

    const nodeError = e as NodeJS.ErrnoException
    if (
      nodeError.code === 'ENOENT'
      || nodeError.message?.includes('ENOENT')
      || nodeError.message?.includes('not found')
    ) {
      // Binary not found, try to download (only once to prevent infinite loops)
      if (!retried) {
        const downloadedPath = await ensureAstGrepBinary()
        if (downloadedPath) {
          resolvedCliPath = downloadedPath
          return runSg(options, true) // Retry once
        }
      }
      return {
        matches: [],
        totalMatches: 0,
        truncated: false,
        error: getInstallInstructions(),
      }
    }

    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: `Failed to spawn ast-grep: ${error.message}`,
    }
  }

  // Handle exit code
  if (exitCode !== 0 && stdout.trim() === '') {
    if (stderr.includes('No files found')) {
      return { matches: [], totalMatches: 0, truncated: false }
    }
    if (stderr.trim()) {
      return { matches: [], totalMatches: 0, truncated: false, error: stderr.trim() }
    }
    // Non-zero exit with no output - include exit code for diagnosis
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: `ast-grep exited with code ${exitCode} (no output)`,
    }
  }

  // No output
  if (!stdout.trim()) {
    return { matches: [], totalMatches: 0, truncated: false }
  }

  // Check if output was truncated
  const outputTruncated = stdout.length >= DEFAULT_MAX_OUTPUT_BYTES
  const outputToProcess = outputTruncated ? stdout.substring(0, DEFAULT_MAX_OUTPUT_BYTES) : stdout

  // Parse JSON output
  let matches: CliMatch[] = []
  try {
    matches = JSON.parse(outputToProcess) as CliMatch[]
  }
  catch (parseError) {
    if (outputTruncated) {
      // Try to parse partial JSON
      try {
        const lastValidIndex = outputToProcess.lastIndexOf('}')
        if (lastValidIndex > 0) {
          const bracketIndex = outputToProcess.lastIndexOf('},', lastValidIndex)
          if (bracketIndex > 0) {
            const truncatedJson = `${outputToProcess.substring(0, bracketIndex + 1)}]`
            matches = JSON.parse(truncatedJson) as CliMatch[]
          }
        }
      }
      catch (recoveryError) {
        const errorMsg = recoveryError instanceof Error ? recoveryError.message : 'unknown'
        return {
          matches: [],
          totalMatches: 0,
          truncated: true,
          truncatedReason: 'max_output_bytes',
          error: `Output too large and could not be parsed: ${errorMsg}`,
        }
      }
    }
    else {
      // Non-truncated output but failed to parse - log and return error
      const errorMsg = parseError instanceof Error ? parseError.message : 'unknown'
      console.error(`[ast-grep] Failed to parse output: ${errorMsg}`)
      return {
        matches: [],
        totalMatches: 0,
        truncated: false,
        error: `Failed to parse ast-grep output: ${errorMsg}`,
      }
    }
  }

  // Apply match limit
  const totalMatches = matches.length
  const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES
  const finalMatches = matchesTruncated ? matches.slice(0, DEFAULT_MAX_MATCHES) : matches

  const result: SgResult = {
    matches: finalMatches,
    totalMatches,
    truncated: outputTruncated || matchesTruncated,
  }

  // Only add truncatedReason if truncation occurred
  if (outputTruncated) {
    result.truncatedReason = 'max_output_bytes'
  }
  else if (matchesTruncated) {
    result.truncatedReason = 'max_matches'
  }

  return result
}
