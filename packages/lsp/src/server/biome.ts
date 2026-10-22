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

/** @biomejs/biome version installed by the bunx fallback. */
export const BIOME_VERSION = '2.6.2'

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
    // Read PATH now rather than the copy Bun captured at startup
    const globalBin = Bun.which('biome', { PATH: process.env.PATH ?? '' })
    if (globalBin) {
      const proc = spawn(globalBin, ['lsp-proxy', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'biome')
      return { process: proc }
    }

    // Fallback: Try via bunx. The unscoped `biome` npm package is an unrelated project.
    // spawn reports a missing bunx only as an async 'error' event, so check for it first.
    const bunx = Bun.which('bunx', { PATH: process.env.PATH ?? '' })
    if (!bunx) {
      log.warn({ root }, 'Biome not found. Install with: npm install @biomejs/biome')
      return undefined
    }
    const proc = spawn(bunx, [`@biomejs/biome@${BIOME_VERSION}`, 'lsp-proxy', '--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'biome')
    return { process: proc }
  },
}
