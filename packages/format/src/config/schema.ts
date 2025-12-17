import { z } from 'zod'

/**
 * Formatter configuration schema
 * Compatible with opencode.json and .please/config.yml
 */
export const FormatterItemSchema = z.object({
  /** Disable this specific formatter */
  disabled: z.boolean().optional(),
  /** Command to execute. Use $FILE as placeholder for file path */
  command: z.array(z.string()).optional(),
  /** File extensions this formatter handles (e.g., [".js", ".ts"]) */
  extensions: z.array(z.string()).optional(),
  /** Environment variables to pass to the formatter */
  environment: z.record(z.string()).optional(),
})

export type FormatterItem = z.infer<typeof FormatterItemSchema>

export const FormatterConfigSchema = z.union([
  z.literal(false),
  z.record(z.string(), FormatterItemSchema),
])

export type FormatterConfig = z.infer<typeof FormatterConfigSchema>

/**
 * Dora configuration schema
 */
export const ConfigSchema = z.object({
  /** Formatter configuration */
  formatter: FormatterConfigSchema.optional(),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration
 */
export const defaultConfig: Config = {
  formatter: {},
}
