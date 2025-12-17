import path from "path"
import z from "zod"

import * as Formatter from "./formatter"
import { loadConfig, type FormatterConfig } from "./config"

export namespace Format {
  const log = {
    info: (...args: unknown[]) => console.error("[format]", ...args),
    error: (...args: unknown[]) => console.error("[format:error]", ...args),
  }

  export const Status = z
    .object({
      name: z.string(),
      extensions: z.string().array(),
      enabled: z.boolean(),
    })
  export type Status = z.infer<typeof Status>

  export interface Config {
    projectDir: string
    formatter?: FormatterConfig
  }

  interface State {
    enabled: Record<string, boolean>
    formatters: Record<string, Formatter.Info>
    projectDir: string
  }

  let cachedState: State | null = null

  /**
   * Initialize formatters from project configuration files
   * Searches for opencode.json, dora.json, or .please/config.yml
   */
  export async function initFromProject(projectDir: string): Promise<void> {
    const config = await loadConfig(projectDir)
    const formatConfig: Config = { projectDir }
    if (config.formatter !== undefined) {
      formatConfig.formatter = config.formatter
    }
    init(formatConfig)
  }

  export function init(config: Config): void {
    const enabled: Record<string, boolean> = {}
    const formatters: Record<string, Formatter.Info> = {}

    if (config.formatter === false) {
      log.info("all formatters are disabled")
      cachedState = { enabled, formatters, projectDir: config.projectDir }
      return
    }

    // Register built-in formatters
    for (const item of Object.values(Formatter)) {
      if (typeof item === "object" && "name" in item && "command" in item) {
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
        if (env) merged.environment = env
        formatters[name] = merged
      } else if (item.command && item.command.length > 0) {
        // Create new formatter from config
        const newFormatter: Formatter.Info = {
          name,
          command: item.command,
          extensions: item.extensions ?? [],
          enabled: async () => true,
        }
        if (item.environment) newFormatter.environment = item.environment
        formatters[name] = newFormatter
      }
    }

    cachedState = { enabled, formatters, projectDir: config.projectDir }
    log.info("initialized with", Object.keys(formatters).length, "formatters")
  }

  function getState(): State {
    if (!cachedState) {
      throw new Error("Format not initialized. Call Format.init() first.")
    }
    return cachedState
  }

  async function isEnabled(item: Formatter.Info): Promise<boolean> {
    const s = getState()
    let status = s.enabled[item.name]
    if (status === undefined) {
      status = await item.enabled(s.projectDir)
      s.enabled[item.name] = status
    }
    return status
  }

  async function getFormatter(ext: string): Promise<Formatter.Info[]> {
    const s = getState()
    const result: Formatter.Info[] = []
    for (const item of Object.values(s.formatters)) {
      log.info("checking", { name: item.name, ext })
      if (!item.extensions.includes(ext)) continue
      if (!(await isEnabled(item))) continue
      log.info("enabled", { name: item.name, ext })
      result.push(item)
    }
    return result
  }

  export async function status(): Promise<Status[]> {
    const s = getState()
    const result: Status[] = []
    for (const formatter of Object.values(s.formatters)) {
      const enabled = await isEnabled(formatter)
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
  export async function formatFile(file: string): Promise<boolean> {
    const s = getState()
    const ext = path.extname(file)
    log.info("formatting", { file, ext })

    const formatters = await getFormatter(ext)
    if (formatters.length === 0) {
      log.info("no formatter found for", ext)
      return false
    }

    let success = true
    for (const item of formatters) {
      log.info("running", { command: item.command })
      try {
        const proc = Bun.spawn({
          cmd: item.command.map((x) => x.replace("$FILE", file)),
          cwd: s.projectDir,
          env: { ...process.env, ...item.environment },
          stdout: "ignore",
          stderr: "ignore",
        })
        const exit = await proc.exited
        if (exit !== 0) {
          log.error("failed", {
            command: item.command,
            ...item.environment,
          })
          success = false
        }
      } catch (error) {
        log.error("failed to format file", {
          error,
          command: item.command,
          ...item.environment,
          file,
        })
        success = false
      }
    }

    return success
  }
}

export * as Formatter from "./formatter"
export { loadConfig, type Config, type FormatterConfig } from "./config"
