/**
 * Dart Language Server
 * Uses official Dart SDK with system-first fallback and auto-download
 */

import type { LSPServerInfo, PlatformId } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadAndExtract, getPlatformId, log, nearestRoot } from './utils'

/**
 * Dart SDK runtime dependency configuration
 * Uses official Dart SDK with built-in language server
 */
const DART_RUNTIME_DEPS = {
  version: '3.7.1',
  platforms: {
    'win-x64': {
      url: 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-windows-x64-release.zip',
      binaryPath: 'dart-sdk/bin/dart.exe',
    },
    'linux-x64': {
      url: 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-linux-x64-release.zip',
      binaryPath: 'dart-sdk/bin/dart',
    },
    'linux-arm64': {
      url: 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-linux-arm64-release.zip',
      binaryPath: 'dart-sdk/bin/dart',
    },
    'osx-x64': {
      url: 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-macos-x64-release.zip',
      binaryPath: 'dart-sdk/bin/dart',
    },
    'osx-arm64': {
      url: 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-macos-arm64-release.zip',
      binaryPath: 'dart-sdk/bin/dart',
    },
  } as Record<PlatformId, { url: string, binaryPath: string }>,
}

/**
 * Get the Dart LSP resources directory
 */
function getDartResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'dart-lsp')
}

/**
 * Setup Dart runtime dependencies
 * Downloads Dart SDK if not available and dart is not in PATH
 */
async function setupDartDependencies(platformId: PlatformId): Promise<string | undefined> {
  const config = DART_RUNTIME_DEPS.platforms[platformId]

  if (!config) {
    log.warn({ platformId }, 'Unsupported platform for Dart')
    return undefined
  }

  const resourcesDir = getDartResourcesDir()
  const dartPath = path.join(resourcesDir, config.binaryPath)

  try {
    await fs.access(dartPath)
    return dartPath
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      log.error({ dartPath, err }, 'Cannot access Dart')
      return undefined
    }

    // Dart not found, download it
    log.info({ version: DART_RUNTIME_DEPS.version, platformId }, 'Downloading Dart SDK')
    try {
      await downloadAndExtract(config.url, resourcesDir)

      // Make dart executable on Unix platforms
      if (!platformId.startsWith('win-')) {
        try {
          await fs.chmod(dartPath, 0o755)
        }
        catch (chmodErr) {
          log.error({ dartPath, err: chmodErr }, 'Failed to make Dart executable')
          return undefined
        }
      }
    }
    catch (downloadErr) {
      log.error({ err: downloadErr }, 'Failed to download Dart SDK')
      return undefined
    }
  }

  // Verify Dart exists
  try {
    await fs.access(dartPath)
    return dartPath
  }
  catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error({ dartPath, errorMsg }, 'Dart executable not accessible')
    return undefined
  }
}

const DART_PROBE_TIMEOUT_MS = 10_000

/**
 * Find a system Dart that actually runs. A version-manager shim (e.g. mise) can resolve
 * on PATH while exiting non-zero because no SDK version is configured.
 */
export async function findSystemDart(root: string): Promise<string | undefined> {
  // Bun.which defaults to the PATH captured at startup; follow the current environment
  const systemDart = Bun.which('dart', { PATH: process.env.PATH ?? '' })
  if (!systemDart) {
    return undefined
  }

  try {
    // Run in the project root: version managers resolve the SDK per directory
    const proc = Bun.spawn([systemDart, '--version'], {
      cwd: root,
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: DART_PROBE_TIMEOUT_MS,
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      log.warn({ systemDart, exitCode, signal: proc.signalCode }, 'System Dart failed --version, trying auto-download')
      return undefined
    }
  }
  catch (err) {
    log.warn({ systemDart, err }, 'Failed to spawn system Dart for version check, trying auto-download')
    return undefined
  }

  return systemDart
}

export const DartServer: LSPServerInfo = {
  id: 'dart',
  extensions: ['.dart'],
  root: nearestRoot(['pubspec.yaml', 'pubspec.lock']),
  async spawn(root) {
    const systemDart = await findSystemDart(root)
    if (systemDart) {
      try {
        const proc = spawn(systemDart, ['language-server', '--client-id', 'dora.dart', '--client-version', '1.0'], {
          cwd: root,
        })

        attachLSPProcessHandlers(proc, 'dart')
        return { process: proc }
      }
      catch (err) {
        log.warn({ err }, 'Failed to spawn system Dart LSP, trying auto-download')
      }
    }

    // Fallback to auto-download
    const platformId = getPlatformId()
    if (!platformId) {
      log.warn({ platform: process.platform, arch: process.arch }, 'Unsupported platform for Dart')
      return undefined
    }

    const dartPath = await setupDartDependencies(platformId)
    if (!dartPath) {
      log.warn('Failed to setup Dart SDK')
      return undefined
    }

    try {
      const proc = spawn(dartPath, ['language-server', '--client-id', 'dora.dart', '--client-version', '1.0'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'dart')
      return { process: proc }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Dart LSP')
      return undefined
    }
  },
}
