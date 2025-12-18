/**
 * Platform detection utilities
 *
 * Used for determining the correct platform-specific binary to execute.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * Detect if running on musl libc (Alpine Linux, etc.)
 * Based on oxc-project's detection approach
 *
 * Uses multiple detection methods:
 * 1. Check /usr/bin/ldd content for "musl"
 * 2. Check process.report for glibc version (Node 12+)
 * 3. Run ldd --version and check output
 *
 * All methods use fallback behavior - if one fails (expected or unexpected),
 * the next method is tried. Common expected errors: ENOENT (file not found).
 * Unexpected errors (EACCES, ENOMEM) are silently ignored with fallback.
 */
export function isMusl(): boolean {
  // Method 1: Check /usr/bin/ldd for musl
  try {
    const lddContent = fs.readFileSync('/usr/bin/ldd', 'utf-8')
    if (lddContent.includes('musl')) {
      return true
    }
  }
  catch {
    // Expected: ENOENT (file not found) on non-Linux or some distros
    // Unexpected errors (EACCES, ENOMEM, etc.) also fall through to next method
  }

  // Method 2: Check process.report for glibc version (Node 12+)
  try {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
    if (report?.header?.glibcVersionRuntime) {
      return false // Has glibc, not musl
    }
  }
  catch {
    // Expected: process.report not available in all environments
  }

  // Method 3: Run ldd --version and check output
  try {
    const output = execSync('ldd --version 2>&1', { encoding: 'utf-8' })
    if (output.includes('musl')) {
      return true
    }
  }
  catch {
    // Expected: ldd not available on non-Linux systems
  }

  return false
}

/**
 * Get the platform-specific target string.
 *
 * Format:
 * - macOS: darwin-arm64, darwin-x64
 * - Windows: win32-x64, win32-arm64
 * - Linux: linux-x64-glibc, linux-arm64-musl, etc.
 *
 * @throws Error if platform is unsupported
 */
export function getTarget(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return `darwin-${arch}`
  }

  if (platform === 'win32') {
    return `win32-${arch}`
  }

  if (platform === 'linux') {
    const libc = isMusl() ? 'musl' : 'glibc'
    return `linux-${arch}-${libc}`
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

/**
 * Get the list of potential binary paths to search.
 * These paths cover different package manager layouts:
 * - npm/yarn hoisted layout
 * - non-hoisted layout
 * - pnpm layout
 *
 * @param dirname - Directory of the calling script (__dirname)
 * @param packageScope - Package scope (e.g., "@pleaseai")
 * @param packageName - Package name (e.g., "code")
 * @param binaryName - Binary name (e.g., "code" or "code.exe")
 */
export function getPotentialBinaryPaths(
  dirname: string,
  packageScope: string,
  packageName: string,
  binaryName: string,
): string[] {
  const target = getTarget()
  const fullPackageName = `${packageScope}/${packageName}-${target}`

  return [
    // Hoisted (npm/yarn)
    path.join(dirname, '..', '..', fullPackageName.replace('/', path.sep), binaryName),
    // Not hoisted
    path.join(dirname, '..', 'node_modules', fullPackageName.replace('/', path.sep), binaryName),
    // pnpm
    path.join(dirname, '..', '..', '..', fullPackageName.replace('/', path.sep), binaryName),
  ]
}
