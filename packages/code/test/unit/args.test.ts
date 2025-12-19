/**
 * Unit tests for argument parsing
 */

import { describe, expect, test } from 'bun:test'
import { parseArgs } from '../../src/utils/args'

// Helper to create argv array (simulating process.argv)
function argv(...args: string[]): string[] {
  return ['/path/to/node', '/path/to/script.ts', ...args]
}

describe('parseArgs', () => {
  describe('command parsing', () => {
    test('extracts command from first positional argument', () => {
      const result = parseArgs(argv('format'))
      expect(result.command).toBe('format')
    })

    test('defaults to help when no command given', () => {
      const result = parseArgs(argv())
      expect(result.command).toBe('help')
    })

    test('handles multiple commands (takes first)', () => {
      const result = parseArgs(argv('format', 'extra'))
      expect(result.command).toBe('format')
      expect(result.args).toEqual(['extra'])
    })
  })

  describe('positional arguments', () => {
    test('collects positional arguments after command', () => {
      const result = parseArgs(argv('format', 'file1.ts', 'file2.ts'))
      expect(result.command).toBe('format')
      expect(result.args).toEqual(['file1.ts', 'file2.ts'])
    })

    test('returns empty args when no positional after command', () => {
      const result = parseArgs(argv('version'))
      expect(result.args).toEqual([])
    })
  })

  describe('long flags (--flag)', () => {
    test('parses boolean flag', () => {
      const result = parseArgs(argv('format', '--stdin'))
      expect(result.flags.stdin).toBe(true)
    })

    test('parses flag with equals value', () => {
      const result = parseArgs(argv('format', '--project=/my/path'))
      expect(result.flags.project).toBe('/my/path')
    })

    test('parses flag with empty value', () => {
      const result = parseArgs(argv('format', '--project='))
      expect(result.flags.project).toBe('')
    })

    test('parses multiple boolean flags', () => {
      const result = parseArgs(argv('lsp', '--stdin', '--verbose'))
      expect(result.flags.stdin).toBe(true)
      expect(result.flags.verbose).toBe(true)
    })

    test('parses multiple value flags', () => {
      const result = parseArgs(argv('format', '--project=/path', '--output=json'))
      expect(result.flags.project).toBe('/path')
      expect(result.flags.output).toBe('json')
    })
  })

  describe('short flags (-f)', () => {
    test('parses short boolean flag', () => {
      const result = parseArgs(argv('-v'))
      expect(result.flags.v).toBe(true)
    })

    test('parses short flag -h', () => {
      const result = parseArgs(argv('-h'))
      expect(result.flags.h).toBe(true)
    })

    test('parses multiple short flags', () => {
      const result = parseArgs(argv('-v', '-h'))
      expect(result.flags.v).toBe(true)
      expect(result.flags.h).toBe(true)
    })
  })

  describe('mixed flags and positional', () => {
    test('handles flags before positional', () => {
      const result = parseArgs(argv('format', '--stdin', 'file.ts'))
      expect(result.command).toBe('format')
      expect(result.flags.stdin).toBe(true)
      expect(result.args).toEqual(['file.ts'])
    })

    test('handles flags after positional', () => {
      const result = parseArgs(argv('format', 'file.ts', '--project=/path'))
      expect(result.command).toBe('format')
      expect(result.args).toEqual(['file.ts'])
      expect(result.flags.project).toBe('/path')
    })

    test('handles interleaved flags and positional', () => {
      const result = parseArgs(argv('format', '--stdin', 'file.ts', '--verbose'))
      expect(result.command).toBe('format')
      expect(result.flags.stdin).toBe(true)
      expect(result.flags.verbose).toBe(true)
      expect(result.args).toEqual(['file.ts'])
    })
  })

  describe('edge cases', () => {
    test('handles flag-like positional argument in quotes', () => {
      // This would come from shell as a single argument without dashes
      const result = parseArgs(argv('format', 'test-file.ts'))
      expect(result.args).toEqual(['test-file.ts'])
    })

    test('handles empty argv', () => {
      const result = parseArgs([])
      expect(result.command).toBe('help')
      expect(result.args).toEqual([])
      expect(result.flags).toEqual({})
    })

    test('handles only node and script path', () => {
      const result = parseArgs(['/usr/bin/node', '/script.ts'])
      expect(result.command).toBe('help')
    })

    test('handles flag with equals containing equals', () => {
      const result = parseArgs(argv('format', '--config=a=b=c'))
      // Note: split('=') only splits first occurrence in our implementation
      // So this gets key='config' and value='a' (rest is lost)
      // This is current behavior - documenting it
      expect(result.flags.config).toBe('a=b=c')
    })

    test('handles long flag name', () => {
      const result = parseArgs(argv('format', '--very-long-flag-name'))
      expect(result.flags['very-long-flag-name']).toBe(true)
    })

    test('handles numeric value', () => {
      const result = parseArgs(argv('format', '--timeout=5000'))
      expect(result.flags.timeout).toBe('5000')
    })

    test('handles paths with special characters', () => {
      const result = parseArgs(argv('format', '--project=/path/with spaces/dir'))
      expect(result.flags.project).toBe('/path/with spaces/dir')
    })
  })

  describe('CLI command aliases', () => {
    test('parses -v as flag (not command)', () => {
      const result = parseArgs(argv('-v'))
      expect(result.command).toBe('help') // No positional, defaults to help
      expect(result.flags.v).toBe(true)
    })

    test('parses --version as flag', () => {
      const result = parseArgs(argv('--version'))
      expect(result.command).toBe('help')
      expect(result.flags.version).toBe(true)
    })

    test('parses -h as flag', () => {
      const result = parseArgs(argv('-h'))
      expect(result.command).toBe('help')
      expect(result.flags.h).toBe(true)
    })

    test('parses --help as flag', () => {
      const result = parseArgs(argv('--help'))
      expect(result.command).toBe('help')
      expect(result.flags.help).toBe(true)
    })
  })
})
