/**
 * ESLint Language Server
 * Downloads and builds vscode-eslint from GitHub
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

function getEslintResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'eslint-lsp')
}

async function setupEslintDependencies(): Promise<string | undefined> {
  const resourcesDir = getEslintResourcesDir()
  const vscodeEslintDir = path.join(resourcesDir, 'vscode-eslint')
  const serverPath = path.join(vscodeEslintDir, 'server', 'out', 'eslintServer.js')

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch (err) {
    const isNotFound = err instanceof Error
      && 'code' in err
      && (err as NodeJS.ErrnoException).code === 'ENOENT'

    if (!isNotFound) {
      log.error({ serverPath, err: err instanceof Error ? err.message : err }, 'Cannot access ESLint server')
      return undefined
    }
  }

  log.info('Downloading and building VS Code ESLint server...')

  try {
    await fs.mkdir(resourcesDir, { recursive: true })

    const response = await fetch('https://github.com/microsoft/vscode-eslint/archive/refs/heads/main.zip')
    if (!response.ok) {
      log.error({ status: response.status, statusText: response.statusText }, 'Failed to download vscode-eslint')
      return undefined
    }

    const zipPath = path.join(resourcesDir, 'vscode-eslint.zip')
    const body = response.body
    if (!body) {
      log.error('No response body for vscode-eslint download')
      return undefined
    }

    const writeStream = createWriteStream(zipPath)
    await pipeline(body as unknown as NodeJS.ReadableStream, writeStream)

    log.info('Extracting vscode-eslint...')
    await fs.mkdir(resourcesDir, { recursive: true })
    const extractProc = Bun.spawn(['unzip', '-o', '-q', zipPath, '-d', resourcesDir], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const extractExitCode = await extractProc.exited
    if (extractExitCode !== 0) {
      const stderr = await new Response(extractProc.stderr).text()
      log.error({ stderr }, 'Failed to extract vscode-eslint')
      return undefined
    }

    await fs.rm(zipPath, { force: true })

    const extractedPath = path.join(resourcesDir, 'vscode-eslint-main')
    try {
      await fs.access(vscodeEslintDir)
      log.info('Removing old vscode-eslint installation...')
      await fs.rm(vscodeEslintDir, { force: true, recursive: true })
    }
    catch {
      // Directory doesn't exist, that's fine
    }
    await fs.rename(extractedPath, vscodeEslintDir)

    log.info('Running npm install for vscode-eslint...')
    const npmInstallProc = Bun.spawn(['npm', 'install'], {
      cwd: vscodeEslintDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const npmInstallExitCode = await npmInstallProc.exited
    if (npmInstallExitCode !== 0) {
      const stderr = await new Response(npmInstallProc.stderr).text()
      log.error({ stderr }, 'npm install failed for vscode-eslint')
      return undefined
    }

    log.info('Building vscode-eslint (npm run compile)...')
    const npmCompileProc = Bun.spawn(['npm', 'run', 'compile'], {
      cwd: vscodeEslintDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const npmCompileExitCode = await npmCompileProc.exited
    if (npmCompileExitCode !== 0) {
      const stderr = await new Response(npmCompileProc.stderr).text()
      log.error({ stderr }, 'npm run compile failed for vscode-eslint')
      return undefined
    }

    log.info('VS Code ESLint server installed successfully')
  }
  catch (err) {
    log.error({ err }, 'Failed to setup ESLint dependencies')
    return undefined
  }

  try {
    await fs.access(serverPath)
    return serverPath
  }
  catch {
    log.error({ serverPath }, 'ESLint server not found after installation')
    return undefined
  }
}

export const EslintServer: LSPServerInfo = {
  id: 'eslint',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue'],
  root: nearestRoot([
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]),
  async spawn(root) {
    const isWindows = process.platform === 'win32'
    const eslintBin = path.join(root, 'node_modules', '.bin', `eslint${isWindows ? '.cmd' : ''}`)
    try {
      await fs.access(eslintBin)
    }
    catch {
      log.warn({ root }, 'eslint package not found in project. Install with: npm install eslint')
      return undefined
    }

    const node = Bun.which('node')
    const npm = Bun.which('npm')
    if (!node || !npm) {
      log.warn('Node.js and npm are required for ESLint Language Server')
      return undefined
    }

    const serverPath = await setupEslintDependencies()
    if (!serverPath) {
      log.error({ serverId: 'eslint', root }, 'ESLint LSP failed to start - dependency setup failed')
      return undefined
    }

    try {
      const proc = spawn(node, ['--max-old-space-size=8192', serverPath, '--stdio'], {
        cwd: root,
      })

      attachLSPProcessHandlers(proc, 'eslint')
      return { process: proc }
    }
    catch (err) {
      log.error({ err }, 'Failed to spawn ESLint Language Server')
      return undefined
    }
  },
}
