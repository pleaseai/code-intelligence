/**
 * Astro Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const ASTRO_RUNTIME_DEPS = {
  astroLanguageServer: {
    package: '@astrojs/language-server',
    version: '2.16.6',
  },
  typescript: {
    package: 'typescript',
    version: '5.7.2',
  },
}

function getAstroResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'astro-lsp')
}

function getAstroExpectedVersion(): string {
  return [
    ASTRO_RUNTIME_DEPS.astroLanguageServer.version,
    ASTRO_RUNTIME_DEPS.typescript.version,
  ].join('_')
}

async function setupAstroDependencies(): Promise<{
  serverPath: string
  tsdkPath: string
} | undefined> {
  const resourcesDir = getAstroResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `astro-ls${ext}`)
  const tsdkPath = path.join(resourcesDir, 'node_modules', 'typescript', 'lib')
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = getAstroExpectedVersion()

  let needsInstall = false

  try {
    await fs.access(serverPath)
    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
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
    log.info('Installing Astro Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packages = [
        `${ASTRO_RUNTIME_DEPS.astroLanguageServer.package}@${ASTRO_RUNTIME_DEPS.astroLanguageServer.version}`,
        `${ASTRO_RUNTIME_DEPS.typescript.package}@${ASTRO_RUNTIME_DEPS.typescript.version}`,
      ]
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, ...packages], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Astro npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Astro version marker')
      }
      log.info('Astro Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Astro dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    await fs.access(tsdkPath)
    return { serverPath, tsdkPath }
  }
  catch {
    log.error({ serverPath, tsdkPath }, 'Astro LSP files not found after installation')
    return undefined
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
