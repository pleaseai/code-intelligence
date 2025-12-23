import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  clearCache,
  DEFAULT_CACHE_DIR,
  ensureCacheDir,
  getCachedBinaryPath,
  getCacheDir,
  hasCachedBinary,
  isValidBinary,
  makeExecutable,
} from '../src/cache'

describe('cache utilities', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'binaries-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('DEFAULT_CACHE_DIR', () => {
    it('is in home directory', () => {
      expect(DEFAULT_CACHE_DIR).toContain(os.homedir())
      expect(DEFAULT_CACHE_DIR).toContain('.cache')
      expect(DEFAULT_CACHE_DIR).toContain('pleaseai')
    })
  })

  describe('getCacheDir', () => {
    it('returns path with tool id', () => {
      const result = getCacheDir('my-tool', tempDir)
      expect(result).toBe(path.join(tempDir, 'my-tool'))
    })

    it('uses DEFAULT_CACHE_DIR when baseCacheDir not provided', () => {
      const result = getCacheDir('my-tool')
      expect(result).toBe(path.join(DEFAULT_CACHE_DIR, 'my-tool'))
    })
  })

  describe('ensureCacheDir', () => {
    it('creates directory if not exists', () => {
      const result = ensureCacheDir('new-tool', tempDir)
      expect(result).toBe(path.join(tempDir, 'new-tool'))
      expect(fs.existsSync(result)).toBe(true)
    })

    it('returns existing directory', () => {
      const toolDir = path.join(tempDir, 'existing-tool')
      fs.mkdirSync(toolDir)
      const result = ensureCacheDir('existing-tool', tempDir)
      expect(result).toBe(toolDir)
      expect(fs.existsSync(result)).toBe(true)
    })
  })

  describe('getCachedBinaryPath', () => {
    it('returns path with tool id and binary name', () => {
      const result = getCachedBinaryPath('my-tool', 'binary', tempDir)
      expect(result).toBe(path.join(tempDir, 'my-tool', 'binary'))
    })
  })

  describe('isValidBinary', () => {
    it('returns false for non-existent file', () => {
      expect(isValidBinary(path.join(tempDir, 'nonexistent'))).toBe(false)
    })

    it('returns false for file smaller than minSize', () => {
      const filePath = path.join(tempDir, 'small-file')
      fs.writeFileSync(filePath, 'small content')
      expect(isValidBinary(filePath)).toBe(false)
    })

    it('returns true for file larger than minSize', () => {
      const filePath = path.join(tempDir, 'large-file')
      fs.writeFileSync(filePath, Buffer.alloc(15000))
      expect(isValidBinary(filePath)).toBe(true)
    })

    it('uses custom minSize', () => {
      const filePath = path.join(tempDir, 'medium-file')
      fs.writeFileSync(filePath, Buffer.alloc(500))
      expect(isValidBinary(filePath, 100)).toBe(true)
      expect(isValidBinary(filePath, 1000)).toBe(false)
    })

    it('returns false for directory', () => {
      const dirPath = path.join(tempDir, 'subdir')
      fs.mkdirSync(dirPath)
      expect(isValidBinary(dirPath)).toBe(false)
    })
  })

  describe('makeExecutable', () => {
    it('makes file executable on non-Windows', () => {
      if (process.platform === 'win32') {
        return
      }
      const filePath = path.join(tempDir, 'executable')
      fs.writeFileSync(filePath, '#!/bin/bash\necho hello')
      makeExecutable(filePath)
      const stat = fs.statSync(filePath)
      expect(stat.mode & 0o755).toBe(0o755)
    })
  })

  describe('hasCachedBinary', () => {
    it('returns false when binary does not exist', () => {
      expect(hasCachedBinary('my-tool', 'binary', tempDir)).toBe(false)
    })

    it('returns false when binary is too small', () => {
      const toolDir = path.join(tempDir, 'my-tool')
      fs.mkdirSync(toolDir)
      fs.writeFileSync(path.join(toolDir, 'binary'), 'small')
      expect(hasCachedBinary('my-tool', 'binary', tempDir)).toBe(false)
    })

    it('returns true when valid binary exists', () => {
      const toolDir = path.join(tempDir, 'my-tool')
      fs.mkdirSync(toolDir)
      fs.writeFileSync(path.join(toolDir, 'binary'), Buffer.alloc(15000))
      expect(hasCachedBinary('my-tool', 'binary', tempDir)).toBe(true)
    })
  })

  describe('clearCache', () => {
    it('removes cache directory', () => {
      const toolDir = path.join(tempDir, 'my-tool')
      fs.mkdirSync(toolDir)
      fs.writeFileSync(path.join(toolDir, 'file'), 'content')
      clearCache('my-tool', tempDir)
      expect(fs.existsSync(toolDir)).toBe(false)
    })

    it('does not throw when directory does not exist', () => {
      expect(() => clearCache('nonexistent', tempDir)).not.toThrow()
    })
  })
})
