/**
 * ElixirLS Language Server
 * Auto-downloads and builds from GitHub
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, extractZip, log, nearestRoot } from './utils'

function getElixirLsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'elixir-lsp')
}

export const ElixirLsServer: LSPServerInfo = {
  id: 'elixir-ls',
  extensions: ['.ex', '.exs'],
  root: nearestRoot(['mix.exs', 'mix.lock']),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const scriptName = isWindows ? 'language_server.bat' : 'language_server.sh'
    const resourcesDir = getElixirLsResourcesDir()

    // Check system binary first
    let binary = Bun.which('elixir-ls')

    if (!binary) {
      // Check for existing installation by looking for versioned directories
      try {
        const entries = await fs.readdir(resourcesDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('elixir-ls-v')) {
            const candidate = path.join(resourcesDir, entry.name, 'release', scriptName)
            try {
              await fs.access(candidate)
              binary = candidate
              break
            }
            catch {
              // Binary not accessible in this directory, try next
            }
          }
        }
      }
      catch {
        // resourcesDir doesn't exist yet, will create during download
      }

      if (!binary) {
        // Need to download and build
        const elixir = Bun.which('elixir')
        if (!elixir) {
          log.warn('Elixir is required for ElixirLS. Install Elixir first.')
          return undefined
        }

        log.info('Downloading and building ElixirLS')
        await fs.mkdir(resourcesDir, { recursive: true })

        // Download from GitHub - using latest stable release
        const zipPath = path.join(resourcesDir, 'elixir-ls.zip')
        const releaseResponse = await fetch('https://api.github.com/repos/elixir-lsp/elixir-ls/releases/latest')
        if (!releaseResponse.ok) {
          log.error({ status: releaseResponse.status, statusText: releaseResponse.statusText }, 'Failed to fetch ElixirLS release info from GitHub')
          return undefined
        }
        const releaseInfo = await releaseResponse.json() as { tag_name: string }
        const releaseTag = releaseInfo.tag_name
        await downloadFile(`https://github.com/elixir-lsp/elixir-ls/archive/refs/tags/${releaseTag}.zip`, zipPath)
        await extractZip(zipPath, resourcesDir)
        await fs.rm(zipPath, { force: true })

        // Build with Mix (directory name matches tag without leading 'v')
        const buildDir = path.join(resourcesDir, `elixir-ls-${releaseTag}`)
        // Update binary path to use correct build directory
        binary = path.join(buildDir, 'release', scriptName)
        const buildProc = Bun.spawn(['mix', 'deps.get'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const depsExitCode = await buildProc.exited
        if (depsExitCode !== 0) {
          const stderr = await new Response(buildProc.stderr).text()
          log.error({ depsExitCode, stderr }, 'ElixirLS mix deps.get failed')
          return undefined
        }

        const compileProc = Bun.spawn(['mix', 'compile'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const compileExitCode = await compileProc.exited
        if (compileExitCode !== 0) {
          const stderr = await new Response(compileProc.stderr).text()
          log.error({ compileExitCode, stderr }, 'ElixirLS mix compile failed')
          return undefined
        }

        const releaseProc = Bun.spawn(['mix', 'elixir_ls.release2', '-o', 'release'], {
          cwd: buildDir,
          env: { ...process.env, MIX_ENV: 'prod' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const releaseExitCode = await releaseProc.exited
        if (releaseExitCode !== 0) {
          const stderr = await new Response(releaseProc.stderr).text()
          log.error({ releaseExitCode, stderr }, 'ElixirLS mix release failed')
          return undefined
        }

        // Verify binary exists
        try {
          await fs.access(binary)
        }
        catch (err) {
          log.error({ binary, err }, 'ElixirLS binary not accessible after build')
          return undefined
        }

        if (!isWindows) {
          await fs.chmod(binary, 0o755)
        }

        log.info({ binary }, 'ElixirLS installed')
      }
    }

    const proc = spawn(binary, [], { cwd: root })
    attachLSPProcessHandlers(proc, 'elixir-ls')
    return { process: proc }
  },
}
