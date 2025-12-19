/**
 * Constants for ast-grep provider
 */

import * as os from 'os'
import * as path from 'path'
import type { PlatformConfig, PlatformId } from './types'

// CLI supported languages (25 total)
export const CLI_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'elixir',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'nix',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'solidity',
  'swift',
  'typescript',
  'tsx',
  'yaml',
] as const

// NAPI supported languages (5 total - native bindings)
export const NAPI_LANGUAGES = ['html', 'javascript', 'tsx', 'css', 'typescript'] as const

// Language to file extensions mapping
export const LANG_EXTENSIONS: Record<string, string[]> = {
  bash: ['.bash', '.sh', '.zsh', '.bats'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
  csharp: ['.cs'],
  css: ['.css'],
  elixir: ['.ex', '.exs'],
  go: ['.go'],
  haskell: ['.hs', '.lhs'],
  html: ['.html', '.htm'],
  java: ['.java'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  json: ['.json'],
  kotlin: ['.kt', '.kts'],
  lua: ['.lua'],
  nix: ['.nix'],
  php: ['.php'],
  python: ['.py', '.pyi'],
  ruby: ['.rb', '.rake'],
  rust: ['.rs'],
  scala: ['.scala', '.sc'],
  solidity: ['.sol'],
  swift: ['.swift'],
  typescript: ['.ts', '.cts', '.mts'],
  tsx: ['.tsx'],
  yaml: ['.yml', '.yaml'],
}

// Default configuration
export const DEFAULT_TIMEOUT_MS = 300_000 // 5 minutes
export const DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024 // 1MB
export const DEFAULT_MAX_MATCHES = 500

// ast-grep binary version
export const AST_GREP_VERSION = '0.40.3'

// GitHub release URL pattern
const GITHUB_RELEASE_BASE = 'https://github.com/ast-grep/ast-grep/releases/download'

// Platform-specific binary configurations
// Note: Release asset names use "app-" prefix, e.g., app-x86_64-unknown-linux-gnu.zip
// The binary inside the archive is named "ast-grep" (or "ast-grep.exe" on Windows)
export const PLATFORM_CONFIGS: Record<PlatformId, PlatformConfig> = {
  'win-x64': {
    url: `${GITHUB_RELEASE_BASE}/${AST_GREP_VERSION}/app-x86_64-pc-windows-msvc.zip`,
    binaryPath: 'ast-grep.exe',
  },
  'linux-x64': {
    url: `${GITHUB_RELEASE_BASE}/${AST_GREP_VERSION}/app-x86_64-unknown-linux-gnu.zip`,
    binaryPath: 'ast-grep',
  },
  'linux-arm64': {
    url: `${GITHUB_RELEASE_BASE}/${AST_GREP_VERSION}/app-aarch64-unknown-linux-gnu.zip`,
    binaryPath: 'ast-grep',
  },
  'osx-x64': {
    url: `${GITHUB_RELEASE_BASE}/${AST_GREP_VERSION}/app-x86_64-apple-darwin.zip`,
    binaryPath: 'ast-grep',
  },
  'osx-arm64': {
    url: `${GITHUB_RELEASE_BASE}/${AST_GREP_VERSION}/app-aarch64-apple-darwin.zip`,
    binaryPath: 'ast-grep',
  },
}

/**
 * Get platform identifier for current system
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

  const platformKey = platformMap[platform]
  const archKey = archMap[arch]

  if (!platformKey || !archKey) {
    return undefined
  }

  return `${platformKey}-${archKey}` as PlatformId
}

/**
 * Get cache directory for ast-grep binary
 */
export function getAstGrepCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'ast-grep')
}

/**
 * Get expected binary path in cache
 */
export function getCachedBinaryPath(): string {
  const platformId = getPlatformId()
  if (!platformId) {
    return 'sg' // Fallback to PATH
  }

  const config = PLATFORM_CONFIGS[platformId]
  return path.join(getAstGrepCacheDir(), config.binaryPath)
}

/**
 * Get version marker file path
 */
export function getVersionMarkerPath(): string {
  return path.join(getAstGrepCacheDir(), '.installed_version')
}
