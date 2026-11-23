/**
 * Astro Language Server
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const ASTRO_NPM: NpmCacheSpec = {
  serverId: 'astro',
  cacheDir: 'astro-lsp',
  packages: [
    { package: '@astrojs/language-server', version: '2.16.6' },
    { package: 'typescript', version: '5.7.2' },
  ],
  required: [npmBin('astro-ls'), path.join('node_modules', 'typescript', 'lib')],
}

async function setupAstroDependencies(): Promise<{
  serverPath: string
  tsdkPath: string
} | undefined> {
  const resourcesDir = await ensureNpmCache(ASTRO_NPM)
  if (!resourcesDir) {
    return undefined
  }
  return {
    serverPath: path.join(resourcesDir, npmBin('astro-ls')),
    tsdkPath: path.join(resourcesDir, 'node_modules', 'typescript', 'lib'),
  }
}

export const AstroServer: LSPServerInfo = {
  id: 'astro',
  extensions: ['.astro'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const systemBin = Bun.which('astro-ls')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'astro')
      return { process: proc }
    }

    const deps = await setupAstroDependencies()
    if (!deps) {
      log.error({ serverId: 'astro', root }, 'Astro LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(deps.serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'astro')
    return {
      process: proc,
      initialization: {
        typescript: {
          tsdk: deps.tsdkPath,
        },
      },
    }
  },
}
