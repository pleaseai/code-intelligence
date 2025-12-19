/**
 * Rubocop (Ruby) Language Server
 * Uses gem install for auto-download
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

function getRubocopResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'rubocop-lsp')
}

export const RubocopServer: LSPServerInfo = {
  id: 'rubocop',
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  root: nearestRoot(['Gemfile', 'Gemfile.lock']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getRubocopResourcesDir()

    // Check PATH first (including our cache dir)
    let bin = Bun.which('rubocop', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisites
      const ruby = Bun.which('ruby')
      const gem = Bun.which('gem')
      if (!ruby || !gem) {
        log.warn('Ruby and gem are required for Rubocop. Install Ruby first.')
        return undefined
      }

      log.info('Installing Rubocop')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['gem', 'install', 'rubocop', '--bindir', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install rubocop')
        return undefined
      }

      bin = path.join(resourcesDir, `rubocop${ext}`)
      log.info({ bin }, 'Rubocop installed')
    }

    const proc = spawn(bin, ['--lsp'], { cwd: root })
    attachLSPProcessHandlers(proc, 'rubocop')
    return { process: proc }
  },
}
