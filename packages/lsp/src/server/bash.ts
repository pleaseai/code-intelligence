/**
 * Bash Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log } from './utils'

const BASH_NPM: NpmCacheSpec = {
  serverId: 'bash',
  cacheDir: 'bash-lsp',
  packages: [{ package: 'bash-language-server', version: '5.4.3' }],
  required: [npmBin('bash-language-server')],
}

async function setupBashDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(BASH_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('bash-language-server'))
}

export const BashServer: LSPServerInfo = {
  id: 'bash',
  extensions: ['.sh', '.bash', '.zsh', '.ksh'],
  root: async (_file, projectPath) => projectPath,
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('bash-language-server')
    if (systemBin) {
      const proc = spawn(systemBin, ['start'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'bash')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupBashDependencies()
    if (!serverPath) {
      log.error({ serverId: 'bash', root }, 'Bash LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['start'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'bash')
    return { process: proc }
  },
}
