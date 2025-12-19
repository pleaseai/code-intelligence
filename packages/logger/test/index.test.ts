import type { Logger, LogLevel } from '../src'
import { describe, expect, it } from 'bun:test'
import { createLogger, logger } from '../src'

describe('@pleaseai/logger', () => {
  describe('createLogger', () => {
    it('creates a named logger', () => {
      const log = createLogger('test')
      expect(log).toBeDefined()
      expect(typeof log.info).toBe('function')
      expect(typeof log.error).toBe('function')
      expect(typeof log.warn).toBe('function')
      expect(typeof log.debug).toBe('function')
    })

    it('creates loggers with different names', () => {
      const log1 = createLogger('module-a')
      const log2 = createLogger('module-b')
      expect(log1).toBeDefined()
      expect(log2).toBeDefined()
      // Both should be functional but independent
      expect(log1).not.toBe(log2)
    })
  })

  describe('logger (default)', () => {
    it('provides a default logger instance', () => {
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
    })
  })

  describe('child loggers', () => {
    it('supports child loggers with context', () => {
      const log = createLogger('parent')
      const child = log.child({ requestId: 'abc-123' })
      expect(child).toBeDefined()
      expect(typeof child.info).toBe('function')
    })
  })

  describe('log levels', () => {
    it('supports all standard log levels', () => {
      const log = createLogger('levels')
      const levels: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
      for (const level of levels) {
        expect(typeof log[level]).toBe('function')
      }
    })
  })

  describe('type exports', () => {
    it('exports Logger type', () => {
      // Type check - Logger should be a valid type
      const log: Logger = createLogger('typed')
      expect(log).toBeDefined()
    })

    it('exports LogLevel type', () => {
      // Type check - LogLevel should be a valid type
      const level: LogLevel = 'info'
      expect(level).toBe('info')
    })
  })
})
