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

/**
 * All available LSP servers
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  VueServer, // Vue before TypeScript for .vue files
  TypescriptServer,
  OxlintServer,
  EslintServer, // ESLint after OxlintServer for JS/TS linting
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
  KotlinServer,
  DartServer,
  PrismaServer,
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
