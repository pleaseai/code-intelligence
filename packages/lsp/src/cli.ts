#!/usr/bin/env bun
/**
 * LSP CLI - Setup and management for language servers
 *
 * Commands:
 *   lsp setup <server>    Setup/download a language server
 *   lsp version           Show version
 *   lsp help              Show help
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createLogger } from '@pleaseai/logger'
import { downloadAndExtract, getPlatformId } from './server/utils'

const log = createLogger('lsp-cli')

const VERSION = '0.1.6'

/**
 * Kotlin LSP setup configuration
 */
const KOTLIN_CONFIG = {
  version: '0.253.10629',
  lspUrl: 'https://download-cdn.jetbrains.com/kotlin-lsp/0.253.10629/kotlin-0.253.10629.zip',
  java: {
    'win-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-win32-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-win32-x86_64',
    },
    'linux-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-linux-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-linux-x86_64',
    },
    'linux-arm64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-linux-arm64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-linux-aarch64',
    },
    'osx-x64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-darwin-x64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-macosx-x86_64',
    },
    'osx-arm64': {
      url: 'https://github.com/redhat-developer/vscode-java/releases/download/v1.42.0/java-darwin-arm64-1.42.0-561.vsix',
      javaHomePath: 'extension/jre/21.0.7-macosx-aarch64',
    },
  } as Record<string, { url: string, javaHomePath: string }>,
}

/**
 * Dart SDK setup configuration
 */
const DART_CONFIG = {
  version: '3.7.1',
  platforms: {
    'win-x64': 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-windows-x64-release.zip',
    'linux-x64': 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-linux-x64-release.zip',
    'linux-arm64': 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-linux-arm64-release.zip',
    'osx-x64': 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-macos-x64-release.zip',
    'osx-arm64': 'https://storage.googleapis.com/dart-archive/channels/stable/release/3.7.1/sdk/dartsdk-macos-arm64-release.zip',
  } as Record<string, string>,
}

async function setupKotlin(): Promise<void> {
  const platformId = getPlatformId()
  if (!platformId) {
    console.error(`Unsupported platform: ${process.platform} ${process.arch}`)
    process.exit(1)
  }

  const javaConfig = KOTLIN_CONFIG.java[platformId]
  if (!javaConfig) {
    console.error(`Unsupported platform for Kotlin: ${platformId}`)
    process.exit(1)
  }

  const cacheDir = path.join(os.homedir(), '.cache', 'dora', 'kotlin-lsp')
  const javaDir = path.join(cacheDir, 'java')
  const isWindows = platformId.startsWith('win-')
  const kotlinLspScript = isWindows ? 'kotlin-lsp.cmd' : 'kotlin-lsp.sh'
  const kotlinLspPath = path.join(cacheDir, kotlinLspScript)
  const javaPath = path.join(javaDir, javaConfig.javaHomePath, 'bin', isWindows ? 'java.exe' : 'java')
  const versionFile = path.join(cacheDir, '.version')

  console.log(`Setting up Kotlin LSP for ${platformId}...`)
  console.log(`Cache directory: ${cacheDir}`)

  // Create cache directory
  await fs.mkdir(cacheDir, { recursive: true })

  // Download Java if needed
  try {
    await fs.access(javaPath)
    console.log('Java 21 already installed')
  }
  catch {
    console.log('Downloading Java 21...')
    await downloadAndExtract(javaConfig.url, javaDir)
    if (!isWindows) {
      await fs.chmod(javaPath, 0o755)
    }
    console.log('Java 21 installed')
  }

  // Download Kotlin LSP if needed
  try {
    await fs.access(kotlinLspPath)
    console.log('Kotlin LSP already installed')
  }
  catch {
    console.log('Downloading Kotlin LSP...')
    await downloadAndExtract(KOTLIN_CONFIG.lspUrl, cacheDir)
    if (!isWindows) {
      await fs.chmod(kotlinLspPath, 0o755)
    }
    console.log('Kotlin LSP installed')
  }

  // Write version file
  await fs.writeFile(versionFile, KOTLIN_CONFIG.version)

  console.log('')
  console.log('Kotlin LSP setup complete!')
  console.log(`  LSP script: ${kotlinLspPath}`)
  console.log(`  Java home: ${path.join(javaDir, javaConfig.javaHomePath)}`)
}

async function setupDart(): Promise<void> {
  const platformId = getPlatformId()
  if (!platformId) {
    console.error(`Unsupported platform: ${process.platform} ${process.arch}`)
    process.exit(1)
  }

  const dartUrl = DART_CONFIG.platforms[platformId]
  if (!dartUrl) {
    console.error(`Unsupported platform for Dart: ${platformId}`)
    process.exit(1)
  }

  const cacheDir = path.join(os.homedir(), '.cache', 'dora', 'dart-lsp')
  const isWindows = platformId.startsWith('win-')
  const dartPath = path.join(cacheDir, 'dart-sdk', 'bin', isWindows ? 'dart.exe' : 'dart')
  const versionFile = path.join(cacheDir, '.version')

  console.log(`Setting up Dart SDK for ${platformId}...`)
  console.log(`Cache directory: ${cacheDir}`)

  // Create cache directory
  await fs.mkdir(cacheDir, { recursive: true })

  // Download Dart SDK if needed
  try {
    await fs.access(dartPath)
    console.log('Dart SDK already installed')
  }
  catch {
    console.log('Downloading Dart SDK...')
    await downloadAndExtract(dartUrl, cacheDir)
    if (!isWindows) {
      await fs.chmod(dartPath, 0o755)
    }
    console.log('Dart SDK installed')
  }

  // Write version file
  await fs.writeFile(versionFile, DART_CONFIG.version)

  console.log('')
  console.log('Dart SDK setup complete!')
  console.log(`  Dart binary: ${dartPath}`)
}

function versionCommand(): void {
  console.log(`@pleaseai/code-lsp ${VERSION}`)
}

function helpCommand(): void {
  console.log(`
@pleaseai/code-lsp - Language Server Protocol client and setup

Usage:
  lsp <command> [options]

Commands:
  setup <server>    Setup/download a language server
                    Supported servers: kotlin, dart
  version           Show version
  help              Show this help

Examples:
  lsp setup kotlin  Download and setup Kotlin LSP
  lsp setup dart    Download and setup Dart SDK
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'setup': {
      const server = args[1]
      if (!server) {
        console.error('Usage: lsp setup <server>')
        console.error('Supported servers: kotlin, dart')
        process.exit(1)
      }

      switch (server.toLowerCase()) {
        case 'kotlin':
          await setupKotlin()
          break
        case 'dart':
          await setupDart()
          break
        default:
          console.error(`Unknown server: ${server}`)
          console.error('Supported servers: kotlin, dart')
          process.exit(1)
      }
      break
    }

    case 'version':
    case '-v':
    case '--version':
      versionCommand()
      break

    case 'help':
    case '-h':
    case '--help':
    case undefined:
      helpCommand()
      break

    default:
      console.error(`Unknown command: ${command}`)
      helpCommand()
      process.exit(1)
  }
}

main().catch((error) => {
  log.fatal({ err: error }, 'Unhandled error')
  process.exit(1)
})
