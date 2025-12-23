/**
 * Download and extraction utilities
 */

import { execSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createLogger } from '@pleaseai/logger'

const log = createLogger('binaries')

/**
 * Download a file from URL to destination
 */
export async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const body = response.body
  if (!body) {
    throw new Error(`No response body for ${url}`)
  }

  await fs.mkdir(path.dirname(dest), { recursive: true })
  const writeStream = createWriteStream(dest)
  await pipeline(body as unknown as NodeJS.ReadableStream, writeStream)
}

/**
 * Extract a tar.gz archive
 */
export async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'ignore' })
}

/**
 * Extract a zip archive (cross-platform: uses PowerShell on Windows, unzip on Unix)
 */
export async function extractZip(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })

  const isWindows = os.platform() === 'win32'

  let proc: ReturnType<typeof Bun.spawn>
  if (isWindows) {
    proc = Bun.spawn(
      ['powershell', '-NoProfile', '-Command', `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${destDir}'`],
      { stdout: 'pipe', stderr: 'pipe' },
    )
  }
  else {
    proc = Bun.spawn(['unzip', '-o', '-q', archivePath, '-d', destDir], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const stderrStream = proc.stderr
    const stderr = stderrStream && typeof stderrStream !== 'number'
      ? await new Response(stderrStream).text()
      : 'Unknown error'
    throw new Error(`Failed to extract ${archivePath}: ${stderr}`)
  }
}

/**
 * Download and extract an archive to destination directory
 * Automatically detects archive type from URL
 */
export async function downloadAndExtract(
  url: string,
  destDir: string,
  options?: {
    /** Override archive type detection */
    archiveType?: 'zip' | 'tar.gz'
    /** Cleanup temp files after extraction (default: true) */
    cleanup?: boolean
  },
): Promise<void> {
  const cleanup = options?.cleanup ?? true
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'binaries-download-'))

  // Determine archive type
  let archiveType = options?.archiveType
  if (!archiveType) {
    if (url.endsWith('.tar.gz') || url.endsWith('.tgz')) {
      archiveType = 'tar.gz'
    }
    else if (url.endsWith('.zip')) {
      archiveType = 'zip'
    }
    else {
      throw new Error(`Cannot determine archive type for URL: ${url}`)
    }
  }

  const archiveExt = archiveType === 'tar.gz' ? '.tar.gz' : '.zip'
  const tempFile = path.join(tempDir, `archive${archiveExt}`)

  try {
    log.info({ url }, 'Downloading')
    await downloadFile(url, tempFile)

    log.info({ destDir }, 'Extracting')
    if (archiveType === 'tar.gz') {
      await extractTarGz(tempFile, destDir)
    }
    else {
      await extractZip(tempFile, destDir)
    }

    log.info('Download complete')
  }
  finally {
    if (cleanup) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        log.warn({ tempDir, err }, 'Failed to cleanup temp directory')
      })
    }
  }
}
