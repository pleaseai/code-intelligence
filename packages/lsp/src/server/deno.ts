/**
 * Deno Language Server
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { attachLSPProcessHandlers, log } from './utils'

export const DenoServer: LSPServerInfo = {
  id: 'deno',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  root: async (file, projectPath) => {
    let current = path.dirname(file)
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of ['deno.json', 'deno.jsonc']) {
        const target = path.join(current, pattern)
        try {
          await fs.access(target)
          return current
        }
        catch (err) {
          // Only continue searching if file not found
          const isNotFound = err instanceof Error
            && 'code' in err
            && (err as NodeJS.ErrnoException).code === 'ENOENT'
          if (!isNotFound) {
            log.warn({ target, err }, 'Unexpected error accessing file')
          }
        }
      }
      const parent = path.dirname(current)
      if (parent === current)
        break
      current = parent
    }
    return undefined
  },
  async spawn(root) {
    const deno = Bun.which('deno')
    if (!deno)
      return undefined

    const proc = spawn(deno, ['lsp'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'deno')
    return { process: proc }
  },
}
