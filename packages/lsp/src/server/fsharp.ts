/**
 * F# Language Server (fsautocomplete)
 * Uses dotnet tool install
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

function getFsharpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'fsharp-lsp')
}

export const FsharpServer: LSPServerInfo = {
  id: 'fsharp',
  extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
  root: nearestRoot(['.sln', '.fsproj', 'global.json']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getFsharpResourcesDir()

    // Check PATH first
    let bin = Bun.which('fsautocomplete', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const dotnet = Bun.which('dotnet')
      if (!dotnet) {
        log.warn('.NET SDK is required for fsautocomplete. Install .NET SDK first.')
        return undefined
      }

      log.info('Installing fsautocomplete via dotnet tool')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['dotnet', 'tool', 'install', 'fsautocomplete', '--tool-path', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install fsautocomplete')
        return undefined
      }

      bin = path.join(resourcesDir, `fsautocomplete${ext}`)
      log.info({ bin }, 'fsautocomplete installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'fsharp')
    return { process: proc }
  },
}
