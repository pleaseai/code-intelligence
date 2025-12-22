/**
 * LSP Server Types
 * Shared interfaces and types for LSP server definitions
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

// Re-export PlatformId from binaries for consistency
export type { PlatformId } from '@pleaseai/binaries'

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
