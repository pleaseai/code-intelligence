/**
 * Gleam Language Server
 * System-only, must be installed globally
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const GleamServer: LSPServerInfo = {
  id: 'gleam',
  extensions: ['.gleam'],
  root: nearestRoot(['gleam.toml']),
  async spawn(root) {
    const bin = Bun.which('gleam')
    if (!bin) {
      log.warn('gleam not found. Install Gleam first.')
      return undefined
    }

    const proc = spawn(bin, ['lsp'], { cwd: root })
    attachLSPProcessHandlers(proc, 'gleam')
    return { process: proc }
  },
}
