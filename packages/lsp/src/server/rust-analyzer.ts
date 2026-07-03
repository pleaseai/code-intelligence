/**
 * Rust Analyzer
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { attachLSPProcessHandlers, nearestRoot } from './utils'

export const RustAnalyzerServer: LSPServerInfo = {
  id: 'rust-analyzer',
  extensions: ['.rs'],
  root: nearestRoot(['Cargo.toml', 'Cargo.lock']),
  async spawn(root) {
    const rustAnalyzer = Bun.which('rust-analyzer')
    if (!rustAnalyzer) { return undefined }

    const proc = spawn(rustAnalyzer, [], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'rust-analyzer')
    return { process: proc }
  },
}
