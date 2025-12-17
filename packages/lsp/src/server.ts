/**
 * LSP Server definitions
 * Based on opencode reference implementation
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export interface LSPServerHandle {
  process: ChildProcessWithoutNullStreams
  initialization?: Record<string, unknown>
}

type RootFunction = (
  file: string,
  projectPath: string,
) => Promise<string | undefined>

export interface LSPServerInfo {
  id: string
  extensions: string[]
  root: RootFunction
  spawn: (root: string) => Promise<LSPServerHandle | undefined>
}

/**
 * Find nearest directory containing one of the target files
 */
function nearestRoot(
  includePatterns: string[],
  excludePatterns?: string[],
): RootFunction {
  return async (file, projectPath) => {
    let current = path.dirname(file)

    // Check exclusions first
    if (excludePatterns) {
      let checkDir = current
      while (checkDir.startsWith(projectPath) || checkDir === projectPath) {
        for (const pattern of excludePatterns) {
          const target = path.join(checkDir, pattern)
          try {
            await fs.access(target)
            return undefined // Excluded
          }
          catch {
            // Not found, continue
          }
        }
        const parent = path.dirname(checkDir)
        if (parent === checkDir)
          break
        checkDir = parent
      }
    }

    // Find nearest matching file
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of includePatterns) {
        const target = path.join(current, pattern)
        try {
          await fs.access(target)
          return current
        }
        catch {
          // Not found, continue
        }
      }
      const parent = path.dirname(current)
      if (parent === current)
        break
      current = parent
    }

    return projectPath
  }
}

/**
 * TypeScript Language Server
 */
export const TypescriptServer: LSPServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  root: nearestRoot(
    [
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ],
    ['deno.json', 'deno.jsonc'],
  ),
  async spawn(root) {
    const tsserver = Bun.which('typescript-language-server')
    if (!tsserver) {
      // Try via bunx
      const proc = spawn('bunx', ['typescript-language-server', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      return { process: proc }
    }

    const proc = spawn(tsserver, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    return { process: proc }
  },
}

/**
 * Deno Language Server
 */
export const DenoServer: LSPServerInfo = {
  id: 'deno',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  root: async (file, projectPath) => {
    let current = path.dirname(file)
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of ['deno.json', 'deno.jsonc']) {
        const target = path.join(current, pattern)
        try {
          await fs.access(target)
          return current
        }
        catch {
          // Not found
        }
      }
      const parent = path.dirname(current)
      if (parent === current)
        break
      current = parent
    }
    return undefined
  },
  async spawn(root) {
    const deno = Bun.which('deno')
    if (!deno)
      return undefined

    const proc = spawn(deno, ['lsp'], {
      cwd: root,
    })
    return { process: proc }
  },
}

/**
 * Python Language Server (Pyright)
 */
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
      const proc = spawn('bunx', ['pyright-langserver', '--stdio'], {
        cwd: root,
      })
      return { process: proc }
    }

    const proc = spawn(pyright, ['--stdio'], {
      cwd: root,
    })
    return { process: proc }
  },
}

/**
 * Go Language Server (gopls)
 */
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
    return { process: proc }
  },
}

/**
 * Rust Analyzer
 */
export const RustAnalyzerServer: LSPServerInfo = {
  id: 'rust-analyzer',
  extensions: ['.rs'],
  root: nearestRoot(['Cargo.toml', 'Cargo.lock']),
  async spawn(root) {
    const rustAnalyzer = Bun.which('rust-analyzer')
    if (!rustAnalyzer)
      return undefined

    const proc = spawn(rustAnalyzer, [], {
      cwd: root,
    })
    return { process: proc }
  },
}

/**
 * Oxlint Language Server
 * Based on opencode PR #5570
 */
export const OxlintServer: LSPServerInfo = {
  id: 'oxlint',
  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.vue',
    '.astro',
    '.svelte',
  ],
  root: nearestRoot([
    '.oxlintrc.json',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package.json',
  ]),
  async spawn(root) {
    const ext = process.platform === 'win32' ? '.cmd' : ''

    const resolveBin = async (
      binName: string,
    ): Promise<string | undefined> => {
      const localBin = path.join(root, 'node_modules', '.bin', binName + ext)
      try {
        await fs.access(localBin)
        return localBin
      }
      catch (err: unknown) {
        // Only ignore ENOENT (file not found), log other errors
        const isNotFound
          = err instanceof Error
            && 'code' in err
            && (err as NodeJS.ErrnoException).code === 'ENOENT'
        if (!isNotFound) {
          console.error(`[oxlint] Cannot access local binary at ${localBin}:`, err)
        }
      }

      // Check global PATH
      const globalBin = Bun.which(binName)
      if (globalBin)
        return globalBin

      return undefined
    }

    // Try oxlint with --lsp flag first
    const lintBin = await resolveBin('oxlint')
    if (lintBin) {
      const proc = Bun.spawn([lintBin, '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        console.warn(
          `[oxlint] Binary at ${lintBin} failed --help (exit ${exitCode}): ${stderr.slice(0, 200)}`,
        )
      }
      else {
        const help = await new Response(proc.stdout).text()
        if (help.includes('--lsp')) {
          return {
            process: spawn(lintBin, ['--lsp'], {
              cwd: root,
            }),
          }
        }
      }
    }

    // Fallback to oxc_language_server
    const serverBin = await resolveBin('oxc_language_server')
    if (serverBin) {
      return {
        process: spawn(serverBin, [], {
          cwd: root,
        }),
      }
    }

    // Neither found - log diagnostic
    console.warn(
      `[oxlint] Could not start oxlint LSP server for ${root}. `
      + `Install with: npm install -D oxlint`,
    )
    return undefined
  },
}

/**
 * All available LSP servers
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  TypescriptServer,
  OxlintServer,
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
]

/**
 * Get server info by ID
 */
export function getServerById(id: string): LSPServerInfo | undefined {
  return LSP_SERVERS.find(s => s.id === id)
}

/**
 * Get servers that support a file extension
 */
export function getServersForExtension(extension: string): LSPServerInfo[] {
  return LSP_SERVERS.filter(s => s.extensions.includes(extension))
}
