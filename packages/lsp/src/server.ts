/**
 * LSP Server definitions
 * Based on opencode reference implementation
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { createLogger } from '@pleaseai/logger'

const log = createLogger('lsp')

export interface LSPServerHandle {
  process: ChildProcessWithoutNullStreams
  initialization?: Record<string, unknown>
}

type RootFunction = (
  file: string,
  projectPath: string,
) => Promise<string | undefined>

export interface LSPServerInfo {
  id: string
  extensions: string[]
  /** Optional filename patterns for files without conventional extensions (e.g., 'Dockerfile', 'Makefile') */
  filenames?: string[]
  root: RootFunction
  spawn: (root: string) => Promise<LSPServerHandle | undefined>
}

// =============================================================================
// Platform Detection Utilities
// =============================================================================

/**
 * Supported platform identifiers for auto-download dependencies
 * Note: win-arm64 is not supported as JRE distributions are not available
 */
type PlatformId = 'win-x64' | 'linux-x64' | 'linux-arm64' | 'osx-x64' | 'osx-arm64'

/**
 * Get platform identifier for current system
 */
function getPlatformId(): PlatformId | undefined {
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
async function downloadFile(url: string, dest: string): Promise<void> {
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
async function extractZip(zipPath: string, destDir: string): Promise<void> {
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
async function downloadAndExtract(url: string, destDir: string): Promise<void> {
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
function attachLSPProcessHandlers(
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
function nearestRoot(
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

/**
 * TypeScript Language Server
 */
export const TypescriptServer: LSPServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  root: nearestRoot(
    [
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ],
    ['deno.json', 'deno.jsonc'],
  ),
  async spawn(root) {
    const tsserver = Bun.which('typescript-language-server')
    if (!tsserver) {
      // Try via bunx
      try {
        const proc = spawn('bunx', ['typescript-language-server', '--stdio'], {
          cwd: root,
          env: { ...process.env, BUN_BE_BUN: '1' },
        })
        attachLSPProcessHandlers(proc, 'typescript')
        return { process: proc }
      }
      catch (err) {
        log.error({ err }, 'Failed to spawn typescript-language-server via bunx')
        return undefined
      }
    }

    const proc = spawn(tsserver, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'typescript')
    return { process: proc }
  },
}

/**
 * Deno Language Server
 */
export const DenoServer: LSPServerInfo = {
  id: 'deno',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  root: async (file, projectPath) => {
    let current = path.dirname(file)
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of ['deno.json', 'deno.jsonc']) {
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
    return undefined
  },
  async spawn(root) {
    const deno = Bun.which('deno')
    if (!deno)
      return undefined

    const proc = spawn(deno, ['lsp'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'deno')
    return { process: proc }
  },
}

/**
 * Python Language Server (Pyright)
 */
export const PyrightServer: LSPServerInfo = {
  id: 'pyright',
  extensions: ['.py', '.pyi'],
  root: nearestRoot([
    'pyproject.toml',
    'setup.py',
    'requirements.txt',
    'pyrightconfig.json',
  ]),
  async spawn(root) {
    const pyright = Bun.which('pyright-langserver')
    if (!pyright) {
      // Try via bunx/npx
      try {
        const proc = spawn('bunx', ['pyright-langserver', '--stdio'], {
          cwd: root,
        })
        attachLSPProcessHandlers(proc, 'pyright')
        return { process: proc }
      }
      catch (err) {
        log.error({ err }, 'Failed to spawn pyright-langserver via bunx')
        return undefined
      }
    }

    const proc = spawn(pyright, ['--stdio'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'pyright')
    return { process: proc }
  },
}

/**
 * Go Language Server (gopls)
 */
export const GoplsServer: LSPServerInfo = {
  id: 'gopls',
  extensions: ['.go'],
  root: async (file, projectPath) => {
    // Check for go.work first
    const workRoot = await nearestRoot(['go.work'])(file, projectPath)
    if (workRoot)
      return workRoot
    return nearestRoot(['go.mod', 'go.sum'])(file, projectPath)
  },
  async spawn(root) {
    const gopls = Bun.which('gopls')
    if (!gopls)
      return undefined

    const proc = spawn(gopls, ['serve'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'gopls')
    return { process: proc }
  },
}

/**
 * Rust Analyzer
 */
export const RustAnalyzerServer: LSPServerInfo = {
  id: 'rust-analyzer',
  extensions: ['.rs'],
  root: nearestRoot(['Cargo.toml', 'Cargo.lock']),
  async spawn(root) {
    const rustAnalyzer = Bun.which('rust-analyzer')
    if (!rustAnalyzer)
      return undefined

    const proc = spawn(rustAnalyzer, [], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'rust-analyzer')
    return { process: proc }
  },
}

/**
 * Oxlint Language Server
 * Based on opencode PR #5570
 */
export const OxlintServer: LSPServerInfo = {
  id: 'oxlint',
  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.vue',
    '.astro',
    '.svelte',
  ],
  root: nearestRoot([
    '.oxlintrc.json',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package.json',
  ]),
  async spawn(root) {
    const ext = process.platform === 'win32' ? '.cmd' : ''

    const resolveBin = async (
      binName: string,
    ): Promise<string | undefined> => {
      const localBin = path.join(root, 'node_modules', '.bin', binName + ext)
      try {
        await fs.access(localBin)
        return localBin
      }
      catch (err: unknown) {
        // Only ignore ENOENT (file not found), log other errors
        const isNotFound
          = err instanceof Error
            && 'code' in err
            && (err as NodeJS.ErrnoException).code === 'ENOENT'
        if (!isNotFound) {
          log.error({ localBin, err }, 'Cannot access local oxlint binary')
        }
      }

      // Check global PATH
      const globalBin = Bun.which(binName)
      if (globalBin)
        return globalBin

      return undefined
    }

    // Try oxlint with --lsp flag first
    const lintBin = await resolveBin('oxlint')
    if (lintBin) {
      const proc = Bun.spawn([lintBin, '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.warn({ lintBin, exitCode, stderr: stderr.slice(0, 200) }, 'oxlint binary failed --help')
      }
      else {
        const help = await new Response(proc.stdout).text()
        if (help.includes('--lsp')) {
          const lspProc = spawn(lintBin, ['--lsp'], {
            cwd: root,
          })
          attachLSPProcessHandlers(lspProc, 'oxlint')
          return { process: lspProc }
        }
      }
    }

    // Fallback to oxc_language_server
    const serverBin = await resolveBin('oxc_language_server')
    if (serverBin) {
      const serverProc = spawn(serverBin, [], {
        cwd: root,
      })
      attachLSPProcessHandlers(serverProc, 'oxlint')
      return { process: serverProc }
    }

    // Neither found - log diagnostic
    log.warn({ root }, 'Could not start oxlint LSP server. Install with: npm install -D oxlint')
    return undefined
  },
}

// =============================================================================
// Kotlin Language Server
// =============================================================================

/**
 * Kotlin Language Server runtime dependency configuration
 * Uses official JetBrains Kotlin LSP and bundled JRE 21
 */
const KOTLIN_RUNTIME_DEPS = {
  kotlinLsp: {
    url: 'https://download-cdn.jetbrains.com/kotlin-lsp/0.253.10629/kotlin-0.253.10629.zip',
    version: '0.253.10629',
  },
  java: {
    'win-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-win32-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-win32-x86_64',
      javaPath: 'extension/jre/21.0.7-win32-x86_64/bin/java.exe',
    },
    'linux-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-linux-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-linux-x86_64',
      javaPath: 'extension/jre/21.0.7-linux-x86_64/bin/java',
    },
    'linux-arm64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-linux-arm64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-linux-aarch64',
      javaPath: 'extension/jre/21.0.7-linux-aarch64/bin/java',
    },
    'osx-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-darwin-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-macosx-x86_64',
      javaPath: 'extension/jre/21.0.7-macosx-x86_64/bin/java',
    },
    'osx-arm64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-darwin-arm64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-macosx-aarch64',
      javaPath: 'extension/jre/21.0.7-macosx-aarch64/bin/java',
    },
  } as Record<PlatformId, { url: string, javaHomePath: string, javaPath: string }>,
}

/**
 * Get the Kotlin LSP resources directory
 */
function getKotlinResourcesDir(): string {
  // Store in user's home directory under .cache/dora/kotlin-lsp
  return path.join(os.homedir(), '.cache', 'dora', 'kotlin-lsp')
}

/**
 * Setup Kotlin runtime dependencies (Java + Kotlin LSP)
 * Downloads and extracts if not already present
 */
async function setupKotlinDependencies(platformId: PlatformId): Promise<{
  javaHomePath: string
  kotlinLspPath: string
} | undefined> {
  const resourcesDir = getKotlinResourcesDir()
  const javaConfig = KOTLIN_RUNTIME_DEPS.java[platformId]

  if (!javaConfig) {
    log.warn({ platformId }, 'Unsupported platform for Kotlin')
    return undefined
  }

  // Setup Java
  const javaDir = path.join(resourcesDir, 'java')
  const javaHomePath = path.join(javaDir, javaConfig.javaHomePath)
  const javaPath = path.join(javaDir, javaConfig.javaPath)

  try {
    await fs.access(javaPath)
  }
  catch (err) {
    // Check if it's actually a "not found" error vs other access issues
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      log.error({ javaPath, err }, 'Cannot access Java')
      return undefined
    }

    // Java not found, download it
    log.info({ platformId }, 'Downloading Java 21')
    try {
      await downloadAndExtract(javaConfig.url, javaDir)

      // Make Java executable on Unix platforms
      if (!platformId.startsWith('win-')) {
        try {
          await fs.chmod(javaPath, 0o755)
        }
        catch (chmodErr) {
          log.error({ javaPath, err: chmodErr }, 'Failed to make Java executable')
          return undefined
        }
      }
    }
    catch (err) {
      log.error({ err }, 'Failed to download Java')
      return undefined
    }
  }

  // Verify Java exists
  try {
    await fs.access(javaPath)
  }
  catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error({ javaPath, errorMsg }, 'Java executable not accessible')
    return undefined
  }

  // Setup Kotlin LSP
  const isWindows = platformId.startsWith('win-')
  const kotlinLspScript = isWindows ? 'kotlin-lsp.cmd' : 'kotlin-lsp.sh'
  const kotlinLspPath = path.join(resourcesDir, kotlinLspScript)

  try {
    await fs.access(kotlinLspPath)
  }
  catch (err) {
    // Check if it's actually a "not found" error vs other access issues
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      log.error({ kotlinLspPath, err }, 'Cannot access Kotlin LSP')
      return undefined
    }

    // Kotlin LSP not found, download it
    log.info('Downloading Kotlin Language Server')
    try {
      await downloadAndExtract(KOTLIN_RUNTIME_DEPS.kotlinLsp.url, resourcesDir)

      // Make script executable on Unix platforms
      if (!isWindows) {
        try {
          await fs.chmod(kotlinLspPath, 0o755)
        }
        catch (chmodErr) {
          log.error({ kotlinLspPath, err: chmodErr }, 'Failed to make Kotlin LSP executable')
          return undefined
        }
      }
    }
    catch (err) {
      log.error({ err }, 'Failed to download Kotlin LSP')
      return undefined
    }
  }

  // Verify Kotlin LSP exists
  try {
    await fs.access(kotlinLspPath)
  }
  catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error({ kotlinLspPath, errorMsg }, 'Kotlin LSP script not accessible')
    return undefined
  }

  return {
    javaHomePath,
    kotlinLspPath,
  }
}

/**
 * Kotlin Language Server
 * Uses official JetBrains Kotlin LSP with auto-download
 */
export const KotlinServer: LSPServerInfo = {
  id: 'kotlin',
  extensions: ['.kt', '.kts'],
  root: nearestRoot([
    'build.gradle.kts',
    'build.gradle',
    'settings.gradle.kts',
    'settings.gradle',
    'pom.xml',
  ]),
  async spawn(root) {
    const platformId = getPlatformId()
    if (!platformId) {
      log.warn({ platform: process.platform, arch: process.arch }, 'Unsupported platform for Kotlin')
      return undefined
    }

    // Setup dependencies (downloads if needed)
    const deps = await setupKotlinDependencies(platformId)
    if (!deps) {
      log.warn('Failed to setup Kotlin LSP dependencies')
      return undefined
    }

    const { javaHomePath, kotlinLspPath } = deps

    // Spawn Kotlin LSP with JAVA_HOME
    try {
      const proc = spawn(kotlinLspPath, ['--stdio'], {
        cwd: root,
        env: {
          ...process.env,
          JAVA_HOME: javaHomePath,
        },
      })

      attachLSPProcessHandlers(proc, 'kotlin')
      return { process: proc }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Kotlin LSP')
      return undefined
    }
  },
}

// =============================================================================
// Dart Language Server
// =============================================================================

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
 *
 * Unlike setupKotlinDependencies which returns { javaHomePath, kotlinLspPath },
 * this returns only the binary path because:
 * - Dart SDK is self-contained (no separate JRE dependency)
 * - No environment variables (like JAVA_HOME) required for execution
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

/**
 * Dart Language Server
 * Uses official Dart SDK with system-first fallback and auto-download
 */
export const DartServer: LSPServerInfo = {
  id: 'dart',
  extensions: ['.dart'],
  root: nearestRoot(['pubspec.yaml', 'pubspec.lock']),
  async spawn(root) {
    // Try system dart first
    const systemDart = Bun.which('dart')
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

// =============================================================================
// Vue Language Server
// =============================================================================

/**
 * Vue Language Server runtime dependency configuration
 * Uses @vue/language-server with Full Hybrid Mode and companion TypeScript server
 *
 * Architecture (matching Python reference):
 * - Vue LS handles .vue files with hybridMode: true
 * - Companion TypeScript LS with @vue/typescript-plugin for cross-file references
 */
const VUE_RUNTIME_DEPS = {
  vueLanguageServer: {
    package: '@vue/language-server',
    version: '2.2.0',
  },
  vueTypeScriptPlugin: {
    package: '@vue/typescript-plugin',
    version: '2.2.0',
  },
  typescript: {
    package: 'typescript',
    version: '5.7.2',
  },
  typeScriptLanguageServer: {
    package: 'typescript-language-server',
    version: '4.3.3',
  },
}

/**
 * Get the Vue LSP resources directory
 */
function getVueResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'vue-lsp')
}

/**
 * Get combined version string for version marker file
 */
function getVueExpectedVersion(): string {
  return [
    VUE_RUNTIME_DEPS.vueLanguageServer.version,
    VUE_RUNTIME_DEPS.vueTypeScriptPlugin.version,
    VUE_RUNTIME_DEPS.typescript.version,
    VUE_RUNTIME_DEPS.typeScriptLanguageServer.version,
  ].join('_')
}

/**
 * Setup Vue runtime dependencies using npm
 * Installs to ~/.cache/dora/vue-lsp/ if not already present or version mismatch
 *
 * @returns Object with paths to executables and tsdk, or undefined on failure
 */
async function setupVueDependencies(): Promise<{
  vueServerPath: string
  tsServerPath: string
  tsdkPath: string
  vuePluginPath: string
} | undefined> {
  const resourcesDir = getVueResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const vueServerPath = path.join(resourcesDir, 'node_modules', '.bin', `vue-language-server${ext}`)
  const tsServerPath = path.join(resourcesDir, 'node_modules', '.bin', `typescript-language-server${ext}`)
  const tsdkPath = path.join(resourcesDir, 'node_modules', 'typescript', 'lib')
  const vuePluginPath = path.join(resourcesDir, 'node_modules', '@vue', 'typescript-plugin')

  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = getVueExpectedVersion()

  // Check if installation is needed
  let needsInstall = false

  try {
    await fs.access(vueServerPath)
    await fs.access(tsServerPath)

    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        log.warn({ installed: installedVersion.trim(), expected: expectedVersion }, 'Vue version mismatch')
        needsInstall = true
      }
    }
    catch (err) {
      const isNotFound = err instanceof Error
        && 'code' in err
        && (err as NodeJS.ErrnoException).code === 'ENOENT'

      if (isNotFound) {
        // Version file doesn't exist, needs install
        needsInstall = true
      }
      else {
        // Unexpected error reading version file - log it but proceed with reinstall
        log.warn({ err }, 'Unexpected error reading Vue version file')
        needsInstall = true
      }
    }
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (isNotFound) {
      // Executables not found, needs install
      needsInstall = true
    }
    else {
      // Unexpected error accessing executables
      log.error({ err }, 'Cannot access Vue LSP executables')
      return undefined
    }
  }

  if (needsInstall) {
    log.info('Installing Vue Language Server dependencies')

    try {
      await fs.mkdir(resourcesDir, { recursive: true })

      // Install all packages with specific versions
      const packages = [
        `${VUE_RUNTIME_DEPS.vueLanguageServer.package}@${VUE_RUNTIME_DEPS.vueLanguageServer.version}`,
        `${VUE_RUNTIME_DEPS.vueTypeScriptPlugin.package}@${VUE_RUNTIME_DEPS.vueTypeScriptPlugin.version}`,
        `${VUE_RUNTIME_DEPS.typescript.package}@${VUE_RUNTIME_DEPS.typescript.version}`,
        `${VUE_RUNTIME_DEPS.typeScriptLanguageServer.package}@${VUE_RUNTIME_DEPS.typeScriptLanguageServer.version}`,
      ]

      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, ...packages], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Vue npm install failed')
        return undefined
      }

      // Write version marker (non-fatal if this fails)
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Vue version marker file')
      }
      log.info('Vue Language Server dependencies installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Vue dependencies')
      return undefined
    }
  }

  // Verify all paths exist
  const requiredPaths = [
    { path: vueServerPath, name: 'vue-language-server' },
    { path: tsServerPath, name: 'typescript-language-server' },
    { path: tsdkPath, name: 'TypeScript SDK' },
    { path: vuePluginPath, name: '@vue/typescript-plugin' },
  ]

  for (const { path: filePath, name } of requiredPaths) {
    try {
      await fs.access(filePath)
    }
    catch (err) {
      log.error({ name, filePath, err }, 'Vue required file not found after installation')
      return undefined
    }
  }

  return { vueServerPath, tsServerPath, tsdkPath, vuePluginPath }
}

/**
 * Vue Language Server
 * Uses @vue/language-server with Full Hybrid Mode
 *
 * Architecture (matching Python reference vue_language_server.py):
 * - Vue LS runs with hybridMode: true
 * - In hybrid mode, Vue LS delegates TypeScript operations to companion server
 * - The companion TypeScript server uses @vue/typescript-plugin for Vue awareness
 *
 * Initialization options:
 * - vue.hybridMode: true - Enable hybrid mode for Vue LS
 * - typescript.tsdk: path to TypeScript lib directory
 */
export const VueServer: LSPServerInfo = {
  id: 'vue',
  extensions: ['.vue'],
  root: nearestRoot(
    [
      'package.json',
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ],
    ['deno.json', 'deno.jsonc'], // Exclude Deno projects
  ),
  async spawn(root) {
    // Check for node/npm availability
    const node = Bun.which('node')
    const npm = Bun.which('npm')

    if (!node || !npm) {
      log.warn('Node.js and npm are required for Vue Language Server')
      return undefined
    }

    // Setup dependencies (npm install if needed)
    const deps = await setupVueDependencies()
    if (!deps) {
      log.warn('Failed to setup Vue LSP dependencies')
      return undefined
    }

    const { vueServerPath, tsdkPath } = deps

    try {
      const proc = spawn(vueServerPath, ['--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'vue')

      return {
        process: proc,
        initialization: {
          vue: {
            hybridMode: true,
          },
          typescript: {
            tsdk: tsdkPath,
          },
        },
      }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Vue Language Server')
      return undefined
    }
  },
}

// =============================================================================
// Prisma Language Server
// =============================================================================

/**
 * Prisma Language Server runtime dependency configuration
 * Uses @prisma/language-server npm package with auto-download
 */
const PRISMA_RUNTIME_DEPS = {
  prismaLanguageServer: {
    package: '@prisma/language-server',
    version: '31.1.35',
  },
}

/**
 * Get the Prisma LSP resources directory
 */
function getPrismaResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'prisma-lsp')
}

/**
 * Setup Prisma runtime dependencies using npm
 * Installs to ~/.cache/dora/prisma-lsp/ if not already present or version mismatch
 *
 * @returns Path to prisma-language-server binary, or undefined on failure
 */
async function setupPrismaDependencies(): Promise<string | undefined> {
  const resourcesDir = getPrismaResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const prismaServerPath = path.join(resourcesDir, 'node_modules', '.bin', `prisma-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = PRISMA_RUNTIME_DEPS.prismaLanguageServer.version

  // Check if installation is needed
  let needsInstall = false

  try {
    await fs.access(prismaServerPath)

    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        log.warn({ installed: installedVersion.trim(), expected: expectedVersion }, 'Prisma version mismatch')
        needsInstall = true
      }
    }
    catch (err) {
      const isNotFound = err instanceof Error
        && 'code' in err
        && (err as NodeJS.ErrnoException).code === 'ENOENT'

      if (isNotFound) {
        needsInstall = true
      }
      else {
        log.warn({ err }, 'Unexpected error reading Prisma version file')
        needsInstall = true
      }
    }
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (isNotFound) {
      needsInstall = true
    }
    else {
      log.error({ err }, 'Cannot access Prisma LSP executable')
      return undefined
    }
  }

  if (needsInstall) {
    log.info('Installing Prisma Language Server')

    try {
      await fs.mkdir(resourcesDir, { recursive: true })

      const packageSpec = `${PRISMA_RUNTIME_DEPS.prismaLanguageServer.package}@${PRISMA_RUNTIME_DEPS.prismaLanguageServer.version}`

      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Prisma npm install failed')
        return undefined
      }

      // Write version marker (non-fatal if this fails)
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Prisma version marker file')
      }
      log.info('Prisma Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Prisma dependencies')
      return undefined
    }
  }

  // Verify binary exists
  try {
    await fs.access(prismaServerPath)
    return prismaServerPath
  }
  catch (err) {
    log.error({ prismaServerPath, err }, 'Prisma LSP binary not found after installation')
    return undefined
  }
}

/**
 * Prisma Language Server
 * Uses @prisma/language-server npm package with auto-download
 *
 * Features:
 * - Diagnostics (real-time error highlighting)
 * - Code completions
 * - Hover information
 * - Go-to-definition
 * - Document formatting
 * - Code actions
 * - Rename symbol
 * - Document symbols
 */
export const PrismaServer: LSPServerInfo = {
  id: 'prisma',
  extensions: ['.prisma'],
  root: nearestRoot(['schema.prisma', 'prisma/schema.prisma']),
  async spawn(root) {
    // Check for node/npm availability
    const node = Bun.which('node')
    const npm = Bun.which('npm')

    if (!node || !npm) {
      log.warn('Node.js and npm are required for Prisma Language Server')
      return undefined
    }

    // Setup dependencies (npm install if needed)
    const prismaServerPath = await setupPrismaDependencies()
    if (!prismaServerPath) {
      log.warn('Failed to setup Prisma LSP dependencies')
      return undefined
    }

    try {
      const proc = spawn(prismaServerPath, ['--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'prisma')

      return { process: proc }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Prisma Language Server')
      return undefined
    }
  },
}

// =============================================================================
// ESLint Language Server
// =============================================================================

/**
 * Get the ESLint LSP resources directory
 */
function getEslintResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'eslint-lsp')
}

/**
 * Setup ESLint runtime dependencies
 * Downloads vscode-eslint from GitHub and builds it
 *
 * @returns Path to eslint server JS file, or undefined on failure
 */
async function setupEslintDependencies(): Promise<string | undefined> {
  const resourcesDir = getEslintResourcesDir()
  const vscodeEslintDir = path.join(resourcesDir, 'vscode-eslint')
  const serverPath = path.join(vscodeEslintDir, 'server', 'out', 'eslintServer.js')

  // Check if server already exists
  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      console.error(`[eslint] Cannot access ESLint server at ${serverPath}:`, err instanceof Error ? err.message : err)
      return undefined
    }
  }

  // Server not found, need to download and build
  console.warn('[eslint] Downloading and building VS Code ESLint server...')

  try {
    await fs.mkdir(resourcesDir, { recursive: true })

    // Download vscode-eslint from GitHub
    const response = await fetch('https://github.com/microsoft/vscode-eslint/archive/refs/heads/main.zip')
    if (!response.ok) {
      console.error(`[eslint] Failed to download vscode-eslint: ${response.status} ${response.statusText}`)
      return undefined
    }

    const zipPath = path.join(resourcesDir, 'vscode-eslint.zip')
    const body = response.body
    if (!body) {
      console.error('[eslint] No response body for vscode-eslint download')
      return undefined
    }

    // Write zip file
    const writeStream = createWriteStream(zipPath)
    await pipeline(body as unknown as NodeJS.ReadableStream, writeStream)

    // Extract zip
    console.warn('[eslint] Extracting vscode-eslint...')
    await fs.mkdir(resourcesDir, { recursive: true })
    const extractProc = Bun.spawn(['unzip', '-o', '-q', zipPath, '-d', resourcesDir], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const extractExitCode = await extractProc.exited
    if (extractExitCode !== 0) {
      const stderr = await new Response(extractProc.stderr).text()
      console.error(`[eslint] Failed to extract vscode-eslint: ${stderr}`)
      return undefined
    }

    // Cleanup zip file
    await fs.rm(zipPath, { force: true })

    // Rename extracted directory (vscode-eslint-main -> vscode-eslint)
    const extractedPath = path.join(resourcesDir, 'vscode-eslint-main')
    try {
      await fs.access(vscodeEslintDir)
      console.warn('[eslint] Removing old vscode-eslint installation...')
      await fs.rm(vscodeEslintDir, { force: true, recursive: true })
    }
    catch {
      // Directory doesn't exist, that's fine
    }
    await fs.rename(extractedPath, vscodeEslintDir)

    // Run npm install
    console.warn('[eslint] Running npm install...')
    const npmInstallProc = Bun.spawn(['npm', 'install'], {
      cwd: vscodeEslintDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const npmInstallExitCode = await npmInstallProc.exited
    if (npmInstallExitCode !== 0) {
      const stderr = await new Response(npmInstallProc.stderr).text()
      console.error(`[eslint] npm install failed: ${stderr}`)
      return undefined
    }

    // Run npm run compile
    console.warn('[eslint] Building vscode-eslint (npm run compile)...')
    const npmCompileProc = Bun.spawn(['npm', 'run', 'compile'], {
      cwd: vscodeEslintDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const npmCompileExitCode = await npmCompileProc.exited
    if (npmCompileExitCode !== 0) {
      const stderr = await new Response(npmCompileProc.stderr).text()
      console.error(`[eslint] npm run compile failed: ${stderr}`)
      return undefined
    }

    console.warn('[eslint] VS Code ESLint server installed successfully')
  }
  catch (err) {
    console.error('[eslint] Failed to setup ESLint dependencies:', err)
    return undefined
  }

  // Verify server exists
  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    console.error(`[eslint] ESLint server not found after installation: ${serverPath}`)
    return undefined
  }
}

/**
 * ESLint Language Server
 * Downloads and builds vscode-eslint from GitHub
 * Requires eslint package in project (prerequisite check)
 */
export const EslintServer: LSPServerInfo = {
  id: 'eslint',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    // Prerequisite: Check eslint exists in project
    const isWindows = process.platform === 'win32'
    const eslintBin = path.join(root, 'node_modules', '.bin', `eslint${isWindows ? '.cmd' : ''}`)
    try {
      await fs.access(eslintBin)
    }
    catch {
      console.warn('[eslint] eslint package not found in project. Install with: npm install eslint')
      return undefined
    }

    // Check for node/npm availability
    const node = Bun.which('node')
    const npm = Bun.which('npm')
    if (!node || !npm) {
      console.warn('[eslint] Node.js and npm are required for ESLint Language Server')
      return undefined
    }

    // Setup dependencies (download + build if needed)
    const serverPath = await setupEslintDependencies()
    if (!serverPath) {
      console.warn('[eslint] Failed to setup ESLint LSP dependencies. Check previous logs for details.')
      return undefined
    }

    try {
      // Spawn server with increased memory for large codebases
      const proc = spawn(node, ['--max-old-space-size=8192', serverPath, '--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'eslint')
      return { process: proc }
    }
    catch (err) {
      console.error('[eslint] Failed to spawn ESLint Language Server:', err)
      return undefined
    }
  },
}

// =============================================================================
// Biome Language Server
// =============================================================================

/**
 * Biome Language Server
 * JS/TS/JSON/CSS linter with auto-download support
 */
export const BiomeServer: LSPServerInfo = {
  id: 'biome',
  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.json',
    '.jsonc',
    '.vue',
    '.astro',
    '.svelte',
    '.css',
    '.graphql',
    '.gql',
    '.html',
  ],
  root: nearestRoot([
    'biome.json',
    'biome.jsonc',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.cmd' : ''

    // Check local node_modules/.bin first
    const localBin = path.join(root, 'node_modules', '.bin', `biome${ext}`)
    try {
      await fs.access(localBin)
      const proc = spawn(localBin, ['lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }
    catch {
      // Not found locally
    }

    // Check global PATH
    const globalBin = Bun.which('biome')
    if (globalBin) {
      const proc = spawn(globalBin, ['lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }

    // Fallback: Try via bunx if biome is resolvable in project
    try {
      const proc = spawn('bunx', ['biome', 'lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }
    catch (err) {
      log.warn({ root, err }, 'Biome not found. Install with: npm install @biomejs/biome')
      return undefined
    }
  },
}

// =============================================================================
// Svelte Language Server
// =============================================================================

/**
 * Svelte Language Server runtime dependency configuration
 */
const SVELTE_RUNTIME_DEPS = {
  svelteLanguageServer: {
    package: 'svelte-language-server',
    version: '0.17.7',
  },
}

function getSvelteResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'svelte-lsp')
}

async function setupSvelteDependencies(): Promise<string | undefined> {
  const resourcesDir = getSvelteResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `svelteserver${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = SVELTE_RUNTIME_DEPS.svelteLanguageServer.version

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing Svelte Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${SVELTE_RUNTIME_DEPS.svelteLanguageServer.package}@${SVELTE_RUNTIME_DEPS.svelteLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Svelte npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Svelte version marker')
      }
      log.info('Svelte Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Svelte dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Svelte LSP binary not found after installation')
    return undefined
  }
}

/**
 * Svelte Language Server
 */
export const SvelteServer: LSPServerInfo = {
  id: 'svelte',
  extensions: ['.svelte'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('svelteserver')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'svelte')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupSvelteDependencies()
    if (!serverPath) {
      log.error({ serverId: 'svelte', root }, 'Svelte LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'svelte')
    return { process: proc }
  },
}

// =============================================================================
// Astro Language Server
// =============================================================================

/**
 * Astro Language Server runtime dependency configuration
 */
const ASTRO_RUNTIME_DEPS = {
  astroLanguageServer: {
    package: '@astrojs/language-server',
    version: '2.16.6',
  },
  typescript: {
    package: 'typescript',
    version: '5.7.2',
  },
}

function getAstroResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'astro-lsp')
}

function getAstroExpectedVersion(): string {
  return [
    ASTRO_RUNTIME_DEPS.astroLanguageServer.version,
    ASTRO_RUNTIME_DEPS.typescript.version,
  ].join('_')
}

async function setupAstroDependencies(): Promise<{
  serverPath: string
  tsdkPath: string
} | undefined> {
  const resourcesDir = getAstroResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `astro-ls${ext}`)
  const tsdkPath = path.join(resourcesDir, 'node_modules', 'typescript', 'lib')
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = getAstroExpectedVersion()

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing Astro Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packages = [
        `${ASTRO_RUNTIME_DEPS.astroLanguageServer.package}@${ASTRO_RUNTIME_DEPS.astroLanguageServer.version}`,
        `${ASTRO_RUNTIME_DEPS.typescript.package}@${ASTRO_RUNTIME_DEPS.typescript.version}`,
      ]
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, ...packages], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Astro npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Astro version marker')
      }
      log.info('Astro Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Astro dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    await fs.access(tsdkPath)
    return { serverPath, tsdkPath }
  }
  catch {
    log.error({ serverPath, tsdkPath }, 'Astro LSP files not found after installation')
    return undefined
  }
}

/**
 * Astro Language Server
 */
export const AstroServer: LSPServerInfo = {
  id: 'astro',
  extensions: ['.astro'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('astro-ls')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'astro')
      return { process: proc }
    }

    // Setup dependencies
    const deps = await setupAstroDependencies()
    if (!deps) {
      log.error({ serverId: 'astro', root }, 'Astro LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(deps.serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'astro')
    return {
      process: proc,
      initialization: {
        typescript: {
          tsdk: deps.tsdkPath,
        },
      },
    }
  },
}

// =============================================================================
// YAML Language Server
// =============================================================================

/**
 * YAML Language Server runtime dependency configuration
 */
const YAML_RUNTIME_DEPS = {
  yamlLanguageServer: {
    package: 'yaml-language-server',
    version: '1.17.0',
  },
}

function getYamlResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'yaml-lsp')
}

async function setupYamlDependencies(): Promise<string | undefined> {
  const resourcesDir = getYamlResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `yaml-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = YAML_RUNTIME_DEPS.yamlLanguageServer.version

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing YAML Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${YAML_RUNTIME_DEPS.yamlLanguageServer.package}@${YAML_RUNTIME_DEPS.yamlLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'YAML npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write YAML version marker')
      }
      log.info('YAML Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install YAML dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'YAML LSP binary not found after installation')
    return undefined
  }
}

/**
 * YAML Language Server
 */
export const YamlServer: LSPServerInfo = {
  id: 'yaml',
  extensions: ['.yaml', '.yml'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('yaml-language-server')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'yaml')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupYamlDependencies()
    if (!serverPath) {
      log.error({ serverId: 'yaml', root }, 'YAML LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'yaml')
    return { process: proc }
  },
}

// =============================================================================
// Bash Language Server
// =============================================================================

/**
 * Bash Language Server runtime dependency configuration
 */
const BASH_RUNTIME_DEPS = {
  bashLanguageServer: {
    package: 'bash-language-server',
    version: '5.4.3',
  },
}

function getBashResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'bash-lsp')
}

async function setupBashDependencies(): Promise<string | undefined> {
  const resourcesDir = getBashResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `bash-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = BASH_RUNTIME_DEPS.bashLanguageServer.version

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing Bash Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${BASH_RUNTIME_DEPS.bashLanguageServer.package}@${BASH_RUNTIME_DEPS.bashLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Bash npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Bash version marker')
      }
      log.info('Bash Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Bash dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Bash LSP binary not found after installation')
    return undefined
  }
}

/**
 * Bash Language Server
 */
export const BashServer: LSPServerInfo = {
  id: 'bash',
  extensions: ['.sh', '.bash', '.zsh', '.ksh'],
  root: async (_file, projectPath) => projectPath,
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('bash-language-server')
    if (systemBin) {
      const proc = spawn(systemBin, ['start'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'bash')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupBashDependencies()
    if (!serverPath) {
      log.error({ serverId: 'bash', root }, 'Bash LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['start'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'bash')
    return { process: proc }
  },
}

// =============================================================================
// Dockerfile Language Server
// =============================================================================

/**
 * Dockerfile Language Server runtime dependency configuration
 */
const DOCKERFILE_RUNTIME_DEPS = {
  dockerfileLanguageServer: {
    package: 'dockerfile-language-server-nodejs',
    version: '0.13.0',
  },
}

function getDockerfileResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'dockerfile-lsp')
}

async function setupDockerfileDependencies(): Promise<string | undefined> {
  const resourcesDir = getDockerfileResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `docker-langserver${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.version

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing Dockerfile Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.package}@${DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Dockerfile npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Dockerfile version marker')
      }
      log.info('Dockerfile Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Dockerfile dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Dockerfile LSP binary not found after installation')
    return undefined
  }
}

/**
 * Dockerfile Language Server
 */
export const DockerfileServer: LSPServerInfo = {
  id: 'dockerfile',
  extensions: ['.dockerfile'],
  filenames: ['Dockerfile', 'Containerfile'],
  root: async (_file, projectPath) => projectPath,
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('docker-langserver')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'dockerfile')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupDockerfileDependencies()
    if (!serverPath) {
      log.error({ serverId: 'dockerfile', root }, 'Dockerfile LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'dockerfile')
    return { process: proc }
  },
}

// =============================================================================
// Rubocop (Ruby) Language Server
// =============================================================================

function getRubocopResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'rubocop-lsp')
}

/**
 * Rubocop (Ruby) Language Server
 * Uses gem install for auto-download
 */
export const RubocopServer: LSPServerInfo = {
  id: 'rubocop',
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  root: nearestRoot(['Gemfile', 'Gemfile.lock']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getRubocopResourcesDir()

    // Check PATH first (including our cache dir)
    let bin = Bun.which('rubocop', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisites
      const ruby = Bun.which('ruby')
      const gem = Bun.which('gem')
      if (!ruby || !gem) {
        log.warn('Ruby and gem are required for Rubocop. Install Ruby first.')
        return undefined
      }

      log.info('Installing Rubocop')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['gem', 'install', 'rubocop', '--bindir', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install rubocop')
        return undefined
      }

      bin = path.join(resourcesDir, `rubocop${ext}`)
      log.info({ bin }, 'Rubocop installed')
    }

    const proc = spawn(bin, ['--lsp'], { cwd: root })
    attachLSPProcessHandlers(proc, 'rubocop')
    return { process: proc }
  },
}

// =============================================================================
// ElixirLS Language Server
// =============================================================================

function getElixirLsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'elixir-lsp')
}

/**
 * ElixirLS Language Server
 * Auto-downloads and builds from GitHub
 */
export const ElixirLsServer: LSPServerInfo = {
  id: 'elixir-ls',
  extensions: ['.ex', '.exs'],
  root: nearestRoot(['mix.exs', 'mix.lock']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const scriptName = isWindows ? 'language_server.bat' : 'language_server.sh'
    const resourcesDir = getElixirLsResourcesDir()

    // Check system binary first
    let binary = Bun.which('elixir-ls')

    if (!binary) {
      // Check for existing installation by looking for versioned directories
      try {
        const entries = await fs.readdir(resourcesDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('elixir-ls-v')) {
            const candidate = path.join(resourcesDir, entry.name, 'release', scriptName)
            try {
              await fs.access(candidate)
              binary = candidate
              break
            }
            catch {
              // Binary not accessible in this directory, try next
            }
          }
        }
      }
      catch {
        // resourcesDir doesn't exist yet, will create during download
      }

      if (!binary) {
        // Need to download and build
        const elixir = Bun.which('elixir')
        if (!elixir) {
          log.warn('Elixir is required for ElixirLS. Install Elixir first.')
          return undefined
        }

        log.info('Downloading and building ElixirLS')
        await fs.mkdir(resourcesDir, { recursive: true })

        // Download from GitHub - using latest stable release
        const zipPath = path.join(resourcesDir, 'elixir-ls.zip')
        const releaseResponse = await fetch('https://api.github.com/repos/elixir-lsp/elixir-ls/releases/latest')
        if (!releaseResponse.ok) {
          log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch ElixirLS release info from GitHub')
          return undefined
        }
        const releaseInfo = await releaseResponse.json() as { tag_name: string }
        const releaseTag = releaseInfo.tag_name
        await downloadFile(`https://github.com/elixir-lsp/elixir-ls/archive/refs/tags/${releaseTag}.zip`, zipPath)
        await extractZip(zipPath, resourcesDir)
        await fs.rm(zipPath, { force: true })

        // Build with Mix (directory name matches tag without leading 'v')
        const buildDir = path.join(resourcesDir, `elixir-ls-${releaseTag}`)
        // Update binary path to use correct build directory
        binary = path.join(buildDir, 'release', scriptName)
        const buildProc = Bun.spawn(['mix', 'deps.get'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const depsExitCode = await buildProc.exited
        if (depsExitCode !== 0) {
          const stderr = await new Response(buildProc.stderr).text()
          log.error({ depsExitCode, stderr }, 'ElixirLS mix deps.get failed')
          return undefined
        }

        const compileProc = Bun.spawn(['mix', 'compile'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const compileExitCode = await compileProc.exited
        if (compileExitCode !== 0) {
          const stderr = await new Response(compileProc.stderr).text()
          log.error({ compileExitCode, stderr }, 'ElixirLS mix compile failed')
          return undefined
        }

        const releaseProc = Bun.spawn(['mix', 'elixir_ls.release2', '-o', 'release'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const releaseExitCode = await releaseProc.exited
        if (releaseExitCode !== 0) {
          const stderr = await new Response(releaseProc.stderr).text()
          log.error({ releaseExitCode, stderr }, 'ElixirLS mix release failed')
          return undefined
        }

        // Verify binary exists
        try {
          await fs.access(binary)
        }
        catch (err) {
          log.error({ binary, err }, 'ElixirLS binary not accessible after build')
          return undefined
        }

        if (!isWindows) {
          await fs.chmod(binary, 0o755)
        }

        log.info({ binary }, 'ElixirLS installed')
      }
    }

    const proc = spawn(binary, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'elixir-ls')
    return { process: proc }
  },
}

// =============================================================================
// Zls (Zig) Language Server
// =============================================================================

function getZlsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'zls-lsp')
}

/**
 * Zls (Zig) Language Server
 * Auto-downloads from GitHub releases
 */
export const ZlsServer: LSPServerInfo = {
  id: 'zls',
  extensions: ['.zig', '.zon'],
  root: nearestRoot(['build.zig']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getZlsResourcesDir()

    // Check PATH first
    let bin = Bun.which('zls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const zig = Bun.which('zig')
      if (!zig) {
        log.warn('Zig is required for ZLS. Install Zig first.')
        return undefined
      }

      log.info('Downloading ZLS from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      // Fetch latest release
      const releaseResponse = await fetch('https://api.github.com/repos/zigtools/zls/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch ZLS release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as { assets: Array<{ name: string, browser_download_url: string }> }

      // Map platform/arch
      const archMap: Record<string, string> = { arm64: 'aarch64', x64: 'x86_64', ia32: 'x86' }
      const platformMap: Record<string, string> = { darwin: 'macos', win32: 'windows', linux: 'linux' }
      const zlsArch = archMap[process.arch] || process.arch
      const zlsPlatform = platformMap[process.platform] || process.platform
      const archiveExt = isWindows ? 'zip' : 'tar.xz'

      const assetName = `zls-${zlsArch}-${zlsPlatform}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'ZLS asset not found for this platform')
        return undefined
      }

      // Download and extract
      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
        await extractZip(archivePath, resourcesDir)
      }
      else {
        const tarProc = Bun.spawn(['tar', '-xf', archivePath], {
          cwd: resourcesDir,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const tarExitCode = await tarProc.exited
        if (tarExitCode !== 0) {
          const stderr = await new Response(tarProc.stderr).text()
          log.error({ tarExitCode, stderr }, 'Failed to extract ZLS archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `zls${ext}`)

      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'ZLS binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'ZLS installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'zls')
    return { process: proc }
  },
}

// =============================================================================
// C# Language Server (csharp-ls)
// =============================================================================

function getCsharpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'csharp-lsp')
}

/**
 * C# Language Server (csharp-ls)
 * Uses dotnet tool install
 */
export const CsharpServer: LSPServerInfo = {
  id: 'csharp',
  extensions: ['.cs'],
  root: nearestRoot(['.sln', '.csproj', 'global.json']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getCsharpResourcesDir()

    // Check PATH first
    let bin = Bun.which('csharp-ls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const dotnet = Bun.which('dotnet')
      if (!dotnet) {
        log.warn('.NET SDK is required for csharp-ls. Install .NET SDK first.')
        return undefined
      }

      log.info('Installing csharp-ls via dotnet tool')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['dotnet', 'tool', 'install', 'csharp-ls', '--tool-path', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install csharp-ls')
        return undefined
      }

      bin = path.join(resourcesDir, `csharp-ls${ext}`)
      log.info({ bin }, 'csharp-ls installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'csharp')
    return { process: proc }
  },
}

// =============================================================================
// F# Language Server (fsautocomplete)
// =============================================================================

function getFsharpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'fsharp-lsp')
}

/**
 * F# Language Server (fsautocomplete)
 * Uses dotnet tool install
 */
export const FsharpServer: LSPServerInfo = {
  id: 'fsharp',
  extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
  root: nearestRoot(['.sln', '.fsproj', 'global.json']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getFsharpResourcesDir()

    // Check PATH first
    let bin = Bun.which('fsautocomplete', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const dotnet = Bun.which('dotnet')
      if (!dotnet) {
        log.warn('.NET SDK is required for fsautocomplete. Install .NET SDK first.')
        return undefined
      }

      log.info('Installing fsautocomplete via dotnet tool')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['dotnet', 'tool', 'install', 'fsautocomplete', '--tool-path', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install fsautocomplete')
        return undefined
      }

      bin = path.join(resourcesDir, `fsautocomplete${ext}`)
      log.info({ bin }, 'fsautocomplete installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'fsharp')
    return { process: proc }
  },
}

// =============================================================================
// SourceKit (Swift) Language Server
// =============================================================================

/**
 * SourceKit (Swift) Language Server
 * System-only, comes with Swift toolchain or Xcode
 */
export const SourceKitServer: LSPServerInfo = {
  id: 'sourcekit',
  extensions: ['.swift'],
  root: nearestRoot(['Package.swift']),
  async spawn(root) {
    // Check PATH first
    let bin = Bun.which('sourcekit-lsp')

    if (!bin) {
      // macOS fallback: use xcrun
      if (process.platform === 'darwin' && Bun.which('xcrun')) {
        try {
          const proc = Bun.spawn(['xcrun', '--find', 'sourcekit-lsp'], {
            stdout: 'pipe',
            stderr: 'pipe',
          })
          const exitCode = await proc.exited
          if (exitCode === 0) {
            bin = (await new Response(proc.stdout).text()).trim()
          }
        }
        catch {
          // xcrun failed
        }
      }

      if (!bin) {
        log.warn('sourcekit-lsp not found. Install Swift toolchain or Xcode.')
        return undefined
      }
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'sourcekit')
    return { process: proc }
  },
}

// =============================================================================
// Clangd (C/C++) Language Server
// =============================================================================

function getClangdResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'clangd-lsp')
}

/**
 * Clangd (C/C++) Language Server
 * Auto-downloads from GitHub releases
 */
export const ClangdServer: LSPServerInfo = {
  id: 'clangd',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'],
  root: nearestRoot(['compile_commands.json', 'compile_flags.txt', '.clangd', 'CMakeLists.txt', 'Makefile']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getClangdResourcesDir()
    const args = ['--background-index', '--clang-tidy']

    // Check PATH first
    let bin = Bun.which('clangd')
    if (bin) {
      const proc = spawn(bin, args, { cwd: root })
      attachLSPProcessHandlers(proc, 'clangd')
      return { process: proc }
    }

    // Check extracted directories (clangd is always in versioned subdirectory like clangd_18.1.3/bin/)
    try {
      const entries = await fs.readdir(resourcesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('clangd_'))
          continue
        const candidate = path.join(resourcesDir, entry.name, 'bin', `clangd${ext}`)
        try {
          await fs.access(candidate)
          const proc = spawn(candidate, args, { cwd: root })
          attachLSPProcessHandlers(proc, 'clangd')
          return { process: proc }
        }
        catch {
          continue
        }
      }
    }
    catch {
      // resourcesDir doesn't exist yet
    }

    // Download from GitHub releases
    log.info('Downloading clangd from GitHub releases')
    await fs.mkdir(resourcesDir, { recursive: true })

    const releaseResponse = await fetch('https://api.github.com/repos/clangd/clangd/releases/latest')
    if (!releaseResponse.ok) {
      log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch clangd release info from GitHub')
      return undefined
    }

    const release = await releaseResponse.json() as {
      tag_name: string
      assets: Array<{ name: string, browser_download_url: string }>
    }

    const tag = release.tag_name
    const platformTokens: Record<string, string> = {
      darwin: 'mac',
      linux: 'linux',
      win32: 'windows',
    }
    const token = platformTokens[process.platform]
    if (!token) {
      log.error({ platform: process.platform }, 'Unsupported platform for clangd')
      return undefined
    }

    const asset = release.assets.find(a =>
      a.name.includes(token) && a.name.includes(tag),
    )
    if (!asset) {
      log.error({ tag, platform: process.platform }, 'clangd asset not found')
      return undefined
    }

    const archivePath = path.join(resourcesDir, asset.name)
    await downloadFile(asset.browser_download_url, archivePath)

    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, resourcesDir)
    }
    else {
      const tarProc = Bun.spawn(['tar', '-xf', archivePath], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const tarExitCode = await tarProc.exited
      if (tarExitCode !== 0) {
        const stderr = await new Response(tarProc.stderr).text()
        log.error({ tarExitCode, stderr }, 'Failed to extract clangd archive')
        await fs.rm(archivePath, { force: true })
        return undefined
      }
    }

    await fs.rm(archivePath, { force: true })

    bin = path.join(resourcesDir, `clangd_${tag}`, 'bin', `clangd${ext}`)
    try {
      await fs.access(bin)
    }
    catch {
      log.error({ bin }, 'clangd binary not found after extraction')
      return undefined
    }

    if (!isWindows) {
      await fs.chmod(bin, 0o755)
    }

    log.info({ bin }, 'clangd installed')

    const proc = spawn(bin, args, { cwd: root })
    attachLSPProcessHandlers(proc, 'clangd')
    return { process: proc }
  },
}

// =============================================================================
// JDTLS (Java) Language Server
// =============================================================================

function getJdtlsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'jdtls-lsp')
}

/**
 * JDTLS (Java) Language Server
 * Auto-downloads from Eclipse
 */
export const JdtlsServer: LSPServerInfo = {
  id: 'jdtls',
  extensions: ['.java'],
  root: nearestRoot(['pom.xml', 'build.gradle', 'build.gradle.kts', '.project', '.classpath']),
  async spawn(root) {
    const resourcesDir = getJdtlsResourcesDir()

    // Check prerequisite
    const java = Bun.which('java')
    if (!java) {
      log.warn('Java 21 or newer is required for JDTLS. Install Java first.')
      return undefined
    }

    // Check Java version
    const versionProc = Bun.spawn(['java', '-version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await versionProc.exited
    const versionOutput = await new Response(versionProc.stderr).text()
    // Match various Java version formats:
    // - openjdk version "21.0.2" 2024-01-16
    // - java version "21.0.2" 2024-01-16 LTS
    // - version "21" (short format)
    const versionMatch = /version\s+"?(\d+)(?:\.\d+)*"?/.exec(versionOutput)
    const majorVersion = versionMatch && versionMatch[1] ? Number.parseInt(versionMatch[1]) : 0

    if (majorVersion < 21) {
      log.warn({ version: majorVersion }, 'JDTLS requires Java 21 or newer')
      return undefined
    }

    const distPath = path.join(resourcesDir, 'jdtls')
    const launcherDir = path.join(distPath, 'plugins')

    // Check if installed
    try {
      await fs.access(launcherDir)
    }
    catch {
      log.info('Downloading JDTLS from Eclipse')
      await fs.mkdir(distPath, { recursive: true })

      // Use specific milestone version for stability
      const JDTLS_VERSION = '1.40.0'
      const JDTLS_TIMESTAMP = '202409261450'
      const archivePath = path.join(distPath, 'release.tar.gz')
      const downloadUrl = `https://download.eclipse.org/jdtls/milestones/${JDTLS_VERSION}/jdt-language-server-${JDTLS_VERSION}-${JDTLS_TIMESTAMP}.tar.gz`
      await downloadFile(downloadUrl, archivePath)

      const extractProc = Bun.spawn(['tar', '-xzf', archivePath], {
        cwd: distPath,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const extractExitCode = await extractProc.exited
      if (extractExitCode !== 0) {
        const stderr = await new Response(extractProc.stderr).text()
        log.error({ extractExitCode, stderr }, 'Failed to extract JDTLS archive')
        await fs.rm(archivePath, { force: true })
        return undefined
      }

      await fs.rm(archivePath, { force: true })
      log.info('JDTLS installed')
    }

    // Find launcher JAR using fs.readdir (cross-platform)
    let files: string[]
    try {
      files = await fs.readdir(launcherDir)
    }
    catch {
      log.error({ launcherDir }, 'Failed to read JDTLS launcher directory')
      return undefined
    }
    const jarFileName = files.find(f => f.startsWith('org.eclipse.equinox.launcher_') && f.endsWith('.jar'))
    if (!jarFileName) {
      log.error('JDTLS launcher JAR not found')
      return undefined
    }

    const launcherJar = path.join(launcherDir, jarFileName)

    // Get platform-specific config
    const configMap: Record<string, string> = {
      darwin: 'config_mac',
      linux: 'config_linux',
      win32: 'config_windows',
    }
    const configFile = path.join(distPath, configMap[process.platform] || 'config_linux')

    // Create temp data directory
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dora-jdtls-data'))

    const proc = spawn(java, [
      '-jar',
      launcherJar,
      '-configuration',
      configFile,
      '-data',
      dataDir,
      '-Declipse.application=org.eclipse.jdt.ls.core.id1',
      '-Dosgi.bundles.defaultStartLevel=4',
      '-Declipse.product=org.eclipse.jdt.ls.core.product',
      '-Dlog.level=ALL',
      '--add-modules=ALL-SYSTEM',
      '--add-opens',
      'java.base/java.util=ALL-UNNAMED',
      '--add-opens',
      'java.base/java.lang=ALL-UNNAMED',
    ], { cwd: root })

    attachLSPProcessHandlers(proc, 'jdtls')
    return { process: proc }
  },
}

// =============================================================================
// LuaLS (Lua) Language Server
// =============================================================================

function getLuaLsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'lua-lsp')
}

/**
 * LuaLS (Lua) Language Server
 * Auto-downloads from GitHub releases
 */
export const LuaLsServer: LSPServerInfo = {
  id: 'lua-ls',
  extensions: ['.lua'],
  root: nearestRoot([
    '.luarc.json',
    '.luarc.jsonc',
    '.luacheckrc',
    '.stylua.toml',
    'stylua.toml',
    'selene.toml',
    'selene.yml',
  ]),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getLuaLsResourcesDir()

    // Check PATH first
    let bin = Bun.which('lua-language-server', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      log.info('Downloading lua-language-server from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/LuaLS/lua-language-server/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch lua-language-server release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      // LuaLS uses platform/arch naming that matches Node.js convention
      // darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64
      const platform = process.platform
      const arch = process.arch
      const archiveExt = isWindows ? 'zip' : 'tar.gz'

      // Remove 'v' prefix from tag if present (tag is v3.13.5, asset uses 3.13.5)
      const version = release.tag_name.replace(/^v/, '')

      const assetName = `lua-language-server-${version}-${platform}-${arch}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName, availableAssets: release.assets.map(a => a.name).slice(0, 10) }, 'lua-language-server asset not found for this platform')
        return undefined
      }

      const installDir = path.join(resourcesDir, `lua-language-server-${arch}-${platform}`)

      // Remove old installation
      try {
        await fs.rm(installDir, { force: true, recursive: true })
      }
      catch {
        // Directory doesn't exist
      }
      await fs.mkdir(installDir, { recursive: true })

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
        await extractZip(archivePath, installDir)
      }
      else {
        const tarProc = Bun.spawn(['tar', '-xzf', archivePath, '-C', installDir], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const tarExitCode = await tarProc.exited
        if (tarExitCode !== 0) {
          const stderr = await new Response(tarProc.stderr).text()
          log.error({ tarExitCode, stderr }, 'Failed to extract lua-language-server archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      bin = path.join(installDir, 'bin', `lua-language-server${ext}`)
      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'lua-language-server binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'lua-language-server installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'lua-ls')
    return { process: proc }
  },
}

// =============================================================================
// PHP Intelephense Language Server
// =============================================================================

/**
 * PHP Intelephense runtime dependency configuration
 */
const PHP_RUNTIME_DEPS = {
  intelephense: {
    package: 'intelephense',
    version: '1.13.0',
  },
}

function getPhpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'php-lsp')
}

async function setupPhpDependencies(): Promise<string | undefined> {
  const resourcesDir = getPhpResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `intelephense${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = PHP_RUNTIME_DEPS.intelephense.version

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing PHP Intelephense')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${PHP_RUNTIME_DEPS.intelephense.package}@${PHP_RUNTIME_DEPS.intelephense.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'PHP npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write PHP version marker')
      }
      log.info('PHP Intelephense installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install PHP dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'PHP LSP binary not found after installation')
    return undefined
  }
}

/**
 * PHP Intelephense Language Server
 */
export const PhpServer: LSPServerInfo = {
  id: 'php',
  extensions: ['.php'],
  root: nearestRoot(['composer.json', 'composer.lock', '.php-version']),
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('intelephense')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'php')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupPhpDependencies()
    if (!serverPath) {
      log.error({ serverId: 'php', root }, 'PHP LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'php')
    return { process: proc }
  },
}

// =============================================================================
// OCaml Language Server
// =============================================================================

/**
 * OCaml Language Server (ocamllsp)
 * System-only, must be installed via opam
 */
export const OcamlServer: LSPServerInfo = {
  id: 'ocaml',
  extensions: ['.ml', '.mli'],
  root: nearestRoot(['dune-project', 'dune-workspace', '.merlin', 'opam']),
  async spawn(root) {
    const bin = Bun.which('ocamllsp')
    if (!bin) {
      log.warn('ocamllsp not found. Install with: opam install ocaml-lsp-server')
      return undefined
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'ocaml')
    return { process: proc }
  },
}

// =============================================================================
// TerraformLS Language Server
// =============================================================================

function getTerraformResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'terraform-lsp')
}

/**
 * TerraformLS Language Server
 * Auto-downloads from GitHub releases
 */
export const TerraformServer: LSPServerInfo = {
  id: 'terraform',
  extensions: ['.tf', '.tfvars'],
  root: nearestRoot(['.terraform.lock.hcl', 'terraform.tfstate']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getTerraformResourcesDir()

    // Check PATH first
    let bin = Bun.which('terraform-ls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      log.info('Downloading terraform-ls from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/hashicorp/terraform-ls/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch terraform-ls release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      const version = release.tag_name.replace('v', '')
      const tfArch = process.arch === 'arm64' ? 'arm64' : 'amd64'
      const tfPlatform = isWindows ? 'windows' : process.platform

      const assetName = `terraform-ls_${version}_${tfPlatform}_${tfArch}.zip`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'terraform-ls asset not found')
        return undefined
      }

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)
      await extractZip(archivePath, resourcesDir)
      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `terraform-ls${ext}`)
      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'terraform-ls binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'terraform-ls installed')
    }

    const proc = spawn(bin, ['serve'], { cwd: root })
    attachLSPProcessHandlers(proc, 'terraform')
    return {
      process: proc,
      initialization: {
        experimentalFeatures: {
          prefillRequiredFields: true,
          validateOnSave: true,
        },
      },
    }
  },
}

// =============================================================================
// TexLab (LaTeX) Language Server
// =============================================================================

function getTexlabResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'texlab-lsp')
}

/**
 * TexLab (LaTeX) Language Server
 * Auto-downloads from GitHub releases
 */
export const TexlabServer: LSPServerInfo = {
  id: 'texlab',
  extensions: ['.tex', '.bib'],
  root: nearestRoot(['.latexmkrc', 'latexmkrc', '.texlabroot', 'texlabroot']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getTexlabResourcesDir()

    // Check PATH first
    let bin = Bun.which('texlab', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      log.info('Downloading texlab from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/latex-lsp/texlab/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch texlab release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      const texArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
      const texPlatform = process.platform === 'darwin' ? 'macos' : isWindows ? 'windows' : 'linux'
      const archiveExt = isWindows ? 'zip' : 'tar.gz'

      const assetName = `texlab-${texArch}-${texPlatform}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'texlab asset not found')
        return undefined
      }

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
        await extractZip(archivePath, resourcesDir)
      }
      else {
        const tarProc = Bun.spawn(['tar', '-xzf', archivePath], {
          cwd: resourcesDir,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const tarExitCode = await tarProc.exited
        if (tarExitCode !== 0) {
          const stderr = await new Response(tarProc.stderr).text()
          log.error({ tarExitCode, stderr }, 'Failed to extract texlab archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `texlab${ext}`)
      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'texlab binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'texlab installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'texlab')
    return { process: proc }
  },
}

// =============================================================================
// Gleam Language Server
// =============================================================================

/**
 * Gleam Language Server
 * System-only, must be installed globally
 */
export const GleamServer: LSPServerInfo = {
  id: 'gleam',
  extensions: ['.gleam'],
  root: nearestRoot(['gleam.toml']),
  async spawn(root) {
    const bin = Bun.which('gleam')
    if (!bin) {
      log.warn('gleam not found. Install Gleam first.')
      return undefined
    }

    const proc = spawn(bin, ['lsp'], { cwd: root })
    attachLSPProcessHandlers(proc, 'gleam')
    return { process: proc }
  },
}

/**
 * All available LSP servers
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  VueServer, // Vue before TypeScript for .vue files
  SvelteServer, // Svelte before TypeScript for .svelte files
  AstroServer, // Astro before TypeScript for .astro files
  TypescriptServer,
  BiomeServer, // Biome after TypeScript for linting
  OxlintServer,
  EslintServer, // ESLint after OxlintServer for JS/TS linting
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
  KotlinServer,
  DartServer,
  PrismaServer,
  YamlServer,
  BashServer,
  DockerfileServer,
  RubocopServer,
  ElixirLsServer,
  ZlsServer,
  CsharpServer,
  FsharpServer,
  SourceKitServer,
  ClangdServer,
  JdtlsServer,
  LuaLsServer,
  PhpServer,
  OcamlServer,
  TerraformServer,
  TexlabServer,
  GleamServer,
]

/**
 * Get server info by ID
 */
export function getServerById(id: string): LSPServerInfo | undefined {
  return LSP_SERVERS.find(s => s.id === id)
}

/**
 * Get servers that support a file extension
 */
export function getServersForExtension(extension: string): LSPServerInfo[] {
  return LSP_SERVERS.filter(s => s.extensions.includes(extension))
}

/**
 * Get servers that support a specific filename (for files like Dockerfile, Makefile)
 */
export function getServersForFilename(filename: string): LSPServerInfo[] {
  return LSP_SERVERS.filter(s => s.filenames?.includes(filename))
}

/**
 * Get servers that support a file by checking both extension and filename
 */
export function getServersForFile(filePath: string): LSPServerInfo[] {
  const ext = path.extname(filePath)
  const filename = path.basename(filePath)

  const byExtension = ext ? getServersForExtension(ext) : []
  const byFilename = getServersForFilename(filename)

  // Combine and deduplicate
  const serverIds = new Set<string>()
  const result: LSPServerInfo[] = []

  for (const server of [...byExtension, ...byFilename]) {
    if (!serverIds.has(server.id)) {
      serverIds.add(server.id)
      result.push(server)
    }
  }

  return result
}
