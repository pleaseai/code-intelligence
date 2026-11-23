/**
 * PHP Intelephense Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const PHP_NPM: NpmCacheSpec = {
  serverId: 'php',
  cacheDir: 'php-lsp',
  packages: [{ package: 'intelephense', version: '1.13.0' }],
  required: [npmBin('intelephense')],
}

async function setupPhpDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(PHP_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('intelephense'))
}

export const PhpServer: LSPServerInfo = {
  id: 'php',
  extensions: ['.php'],
  root: nearestRoot(['composer.json', 'composer.lock', '.php-version']),
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('intelephense')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'php')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupPhpDependencies()
    if (!serverPath) {
      log.error({ serverId: 'php', root }, 'PHP LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'php')
    return { process: proc }
  },
}
