/**
 * Vue Language Server
 * Uses @vue/language-server with Full Hybrid Mode
 */

import type { NpmCacheSpec } from './npm-cache'
import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { ensureNpmCache, npmBin } from './npm-cache'
import { TS_LANGUAGE_SERVER_VERSION } from './typescript'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const VUE_PLUGIN_PATH = path.join('node_modules', '@vue', 'typescript-plugin')
const VUE_TSDK_PATH = path.join('node_modules', 'typescript', 'lib')

const VUE_NPM: NpmCacheSpec = {
  serverId: 'vue',
  cacheDir: 'vue-lsp',
  packages: [
    { package: '@vue/language-server', version: '2.2.0' },
    { package: '@vue/typescript-plugin', version: '2.2.0' },
    { package: 'typescript', version: '5.7.2' },
    { package: 'typescript-language-server', version: TS_LANGUAGE_SERVER_VERSION },
  ],
  required: [npmBin('vue-language-server'), npmBin('typescript-language-server'), VUE_TSDK_PATH, VUE_PLUGIN_PATH],
}

async function setupVueDependencies(): Promise<{
  vueServerPath: string
  tsServerPath: string
  tsdkPath: string
  vuePluginPath: string
} | undefined> {
  const resourcesDir = await ensureNpmCache(VUE_NPM)
  if (!resourcesDir) {
    return undefined
  }
  return {
    vueServerPath: path.join(resourcesDir, npmBin('vue-language-server')),
    tsServerPath: path.join(resourcesDir, npmBin('typescript-language-server')),
    tsdkPath: path.join(resourcesDir, VUE_TSDK_PATH),
    vuePluginPath: path.join(resourcesDir, VUE_PLUGIN_PATH),
  }
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
