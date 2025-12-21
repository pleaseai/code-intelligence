/**
 * Python Language Server (Pyright)
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

export const PyrightServer: LSPServerInfo = {
  id: 'pyright',
  extensions: ['.py', '.pyi'],
  root: nearestRoot([
    'pyproject.toml',
    'setup.py',
    'requirements.txt',
    'pyrightconfig.json',
  ]),
  async spawn(root) {
    const pyright = Bun.which('pyright-langserver')
    if (!pyright) {
      // Try via bunx/npx
      try {
        const proc = spawn('bunx', ['pyright-langserver', '--stdio'], {
          cwd: root,
        })
        attachLSPProcessHandlers(proc, 'pyright')
        return { process: proc }
      }
      catch (err) {
        log.error({ err }, 'Failed to spawn pyright-langserver via bunx')
        return undefined
      }
    }

    const proc = spawn(pyright, ['--stdio'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'pyright')
    return { process: proc }
  },
}
