import type { FormatterConfig } from './config'
import path from 'node:path'
import process from 'node:process'

import { createLogger } from '@pleaseai/logger'
import z from 'zod'
import { loadConfig } from './config'
import * as Formatter from './formatter'

const log = createLogger('format')

export const FormatStatusSchema = z
  .object({
    name: z.string(),
    extensions: z.string().array(),
    enabled: z.boolean(),
  })
export type FormatStatus = z.infer<typeof FormatStatusSchema>

export interface FormatConfig {
  projectDir: string
  formatter?: FormatterConfig
}

interface State {
  enabled: Record<string, boolean> // Cache key: `${dirPath}:${formatterName}`
  formatters: Record<string, Formatter.Info>
  projectDir: string
}

let cachedState: State | null = null

/**
 * Initialize formatters from project configuration files
 * Searches for opencode.json, dora.json, or .please/config.yml
 */
async function initFromProject(projectDir: string): Promise<void> {
  const config = await loadConfig(projectDir)
  const formatConfig: FormatConfig = { projectDir }
  if (config.formatter !== undefined) {
    formatConfig.formatter = config.formatter
  }
  init(formatConfig)
}

function init(config: FormatConfig): void {
  const enabled: Record<string, boolean> = {}
  const formatters: Record<string, Formatter.Info> = {}

  if (config.formatter === false) {
    log.info('all formatters are disabled')
    cachedState = { enabled, formatters, projectDir: config.projectDir }
    return
  }

  // Register built-in formatters
  for (const item of Object.values(Formatter)) {
    if (typeof item === 'object' && 'name' in item && 'command' in item) {
      formatters[item.name] = item as Formatter.Info
    }
  }

  // Apply user configuration overrides
  for (const [name, item] of Object.entries(config.formatter ?? {})) {
    if (item.disabled) {
      delete formatters[name]
      continue
    }

    const existing = formatters[name]
    if (existing) {
      // Merge existing formatter with config overrides
      const env = item.environment ?? existing.environment
      const merged: Formatter.Info = {
        ...existing,
        command: item.command ?? existing.command,
        extensions: item.extensions ?? existing.extensions,
      }
      if (env)
        merged.environment = env
      formatters[name] = merged
    }
    else if (item.command && item.command.length > 0) {
      // Create new formatter from config
      const newFormatter: Formatter.Info = {
        name,
        command: item.command,
        extensions: item.extensions ?? [],
        enabled: async () => true,
      }
      if (item.environment)
        newFormatter.environment = item.environment
      formatters[name] = newFormatter
    }
  }

  cachedState = { enabled, formatters, projectDir: config.projectDir }
  log.info({ count: Object.keys(formatters).length }, 'initialized formatters')
}

function getState(): State {
  if (!cachedState) {
    throw new Error('Format not initialized. Call Format.init() first.')
  }
  return cachedState
}

async function isEnabled(item: Formatter.Info, filePath: string): Promise<boolean> {
  const s = getState()
  const dirPath = path.dirname(filePath)
  const cacheKey = `${dirPath}:${item.name}`
  let status = s.enabled[cacheKey]
  if (status === undefined) {
    status = await item.enabled(filePath, s.projectDir)
    s.enabled[cacheKey] = status
  }
  return status
}

async function getFormatter(ext: string, filePath: string): Promise<Formatter.Info[]> {
  const s = getState()
  const result: Formatter.Info[] = []
  for (const item of Object.values(s.formatters)) {
    log.debug({ name: item.name, ext }, 'checking formatter')
    if (!item.extensions.includes(ext))
      continue
    if (!(await isEnabled(item, filePath)))
      continue
    log.debug({ name: item.name, ext }, 'formatter enabled')
    result.push(item)
  }
  return result
}

async function status(filePath?: string): Promise<FormatStatus[]> {
  const s = getState()
  const testPath = filePath ?? s.projectDir
  const result: FormatStatus[] = []
  for (const formatter of Object.values(s.formatters)) {
    const enabled = await isEnabled(formatter, testPath)
    result.push({
      name: formatter.name,
      extensions: formatter.extensions,
      enabled,
    })
  }
  return result
}

/**
 * Format a file using the appropriate formatter based on file extension
 */
async function formatFile(file: string): Promise<boolean> {
  const s = getState()
  const ext = path.extname(file)
  log.debug({ file, ext }, 'formatting file')

  const formatters = await getFormatter(ext, file)
  if (formatters.length === 0) {
    log.debug({ ext }, 'no formatter found')
    return false
  }

  let success = true
  for (const item of formatters) {
    log.debug({ command: item.command }, 'running formatter')
    try {
      const proc = Bun.spawn({
        cmd: item.command.map(x => x.replace('$FILE', file)),
        cwd: s.projectDir,
        env: { ...process.env, ...item.environment },
        stdout: 'ignore',
        stderr: 'ignore',
      })
      const exit = await proc.exited
      if (exit !== 0) {
        log.error({ command: item.command, env: item.environment }, 'formatter failed')
        success = false
      }
    }
    catch (error) {
      log.error({ err: error, file, command: item.command, env: item.environment }, 'failed to format file')
      success = false
    }
  }

  return success
}

// Export as object to maintain backward compatibility
export const Format = {
  Status: FormatStatusSchema,
  initFromProject,
  init,
  status,
  formatFile,
} as const

// Type exports for backward compatibility
export type { FormatConfig as Config }

export { type Config as ConfigType, type FormatterConfig, loadConfig } from './config'
export * as Formatter from './formatter'
