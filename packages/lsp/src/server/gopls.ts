/**
 * Go Language Server (gopls)
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { attachLSPProcessHandlers, nearestRoot } from './utils'

export const GoplsServer: LSPServerInfo = {
  id: 'gopls',
  extensions: ['.go'],
  root: async (file, projectPath) => {
    // Check for go.work first
    const workRoot = await nearestRoot(['go.work'])(file, projectPath)
    if (workRoot)
      return workRoot
    return nearestRoot(['go.mod', 'go.sum'])(file, projectPath)
  },
  async spawn(root) {
    const gopls = Bun.which('gopls')
    if (!gopls)
      return undefined

    const proc = spawn(gopls, ['serve'], {
      cwd: root,
    })
    attachLSPProcessHandlers(proc, 'gopls')
    return { process: proc }
  },
}
