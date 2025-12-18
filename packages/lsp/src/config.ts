/**
 * LSP Configuration
 * Loads LSP settings from unified config file (.please/config.json or .please/config.yml)
 */

import type { LspConfig, LspItem } from '@pleaseai/code-format/config'
import { loadConfig } from '@pleaseai/code-format/config'

export type { LspConfig, LspItem }

/**
 * Load LSP configuration from project directory
 */
export async function loadLspConfig(projectDir: string): Promise<LspConfig | undefined> {
  const config = await loadConfig(projectDir)
  return config.lsp
}

/**
 * Check if a server is enabled in config
 * Returns true if:
 * - Config is undefined (default: all enabled)
 * - Config is not false (globally disabled)
 * - Server is not explicitly disabled
 */
export function isServerEnabled(config: LspConfig | undefined, serverId: string): boolean {
  // No config or empty config means all servers enabled
  if (config === undefined || config === false) {
    return config !== false
  }

  const serverConfig = config[serverId]
  if (!serverConfig) {
    return true // Not configured means enabled
  }

  return serverConfig.enabled !== false
}

/**
 * Get custom root path for a server
 */
export function getServerRoot(config: LspConfig | undefined, serverId: string): string | undefined {
  if (!config || typeof config === 'boolean') {
    return undefined
  }

  return config[serverId]?.root
}

/**
 * Get custom command for a server
 */
export function getServerCommand(config: LspConfig | undefined, serverId: string): string[] | undefined {
  if (!config || typeof config === 'boolean') {
    return undefined
  }

  return config[serverId]?.command
}
