/**
 * TexLab (LaTeX) Language Server
 * Auto-downloads from GitHub releases
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, extractZip, log, nearestRoot } from './utils'

function getTexlabResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'texlab-lsp')
}

export const TexlabServer: LSPServerInfo = {
  id: 'texlab',
  extensions: ['.tex', '.bib'],
  root: nearestRoot(['.latexmkrc', 'latexmkrc', '.texlabroot', 'texlabroot']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getTexlabResourcesDir()

    // Check PATH first
    let bin = Bun.which('texlab', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      log.info('Downloading texlab from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/latex-lsp/texlab/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch texlab release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      const texArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
      const texPlatform = process.platform === 'darwin' ? 'macos' : isWindows ? 'windows' : 'linux'
      const archiveExt = isWindows ? 'zip' : 'tar.gz'

      const assetName = `texlab-${texArch}-${texPlatform}.${archiveExt}`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'texlab asset not found')
        return undefined
      }

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)

      if (archiveExt === 'zip') {
        await extractZip(archivePath, resourcesDir)
      }
      else {
        const tarProc = Bun.spawn(['tar', '-xzf', archivePath], {
          cwd: resourcesDir,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const tarExitCode = await tarProc.exited
        if (tarExitCode !== 0) {
          const stderr = await new Response(tarProc.stderr).text()
          log.error({ tarExitCode, stderr }, 'Failed to extract texlab archive')
          await fs.rm(archivePath, { force: true })
          return undefined
        }
      }

      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `texlab${ext}`)
      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'texlab binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'texlab installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'texlab')
    return { process: proc }
  },
}
