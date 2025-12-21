/**
 * Kotlin Language Server
 * Uses official JetBrains Kotlin LSP with auto-download
 */

import type { LSPServerInfo, PlatformId } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadAndExtract, getPlatformId, log, nearestRoot } from './utils'

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
