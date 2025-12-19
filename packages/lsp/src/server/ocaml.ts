/**
 * OCaml Language Server (ocamllsp)
 * System-only, must be installed via opam
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const OcamlServer: LSPServerInfo = {
  id: 'ocaml',
  extensions: ['.ml', '.mli'],
  root: nearestRoot(['dune-project', 'dune-workspace', '.merlin', 'opam']),
  async spawn(root) {
    const bin = Bun.which('ocamllsp')
    if (!bin) {
      log.warn('ocamllsp not found. Install with: opam install ocaml-lsp-server')
      return undefined
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'ocaml')
    return { process: proc }
  },
}
