/**
 * Zls (Zig) Language Server
 * Auto-downloads from GitHub releases
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, extractZip, log, nearestRoot } from './utils'

function getZlsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'zls-lsp')
}

export const ZlsServer: LSPServerInfo = {
  id: 'zls',
  extensions: ['.zig', '.zon'],
  root: nearestRoot(['build.zig']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getZlsResourcesDir()

    // Check PATH first
    let bin = Bun.which('zls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const zig = Bun.which('zig')
      if (!zig) {
        log.warn('Zig is required for ZLS. Install Zig first.')
        return undefined
      }

      log.info('Downloading ZLS from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      // Fetch latest release
      const releaseResponse = await fetch('https://api.github.com/repos/zigtools/zls/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch ZLS release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as { assets: Array<{ name: string, browser_download_url: string }> }

      // Map platform/arch
      const archMap: Record<string, string> = { arm64: 'aarch64', x64: 'x86_64', ia32: 'x86' }
      const platformMap: Record<string, string> = { darwin: 'macos', win32: 'windows', linux: 'linux' }
      const zlsArch = archMap[process.arch] || process.arch
      const zlsPlatform = platformMap[process.platform] || process.platform
      const archiveExt = isWindows ? 'zip' : 'tar.xz'

      const assetName = `zls-${zlsArch}-${zlsPlatform}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'ZLS asset not found for this platform')
        return undefined
      }

      // Download and extract
      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
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
          log.error({ tarExitCode, stderr }, 'Failed to extract ZLS archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `zls${ext}`)

      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'ZLS binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'ZLS installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'zls')
    return { process: proc }
  },
}
