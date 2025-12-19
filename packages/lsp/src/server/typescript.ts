/**
 * TypeScript Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const TypescriptServer: LSPServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  root: nearestRoot(
    [
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ],
    ['deno.json', 'deno.jsonc'],
  ),
  async spawn(root) {
    const tsserver = Bun.which('typescript-language-server')
    if (!tsserver) {
      // Try via bunx
      try {
        const proc = spawn('bunx', ['typescript-language-server', '--stdio'], {
          cwd: root,
          env: { ...process.env, BUN_BE_BUN: '1' },
        })
        attachLSPProcessHandlers(proc, 'typescript')
        return { process: proc }
      }
      catch (err) {
        log.error({ err }, 'Failed to spawn typescript-language-server via bunx')
        return undefined
      }
    }

    const proc = spawn(tsserver, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'typescript')
    return { process: proc }
  },
}
