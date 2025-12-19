/**
 * Prisma Language Server
 * Uses @prisma/language-server npm package with auto-download
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const PRISMA_RUNTIME_DEPS = {
  prismaLanguageServer: {
    package: '@prisma/language-server',
    version: '31.1.35',
  },
}

function getPrismaResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'prisma-lsp')
}

async function setupPrismaDependencies(): Promise<string | undefined> {
  const resourcesDir = getPrismaResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const prismaServerPath = path.join(resourcesDir, 'node_modules', '.bin', `prisma-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = PRISMA_RUNTIME_DEPS.prismaLanguageServer.version

  let needsInstall = false

  try {
    await fs.access(prismaServerPath)

    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        log.warn({ installed: installedVersion.trim(), expected: expectedVersion }, 'Prisma version mismatch')
        needsInstall = true
      }
    }
    catch {
      needsInstall = true
    }
  }
  catch {
    needsInstall = true
  }

  if (needsInstall) {
    log.info('Installing Prisma Language Server')

    try {
      await fs.mkdir(resourcesDir, { recursive: true })

      const packageSpec = `${PRISMA_RUNTIME_DEPS.prismaLanguageServer.package}@${PRISMA_RUNTIME_DEPS.prismaLanguageServer.version}`

      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Prisma npm install failed')
        return undefined
      }

      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Prisma version marker file')
      }
      log.info('Prisma Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Prisma dependencies')
      return undefined
    }
  }

  try {
    await fs.access(prismaServerPath)
    return prismaServerPath
  }
  catch (err) {
    log.error({ prismaServerPath, err }, 'Prisma LSP binary not found after installation')
    return undefined
  }
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
