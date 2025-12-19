/**
 * Svelte Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const SVELTE_RUNTIME_DEPS = {
  svelteLanguageServer: {
    package: 'svelte-language-server',
    version: '0.17.7',
  },
}

function getSvelteResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'svelte-lsp')
}

async function setupSvelteDependencies(): Promise<string | undefined> {
  const resourcesDir = getSvelteResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `svelteserver${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = SVELTE_RUNTIME_DEPS.svelteLanguageServer.version

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
    log.info('Installing Svelte Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${SVELTE_RUNTIME_DEPS.svelteLanguageServer.package}@${SVELTE_RUNTIME_DEPS.svelteLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Svelte npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Svelte version marker')
      }
      log.info('Svelte Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Svelte dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Svelte LSP binary not found after installation')
    return undefined
  }
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
