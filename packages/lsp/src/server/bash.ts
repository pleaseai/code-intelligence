/**
 * Bash Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log } from './utils'

const BASH_RUNTIME_DEPS = {
  bashLanguageServer: {
    package: 'bash-language-server',
    version: '5.4.3',
  },
}

function getBashResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'bash-lsp')
}

async function setupBashDependencies(): Promise<string | undefined> {
  const resourcesDir = getBashResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `bash-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = BASH_RUNTIME_DEPS.bashLanguageServer.version

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
    log.info('Installing Bash Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${BASH_RUNTIME_DEPS.bashLanguageServer.package}@${BASH_RUNTIME_DEPS.bashLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Bash npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Bash version marker')
      }
      log.info('Bash Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Bash dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Bash LSP binary not found after installation')
    return undefined
  }
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
