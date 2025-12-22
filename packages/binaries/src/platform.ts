/**
 * Platform detection utilities
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

export interface PlatformInfo {
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  isMusl: boolean
}

export type PlatformId
  = | 'win-x64'
    | 'win-arm64'
    | 'osx-x64'
    | 'osx-arm64'
    | 'linux-x64'
    | 'linux-arm64'

/**
 * Get platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform: process.platform,
    arch: process.arch as NodeJS.Architecture,
    isMusl: detectMusl(),
  }
}

/**
 * Get platform identifier string (e.g., "osx-arm64", "linux-x64")
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

  if (!platformStr || !archStr) {
    return undefined
  }

  return `${platformStr}-${archStr}` as PlatformId
}

/**
 * Detect if running on musl libc (Alpine Linux, etc.)
 */
export function detectMusl(): boolean {
  if (process.platform !== 'linux') {
    return false
  }

  // Method 1: Check /usr/bin/ldd for musl
  try {
    const lddContent = fs.readFileSync('/usr/bin/ldd', 'utf-8')
    if (lddContent.includes('musl')) {
      return true
    }
  }
  catch {
    // Expected: file not found on some systems
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
 * Check if a command exists in PATH
 */
export function commandExists(command: string): boolean {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${whichCmd} ${command}`, { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

/**
 * Get command output or null if failed
 */
export function getCommandOutput(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return null
  }
}
