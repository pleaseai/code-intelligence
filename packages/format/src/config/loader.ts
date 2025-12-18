import type { Config } from './schema'
import path from 'node:path'
import YAML from 'yaml'
import { ConfigSchema, defaultConfig } from './schema'

/**
 * Configuration file names to search for (in order of priority)
 */
const CONFIG_FILES = [
  '.please/config.json',
  '.please/config.yml',
  '.please/config.yaml',
]

/**
 * Find configuration file by searching upward from startDir
 */
async function findConfigFile(
  startDir: string,
  stopDir?: string,
): Promise<string | null> {
  let currentDir = startDir
  const root = stopDir ?? path.parse(startDir).root

  while (currentDir !== root && currentDir !== path.dirname(currentDir)) {
    for (const configFile of CONFIG_FILES) {
      const filePath = path.join(currentDir, configFile)
      const file = Bun.file(filePath)
      if (await file.exists()) {
        return filePath
      }
    }
    currentDir = path.dirname(currentDir)
  }

  return null
}

/**
 * Parse configuration file content based on extension
 */
function parseConfigContent(content: string, filePath: string): unknown {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') {
    return JSON.parse(content)
  }
  if (ext === '.yml' || ext === '.yaml') {
    return YAML.parse(content)
  }
  // Try JSON first, then YAML
  try {
    return JSON.parse(content)
  }
  catch {
    return YAML.parse(content)
  }
}

/**
 * Load configuration from a specific file
 */
export async function loadConfigFromFile(filePath: string): Promise<Config> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return defaultConfig
  }

  const content = await file.text()
  const parsed = parseConfigContent(content, filePath)
  const result = ConfigSchema.safeParse(parsed)

  if (!result.success) {
    console.error(`[config] Invalid configuration in ${filePath}:`, result.error.message)
    return defaultConfig
  }

  return result.data
}

/**
 * Load configuration by searching from projectDir upward
 */
export async function loadConfig(projectDir: string): Promise<Config> {
  const configPath = await findConfigFile(projectDir)
  if (!configPath) {
    return defaultConfig
  }

  console.error(`[config] Loading configuration from ${configPath}`)
  return loadConfigFromFile(configPath)
}

/**
 * Merge two configurations (source overrides base)
 */
export function mergeConfig(base: Config, source: Partial<Config>): Config {
  const merged: Config = { ...base }

  // Merge shared settings
  if (source.language !== undefined) {
    merged.language = source.language
  }
  if (source.ignore_patterns !== undefined) {
    merged.ignore_patterns = source.ignore_patterns
  }

  // Merge formatter config
  if (source.formatter !== undefined) {
    if (source.formatter === false) {
      merged.formatter = false
    }
    else if (base.formatter === false) {
      merged.formatter = source.formatter
    }
    else {
      merged.formatter = {
        ...(base.formatter ?? {}),
        ...source.formatter,
      }
    }
  }

  // Merge LSP config
  if (source.lsp !== undefined) {
    if (source.lsp === false) {
      merged.lsp = false
    }
    else if (base.lsp === false) {
      merged.lsp = source.lsp
    }
    else {
      merged.lsp = {
        ...(base.lsp ?? {}),
        ...source.lsp,
      }
    }
  }

  return merged
}
