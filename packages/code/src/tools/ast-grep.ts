/**
 * ast-grep tool definition
 * Handles installation and detection of ast-grep CLI
 */

import type { Tool } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  CACHE_DIR,
  commandExists,
  downloadFile,
  ensureCacheDir,
  extractTarGz,
  extractZip,
  getCachedBinaryPath,
  getCommandOutput,
  getPlatformInfo,
  isValidBinary,
  makeExecutable,
} from './downloader'

const TOOL_ID = 'ast-grep'
const BINARY_NAME = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep'

/** GitHub release URL pattern */
const GITHUB_RELEASE_URL = 'https://github.com/ast-grep/ast-grep/releases/latest/download'

/**
 * Get the platform-specific archive name for ast-grep
 */
function getArchiveName(): string | null {
  const { platform, arch } = getPlatformInfo()

  const platformMap: Record<string, Record<string, string>> = {
    darwin: {
      arm64: 'ast-grep-aarch64-apple-darwin.tar.gz',
      x64: 'ast-grep-x86_64-apple-darwin.tar.gz',
    },
    linux: {
      arm64: 'ast-grep-aarch64-unknown-linux-gnu.tar.gz',
      x64: 'ast-grep-x86_64-unknown-linux-gnu.tar.gz',
    },
    win32: {
      x64: 'ast-grep-x86_64-pc-windows-msvc.zip',
      arm64: 'ast-grep-aarch64-pc-windows-msvc.zip',
    },
  }

  return platformMap[platform]?.[arch] ?? null
}

/**
 * Find ast-grep binary in various locations
 */
async function findBinary(): Promise<string | null> {
  // 1. Check cached binary
  const cachedPath = getCachedBinaryPath(TOOL_ID, BINARY_NAME)
  if (isValidBinary(cachedPath)) {
    return cachedPath
  }

  // 2. Check Homebrew paths (macOS)
  if (process.platform === 'darwin') {
    const homebrewPaths = [
      '/opt/homebrew/bin/ast-grep',
      '/usr/local/bin/ast-grep',
    ]
    for (const p of homebrewPaths) {
      if (isValidBinary(p)) {
        return p
      }
    }
  }

  // 3. Check system PATH
  if (commandExists('ast-grep')) {
    const output = getCommandOutput('which ast-grep')
    if (output && isValidBinary(output)) {
      return output
    }
    return 'ast-grep' // Fallback to command name
  }

  return null
}

/**
 * Install ast-grep to local cache
 */
async function installToCache(): Promise<void> {
  const archiveName = getArchiveName()
  if (!archiveName) {
    throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`)
  }

  const downloadUrl = `${GITHUB_RELEASE_URL}/${archiveName}`
  const toolDir = ensureCacheDir(TOOL_ID)
  const archivePath = path.join(toolDir, archiveName)

  // Download archive
  await downloadFile(downloadUrl, archivePath)

  // Extract archive
  if (archiveName.endsWith('.tar.gz')) {
    await extractTarGz(archivePath, toolDir)
  }
  else if (archiveName.endsWith('.zip')) {
    await extractZip(archivePath, toolDir)
  }

  // Make binary executable
  const binaryPath = getCachedBinaryPath(TOOL_ID, BINARY_NAME)
  if (fs.existsSync(binaryPath)) {
    makeExecutable(binaryPath)
  }
  else {
    // Binary might be in a subdirectory, try to find it
    const files = fs.readdirSync(toolDir)
    for (const file of files) {
      const filePath = path.join(toolDir, file)
      if (file === BINARY_NAME || file === 'ast-grep' || file === 'sg') {
        if (file !== BINARY_NAME) {
          fs.renameSync(filePath, binaryPath)
        }
        makeExecutable(binaryPath)
        break
      }
    }
  }

  // Clean up archive
  fs.unlinkSync(archivePath)

  // Verify installation
  if (!isValidBinary(getCachedBinaryPath(TOOL_ID, BINARY_NAME))) {
    throw new Error('Failed to install ast-grep: binary not found after extraction')
  }
}

/**
 * Get ast-grep version
 */
async function getVersion(): Promise<string | null> {
  const binaryPath = await findBinary()
  if (!binaryPath) {
    return null
  }

  const output = getCommandOutput(`"${binaryPath}" --version`)
  if (output) {
    // Output format: "ast-grep 0.x.x" - extract version
    const match = output.match(/(\d+\.\d+\.\d+)/)
    return match?.[1] ?? output
  }

  return null
}

export const astGrepTool: Tool = {
  id: TOOL_ID,
  name: 'ast-grep',
  description: 'AST-based code search and rewriting tool',

  async isInstalled(): Promise<boolean> {
    const binaryPath = await findBinary()
    return binaryPath !== null
  },

  async getBinaryPath(): Promise<string | null> {
    return findBinary()
  },

  async install(): Promise<void> {
    await installToCache()
  },

  async getVersion(): Promise<string | null> {
    return getVersion()
  },
}

/**
 * Export the cached binary path for use in other modules
 */
export function getAstGrepCachePath(): string {
  return path.join(CACHE_DIR, TOOL_ID, BINARY_NAME)
}
