/**
 * Unit tests for platform detection utilities
 */

import { describe, expect, test } from 'bun:test'
import { getPotentialBinaryPaths, getTarget, isMusl } from '../../src/utils/platform'

describe('platform detection', () => {
  describe('getTarget', () => {
    test('returns valid target format', () => {
      const target = getTarget()

      // Target should be non-empty string
      expect(typeof target).toBe('string')
      expect(target.length).toBeGreaterThan(0)

      // Target should contain platform and arch
      const platform = process.platform
      const arch = process.arch

      if (platform === 'darwin') {
        expect(target).toBe(`darwin-${arch}`)
      }
      else if (platform === 'win32') {
        expect(target).toBe(`win32-${arch}`)
      }
      else if (platform === 'linux') {
        expect(target).toMatch(new RegExp(`linux-${arch}-(glibc|musl)`))
      }
    })

    test('matches expected format for current platform', () => {
      const target = getTarget()

      // Should contain a hyphen separator
      expect(target).toContain('-')

      // Should start with known platform
      const validPrefixes = ['darwin', 'win32', 'linux']
      const startsWithValid = validPrefixes.some(prefix => target.startsWith(prefix))
      expect(startsWithValid).toBe(true)
    })
  })

  describe('isMusl', () => {
    test('returns boolean', () => {
      const result = isMusl()
      expect(typeof result).toBe('boolean')
    })

    test('returns false on macOS and Windows', () => {
      // musl is Linux-specific
      if (process.platform !== 'linux') {
        expect(isMusl()).toBe(false)
      }
    })
  })

  describe('getPotentialBinaryPaths', () => {
    const testDirname = '/app/node_modules/@pleaseai/code/dist'
    const packageScope = '@pleaseai'
    const packageName = 'code'
    const binaryName = 'code'

    test('returns array of paths', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBe(3)
    })

    test('paths contain package scope and name', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      // Each path should contain the package reference
      for (const p of paths) {
        expect(p).toContain('@pleaseai')
        expect(p).toContain('code')
      }
    })

    test('paths end with binary name', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      for (const p of paths) {
        expect(p).toMatch(/code$/)
      }
    })

    test('handles Windows binary name', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        'code.exe',
      )

      for (const p of paths) {
        expect(p).toMatch(/code\.exe$/)
      }
    })

    test('includes target in package path', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      const target = getTarget()

      for (const p of paths) {
        expect(p).toContain(`code-${target}`)
      }
    })

    test('generates different paths for different layouts', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      // All paths should be unique
      const uniquePaths = new Set(paths)
      expect(uniquePaths.size).toBe(paths.length)
    })

    test('hoisted path resolves to sibling package directory', () => {
      const target = getTarget()
      const paths = getPotentialBinaryPaths(
        '/project/node_modules/@pleaseai/code/dist',
        packageScope,
        packageName,
        binaryName,
      )

      // First path (hoisted) should be at node_modules level
      const hoistedPath = paths[0]!
      // Should resolve relative to the root node_modules
      expect(hoistedPath).toContain(`code-${target}`)
    })

    test('non-hoisted path includes node_modules subdirectory', () => {
      const paths = getPotentialBinaryPaths(
        testDirname,
        packageScope,
        packageName,
        binaryName,
      )

      // Second path (non-hoisted) should include node_modules
      const nonHoistedPath = paths[1]!
      expect(nonHoistedPath).toContain('node_modules')
    })

    test('all three paths are different', () => {
      const paths = getPotentialBinaryPaths(
        '/project/node_modules/.pnpm/@pleaseai+code@1.0.0/node_modules/@pleaseai/code/dist',
        packageScope,
        packageName,
        binaryName,
      )

      // All three search paths should be unique
      const uniquePaths = new Set(paths)
      expect(uniquePaths.size).toBe(3)
    })
  })
})
