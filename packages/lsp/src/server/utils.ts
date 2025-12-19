/**
 * LSP Server Utilities
 * Shared utilities for LSP server implementations
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { PlatformId, RootFunction } from './types'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { createLogger } from '@pleaseai/logger'

export const log = createLogger('lsp')

// =============================================================================
// Platform Detection Utilities
// =============================================================================

/**
 * Get platform identifier for current system
 */
export function getPlatformId(): PlatformId | undefined {
  const platform = process.platform
  const arch = process.arch

  const platformMap: Record<string, string> = {
    win32: 'win',
    darwin: 'osx',
    linux: 'linux',
  }

  const archMap: Record<string, string> = {
    x64: 'x64',
    arm64: 'arm64',
  }

  const platformStr = platformMap[platform]
  const archStr = archMap[arch]

  if (!platformStr || !archStr)
    return undefined

  return `${platformStr}-${archStr}` as PlatformId
}

// =============================================================================
// Download Utilities
// =============================================================================

/**
 * Download a file from URL to destination
 */
export async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const body = response.body
  if (!body) {
    throw new Error(`No response body for ${url}`)
  }

  await fs.mkdir(path.dirname(dest), { recursive: true })
  const writeStream = createWriteStream(dest)
  await pipeline(body as unknown as NodeJS.ReadableStream, writeStream)
}

/**
 * Extract a zip archive using system unzip command
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })

  // Use system unzip command via Bun.spawn
  const proc = Bun.spawn(['unzip', '-o', '-q', zipPath, '-d', destDir], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`Failed to extract ${zipPath}: ${stderr}`)
  }
}

/**
 * Download and extract an archive
 */
export async function downloadAndExtract(url: string, destDir: string): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-download-'))
  const tempFile = path.join(tempDir, 'archive.zip')

  try {
    log.info({ url }, 'Downloading')
    await downloadFile(url, tempFile)
    log.info({ destDir }, 'Extracting')
    await extractZip(tempFile, destDir)
    log.info('Download complete')
  }
  finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
      log.warn({ tempDir, err }, 'Failed to cleanup temp directory')
    })
  }
}

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
        if (parent === checkDir)
          break
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
      if (parent === current)
        break
      current = parent
    }

    return projectPath
  }
}
