/**
 * TexLab (LaTeX) Language Server
 * Auto-downloads from GitHub releases
 */

import type { ReleaseBinarySpec } from './github-release'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { downloadReleaseBinary, findCachedBinary, serverCacheDir } from './github-release'
import { attachLSPProcessHandlers, autoInstallDisabled, log, nearestRoot } from './utils'

const TEXLAB_RELEASE: ReleaseBinarySpec = {
  serverId: 'texlab',
  repo: 'latex-lsp/texlab',
  assetName: () => {
    const isWindows = process.platform === 'win32'
    const texArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    const texPlatform = process.platform === 'darwin' ? 'macos' : isWindows ? 'windows' : 'linux'
    return `texlab-${texArch}-${texPlatform}.${isWindows ? 'zip' : 'tar.gz'}`
  },
}

export const TexlabServer: LSPServerInfo = {
  id: 'texlab',
  extensions: ['.tex', '.bib'],
  root: nearestRoot(['.latexmkrc', 'latexmkrc', '.texlabroot', 'texlabroot']),
  async spawn(root) {
    const resourcesDir = serverCacheDir('texlab-lsp')
    let bin = findCachedBinary('texlab', resourcesDir)

    if (!bin) {
      if (autoInstallDisabled('texlab')) { return undefined }
      log.info('Downloading texlab from GitHub releases')
      bin = path.join(resourcesDir, `texlab${process.platform === 'win32' ? '.exe' : ''}`)
      if (!await downloadReleaseBinary(TEXLAB_RELEASE, resourcesDir, bin)) { return undefined }
      log.info({ bin }, 'texlab installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'texlab')
    return { process: proc }
  },
}
