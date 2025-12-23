/**
 * Cache management utilities
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/** Default cache directory */
export const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'pleaseai')

/**
 * Get the cache directory for a specific tool
 */
export function getCacheDir(toolId: string, baseCacheDir?: string): string {
  const base = baseCacheDir ?? DEFAULT_CACHE_DIR
  return path.join(base, toolId)
}

/**
 * Ensure cache directory exists and return the path
 */
export function ensureCacheDir(toolId: string, baseCacheDir?: string): string {
  const cacheDir = getCacheDir(toolId, baseCacheDir)
  fs.mkdirSync(cacheDir, { recursive: true })
  return cacheDir
}

/**
 * Get cached binary path for a tool
 */
export function getCachedBinaryPath(
  toolId: string,
  binaryName: string,
  baseCacheDir?: string,
): string {
  return path.join(getCacheDir(toolId, baseCacheDir), binaryName)
}

/**
 * Check if a file exists and is a valid binary (size > 10KB)
 * This helps detect stub files or corrupted downloads
 */
export function isValidBinary(filePath: string, minSize = 10000): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && stat.size > minSize
  }
  catch {
    return false
  }
}

/**
 * Make a file executable (chmod +x)
 * No-op on Windows
 */
export function makeExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755)
  }
}

/**
 * Check if a cached binary exists and is valid
 */
export function hasCachedBinary(
  toolId: string,
  binaryName: string,
  baseCacheDir?: string,
): boolean {
  const binaryPath = getCachedBinaryPath(toolId, binaryName, baseCacheDir)
  return isValidBinary(binaryPath)
}

/**
 * Remove cached files for a tool
 */
export function clearCache(toolId: string, baseCacheDir?: string): void {
  const cacheDir = getCacheDir(toolId, baseCacheDir)
  fs.rmSync(cacheDir, { recursive: true, force: true })
}
