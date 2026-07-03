/**
 * Tools registry
 * Central registry for all tools that can be installed via setup command
 */

import type { Tool, ToolStatus } from './types'
import { astGrepTool } from './ast-grep'

export { getAstGrepCachePath } from './ast-grep'
export { CACHE_DIR, getCachedBinaryPath } from './downloader'
export type { Tool, ToolStatus } from './types'

/** All available tools */
export const tools: Tool[] = [
  astGrepTool,
  // Add more tools here as needed:
  // biomeTool,
  // typescriptLspTool,
  // etc.
]

/** Get a tool by ID */
export function getTool(id: string): Tool | undefined {
  return tools.find(t => t.id === id)
}

/** Get all tool IDs */
export function getToolIds(): string[] {
  return tools.map(t => t.id)
}

/** Check status of all tools */
export async function checkAllTools(): Promise<ToolStatus[]> {
  const results: ToolStatus[] = []

  for (const tool of tools) {
    const installed = await tool.isInstalled()
    const status: ToolStatus = {
      id: tool.id,
      name: tool.name,
      installed,
    }

    if (installed) {
      const version = await tool.getVersion?.()
      const binaryPath = await tool.getBinaryPath()
      if (version) { status.version = version }
      if (binaryPath) { status.path = binaryPath }
    }

    results.push(status)
  }

  return results
}

/** Check status of a specific tool */
export async function checkTool(id: string): Promise<ToolStatus | null> {
  const tool = getTool(id)
  if (!tool) {
    return null
  }

  const installed = await tool.isInstalled()
  const status: ToolStatus = {
    id: tool.id,
    name: tool.name,
    installed,
  }

  if (installed) {
    const version = await tool.getVersion?.()
    const binaryPath = await tool.getBinaryPath()
    if (version) { status.version = version }
    if (binaryPath) { status.path = binaryPath }
  }

  return status
}
