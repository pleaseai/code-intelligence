/**
 * Clangd (C/C++) Language Server
 * Auto-downloads from GitHub releases
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, extractZip, log, nearestRoot } from './utils'

function getClangdResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'clangd-lsp')
}

export const ClangdServer: LSPServerInfo = {
  id: 'clangd',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'],
  root: nearestRoot(['compile_commands.json', 'compile_flags.txt', '.clangd', 'CMakeLists.txt', 'Makefile']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getClangdResourcesDir()
    const args = ['--background-index', '--clang-tidy']

    // Check PATH first
    let bin = Bun.which('clangd')
    if (bin) {
      const proc = spawn(bin, args, { cwd: root })
      attachLSPProcessHandlers(proc, 'clangd')
      return { process: proc }
    }

    // Check extracted directories (clangd is always in versioned subdirectory like clangd_18.1.3/bin/)
    try {
      const entries = await fs.readdir(resourcesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('clangd_'))
          continue
        const candidate = path.join(resourcesDir, entry.name, 'bin', `clangd${ext}`)
        try {
          await fs.access(candidate)
          const proc = spawn(candidate, args, { cwd: root })
          attachLSPProcessHandlers(proc, 'clangd')
          return { process: proc }
        }
        catch {
          continue
        }
      }
    }
    catch {
      // resourcesDir doesn't exist yet
    }

    // Download from GitHub releases
    log.info('Downloading clangd from GitHub releases')
    await fs.mkdir(resourcesDir, { recursive: true })

    const releaseResponse = await fetch('https://api.github.com/repos/clangd/clangd/releases/latest')
    if (!releaseResponse.ok) {
      log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch clangd release info from GitHub')
      return undefined
    }

    const release = await releaseResponse.json() as {
      tag_name: string
      assets: Array<{ name: string, browser_download_url: string }>
    }

    const tag = release.tag_name
    const platformTokens: Record<string, string> = {
      darwin: 'mac',
      linux: 'linux',
      win32: 'windows',
    }
    const token = platformTokens[process.platform]
    if (!token) {
      log.error({ platform: process.platform }, 'Unsupported platform for clangd')
      return undefined
    }

    const asset = release.assets.find(a =>
      a.name.includes(token) && a.name.includes(tag),
    )
    if (!asset) {
      log.error({ tag, platform: process.platform }, 'clangd asset not found')
      return undefined
    }

    const archivePath = path.join(resourcesDir, asset.name)
    await downloadFile(asset.browser_download_url, archivePath)

    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, resourcesDir)
    }
    else {
      const tarProc = Bun.spawn(['tar', '-xf', archivePath], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const tarExitCode = await tarProc.exited
      if (tarExitCode !== 0) {
        const stderr = await new Response(tarProc.stderr).text()
        log.error({ tarExitCode, stderr }, 'Failed to extract clangd archive')
        await fs.rm(archivePath, { force: true })
        return undefined
      }
    }

    await fs.rm(archivePath, { force: true })

    bin = path.join(resourcesDir, `clangd_${tag}`, 'bin', `clangd${ext}`)
    try {
      await fs.access(bin)
    }
    catch {
      log.error({ bin }, 'clangd binary not found after extraction')
      return undefined
    }

    if (!isWindows) {
      await fs.chmod(bin, 0o755)
    }

    log.info({ bin }, 'clangd installed')

    const proc = spawn(bin, args, { cwd: root })
    attachLSPProcessHandlers(proc, 'clangd')
    return { process: proc }
  },
}
