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
    console.warn(`[lsp] Downloading ${url}...`)
    await downloadFile(url, tempFile)
    console.warn(`[lsp] Extracting to ${destDir}...`)
    await extractZip(tempFile, destDir)
    console.warn(`[lsp] Download complete`)
  }
  finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
      console.warn(`[lsp] Failed to cleanup temp directory ${tempDir}:`, err instanceof Error ? err.message : err)
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
  proc.on('error', (err) => {
    console.error(`[${serverId}] LSP process error:`, err)
  })

  proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[${serverId}] LSP exited with code ${code}`)
    }
    if (signal) {
      console.error(`[${serverId}] LSP killed by signal ${signal}`)
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
          catch {
            // Not found, continue
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
        catch {
          // Not found, continue
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
      const proc = spawn('bunx', ['typescript-language-server', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      return { process: proc }
    }

    const proc = spawn(tsserver, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
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
        catch {
          // Not found
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
      const proc = spawn('bunx', ['pyright-langserver', '--stdio'], {
        cwd: root,
      })
      return { process: proc }
    }

    const proc = spawn(pyright, ['--stdio'], {
      cwd: root,
    })
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
          console.error(`[oxlint] Cannot access local binary at ${localBin}:`, err)
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
        console.warn(
          `[oxlint] Binary at ${lintBin} failed --help (exit ${exitCode}): ${stderr.slice(0, 200)}`,
        )
      }
      else {
        const help = await new Response(proc.stdout).text()
        if (help.includes('--lsp')) {
          return {
            process: spawn(lintBin, ['--lsp'], {
              cwd: root,
            }),
          }
        }
      }
    }

    // Fallback to oxc_language_server
    const serverBin = await resolveBin('oxc_language_server')
    if (serverBin) {
      return {
        process: spawn(serverBin, [], {
          cwd: root,
        }),
      }
    }

    // Neither found - log diagnostic
    console.warn(
      `[oxlint] Could not start oxlint LSP server for ${root}. `
      + `Install with: npm install -D oxlint`,
    )
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
    console.warn(`[kotlin] Unsupported platform: ${platformId}`)
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
      console.error(`[kotlin] Cannot access Java at ${javaPath}:`, err instanceof Error ? err.message : err)
      return undefined
    }

    // Java not found, download it
    console.warn(`[kotlin] Downloading Java 21 for ${platformId}...`)
    try {
      await downloadAndExtract(javaConfig.url, javaDir)

      // Make Java executable on Unix platforms
      if (!platformId.startsWith('win-')) {
        try {
          await fs.chmod(javaPath, 0o755)
        }
        catch (chmodErr) {
          console.error(`[kotlin] Failed to make Java executable at ${javaPath}:`, chmodErr instanceof Error ? chmodErr.message : chmodErr)
          return undefined
        }
      }
    }
    catch (err) {
      console.error(`[kotlin] Failed to download Java:`, err)
      return undefined
    }
  }

  // Verify Java exists
  try {
    await fs.access(javaPath)
  }
  catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[kotlin] Java executable not accessible at ${javaPath}: ${errorMsg}`)
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
      console.error(`[kotlin] Cannot access Kotlin LSP at ${kotlinLspPath}:`, err instanceof Error ? err.message : err)
      return undefined
    }

    // Kotlin LSP not found, download it
    console.warn(`[kotlin] Downloading Kotlin Language Server...`)
    try {
      await downloadAndExtract(KOTLIN_RUNTIME_DEPS.kotlinLsp.url, resourcesDir)

      // Make script executable on Unix platforms
      if (!isWindows) {
        try {
          await fs.chmod(kotlinLspPath, 0o755)
        }
        catch (chmodErr) {
          console.error(`[kotlin] Failed to make Kotlin LSP executable at ${kotlinLspPath}:`, chmodErr instanceof Error ? chmodErr.message : chmodErr)
          return undefined
        }
      }
    }
    catch (err) {
      console.error(`[kotlin] Failed to download Kotlin LSP:`, err)
      return undefined
    }
  }

  // Verify Kotlin LSP exists
  try {
    await fs.access(kotlinLspPath)
  }
  catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[kotlin] Kotlin LSP script not accessible at ${kotlinLspPath}: ${errorMsg}`)
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
      console.warn(`[kotlin] Unsupported platform: ${process.platform}-${process.arch}`)
      return undefined
    }

    // Setup dependencies (downloads if needed)
    const deps = await setupKotlinDependencies(platformId)
    if (!deps) {
      console.warn(`[kotlin] Failed to setup Kotlin LSP dependencies. Check previous logs for details.`)
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
      console.error(`[kotlin] Failed to spawn Kotlin LSP:`, err)
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
    console.warn(`[dart] Unsupported platform: ${platformId}`)
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
      console.error(`[dart] Cannot access Dart at ${dartPath}:`, err instanceof Error ? err.message : err)
      return undefined
    }

    // Dart not found, download it
    console.warn(`[dart] Downloading Dart SDK ${DART_RUNTIME_DEPS.version} for ${platformId}...`)
    try {
      await downloadAndExtract(config.url, resourcesDir)

      // Make dart executable on Unix platforms
      if (!platformId.startsWith('win-')) {
        try {
          await fs.chmod(dartPath, 0o755)
        }
        catch (chmodErr) {
          console.error(`[dart] Failed to make Dart executable at ${dartPath}:`, chmodErr instanceof Error ? chmodErr.message : chmodErr)
          return undefined
        }
      }
    }
    catch (downloadErr) {
      console.error(`[dart] Failed to download Dart SDK:`, downloadErr)
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
    console.error(`[dart] Dart executable not accessible at ${dartPath}: ${errorMsg}`)
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
        console.warn(`[dart] Failed to spawn system Dart LSP, trying auto-download:`, err)
      }
    }

    // Fallback to auto-download
    const platformId = getPlatformId()
    if (!platformId) {
      console.warn(`[dart] Unsupported platform: ${process.platform}-${process.arch}`)
      return undefined
    }

    const dartPath = await setupDartDependencies(platformId)
    if (!dartPath) {
      console.warn(`[dart] Failed to setup Dart SDK. Check previous logs for details.`)
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
      console.error(`[dart] Failed to spawn Dart LSP:`, err)
      return undefined
    }
  },
}

// =============================================================================
// Vue Language Server
// =============================================================================

/**
 * Vue LSP runtime dependency configuration
 * Uses @vue/language-server with hybrid mode and companion TypeScript server
 */
const VUE_RUNTIME_DEPS = {
  version: '2.2.0',
  dependencies: {
    '@vue/language-server': '2.2.0',
    '@vue/typescript-plugin': '2.2.0',
    'typescript-language-server': '4.3.3',
    'typescript': '5.7.2',
  },
}

/**
 * Get the Vue LSP resources directory
 */
function getVueResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'vue-lsp')
}

/**
 * Setup Vue runtime dependencies using npm
 * Installs to ~/.cache/dora/vue-lsp/ if not already present
 */
async function setupVueDependencies(): Promise<string | undefined> {
  const resourcesDir = getVueResourcesDir()
  const packageJsonPath = path.join(resourcesDir, 'package.json')

  try {
    // Check if package.json exists (indicator that npm install has been run)
    await fs.access(packageJsonPath)

    // Verify node_modules exists and has required packages
    const vueServerPath = path.join(resourcesDir, 'node_modules', '@vue', 'language-server')
    await fs.access(vueServerPath)

    return resourcesDir
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      console.error(`[vue] Cannot access Vue LSP at ${resourcesDir}:`, err instanceof Error ? err.message : err)
      return undefined
    }

    // Vue dependencies not found, install them
    console.warn(`[vue] Setting up Vue Language Server dependencies at ${resourcesDir}...`)

    try {
      await fs.mkdir(resourcesDir, { recursive: true })

      // Create minimal package.json
      const packageJson = {
        name: 'dora-vue-lsp',
        version: VUE_RUNTIME_DEPS.version,
        private: true,
        dependencies: VUE_RUNTIME_DEPS.dependencies,
      }

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))

      // Run npm install
      console.warn(`[vue] Running npm install...`)
      const proc = await Bun.spawn(['npm', 'install', '--omit=optional'], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        console.error(`[vue] npm install failed (exit ${exitCode}): ${stderr}`)
        return undefined
      }

      console.warn(`[vue] Vue Language Server dependencies installed successfully`)
      return resourcesDir
    }
    catch (err) {
      console.error(`[vue] Failed to setup Vue dependencies:`, err)
      return undefined
    }
  }
}

/**
 * Vue Language Server
 * Uses @vue/language-server with Full Hybrid Mode
 * Spawns dual servers: Vue LS + companion TypeScript LS
 */
export const VueServer: LSPServerInfo = {
  id: 'vue',
  extensions: ['.vue'],
  root: nearestRoot(['package.json', 'tsconfig.json']),
  async spawn(root) {
    // Setup dependencies first
    const resourcesDir = await setupVueDependencies()
    if (!resourcesDir) {
      console.warn(`[vue] Failed to setup Vue LSP dependencies. Check previous logs for details.`)
      return undefined
    }

    try {
      const vueServerPath = path.join(resourcesDir, 'node_modules', '.bin', 'vue-language-server')
      const proc = spawn(vueServerPath, ['--stdio'], {
        cwd: root,
        env: {
          ...process.env,
          // Enable Vue LSP hybrid mode via environment variable if needed
          VUE_HYBRID_MODE: 'true',
        },
      })

      attachLSPProcessHandlers(proc, 'vue')
      return { process: proc }
    }
    catch (err) {
      console.error(`[vue] Failed to spawn Vue LSP:`, err)
      return undefined
    }
  },
}

/**
 * All available LSP servers
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  TypescriptServer,
  OxlintServer,
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
  KotlinServer,
  DartServer,
  VueServer,
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
