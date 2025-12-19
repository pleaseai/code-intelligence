/**
 * SourceKit (Swift) Language Server
 * System-only, comes with Swift toolchain or Xcode
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const SourceKitServer: LSPServerInfo = {
  id: 'sourcekit',
  extensions: ['.swift'],
  root: nearestRoot(['Package.swift']),
  async spawn(root) {
    // Check PATH first
    let bin = Bun.which('sourcekit-lsp')

    if (!bin) {
      // macOS fallback: use xcrun
      if (process.platform === 'darwin' && Bun.which('xcrun')) {
        try {
          const proc = Bun.spawn(['xcrun', '--find', 'sourcekit-lsp'], {
            stdout: 'pipe',
            stderr: 'pipe',
          })
          const exitCode = await proc.exited
          if (exitCode === 0) {
            bin = (await new Response(proc.stdout).text()).trim()
          }
        }
        catch {
          // xcrun failed
        }
      }

      if (!bin) {
        log.warn('sourcekit-lsp not found. Install Swift toolchain or Xcode.')
        return undefined
      }
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'sourcekit')
    return { process: proc }
  },
}
