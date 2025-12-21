/**
 * Biome Language Server
 * JS/TS/JSON/CSS linter with auto-download support
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const BiomeServer: LSPServerInfo = {
  id: 'biome',
  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.json',
    '.jsonc',
    '.vue',
    '.astro',
    '.svelte',
    '.css',
    '.graphql',
    '.gql',
    '.html',
  ],
  root: nearestRoot([
    'biome.json',
    'biome.jsonc',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.cmd' : ''

    // Check local node_modules/.bin first
    const localBin = path.join(root, 'node_modules', '.bin', `biome${ext}`)
    try {
      await fs.access(localBin)
      const proc = spawn(localBin, ['lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }
    catch {
      // Not found locally
    }

    // Check global PATH
    const globalBin = Bun.which('biome')
    if (globalBin) {
      const proc = spawn(globalBin, ['lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }

    // Fallback: Try via bunx
    try {
      const proc = spawn('bunx', ['biome', 'lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }
    catch (err) {
      log.warn({ root, err }, 'Biome not found. Install with: npm install @biomejs/biome')
      return undefined
    }
  },
}
