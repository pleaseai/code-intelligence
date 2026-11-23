import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { findCachedBinary, serverCacheDir } from './github-release'
import { attachLSPProcessHandlers, autoInstallDisabled, log, nearestRoot } from './utils'

export interface DotnetToolServerSpec {
  id: string
  /** NuGet tool package, also the executable name. */
  tool: string
  extensions: string[]
  rootMarkers: string[]
}

async function installDotnetTool(serverId: string, tool: string, toolPath: string): Promise<string | undefined> {
  if (!Bun.which('dotnet')) {
    log.warn(`.NET SDK is required for ${tool}. Install .NET SDK first.`)
    return undefined
  }
  if (autoInstallDisabled(serverId)) {
    return undefined
  }

  log.info({ tool }, 'Installing language server via dotnet tool')
  try {
    await fs.mkdir(toolPath, { recursive: true })
    const proc = Bun.spawn(['dotnet', 'tool', 'install', tool, '--tool-path', toolPath], {
      stdout: 'ignore',
      stderr: 'pipe',
    })
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
    if (exitCode !== 0) {
      log.error({ tool, exitCode, stderr }, 'dotnet tool install failed')
      return undefined
    }
  }
  catch (err) {
    log.error({ tool, err }, 'Failed to run dotnet tool install')
    return undefined
  }

  const bin = path.join(toolPath, `${tool}${process.platform === 'win32' ? '.exe' : ''}`)
  log.info({ bin }, 'Language server installed via dotnet tool')
  return bin
}

/** A server run from PATH, or installed with `dotnet tool install` into `~/.cache/dora/<id>-lsp`. */
export function dotnetToolServer(spec: DotnetToolServerSpec): LSPServerInfo {
  return {
    id: spec.id,
    extensions: spec.extensions,
    root: nearestRoot(spec.rootMarkers),
    async spawn(root) {
      const toolPath = serverCacheDir(`${spec.id}-lsp`)
      const bin = findCachedBinary(spec.tool, toolPath) ?? await installDotnetTool(spec.id, spec.tool, toolPath)
      if (!bin) {
        return undefined
      }
      const proc = spawn(bin, [], { cwd: root })
      attachLSPProcessHandlers(proc, spec.id)
      return { process: proc }
    },
  }
}
