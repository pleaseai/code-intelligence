import type { Config } from './schema'
import path from 'node:path'
import YAML from 'yaml'
import { ConfigSchema, defaultConfig } from './schema'

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly issues: Array<{ path: string[], message: string }>,
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * Error thrown when configuration file cannot be read or parsed
 */
export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ConfigLoadError'
  }
}

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
  // Try JSON first, then YAML (only catch syntax errors)
  try {
    return JSON.parse(content)
  }
  catch (err) {
    if (err instanceof SyntaxError) {
      // JSON syntax error - try YAML as fallback
      return YAML.parse(content)
    }
    // Re-throw unexpected errors (memory, stack overflow, etc.)
    throw err
  }
}

/**
 * Load configuration from a specific file
 * @throws {ConfigLoadError} If file cannot be read or parsed
 * @throws {ConfigValidationError} If configuration fails validation
 */
export async function loadConfigFromFile(filePath: string): Promise<Config> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return defaultConfig
  }

  // Read file with error context
  let content: string
  try {
    content = await file.text()
  }
  catch (err) {
    throw new ConfigLoadError(
      `Failed to read configuration file: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
      err,
    )
  }

  // Parse file with error context
  let parsed: unknown
  try {
    parsed = parseConfigContent(content, filePath)
  }
  catch (err) {
    throw new ConfigLoadError(
      `Failed to parse configuration file: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
      err,
    )
  }

  // Validate configuration - throw on validation errors
  const result = ConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(i => ({
      path: i.path.map(String),
      message: i.message,
    }))
    const issueMessages = issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new ConfigValidationError(
      `Invalid configuration in ${filePath}:\n${issueMessages}`,
      filePath,
      issues,
    )
  }

  return result.data
}

/**
 * Load configuration by searching from projectDir upward
 * @throws {ConfigLoadError} If file cannot be read or parsed
 * @throws {ConfigValidationError} If configuration fails validation
 */
export async function loadConfig(projectDir: string): Promise<Config> {
  const configPath = await findConfigFile(projectDir)
  if (!configPath) {
    return defaultConfig
  }

  // Use stderr to avoid interfering with JSON output on stdout
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
