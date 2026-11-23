/**
 * LuaLS (Lua) Language Server
 * Auto-downloads from GitHub releases
 */

import type { ReleaseBinarySpec } from './github-release'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { downloadReleaseBinary, findCachedBinary, serverCacheDir } from './github-release'
import { attachLSPProcessHandlers, autoInstallDisabled, log, nearestRoot } from './utils'

const LUA_RELEASE: ReleaseBinarySpec = {
  serverId: 'lua-ls',
  repo: 'LuaLS/lua-language-server',
  // Assets use Node's platform/arch names and drop the tag's `v`, e.g. 3.13.5-darwin-arm64
  assetName: release => `lua-language-server-${release.tag_name.replace(/^v/, '')}-${process.platform}-${process.arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`,
}

async function publishInstall(stagingDir: string, installDir: string, bin: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.rename(stagingDir, installDir)
      return true
    }
    catch {
      try {
        await fs.access(bin)
        return true
      }
      catch {
        try {
          await fs.rm(installDir, { force: true, recursive: true })
        }
        catch (err) {
          log.warn({ err, installDir }, 'Failed to remove a broken lua-language-server install')
          return false
        }
      }
    }
  }
  return false
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
    const ext = process.platform === 'win32' ? '.exe' : ''
    const resourcesDir = serverCacheDir('lua-lsp')
    const installDir = path.join(resourcesDir, `lua-language-server-${process.arch}-${process.platform}`)

    let bin = findCachedBinary('lua-language-server', resourcesDir, path.join(installDir, 'bin'))

    if (!bin) {
      if (autoInstallDisabled('lua-ls')) { return undefined }
      log.info('Downloading lua-language-server from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const stagingDir = await fs.mkdtemp(`${installDir}.partial-`)
      bin = path.join(installDir, 'bin', `lua-language-server${ext}`)
      try {
        const stagedBin = path.join(stagingDir, 'bin', `lua-language-server${ext}`)
        if (!await downloadReleaseBinary(LUA_RELEASE, stagingDir, stagedBin)) {
          return undefined
        }
        if (!await publishInstall(stagingDir, installDir, bin)) {
          log.error({ bin }, 'lua-language-server install could not be moved into place')
          return undefined
        }
      }
      finally {
        await fs.rm(stagingDir, { force: true, recursive: true }).catch((err) => {
          log.warn({ err, stagingDir }, 'Failed to clean up lua-language-server staging dir')
        })
      }

      log.info({ bin }, 'lua-language-server installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'lua-ls')
    return { process: proc }
  },
}
