/**
 * YAML Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const YAML_RUNTIME_DEPS = {
  yamlLanguageServer: {
    package: 'yaml-language-server',
    version: '1.17.0',
  },
}

function getYamlResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'yaml-lsp')
}

async function setupYamlDependencies(): Promise<string | undefined> {
  const resourcesDir = getYamlResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const serverPath = path.join(resourcesDir, 'node_modules', '.bin', `yaml-language-server${ext}`)
  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = YAML_RUNTIME_DEPS.yamlLanguageServer.version

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
    log.info('Installing YAML Language Server')
    try {
      await fs.mkdir(resourcesDir, { recursive: true })
      const packageSpec = `${YAML_RUNTIME_DEPS.yamlLanguageServer.package}@${YAML_RUNTIME_DEPS.yamlLanguageServer.version}`
      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, packageSpec], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'YAML npm install failed')
        return undefined
      }
      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write YAML version marker')
      }
      log.info('YAML Language Server installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install YAML dependencies')
      return undefined
    }
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'YAML LSP binary not found after installation')
    return undefined
  }
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
