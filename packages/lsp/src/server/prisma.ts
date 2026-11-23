/**
 * Prisma Language Server
 * Uses @prisma/language-server npm package with auto-download
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { ensureNpmCache, npmBin } from './npm-cache'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const PRISMA_NPM: NpmCacheSpec = {
  serverId: 'prisma',
  cacheDir: 'prisma-lsp',
  packages: [{ package: '@prisma/language-server', version: '31.1.35' }],
  required: [npmBin('prisma-language-server')],
}

async function setupPrismaDependencies(): Promise<string | undefined> {
  const resourcesDir = await ensureNpmCache(PRISMA_NPM)
  return resourcesDir && path.join(resourcesDir, npmBin('prisma-language-server'))
}

export const PrismaServer: LSPServerInfo = {
  id: 'prisma',
  extensions: ['.prisma'],
  root: nearestRoot(['schema.prisma', 'prisma/schema.prisma']),
  async spawn(root) {
    const node = Bun.which('node')
    const npm = Bun.which('npm')

    if (!node || !npm) {
      log.warn('Node.js and npm are required for Prisma Language Server')
      return undefined
    }

    const prismaServerPath = await setupPrismaDependencies()
    if (!prismaServerPath) {
      log.warn('Failed to setup Prisma LSP dependencies')
      return undefined
    }

    try {
      const proc = spawn(prismaServerPath, ['--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'prisma')

      return { process: proc }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Prisma Language Server')
      return undefined
    }
  },
}
