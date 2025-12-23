import { describe, expect, it } from 'bun:test'
import {
  commandExists,
  detectMusl,
  getCommandOutput,
  getPlatformId,
  getPlatformInfo,
} from '../src/platform'

describe('platform utilities', () => {
  describe('getPlatformInfo', () => {
    it('returns platform, arch, and isMusl', () => {
      const info = getPlatformInfo()
      expect(info).toHaveProperty('platform')
      expect(info).toHaveProperty('arch')
      expect(info).toHaveProperty('isMusl')
      expect(typeof info.isMusl).toBe('boolean')
    })

    it('returns current platform', () => {
      const info = getPlatformInfo()
      expect(info.platform).toBe(process.platform)
    })

    it('returns current arch', () => {
      const info = getPlatformInfo()
      expect(info.arch).toBe(process.arch)
    })
  })

  describe('getPlatformId', () => {
    it('returns valid platform id for supported platforms', () => {
      const id = getPlatformId()
      if (id) {
        expect(['win-x64', 'win-arm64', 'osx-x64', 'osx-arm64', 'linux-x64', 'linux-arm64']).toContain(id)
      }
    })

    it('returns undefined for unsupported arch', () => {
      const originalArch = process.arch
      Object.defineProperty(process, 'arch', { value: 'mips', configurable: true })
      try {
        expect(getPlatformId()).toBeUndefined()
      }
      finally {
        Object.defineProperty(process, 'arch', { value: originalArch, configurable: true })
      }
    })
  })

  describe('detectMusl', () => {
    it('returns false on non-Linux platforms', () => {
      if (process.platform !== 'linux') {
        expect(detectMusl()).toBe(false)
      }
    })

    it('returns boolean on Linux', () => {
      if (process.platform === 'linux') {
        expect(typeof detectMusl()).toBe('boolean')
      }
    })
  })

  describe('commandExists', () => {
    it('returns true for common commands', () => {
      const command = process.platform === 'win32' ? 'cmd' : 'ls'
      expect(commandExists(command)).toBe(true)
    })

    it('returns false for non-existent command', () => {
      expect(commandExists('definitely-not-a-real-command-12345')).toBe(false)
    })
  })

  describe('getCommandOutput', () => {
    it('returns output for valid command', () => {
      const command = process.platform === 'win32' ? 'echo hello' : 'echo hello'
      const output = getCommandOutput(command)
      expect(output).toBe('hello')
    })

    it('returns null for invalid command', () => {
      expect(getCommandOutput('definitely-not-a-command-12345')).toBeNull()
    })

    it('trims output', () => {
      const output = getCommandOutput('echo "  hello  "')
      expect(output).not.toStartWith(' ')
      expect(output).not.toEndWith(' ')
    })
  })
})
