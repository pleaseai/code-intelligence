/**
 * @pleaseai/logger - Structured logging with pino for AI coding tools
 *
 * All output goes to stderr to preserve stdout for protocol data (MCP, JSON-RPC)
 */

import process from 'node:process'
import pino from 'pino'

export type { Logger } from 'pino'

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

/**
 * Sensitive field paths to redact from logs
 * Uses pino's redact path syntax
 */
const REDACT_PATHS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'authorization',
  'credentials',
  'api_key',
  'access_token',
  'refresh_token',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.authorization',
  '*.credentials',
]

/**
 * Determine if pretty printing should be enabled
 * Auto-detects based on NODE_ENV
 */
function shouldUsePretty(): boolean {
  const env = process.env.NODE_ENV ?? 'development'
  return env !== 'production'
}

/**
 * Get the log level from environment or use defaults
 * Development: debug, Production: info
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL as LogLevel | undefined
  if (level && ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(level)) {
    return level
  }
  return shouldUsePretty() ? 'debug' : 'info'
}

/**
 * Create base pino options
 */
function createBaseOptions(): pino.LoggerOptions {
  return {
    level: getLogLevel(),
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }
}

/**
 * Create the root logger instance
 * Uses pino-pretty in development, JSON to stderr in production
 */
function createRootLogger(): pino.Logger {
  const options = createBaseOptions()
  const pretty = shouldUsePretty()

  if (pretty) {
    // Development: use pino-pretty transport
    try {
      return pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: {
            destination: 2, // stderr
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      })
    }
    catch (e) {
      // Check if this is expected "module not found" or unexpected error
      const error = e as Error & { code?: string }
      const isModuleNotFound
        = error.code === 'MODULE_NOT_FOUND'
          || error.message?.includes('Cannot find module')
          || error.message?.includes('pino-pretty')

      if (!isModuleNotFound) {
        // Unexpected error - notify user
        console.error('[logger] Failed to initialize pretty printing:', error.message)
        console.error('[logger] Falling back to JSON output')
      }

      // Fallback to JSON output
      return pino(options, pino.destination(2))
    }
  }

  // Production: JSON to stderr
  return pino(options, pino.destination(2))
}

// Singleton root logger
const rootLogger = createRootLogger()

/**
 * Create a named logger instance
 *
 * @param name - Logger name (appears in logs as 'name' field)
 * @returns A pino Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger('dora')
 * logger.info({ tool: 'findSymbol' }, 'Processing request')
 * logger.error({ err }, 'Request failed')
 *
 * // Child logger with context
 * const toolLogger = logger.child({ tool: 'findSymbol' })
 * toolLogger.debug({ query }, 'Searching symbols')
 * ```
 */
export function createLogger(name: string): pino.Logger {
  return rootLogger.child({ name })
}

/**
 * Default logger instance for simple usage
 *
 * @example
 * ```typescript
 * import { logger } from '@pleaseai/logger'
 * logger.info('Application started')
 * ```
 */
export const logger = rootLogger
