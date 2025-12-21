/**
 * LSP Server Types
 * Shared interfaces and types for LSP server definitions
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export interface LSPServerHandle {
  process: ChildProcessWithoutNullStreams
  initialization?: Record<string, unknown>
}

export type RootFunction = (
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

/**
 * Supported platform identifiers for auto-download dependencies
 * Note: win-arm64 is not supported as JRE distributions are not available
 */
export type PlatformId = 'win-x64' | 'linux-x64' | 'linux-arm64' | 'osx-x64' | 'osx-arm64'
