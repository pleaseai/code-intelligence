/**
 * Binary downloader for ast-grep CLI
 *
 * Downloads platform-specific binary from GitHub releases
 * Caches to ~/.cache/dora/ast-grep/
 */

import type { PlatformId } from '@pleaseai/binaries'
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { createLogger } from '@pleaseai/logger'
import { spawn } from 'bun'
import {
  AST_GREP_VERSION,
  getAstGrepCacheDir,
  getCachedBinaryPath,
  getPlatformId,
  getVersionMarkerPath,
  PLATFORM_CONFIGS,
} from './constants'

const log = createLogger('ast-grep')

/**
 * Verify a binary is actually ast-grep by checking --version output
 */
async function verifyAstGrepBinary(binaryPath: string): Promise<boolean> {
  try {
    const proc = spawn([binaryPath, '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    // ast-grep version output contains "ast-grep" or version number like "0.x.x"
    return stdout.includes('ast-grep') || /^\d+\.\d+\.\d+/.test(stdout.trim())
  }
  catch (e) {
    log.warn({ binaryPath, err: e }, 'Binary verification failed')
    return false
  }
}

/**
 * Check if binary exists in system PATH and is actually ast-grep
 * Checks both 'ast-grep' and 'sg' (common symlink name)
 */
export async function findSystemBinary(): Promise<string | null> {
  // Check 'ast-grep' first (newer name)
  const astGrepPath = Bun.which('ast-grep')
  if (astGrepPath && existsSync(astGrepPath) && await verifyAstGrepBinary(astGrepPath)) {
    return astGrepPath
  }

  // Check 'sg' (common symlink/alias)
  const sgPath = Bun.which('sg')
  if (sgPath && existsSync(sgPath) && await verifyAstGrepBinary(sgPath)) {
    return sgPath
  }

  return null
}

/**
 * Check if cached binary exists and matches version
 */
export function getCachedBinary(): string | null {
  const binaryPath = getCachedBinaryPath()
  const versionPath = getVersionMarkerPath()

  if (!existsSync(binaryPath)) {
    return null
  }

  // Check version marker
  if (existsSync(versionPath)) {
    try {
      const installedVersion = readFileSync(versionPath, 'utf-8').trim()
      if (installedVersion !== AST_GREP_VERSION) {
        // Version mismatch, need to re-download
        return null
      }
    }
    catch (e) {
      // Log warning but continue - will trigger re-download
      log.warn({ versionPath, err: e }, 'Failed to read version marker')
      return null
    }
  }

  return binaryPath
}

/**
 * Extract zip archive
 */
async function extractZip(archivePath: string, destDir: string): Promise<void> {
  let proc
  if (process.platform === 'win32') {
    // Escape single quotes for PowerShell by doubling them
    const escapedArchive = archivePath.replace(/'/g, '\'\'')
    const escapedDest = destDir.replace(/'/g, '\'\'')
    proc = spawn(
      [
        'powershell',
        '-command',
        `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDest}' -Force`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
  }
  else {
    proc = spawn(['unzip', '-o', archivePath, '-d', destDir], { stdout: 'pipe', stderr: 'pipe' })
  }

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    const toolHint
      = process.platform === 'win32'
        ? 'Ensure PowerShell is available on your system.'
        : 'Please install \'unzip\' (e.g., apt install unzip, brew install unzip).'
    throw new Error(`zip extraction failed (exit ${exitCode}): ${stderr}\n\n${toolHint}`)
  }
}

/**
 * Download ast-grep binary from GitHub releases
 */
export async function downloadAstGrepBinary(platformId?: PlatformId): Promise<string | null> {
  const platform = platformId ?? getPlatformId()
  if (!platform) {
    log.error('Unsupported platform for ast-grep binary download')
    return null
  }

  const config = PLATFORM_CONFIGS[platform]
  if (!config) {
    log.error({ platform }, 'No binary configuration for platform')
    return null
  }

  const cacheDir = getAstGrepCacheDir()
  const binaryPath = getCachedBinaryPath()

  // Check if already downloaded
  if (existsSync(binaryPath)) {
    const versionPath = getVersionMarkerPath()
    if (existsSync(versionPath)) {
      const installedVersion = readFileSync(versionPath, 'utf-8').trim()
      if (installedVersion === AST_GREP_VERSION) {
        return binaryPath
      }
    }
  }

  log.info({ version: AST_GREP_VERSION }, 'Downloading ast-grep binary')

  try {
    // Create cache directory
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    // Download archive
    const response = await fetch(config.url, { redirect: 'follow' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const archivePath = `${cacheDir}/sg-download.zip`
    const arrayBuffer = await response.arrayBuffer()
    await Bun.write(archivePath, arrayBuffer)

    // Extract archive
    await extractZip(archivePath, cacheDir)

    // Clean up archive
    if (existsSync(archivePath)) {
      unlinkSync(archivePath)
    }

    // Set executable permission on Unix
    if (process.platform !== 'win32' && existsSync(binaryPath)) {
      chmodSync(binaryPath, 0o755)
    }

    // Write version marker
    writeFileSync(getVersionMarkerPath(), AST_GREP_VERSION)

    log.info({ binaryPath }, 'ast-grep binary ready')

    return binaryPath
  }
  catch (err) {
    log.error({ err }, 'Failed to download ast-grep')
    return null
  }
}

/**
 * Ensure ast-grep binary is available
 *
 * Checks in order:
 * 1. System PATH
 * 2. Cached binary
 * 3. Download if needed
 */
export async function ensureAstGrepBinary(): Promise<string | null> {
  // 1. Check system PATH first
  const systemPath = await findSystemBinary()
  if (systemPath) {
    return systemPath
  }

  // 2. Check cached binary
  const cachedPath = getCachedBinary()
  if (cachedPath) {
    return cachedPath
  }

  // 3. Download
  return downloadAstGrepBinary()
}

/**
 * Get install instructions for manual installation
 */
export function getInstallInstructions(): string {
  return `ast-grep CLI binary not found.

Install options:
  bun add -D @ast-grep/cli
  cargo install ast-grep --locked
  brew install ast-grep

Or let dora auto-download on first use.`
}
