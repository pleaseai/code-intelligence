/**
 * Dockerfile Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log } from './utils'

const DOCKERFILE_NPM: NpmCacheSpec = {
  serverId: 'dockerfile',
  cacheDir: 'dockerfile-lsp',
  packages: [{ package: 'dockerfile-language-server-nodejs', version: '0.13.0' }],
  required: [npmBin('docker-langserver')],
}

async function setupDockerfileDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(DOCKERFILE_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('docker-langserver'))
}

export const DockerfileServer: LSPServerInfo = {
  id: 'dockerfile',
  extensions: ['.dockerfile'],
  filenames: ['Dockerfile', 'Containerfile'],
  root: async (_file, projectPath) => projectPath,
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('docker-langserver')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'dockerfile')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupDockerfileDependencies()
    if (!serverPath) {
      log.error({ serverId: 'dockerfile', root }, 'Dockerfile LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'dockerfile')
    return { process: proc }
  },
}
