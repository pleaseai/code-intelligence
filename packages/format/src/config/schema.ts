import { z } from 'zod'

/**
 * Formatter configuration schema
 * Compatible with .please/config.json and .please/config.yml
 */
export const FormatterItemSchema = z.object({
  /** Disable this specific formatter */
  disabled: z.boolean().optional(),
  /** Command to execute. Use $FILE as placeholder for file path */
  command: z.array(z.string()).optional(),
  /** File extensions this formatter handles (e.g., [".js", ".ts"]) */
  extensions: z.array(z.string()).optional(),
  /** Environment variables to pass to the formatter */
  environment: z.record(z.string(), z.string()).optional(),
})

export type FormatterItem = z.infer<typeof FormatterItemSchema>

export const FormatterConfigSchema = z.union([
  z.literal(false),
  z.record(z.string(), FormatterItemSchema),
])

export type FormatterConfig = z.infer<typeof FormatterConfigSchema>

/**
 * LSP server configuration schema
 */
export const LspItemSchema = z.object({
  /** Enable/disable this LSP server */
  enabled: z.boolean().optional(),
  /** Custom project root path for this server (must be non-empty if provided) */
  root: z.string().min(1, 'root path cannot be empty').optional(),
  /** Custom command to spawn the server (must have at least one element if provided) */
  command: z.array(z.string()).min(1, 'command must have at least one element').optional(),
})

export type LspItem = z.infer<typeof LspItemSchema>

export const LspConfigSchema = z.union([
  z.literal(false),
  z.record(z.string(), LspItemSchema),
])

export type LspConfig = z.infer<typeof LspConfigSchema>

/**
 * Unified configuration schema
 */
export const ConfigSchema = z.object({
  /** Language for messages (en or ko) */
  language: z.enum(['en', 'ko']).optional(),
  /** Patterns to ignore */
  ignore_patterns: z.array(z.string()).optional(),
  /** Formatter configuration */
  formatter: FormatterConfigSchema.optional(),
  /** LSP configuration */
  lsp: LspConfigSchema.optional(),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration
 */
export const defaultConfig: Config = {
  formatter: {},
  lsp: {},
}
