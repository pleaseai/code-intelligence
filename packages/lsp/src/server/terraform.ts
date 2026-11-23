/**
 * TerraformLS Language Server
 * Auto-downloads from GitHub releases
 */

import type { ReleaseBinarySpec } from './github-release'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { downloadReleaseBinary, findCachedBinary, serverCacheDir } from './github-release'
import { attachLSPProcessHandlers, autoInstallDisabled, log, nearestRoot } from './utils'

const TERRAFORM_RELEASE: ReleaseBinarySpec = {
  serverId: 'terraform',
  repo: 'hashicorp/terraform-ls',
  assetName: (release) => {
    const version = release.tag_name.replace('v', '')
    const tfArch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const tfPlatform = process.platform === 'win32' ? 'windows' : process.platform
    return `terraform-ls_${version}_${tfPlatform}_${tfArch}.zip`
  },
}

export const TerraformServer: LSPServerInfo = {
  id: 'terraform',
  extensions: ['.tf', '.tfvars'],
  root: nearestRoot(['.terraform.lock.hcl', 'terraform.tfstate']),
  async spawn(root) {
    const resourcesDir = serverCacheDir('terraform-lsp')
    let bin = findCachedBinary('terraform-ls', resourcesDir)

    if (!bin) {
      if (autoInstallDisabled('terraform')) { return undefined }
      log.info('Downloading terraform-ls from GitHub releases')
      bin = path.join(resourcesDir, `terraform-ls${process.platform === 'win32' ? '.exe' : ''}`)
      if (!await downloadReleaseBinary(TERRAFORM_RELEASE, resourcesDir, bin)) { return undefined }
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
