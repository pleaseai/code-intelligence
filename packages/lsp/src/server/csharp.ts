/**
 * C# Language Server (csharp-ls)
 * Uses dotnet tool install
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

function getCsharpResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'csharp-lsp')
}

export const CsharpServer: LSPServerInfo = {
  id: 'csharp',
  extensions: ['.cs'],
  root: nearestRoot(['.sln', '.csproj', 'global.json']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const ext = isWindows ? '.exe' : ''
    const resourcesDir = getCsharpResourcesDir()

    // Check PATH first
    let bin = Bun.which('csharp-ls', {
      PATH: `${process.env.PATH}${path.delimiter}${resourcesDir}`,
    })

    if (!bin) {
      // Check prerequisite
      const dotnet = Bun.which('dotnet')
      if (!dotnet) {
        log.warn('.NET SDK is required for csharp-ls. Install .NET SDK first.')
        return undefined
      }

      log.info('Installing csharp-ls via dotnet tool')
      await fs.mkdir(resourcesDir, { recursive: true })

      const proc = Bun.spawn(['dotnet', 'tool', 'install', 'csharp-ls', '--tool-path', resourcesDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        log.error({ exitCode, stderr }, 'Failed to install csharp-ls')
        return undefined
      }

      bin = path.join(resourcesDir, `csharp-ls${ext}`)
      log.info({ bin }, 'csharp-ls installed')
    }

    const proc = spawn(bin, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'csharp')
    return { process: proc }
  },
}
