/**
 * Unit tests for hooks module
 */

import { describe, expect, test } from 'bun:test'
import { formatDiagnosticsReport } from '../../src/hooks'

// Mock diagnostic structure matching LSP Diagnostic type
interface MockDiagnostic {
  range: {
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  message: string
  severity?: number
  code?: string | number
  source?: string
}

function createDiagnostic(
  line: number,
  char: number,
  message: string,
  severity: number = 1,
  code?: string | number,
): MockDiagnostic {
  return {
    range: {
      start: { line, character: char },
      end: { line, character: char + 1 },
    },
    message,
    severity,
    code,
  }
}

describe('formatDiagnosticsReport', () => {
  describe('empty diagnostics', () => {
    test('returns null for empty diagnostics', () => {
      const result = formatDiagnosticsReport({}, '/project')
      expect(result).toBeNull()
    })

    test('returns null for file with empty diagnostics array', () => {
      const result = formatDiagnosticsReport(
        { '/project/src/file.ts': [] },
        '/project',
      )
      expect(result).toBeNull()
    })
  })

  describe('single error', () => {
    test('formats single error correctly', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(10, 5, 'Type error: expected number'),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).not.toBeNull()
      expect(result).toContain('✗ 1 error found')
      expect(result).toContain('src/file.ts:11:6')
      expect(result).toContain('Type error: expected number')
    })

    test('formats error with code', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(10, 5, 'Type error', 1, 'TS2345'),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).toContain('[TS2345]')
    })
  })

  describe('warnings', () => {
    test('formats single warning correctly', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'Unused variable', 2),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).not.toBeNull()
      expect(result).toContain('✗ 1 warning found')
      expect(result).toContain('⚠')
    })

    test('formats multiple warnings correctly', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'Unused variable x', 2),
          createDiagnostic(10, 0, 'Unused variable y', 2),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).toContain('✗ 2 warnings found')
    })
  })

  describe('mixed errors and warnings', () => {
    test('formats mixed diagnostics correctly', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'Type error', 1),
          createDiagnostic(10, 0, 'Unused variable', 2),
          createDiagnostic(15, 0, 'Another error', 1),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).not.toBeNull()
      expect(result).toContain('✗ 2 errors, 1 warning found')
    })

    test('formats multiple files correctly', () => {
      const diagnostics = {
        '/project/src/a.ts': [createDiagnostic(0, 0, 'Error in a', 1)],
        '/project/src/b.ts': [createDiagnostic(0, 0, 'Warning in b', 2)],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).toContain('✗ 1 error, 1 warning found')
      expect(result).toContain('src/a.ts')
      expect(result).toContain('src/b.ts')
    })
  })

  describe('info and hint severities', () => {
    test('does not count info in summary', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'Info message', 3),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      // Info severity (3) is not counted in error/warning totals
      expect(result).toBeNull()
    })

    test('does not count hint in summary', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'Hint message', 4),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      // Hint severity (4) is not counted in error/warning totals
      expect(result).toBeNull()
    })
  })

  describe('overflow handling', () => {
    test('truncates to 5 diagnostics and shows overflow', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(1, 0, 'Error 1', 1),
          createDiagnostic(2, 0, 'Error 2', 1),
          createDiagnostic(3, 0, 'Error 3', 1),
          createDiagnostic(4, 0, 'Error 4', 1),
          createDiagnostic(5, 0, 'Error 5', 1),
          createDiagnostic(6, 0, 'Error 6', 1),
          createDiagnostic(7, 0, 'Error 7', 1),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).not.toBeNull()
      expect(result).toContain('✗ 7 errors found')
      expect(result).toContain('... and 2 more')
      // First 5 should be included
      expect(result).toContain('Error 1')
      expect(result).toContain('Error 5')
      // 6th and 7th should not be shown individually
      expect(result).not.toContain('Error 6')
      expect(result).not.toContain('Error 7')
    })
  })

  describe('multiline messages', () => {
    test('uses only first line of multiline messages', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(5, 0, 'First line\nSecond line\nThird line', 1),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).toContain('First line')
      expect(result).not.toContain('Second line')
      expect(result).not.toContain('Third line')
    })
  })

  describe('line/column numbering', () => {
    test('converts 0-based to 1-based line/column', () => {
      const diagnostics = {
        '/project/src/file.ts': [
          createDiagnostic(0, 0, 'Error at start', 1),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      // 0,0 should display as 1:1
      expect(result).toContain('src/file.ts:1:1')
    })
  })

  describe('relative path handling', () => {
    test('shows relative path from project root', () => {
      const diagnostics = {
        '/project/src/deep/nested/file.ts': [
          createDiagnostic(0, 0, 'Error', 1),
        ],
      }
      const result = formatDiagnosticsReport(diagnostics, '/project')

      expect(result).toContain('src/deep/nested/file.ts')
      expect(result).not.toContain('/project/')
    })
  })
})
