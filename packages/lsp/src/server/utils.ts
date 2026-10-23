/**
 * LSP Server Utilities
 * Shared utilities for LSP server implementations
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RootFunction } from './types'
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
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

const VERSION_PROBE_TIMEOUT_MS = 10_000

/**
 * Find the first `name` on PATH whose `name --version` exits 0 when run in `root`.
 * A version-manager shim (e.g. mise) can resolve on PATH while exiting non-zero
 * because no version is configured for that directory, and a working install may
 * sit in a later PATH entry.
 */
export async function findRunnableBin(name: string, root: string): Promise<string | undefined> {
  // Read PATH now rather than the copy Bun captured at startup
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  const seen = new Set<string>()
  for (const dir of dirs) {
    const bin = Bun.which(name, { PATH: dir })
    if (!bin || seen.has(bin)) {
      continue
    }
    seen.add(bin)
    if (await runsVersion(bin, root)) {
      return bin
    }
  }
  return undefined
}

/** Whether `bin --version` exits 0 when run in `root`. */
export async function runsVersion(bin: string, root: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([bin, '--version'], {
      cwd: root,
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: VERSION_PROBE_TIMEOUT_MS,
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      log.warn({ bin, exitCode, signal: proc.signalCode }, 'Binary failed --version, skipping it')
      return false
    }
    return true
  }
  catch (err) {
    log.warn({ bin, err }, 'Failed to spawn binary for version check, skipping it')
    return false
  }
}

/** Resolve a package-owned bin declared by the package and exposed by its shared shim. */
export function resolvePackageBin(packageRoot: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { bin?: string | Record<string, string> }
    const relativeTarget = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[name]
    if (!relativeTarget) { return undefined }

    const target = path.resolve(packageRoot, relativeTarget)
    if (!existsSync(target)) { return undefined }
    const ext = process.platform === 'win32' ? '.cmd' : ''
    const packageDir = path.dirname(packageRoot)
    const nodeModules = path.basename(packageDir).startsWith('@')
      ? path.dirname(packageDir)
      : packageDir
    const shim = path.join(nodeModules, '.bin', `${name}${ext}`)
    if (!existsSync(shim)) { return undefined }

    // npm-style symlinks and package-manager-generated wrapper scripts are both
    // valid shims. For wrappers, require a reference to the package's declared
    // target so a stale or unrelated shared shim is never selected.
    const stat = lstatSync(shim)
    if (stat.isSymbolicLink()) {
      const resolvedShim = path.resolve(path.dirname(shim), readlinkSync(shim))
      return existsSync(resolvedShim)
        && realpathSync(resolvedShim) === realpathSync(target)
        ? shim
        : undefined
    }
    const normalizeShimPath = (value: string): string => {
      const normalized = value.replaceAll('\\', '/')
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    }
    const wrapper = normalizeShimPath(readFileSync(shim, 'utf8'))
    const relativeFromBin = normalizeShimPath(path.relative(path.dirname(shim), target))
    const normalizedTarget = normalizeShimPath(target)
    return wrapper.includes(relativeFromBin) || wrapper.includes(normalizedTarget)
      ? shim
      : undefined
  }
  catch {
    return undefined
  }
}

export function findPackageBin(
  start: string,
  packageName: string,
  name: string,
  isUsable: (packageRoot: string) => boolean = () => true,
): string | undefined {
  let dir = path.resolve(start)
  while (true) {
    const packageRoot = path.join(dir, 'node_modules', ...packageName.split('/'))
    const bin = resolvePackageBin(packageRoot, name)
    if (bin && isUsable(packageRoot)) { return bin }
    const parent = path.dirname(dir)
    if (parent === dir) { return undefined }
    dir = parent
  }
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
