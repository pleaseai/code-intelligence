/**
 * Python Language Server (Pyright)
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { attachLSPProcessHandlers, findPackageBin, log, nearestRoot, prepareSpawnCommand } from './utils'

export const PYRIGHT_VERSION = '1.1.414'

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
    // Read PATH now rather than the copy Bun captured at startup
    const pyright = findPackageBin(root, 'pyright', 'pyright-langserver')
      ?? Bun.which('pyright-langserver', { PATH: process.env.PATH ?? '' })
    if (!pyright) {
      // pyright-langserver is a bin of the pyright package, not a package itself.
      // spawn reports a missing bunx only as an async 'error' event, so check for it first.
      const bunx = Bun.which('bunx', { PATH: process.env.PATH ?? '' })
      if (!bunx) {
        log.warn({ root }, 'pyright not found. Install with: npm install pyright')
        return undefined
      }
      const proc = spawn(bunx, ['-p', `pyright@${PYRIGHT_VERSION}`, 'pyright-langserver', '--stdio'], {
        cwd: root,
      })
      attachLSPProcessHandlers(proc, 'pyright')
      return { process: proc }
    }

    const launch = prepareSpawnCommand(pyright)
    const proc = spawn(launch.command, ['--stdio'], {
      cwd: root,
      shell: launch.shell,
    })
    attachLSPProcessHandlers(proc, 'pyright')
    return { process: proc }
  },
}
