/**
 * Platform-specific binary launcher for @pleaseai/code
 *
 * This file is compiled to dist/cli.js in the npm package.
 * It detects the current platform and executes the appropriate native binary.
 */

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PACKAGE_SCOPE = '@pleaseai'
const PACKAGE_NAME = 'code'

/**
 * Detect if running on musl libc (Alpine Linux, etc.)
 * Based on oxc-project's detection approach
 */
function isMusl(): boolean {
  // Method 1: Check /usr/bin/ldd for musl
  try {
    const lddContent = fs.readFileSync('/usr/bin/ldd', 'utf-8')
    if (lddContent.includes('musl')) {
      return true
    }
  }
  catch {
    // File doesn't exist or can't be read
  }

  // Method 2: Check process.report for glibc version (Node 12+)
  try {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
    if (report?.header?.glibcVersionRuntime) {
      return false // Has glibc, not musl
    }
  }
  catch {
    // process.report not available
  }

  // Method 3: Run ldd --version and check output
  try {
    const output = execSync('ldd --version 2>&1', { encoding: 'utf-8' })
    if (output.includes('musl')) {
      return true
    }
  }
  catch {
    // ldd not available or failed
  }

  return false
}

function getTarget(): string {
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

function getBinaryPath(): string {
  const target = getTarget()
  const packageName = `${PACKAGE_SCOPE}/${PACKAGE_NAME}-${target}`
  const binaryName = process.platform === 'win32' ? `${PACKAGE_NAME}.exe` : PACKAGE_NAME

  // Try to find the binary in node_modules
  const paths = [
    // Hoisted (npm/yarn)
    path.join(__dirname, '..', '..', packageName.replace('/', path.sep), binaryName),
    // Not hoisted
    path.join(__dirname, '..', 'node_modules', packageName.replace('/', path.sep), binaryName),
    // pnpm
    path.join(__dirname, '..', '..', '..', packageName.replace('/', path.sep), binaryName),
  ]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  throw new Error(
    `Could not find ${PACKAGE_NAME} binary for ${target}.\n`
    + `Tried: ${paths.join(', ')}\n`
    + `Please ensure the optional dependency ${packageName} is installed.`,
  )
}

try {
  const binaryPath = getBinaryPath()
  execFileSync(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })
}
catch (error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    process.exit(error.status)
  }
  if (error instanceof Error) {
    console.error(error.message)
  }
  process.exit(1)
}
