/**
 * Oxlint Language Server
 * Based on opencode PR #5570
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const OxlintServer: LSPServerInfo = {
  id: 'oxlint',
  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.vue',
    '.astro',
    '.svelte',
  ],
  root: nearestRoot([
    '.oxlintrc.json',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package.json',
  ]),
  async spawn(root) {
    const ext = process.platform === 'win32' ? '.cmd' : ''

    const resolveBin = async (
      binName: string,
    ): Promise<string | undefined> => {
      const localBin = path.join(root, 'node_modules', '.bin', binName + ext)
      try {
        await fs.access(localBin)
        return localBin
      }
      catch (err: unknown) {
        // Only ignore ENOENT (file not found), log other errors
        const isNotFound
          = err instanceof Error
            && 'code' in err
            && (err as NodeJS.ErrnoException).code === 'ENOENT'
        if (!isNotFound) {
          log.error({ localBin, err }, 'Cannot access local oxlint binary')
        }
      }

      // Check global PATH
      const globalBin = Bun.which(binName)
      if (globalBin)
        return globalBin

      return undefined
    }

    // Try oxlint with --lsp flag first
    const lintBin = await resolveBin('oxlint')
    if (lintBin) {
      const proc = Bun.spawn([lintBin, '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.warn({ lintBin, exitCode, stderr: stderr.slice(0, 200) }, 'oxlint binary failed --help')
      }
      else {
        const help = await new Response(proc.stdout).text()
        if (help.includes('--lsp')) {
          const lspProc = spawn(lintBin, ['--lsp'], {
            cwd: root,
          })
          attachLSPProcessHandlers(lspProc, 'oxlint')
          return { process: lspProc }
        }
      }
    }

    // Fallback to oxc_language_server
    const serverBin = await resolveBin('oxc_language_server')
    if (serverBin) {
      const serverProc = spawn(serverBin, [], {
        cwd: root,
      })
      attachLSPProcessHandlers(serverProc, 'oxlint')
      return { process: serverProc }
    }

    // Neither found - log diagnostic
    log.warn({ root }, 'Could not start oxlint LSP server. Install with: npm install -D oxlint')
    return undefined
  },
}
