/**
 * TerraformLS Language Server
 * Auto-downloads from GitHub releases
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, extractZip, log, nearestRoot } from './utils'

function getTerraformResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'terraform-lsp')
}

export const TerraformServer: LSPServerInfo = {
  id: 'terraform',
  extensions: ['.tf', '.tfvars'],
  root: nearestRoot(['.terraform.lock.hcl', 'terraform.tfstate']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getTerraformResourcesDir()

    // Check PATH first
    let bin = Bun.which('terraform-ls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      log.info('Downloading terraform-ls from GitHub releases')
      await fs.mkdir(resourcesDir, { recursive: true })

      const releaseResponse = await fetch('https://api.github.com/repos/hashicorp/terraform-ls/releases/latest')
      if (!releaseResponse.ok) {
        log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch terraform-ls release info from GitHub')
        return undefined
      }

      const release = await releaseResponse.json() as {
        tag_name: string
        assets: Array<{ name: string, browser_download_url: string }>
      }

      const version = release.tag_name.replace('v', '')
      const tfArch = process.arch === 'arm64' ? 'arm64' : 'amd64'
      const tfPlatform = isWindows ? 'windows' : process.platform

      const assetName = `terraform-ls_${version}_${tfPlatform}_${tfArch}.zip`
      const asset = release.assets.find(a => a.name === assetName)
      if (!asset) {
        log.error({ assetName }, 'terraform-ls asset not found')
        return undefined
      }

      const archivePath = path.join(resourcesDir, assetName)
      await downloadFile(asset.browser_download_url, archivePath)
      await extractZip(archivePath, resourcesDir)
      await fs.rm(archivePath, { force: true })

      bin = path.join(resourcesDir, `terraform-ls${ext}`)
      try {
        await fs.access(bin)
      }
      catch {
        log.error({ bin }, 'terraform-ls binary not found after extraction')
        return undefined
      }

      if (!isWindows) {
        await fs.chmod(bin, 0o755)
      }

      log.info({ bin }, 'terraform-ls installed')
    }

    const proc = spawn(bin, ['serve'], { cwd: root })
    attachLSPProcessHandlers(proc, 'terraform')
    return {
      process: proc,
      initialization: {
        experimentalFeatures: {
          prefillRequiredFields: true,
          validateOnSave: true,
        },
      },
    }
  },
}
