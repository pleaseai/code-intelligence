/**
 * Svelte Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const SVELTE_NPM: NpmCacheSpec = {
  serverId: 'svelte',
  cacheDir: 'svelte-lsp',
  packages: [{ package: 'svelte-language-server', version: '0.17.7' }],
  required: [npmBin('svelteserver')],
}

async function setupSvelteDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(SVELTE_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('svelteserver'))
}

export const SvelteServer: LSPServerInfo = {
  id: 'svelte',
  extensions: ['.svelte'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const systemBin = Bun.which('svelteserver')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'svelte')
      return { process: proc }
    }

    const serverPath = await setupSvelteDependencies()
    if (!serverPath) {
      log.error({ serverId: 'svelte', root }, 'Svelte LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'svelte')
    return { process: proc }
  },
}
