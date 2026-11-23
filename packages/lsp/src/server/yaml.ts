/**
 * YAML Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const YAML_NPM: NpmCacheSpec = {
  serverId: 'yaml',
  cacheDir: 'yaml-lsp',
  packages: [{ package: 'yaml-language-server', version: '1.17.0' }],
  required: [npmBin('yaml-language-server')],
}

async function setupYamlDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(YAML_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('yaml-language-server'))
}

export const YamlServer: LSPServerInfo = {
  id: 'yaml',
  extensions: ['.yaml', '.yml'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const systemBin = Bun.which('yaml-language-server')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'yaml')
      return { process: proc }
    }

    const serverPath = await setupYamlDependencies()
    if (!serverPath) {
      log.error({ serverId: 'yaml', root }, 'YAML LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'yaml')
    return { process: proc }
  },
}
