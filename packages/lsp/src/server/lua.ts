/**
 * LuaLS (Lua) Language Server
 * Auto-downloads from GitHub releases
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, autoInstallDisabled, downloadFile, extractZip, log, nearestRoot } from './utils'

function getLuaLsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'lua-lsp')
}

export const LuaLsServer: LSPServerInfo = {
  id: 'lua-ls',
  extensions: ['.lua'],
  root: nearestRoot([
    '.luarc.json',
    '.luarc.jsonc',
    '.luacheckrc',
    '.stylua.toml',
    'stylua.toml',
    'selene.toml',
    'selene.yml',
  ]),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getLuaLsResourcesDir()
    const installDir = path.join(resourcesDir, `lua-language-server-${process.arch}-${process.platform}`)

    // Check PATH first, then a previous download
    let bin = Bun.which('lua-language-server', {
      PATH: [process.env.PATH, resourcesDir, path.join(installDir, 'bin')].filter(Boolean).join(path.delimiter),
    })

    if (!bin) {
      if (autoInstallDisabled('lua-ls')) { return undefined }
      log.info('Downloading lua-language-server from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/LuaLS/lua-language-server/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch lua-language-server release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      // LuaLS uses platform/arch naming that matches Node.js convention
      // darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64
      const platform = process.platform
      const arch = process.arch
      const archiveExt = isWindows ? 'zip' : 'tar.gz'

      // Remove 'v' prefix from tag if present (tag is v3.13.5, asset uses 3.13.5)
      const version = release.tag_name.replace(/^v/, '')

      const assetName = `lua-language-server-${version}-${platform}-${arch}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName, availableAssets: release.assets.map(a => a.name).slice(0, 10) }, 'lua-language-server asset not found for this platform')
        return undefined
      }

      // Extract next to installDir and move it into place only once it is complete,
      // so an interrupted download never leaves a binary the lookup above would reuse.
      const stagingDir = `${installDir}.partial`
      await fs.rm(stagingDir, { force: true, recursive: true })
      await fs.mkdir(stagingDir, { recursive: true })

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
        await extractZip(archivePath, stagingDir)
      }
      else {
        const tarProc = Bun.spawn(['tar', '-xzf', archivePath, '-C', stagingDir], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const tarExitCode = await tarProc.exited
        if (tarExitCode !== 0) {
          const stderr = await new Response(tarProc.stderr).text()
          log.error({ tarExitCode, stderr }, 'Failed to extract lua-language-server archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      const stagedBin = path.join(stagingDir, 'bin', `lua-language-server${ext}`)
      try {
        await fs.access(stagedBin)
      }
      catch {
        log.error({ bin: stagedBin }, 'lua-language-server binary not found after extraction')
        return undefined
      }

      await fs.rm(installDir, { force: true, recursive: true })
      await fs.rename(stagingDir, installDir)
      bin = path.join(installDir, 'bin', `lua-language-server${ext}`)

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'lua-language-server installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'lua-ls')
    return { process: proc }
  },
}
