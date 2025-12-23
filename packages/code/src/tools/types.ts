/**
 * Tool type definitions for the setup command
 */

export type { PlatformId, PlatformInfo } from '@pleaseai/binaries'

export interface Tool {
  /** Tool identifier */
  id: string
  /** Display name */
  name: string
  /** Tool description */
  description: string
  /** Check if tool is installed */
  isInstalled: () => Promise<boolean>
  /** Get the binary path (if installed) */
  getBinaryPath: () => Promise<string | null>
  /** Install the tool */
  install: () => Promise<void>
  /** Get version (if installed) */
  getVersion?: () => Promise<string | null>
}

export interface ToolStatus {
  id: string
  name: string
  installed: boolean
  version?: string | undefined
  path?: string | undefined
}

export interface DownloadOptions {
  url: string
  dest: string
  extract?: boolean
  binaryName?: string
}
