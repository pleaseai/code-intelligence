/**
 * LSP Server Utilities
 * Shared utilities for LSP server implementations
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RootFunction } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@pleaseai/logger'

// Re-export from @pleaseai/binaries
export {
  downloadAndExtract,
  downloadFile,
  extractZip,
  getPlatformId,
} from '@pleaseai/binaries'
export type { PlatformId } from '@pleaseai/binaries'

export const log = createLogger('lsp')

// =============================================================================
// Process Lifecycle Utilities
// =============================================================================

/**
 * Attach error and exit event handlers to an LSP process
 * Centralizes logging for process lifecycle events
 */
export function attachLSPProcessHandlers(
  proc: ChildProcessWithoutNullStreams,
  serverId: string,
): void {
  const serverLog = log.child({ serverId })
  proc.on('error', (err) => {
    serverLog.error({ err }, 'LSP process error')
  })

  proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      serverLog.error({ exitCode: code }, 'LSP exited with non-zero code')
    }
    if (signal) {
      serverLog.error({ signal }, 'LSP killed by signal')
    }
  })
}

// =============================================================================
// Root Detection Utilities
// =============================================================================

/**
 * Find nearest directory containing one of the target files
 */
export function nearestRoot(
  includePatterns: string[],
  excludePatterns?: string[],
): RootFunction {
  return async (file, projectPath) => {
    let current = path.dirname(file)

    // Check exclusions first
    if (excludePatterns) {
      let checkDir = current
      while (checkDir.startsWith(projectPath) || checkDir === projectPath) {
        for (const pattern of excludePatterns) {
          const target = path.join(checkDir, pattern)
          try {
            await fs.access(target)
            return undefined // Excluded
          }
          catch (err) {
            // Only continue searching if file not found
            const isNotFound = err instanceof Error
              && 'code' in err
              && (err as NodeJS.ErrnoException).code === 'ENOENT'
            if (!isNotFound) {
              log.warn({ target, err }, 'Unexpected error accessing file')
            }
          }
        }
        const parent = path.dirname(checkDir)
        if (parent === checkDir) { break }
        checkDir = parent
      }
    }

    // Find nearest matching file
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of includePatterns) {
        const target = path.join(current, pattern)
        try {
          await fs.access(target)
          return current
        }
        catch (err) {
          // Only continue searching if file not found
          const isNotFound = err instanceof Error
            && 'code' in err
            && (err as NodeJS.ErrnoException).code === 'ENOENT'
          if (!isNotFound) {
            log.warn({ target, err }, 'Unexpected error accessing file')
          }
        }
      }
      const parent = path.dirname(current)
      if (parent === current) { break }
      current = parent
    }

    return projectPath
  }
}
