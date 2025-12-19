/**
 * PHP Intelephense Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const PHP_RUNTIME_DEPS = {
  intelephense: {
    package: 'intelephense',
    version: '1.13.0',
  },
}

function getPhpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'php-lsp')
}

async function setupPhpDependencies(): Promise<string | undefined> {
  const resourcesDir = getPhpResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `intelephense${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = PHP_RUNTIME_DEPS.intelephense.version

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
    log.info('Installing PHP Intelephense')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${PHP_RUNTIME_DEPS.intelephense.package}@${PHP_RUNTIME_DEPS.intelephense.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'PHP npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write PHP version marker')
      }
      log.info('PHP Intelephense installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install PHP dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'PHP LSP binary not found after installation')
    return undefined
  }
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
