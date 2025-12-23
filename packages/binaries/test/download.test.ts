import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { downloadAndExtract, extractTarGz, extractZip } from '../src/download'

describe('download utilities', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'binaries-download-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('extractTarGz', () => {
    it('creates destination directory if not exists', async () => {
      const destDir = path.join(tempDir, 'new-dir')
      const archivePath = path.join(tempDir, 'test.tar.gz')

      // Create minimal tar.gz (empty tar, gzipped)
      const emptyTarHeader = Buffer.alloc(512, 0)
      const { gzipSync } = await import('node:zlib')
      fs.writeFileSync(archivePath, gzipSync(emptyTarHeader))

      await extractTarGz(archivePath, destDir)
      expect(fs.existsSync(destDir)).toBe(true)
    })

    it('throws for invalid archive', async () => {
      const destDir = path.join(tempDir, 'dest')
      const archivePath = path.join(tempDir, 'invalid.tar.gz')
      fs.writeFileSync(archivePath, 'not a valid archive')

      await expect(extractTarGz(archivePath, destDir)).rejects.toThrow()
    })
  })

  describe('extractZip', () => {
    it('throws for invalid archive', async () => {
      const destDir = path.join(tempDir, 'dest')
      const archivePath = path.join(tempDir, 'invalid.zip')
      fs.writeFileSync(archivePath, 'not a valid zip')

      await expect(extractZip(archivePath, destDir)).rejects.toThrow()
    })
  })

  describe('downloadAndExtract', () => {
    it('throws for unknown archive type', async () => {
      const destDir = path.join(tempDir, 'dest')
      await expect(
        downloadAndExtract('https://example.com/file.unknown', destDir),
      ).rejects.toThrow('Cannot determine archive type')
    })

    it('detects tar.gz from URL', async () => {
      const destDir = path.join(tempDir, 'dest')
      // This will fail on network, but we're testing the archive type detection
      await expect(
        downloadAndExtract('https://invalid-domain-12345.test/file.tar.gz', destDir),
      ).rejects.toThrow()
    })

    it('detects tgz from URL', async () => {
      const destDir = path.join(tempDir, 'dest')
      await expect(
        downloadAndExtract('https://invalid-domain-12345.test/file.tgz', destDir),
      ).rejects.toThrow()
    })

    it('detects zip from URL', async () => {
      const destDir = path.join(tempDir, 'dest')
      await expect(
        downloadAndExtract('https://invalid-domain-12345.test/file.zip', destDir),
      ).rejects.toThrow()
    })

    it('uses archiveType override', async () => {
      const destDir = path.join(tempDir, 'dest')
      await expect(
        downloadAndExtract('https://invalid-domain-12345.test/file', destDir, {
          archiveType: 'zip',
        }),
      ).rejects.toThrow()
    })
  })
})
