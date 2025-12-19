/**
 * Dockerfile Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log } from './utils'

const DOCKERFILE_RUNTIME_DEPS = {
  dockerfileLanguageServer: {
    package: 'dockerfile-language-server-nodejs',
    version: '0.13.0',
  },
}

function getDockerfileResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'dockerfile-lsp')
}

async function setupDockerfileDependencies(): Promise<string | undefined> {
  const resourcesDir = getDockerfileResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `docker-langserver${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.version

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
    log.info('Installing Dockerfile Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.package}@${DOCKERFILE_RUNTIME_DEPS.dockerfileLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Dockerfile npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Dockerfile version marker')
      }
      log.info('Dockerfile Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Dockerfile dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'Dockerfile LSP binary not found after installation')
    return undefined
  }
}

export const DockerfileServer: LSPServerInfo = {
  id: 'dockerfile',
  extensions: ['.dockerfile'],
  filenames: ['Dockerfile', 'Containerfile'],
  root: async (_file, projectPath) => projectPath,
  async spawn(root) {
    // Check system first
    const systemBin = Bun.which('docker-langserver')
    if (systemBin) {
      const proc = spawn(systemBin, ['--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'dockerfile')
      return { process: proc }
    }

    // Setup dependencies
    const serverPath = await setupDockerfileDependencies()
    if (!serverPath) {
      log.error({ serverId: 'dockerfile', root }, 'Dockerfile LSP failed to start - dependency setup failed')
      return undefined
    }

    const proc = spawn(serverPath, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'dockerfile')
    return { process: proc }
  },
}
