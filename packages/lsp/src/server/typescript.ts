/**
 * TypeScript Language Server
 *
 * Selection happens per project root at spawn time, so the single `typescript`
 * server transparently upgrades to the native server without a separate server
 * id or config toggle (and therefore without duplicate diagnostics). The native
 * servers report diagnostics via the LSP pull model, which the client handles.
 */

import type { LSPServerInfo } from './types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, findPackageBin, findRunnableBin, log, nearestRoot, resolvePackageBin, runsVersion } from './utils'

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']

/** typescript-language-server version installed by the bunx fallback and the Vue server. */
export const TS_LANGUAGE_SERVER_VERSION = '4.3.3'

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

/** Detect musl the way the tsrs launcher does. The readers are injectable for testing. */
export function isMuslLinux(
  readLdd: () => string = () => fs.readFileSync('/usr/bin/ldd', 'utf8'),
  getReport: () => unknown = () => process.report?.getReport(),
): boolean {
  try {
    return readLdd().includes('musl')
  }
  catch {
    // Fall through to the process report.
  }
  try {
    const report = getReport() as {
      header?: { glibcVersionRuntime?: string }
      sharedObjects?: string[]
    } | undefined
    if (report?.header?.glibcVersionRuntime) { return false }
    if (report?.sharedObjects?.some(o => o.includes('libc.musl-') || o.includes('ld-musl-'))) { return true }
  }
  catch {
    // Unknown host: the launcher defaults to GNU.
  }
  return false
}

/** The single platform package the tsrs launcher resolves for this host. Exported for testing. */
export function getTsrsPlatformPackageName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  musl: () => boolean = isMuslLinux,
): string {
  const suffix = platform === 'linux' ? (musl() ? '-musl' : '-gnu') : ''
  return `@tsrs/${platform}-${arch}${suffix}`
}

/** On Windows a native server runs through the shell, so its path is quoted. Exported for testing. */
export function nativeServerSpawnArgs(
  command: string,
  platform: NodeJS.Platform = process.platform,
): { command: string, args: string[], shell: boolean } {
  const win32 = platform === 'win32'
  return { command: win32 ? `"${command}"` : command, args: ['--lsp', '--stdio'], shell: win32 }
}

function hasTsrsBinary(packageRoot: string, root: string): boolean {
  const override = process.env.TSRS_BINARY
  // The launcher runs with cwd = root, so a relative override resolves against it.
  if (override) { return fs.existsSync(path.resolve(root, override)) }
  try {
    const realRoot = fs.realpathSync(packageRoot)
    const require = createRequire(path.join(realRoot, 'package.json'))
    const exeName = process.platform === 'win32' ? 'tsrs.exe' : 'tsrs'
    const platformPkgJson = require.resolve(`${getTsrsPlatformPackageName()}/package.json`)
    return fs.existsSync(path.join(path.dirname(platformPkgJson), exeName))
  }
  catch {
    return false
  }
}

function isNativeExecutable(file: string): boolean {
  const header = Buffer.alloc(4)
  const fd = fs.openSync(file, 'r')
  try {
    if (fs.readSync(fd, header, 0, 4, 0) < 4) { return false }
  }
  finally {
    fs.closeSync(fd)
  }
  const hex = header.toString('hex')
  return hex === '7f454c46' // ELF
    || ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(hex) // Mach-O
    || hex.startsWith('4d5a') // PE
}

/** Locate the tsrs package a wrapper script launches, from `node_modules/tsrs` paths in its text. */
function findWrapperPackageRoot(wrapper: string, bin: string): string | undefined {
  const dir = path.dirname(bin)
  const text = wrapper.replace(/\$\{?basedir\}?|%~dp0|%dp0%/g, dir)
  // Quoted strings may contain spaces (e.g. an expanded $basedir); unquoted arguments cannot.
  const quoted = [...text.matchAll(/"([^"]*)"|'([^']*)'/g)]
    .map(m => /(.*?node_modules[\\/]tsrs)[\\/]/.exec(m[1] ?? m[2] ?? '')?.[1])
  const unquoted = [...text.matchAll(/([^\s"'`=:;]*node_modules[\\/]tsrs)[\\/]/g)].map(m => m[1])
  for (const candidate of [...quoted, ...unquoted]) {
    if (!candidate) { continue }
    const packageRoot = path.resolve(dir, candidate)
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
      ) as { name?: unknown }
      if (pkg.name === 'tsrs') { return packageRoot }
    }
    catch {
      // Not a package root.
    }
  }
  return undefined
}

/**
 * Resolve a native TypeScript 7 LSP command for `root`: a project-local one if
 * the workspace provides it, else a global `tsrs` on PATH. Exported for testing.
 */
export function resolveNativeTypeScriptServer(
  root: string,
): { command: string, label: string } | undefined {
  const tsrs = findPackageBin(root, 'tsrs', 'tsrs', packageRoot => hasTsrsBinary(packageRoot, root))
  if (tsrs) { return { command: tsrs, label: 'tsrs' } }

  // Native `typescript` package (TS 7+) → its node_modules/.bin/tsc.
  const packageRoot = findTypeScriptPackageRoot(root)
  if (packageRoot && isNativeTypeScriptPackage(packageRoot)) {
    const tsc = resolvePackageBin(packageRoot, 'tsc')
    if (tsc) { return { command: tsc, label: 'native tsc' } }
  }

  // `@typescript/native-preview` installs a `tsgo` bin (can coexist with TS <= 6).
  const tsgo = findPackageBin(root, '@typescript/native-preview', 'tsgo')
  if (tsgo) { return { command: tsgo, label: 'native tsgo' } }

  const globalTsrs = resolveGlobalTsrs(root)
  if (globalTsrs) { return { command: globalTsrs, label: 'global tsrs' } }
  return undefined
}

function resolveGlobalTsrs(root: string): string | undefined {
  const bin = Bun.which('tsrs', { PATH: process.env.PATH ?? '' })
  if (!bin) { return undefined }
  // An npm-installed launcher (symlinked `<prefix>/bin/tsrs` or Windows `<prefix>/tsrs.cmd`)
  // only works with its platform binary; a native executable is used as-is and a wrapper script is verified.
  let realBin: string
  try {
    realBin = fs.realpathSync(bin)
  }
  catch {
    return undefined
  }
  const candidates = [
    path.dirname(path.dirname(realBin)),
    path.join(path.dirname(bin), 'node_modules', 'tsrs'),
  ]
  for (const packageRoot of candidates) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
      ) as { name?: unknown }
      if (pkg.name === 'tsrs') { return hasTsrsBinary(packageRoot, root) ? bin : undefined }
    }
    catch {
      // Not an npm package root.
    }
  }
  try {
    if (isNativeExecutable(realBin)) { return bin }
    // A wrapper script (e.g. pnpm) is only usable when the tsrs package it launches has its binary.
    const packageRoot = findWrapperPackageRoot(fs.readFileSync(realBin, 'utf8'), bin)
    return packageRoot && hasTsrsBinary(packageRoot, root) ? bin : undefined
  }
  catch {
    return undefined
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
      const launch = nativeServerSpawnArgs(native.command)
      const proc = spawn(launch.command, launch.args, {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
        shell: launch.shell,
      })
      attachLSPProcessHandlers(proc, 'typescript')
      return { process: proc }
    }

    // Classic fallback: typescript-language-server, project-local before PATH.
    const local = findPackageBin(root, 'typescript-language-server', 'typescript-language-server')
    const tsserver = local && await runsVersion(local, root)
      ? local
      : await findRunnableBin('typescript-language-server', root)
    if (!tsserver) {
      // Try via bunx. The version tag makes bunx install from the registry instead of
      // reusing a typescript-language-server on PATH, which may be the shim just rejected.
      // spawn reports a missing bunx only as an async 'error' event, so check for it first.
      const bunx = Bun.which('bunx', { PATH: process.env.PATH ?? '' })
      if (!bunx) {
        log.warn({ root }, 'typescript-language-server not found. Install with: npm install typescript-language-server typescript')
        return undefined
      }
      const proc = spawn(bunx, [`typescript-language-server@${TS_LANGUAGE_SERVER_VERSION}`, '--stdio'], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: '1' },
      })
      attachLSPProcessHandlers(proc, 'typescript')
      return { process: proc }
    }

    // On Windows the bin is a .cmd shim, which only runs through a shell.
    const launch = nativeServerSpawnArgs(tsserver)
    const proc = spawn(launch.command, ['--stdio'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
      shell: launch.shell,
    })
    attachLSPProcessHandlers(proc, 'typescript')
    return { process: proc }
  },
}
