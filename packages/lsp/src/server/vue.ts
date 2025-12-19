/**
 * Vue Language Server
 * Uses @vue/language-server with Full Hybrid Mode
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

/**
 * Vue Language Server runtime dependency configuration
 */
const VUE_RUNTIME_DEPS = {
  vueLanguageServer: {
    package: '@vue/language-server',
    version: '2.2.0',
  },
  vueTypeScriptPlugin: {
    package: '@vue/typescript-plugin',
    version: '2.2.0',
  },
  typescript: {
    package: 'typescript',
    version: '5.7.2',
  },
  typeScriptLanguageServer: {
    package: 'typescript-language-server',
    version: '4.3.3',
  },
}

function getVueResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'vue-lsp')
}

function getVueExpectedVersion(): string {
  return [
    VUE_RUNTIME_DEPS.vueLanguageServer.version,
    VUE_RUNTIME_DEPS.vueTypeScriptPlugin.version,
    VUE_RUNTIME_DEPS.typescript.version,
    VUE_RUNTIME_DEPS.typeScriptLanguageServer.version,
  ].join('_')
}

async function setupVueDependencies(): Promise<{
  vueServerPath: string
  tsServerPath: string
  tsdkPath: string
  vuePluginPath: string
} | undefined> {
  const resourcesDir = getVueResourcesDir()
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.cmd' : ''

  const vueServerPath = path.join(resourcesDir, 'node_modules', '.bin', `vue-language-server${ext}`)
  const tsServerPath = path.join(resourcesDir, 'node_modules', '.bin', `typescript-language-server${ext}`)
  const tsdkPath = path.join(resourcesDir, 'node_modules', 'typescript', 'lib')
  const vuePluginPath = path.join(resourcesDir, 'node_modules', '@vue', 'typescript-plugin')

  const versionFile = path.join(resourcesDir, '.installed_version')
  const expectedVersion = getVueExpectedVersion()

  let needsInstall = false

  try {
    await fs.access(vueServerPath)
    await fs.access(tsServerPath)

    try {
      const installedVersion = await fs.readFile(versionFile, 'utf-8')
      if (installedVersion.trim() !== expectedVersion) {
        log.warn({ installed: installedVersion.trim(), expected: expectedVersion }, 'Vue version mismatch')
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
    log.info('Installing Vue Language Server dependencies')

    try {
      await fs.mkdir(resourcesDir, { recursive: true })

      const packages = [
        `${VUE_RUNTIME_DEPS.vueLanguageServer.package}@${VUE_RUNTIME_DEPS.vueLanguageServer.version}`,
        `${VUE_RUNTIME_DEPS.vueTypeScriptPlugin.package}@${VUE_RUNTIME_DEPS.vueTypeScriptPlugin.version}`,
        `${VUE_RUNTIME_DEPS.typescript.package}@${VUE_RUNTIME_DEPS.typescript.version}`,
        `${VUE_RUNTIME_DEPS.typeScriptLanguageServer.package}@${VUE_RUNTIME_DEPS.typeScriptLanguageServer.version}`,
      ]

      const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, ...packages], {
        cwd: resourcesDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Vue npm install failed')
        return undefined
      }

      try {
        await fs.writeFile(versionFile, expectedVersion)
      }
      catch (writeErr) {
        log.warn({ err: writeErr }, 'Failed to write Vue version marker file')
      }
      log.info('Vue Language Server dependencies installed successfully')
    }
    catch (err) {
      log.error({ err }, 'Failed to install Vue dependencies')
      return undefined
    }
  }

  const requiredPaths = [
    { path: vueServerPath, name: 'vue-language-server' },
    { path: tsServerPath, name: 'typescript-language-server' },
    { path: tsdkPath, name: 'TypeScript SDK' },
    { path: vuePluginPath, name: '@vue/typescript-plugin' },
  ]

  for (const { path: filePath, name } of requiredPaths) {
    try {
      await fs.access(filePath)
    }
    catch (err) {
      log.error({ name, filePath, err }, 'Vue required file not found after installation')
      return undefined
    }
  }

  return { vueServerPath, tsServerPath, tsdkPath, vuePluginPath }
}

export const VueServer: LSPServerInfo = {
  id: 'vue',
  extensions: ['.vue'],
  root: nearestRoot(
    [
      'package.json',
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ],
    ['deno.json', 'deno.jsonc'],
  ),
  async spawn(root) {
    const node = Bun.which('node')
    const npm = Bun.which('npm')

    if (!node || !npm) {
      log.warn('Node.js and npm are required for Vue Language Server')
      return undefined
    }

    const deps = await setupVueDependencies()
    if (!deps) {
      log.warn('Failed to setup Vue LSP dependencies')
      return undefined
    }

    const { vueServerPath, tsdkPath } = deps

    try {
      const proc = spawn(vueServerPath, ['--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'vue')

      return {
        process: proc,
        initialization: {
          vue: {
            hybridMode: true,
          },
          typescript: {
            tsdk: tsdkPath,
          },
        },
      }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn Vue Language Server')
      return undefined
    }
  },
}
