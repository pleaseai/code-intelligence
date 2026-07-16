/**
 * TypeScript Language Server
 *
 * Prefers a project-local native TypeScript 7 (typescript-go) language server —
 * `tsc --lsp --stdio` (or `tsgo --lsp --stdio` from `@typescript/native-preview`)
 * — when the workspace ships one, and falls back to the classic
 * `typescript-language-server --stdio` otherwise.
 *
 * Selection happens per project root at spawn time, so the single `typescript`
 * server transparently upgrades to the native server without a separate server
 * id or config toggle (and therefore without duplicate diagnostics). The native
 * servers report diagnostics via the LSP pull model, which the client handles.
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, log, nearestRoot } from './utils'

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']

/** Walk up from `start` to the nearest `node_modules/typescript` package dir. */
function findTypeScriptPackageRoot(start: string): string | undefined {
  let dir = path.resolve(start)
  while (true) {
    const pkgJson = path.join(dir, 'node_modules', 'typescript', 'package.json')
    if (fs.existsSync(pkgJson)) { return path.dirname(pkgJson) }
    const parent = path.dirname(dir)
    if (parent === dir) { return undefined }
    dir = parent
  }
}

/** Resolve a package-owned bin declared by the package and exposed by its shared shim. */
function resolvePackageBin(packageRoot: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { bin?: string | Record<string, string> }
    const relativeTarget = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[name]
    if (!relativeTarget) { return undefined }

    const target = path.resolve(packageRoot, relativeTarget)
    if (!fs.existsSync(target)) { return undefined }
    const ext = process.platform === 'win32' ? '.cmd' : ''
    const packageDir = path.dirname(packageRoot)
    const nodeModules = path.basename(packageDir).startsWith('@')
      ? path.dirname(packageDir)
      : packageDir
    const shim = path.join(nodeModules, '.bin', `${name}${ext}`)
    if (!fs.existsSync(shim)) { return undefined }

    // npm-style symlinks and package-manager-generated wrapper scripts are both
    // valid shims. For wrappers, require a reference to the package's declared
    // target so a stale or unrelated shared shim is never selected.
    const stat = fs.lstatSync(shim)
    if (stat.isSymbolicLink()) {
      const resolvedShim = path.resolve(path.dirname(shim), fs.readlinkSync(shim))
      return fs.existsSync(resolvedShim)
        && fs.realpathSync(resolvedShim) === fs.realpathSync(target)
        ? shim
        : undefined
    }
    const normalizeShimPath = (value: string): string => {
      const normalized = value.replaceAll('\\', '/')
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    }
    const wrapper = normalizeShimPath(fs.readFileSync(shim, 'utf8'))
    const relativeFromBin = normalizeShimPath(path.relative(path.dirname(shim), target))
    const normalizedTarget = normalizeShimPath(target)
    return wrapper.includes(relativeFromBin) || wrapper.includes(normalizedTarget)
      ? shim
      : undefined
  }
  catch {
    return undefined
  }
}

/** Whether the installed `typescript` package is the native (TS 7+) build. */
function isNativeTypeScriptPackage(packageRoot: string): boolean {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { version?: unknown }
    const major = typeof pkg.version === 'string'
      ? Number.parseInt(pkg.version.split('.')[0] ?? '', 10)
      : Number.NaN
    if (!Number.isNaN(major) && major >= 7) { return true }
  }
  catch {
    // Fall through to file-based markers.
  }
  const libRoot = path.join(packageRoot, 'lib')
  if (!fs.existsSync(libRoot)) { return false }
  // The native build ships getExePath.js and drops the classic tsserver.js entry.
  if (fs.existsSync(path.join(libRoot, 'getExePath.js'))) { return true }
  return !fs.existsSync(path.join(libRoot, 'tsserver.js'))
}

/**
 * Resolve a project-local native TypeScript 7 LSP command for `root`, if the
 * workspace provides one. Exported for testing.
 */
export function resolveNativeTypeScriptServer(
  root: string,
): { command: string, label: string } | undefined {
  // Native `typescript` package (TS 7+) → its node_modules/.bin/tsc.
  const packageRoot = findTypeScriptPackageRoot(root)
  if (packageRoot && isNativeTypeScriptPackage(packageRoot)) {
    const tsc = resolvePackageBin(packageRoot, 'tsc')
    if (tsc) { return { command: tsc, label: 'native tsc' } }
  }

  // `@typescript/native-preview` installs a `tsgo` bin (can coexist with TS <= 6).
  let dir = path.resolve(root)
  while (true) {
    const nativePreviewRoot = path.join(dir, 'node_modules', '@typescript', 'native-preview')
    const tsgo = resolvePackageBin(nativePreviewRoot, 'tsgo')
    if (tsgo) { return { command: tsgo, label: 'native tsgo' } }
    const parent = path.dirname(dir)
    if (parent === dir) { return undefined }
    dir = parent
  }
}

export const TypescriptServer: LSPServerInfo = {
  id: 'typescript',
  extensions: TS_EXTENSIONS,
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
    // Prefer a project-local native TypeScript 7 (typescript-go) server.
    const native = resolveNativeTypeScriptServer(root)
    if (native) {
      log.info({ command: native.command }, `Using ${native.label} language server (--lsp --stdio)`)
      const proc = spawn(native.command, ['--lsp', '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
        shell: process.platform === 'win32',
      })
      attachLSPProcessHandlers(proc, 'typescript')
      return { process: proc }
    }

    // Classic fallback: typescript-language-server.
    const tsserver = Bun.which('typescript-language-server')
    if (!tsserver) {
      // Try via bunx
      try {
        const proc = spawn('bunx', ['typescript-language-server', '--stdio'], {
          cwd: root,
          env: { ...process.env, BUN_BE_BUN: '1' },
        })
        attachLSPProcessHandlers(proc, 'typescript')
        return { process: proc }
      }
      catch (err) {
        log.error({ err }, 'Failed to spawn typescript-language-server via bunx')
        return undefined
      }
    }

    const proc = spawn(tsserver, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
    })
    attachLSPProcessHandlers(proc, 'typescript')
    return { process: proc }
  },
}
