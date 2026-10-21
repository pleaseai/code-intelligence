import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getTsrsPlatformPackageName, resolveNativeTypeScriptServer } from '../../src/server/typescript'

async function makeBin(
  dir: string,
  name: string,
  packageName = name === 'tsgo' ? '@typescript/native-preview' : 'typescript',
): Promise<string> {
  const packageDir = path.join(dir, 'node_modules', ...packageName.split('/'))
  const relativeTarget = `bin/${name}.js`
  const target = path.join(packageDir, relativeTarget)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, '#!/usr/bin/env node\n')

  const packageJson = path.join(packageDir, 'package.json')
  const pkg = await fs.readFile(packageJson, 'utf8')
    .then(text => JSON.parse(text) as Record<string, unknown>)
    .catch(() => ({ name: packageName, version: '1.0.0' }))
  pkg.bin = { ...(typeof pkg.bin === 'object' ? pkg.bin : {}), [name]: relativeTarget }
  await fs.writeFile(packageJson, JSON.stringify(pkg))

  const binDir = path.join(dir, 'node_modules', '.bin')
  await fs.mkdir(binDir, { recursive: true })
  const ext = process.platform === 'win32' ? '.cmd' : ''
  const bin = path.join(binDir, `${name}${ext}`)
  if (process.platform === 'win32') {
    await fs.writeFile(bin, `@node "%~dp0\\..\\${packageName}\\${relativeTarget.replaceAll('/', '\\')}" %*\n`)
  }
  else {
    await fs.symlink(path.relative(binDir, target), bin)
  }
  return bin
}

async function writeTypeScriptPackage(
  dir: string,
  opts: { version?: string, tsserver?: boolean, getExePath?: boolean },
): Promise<void> {
  const pkgDir = path.join(dir, 'node_modules', 'typescript')
  const libDir = path.join(pkgDir, 'lib')
  await fs.mkdir(libDir, { recursive: true })
  await fs.writeFile(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'typescript', version: opts.version ?? '5.7.0' }),
  )
  if (opts.tsserver ?? true) {
    await fs.writeFile(path.join(libDir, 'tsserver.js'), '// classic entry\n')
  }
  if (opts.getExePath) {
    await fs.writeFile(path.join(libDir, 'getExePath.js'), '// native marker\n')
  }
}

async function makeTsrs(
  dir: string,
  opts: { platformBinary: boolean, platformName?: string },
): Promise<string> {
  const bin = await makeBin(dir, 'tsrs', 'tsrs')
  const platformName = opts.platformName ?? getTsrsPlatformPackageName()
  const pkgJson = path.join(dir, 'node_modules', 'tsrs', 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgJson, 'utf8')) as Record<string, unknown>
  await fs.writeFile(pkgJson, JSON.stringify(pkg))
  if (opts.platformBinary) {
    const platformDir = path.join(dir, 'node_modules', ...platformName.split('/'))
    await fs.mkdir(platformDir, { recursive: true })
    await fs.writeFile(
      path.join(platformDir, 'package.json'),
      JSON.stringify({ name: platformName, version: '1.0.0', os: [process.platform], cpu: [process.arch] }),
    )
    await fs.writeFile(path.join(platformDir, process.platform === 'win32' ? 'tsrs.exe' : 'tsrs'), '')
  }
  return bin
}

describe('resolveNativeTypeScriptServer', () => {
  const originalPath = process.env.PATH
  let emptyPathDir: string
  beforeEach(async () => {
    emptyPathDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-empty-path-'))
    process.env.PATH = emptyPathDir
  })
  afterEach(async () => {
    process.env.PATH = originalPath
    await fs.rm(emptyPathDir, { recursive: true, force: true })
  })

  test('falls back to a native tsrs binary on PATH when no project-local server exists', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-global-tsrs-'))
    try {
      await writeTypeScriptPackage(dir, { version: '5.7.0', tsserver: true })
      const globalTsrs = path.join(emptyPathDir, process.platform === 'win32' ? 'tsrs.exe' : 'tsrs')
      await fs.writeFile(globalTsrs, Buffer.from('7f454c46', 'hex'))
      await fs.chmod(globalTsrs, 0o755)
      const result = resolveNativeTypeScriptServer(dir)
      expect(result?.command).toBe(globalTsrs)
      expect(result?.label).toBe('global tsrs')
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('skips a global npm tsrs launcher without a platform binary', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-global-tsrs-npm-'))
    const prefix = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-global-prefix-'))
    try {
      const launcher = await makeTsrs(prefix, { platformBinary: false })
      process.env.PATH = path.dirname(launcher)
      expect(resolveNativeTypeScriptServer(dir)).toBeUndefined()
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
      await fs.rm(prefix, { recursive: true, force: true })
    }
  })

  test('skips a global wrapper-script tsrs launcher without a platform binary', async () => {
    if (process.platform === 'win32') { return }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-global-tsrs-wrapper-'))
    const prefix = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-global-wrapper-prefix-'))
    try {
      await makeTsrs(prefix, { platformBinary: false })
      const wrapperDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-wrapper-bin-'))
      const wrapper = path.join(wrapperDir, 'tsrs')
      await fs.writeFile(
        wrapper,
        `#!/bin/sh\nexec node "${path.join(prefix, 'node_modules', 'tsrs', 'bin', 'tsrs.js')}" "$@"\n`,
      )
      await fs.chmod(wrapper, 0o755)
      process.env.PATH = wrapperDir
      expect(resolveNativeTypeScriptServer(dir)).toBeUndefined()
      await fs.rm(wrapperDir, { recursive: true, force: true })
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
      await fs.rm(prefix, { recursive: true, force: true })
    }
  })

  test('resolves a relative TSRS_BINARY against the project root', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-rel-override-'))
    const original = process.env.TSRS_BINARY
    try {
      const launcher = await makeTsrs(dir, { platformBinary: false })
      await fs.writeFile(path.join(dir, 'custom-tsrs'), '')
      process.env.TSRS_BINARY = 'custom-tsrs'
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(launcher)
    }
    finally {
      if (original === undefined) { delete process.env.TSRS_BINARY }
      else { process.env.TSRS_BINARY = original }
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('resolves a wrapper script in a PATH directory containing spaces', async () => {
    if (process.platform === 'win32') { return }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-space-project-'))
    const prefix = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-space-prefix-'))
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-space-parent-'))
    try {
      await makeTsrs(prefix, { platformBinary: true })
      const wrapperDir = path.join(parent, 'Jane Doe', 'pnpm')
      await fs.mkdir(wrapperDir, { recursive: true })
      const wrapper = path.join(wrapperDir, 'tsrs')
      const rel = path.relative(wrapperDir, path.join(prefix, 'node_modules', 'tsrs', 'bin', 'tsrs.js'))
      await fs.writeFile(wrapper, `#!/bin/sh\nbasedir=$(dirname "$0")\nexec node "$basedir/${rel}" "$@"\n`)
      await fs.chmod(wrapper, 0o755)
      process.env.PATH = wrapperDir
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(wrapper)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
      await fs.rm(prefix, { recursive: true, force: true })
      await fs.rm(parent, { recursive: true, force: true })
    }
  })

  test('prefers project-local native tsc over a global tsrs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-local-over-global-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      const globalTsrs = path.join(emptyPathDir, process.platform === 'win32' ? 'tsrs.exe' : 'tsrs')
      await fs.writeFile(globalTsrs, Buffer.from('7f454c46', 'hex'))
      await fs.chmod(globalTsrs, 0o755)
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('returns undefined for a classic TypeScript 5 project', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-classic-'))
    try {
      await writeTypeScriptPackage(dir, { version: '5.7.0', tsserver: true })
      await makeBin(dir, 'tsc')
      expect(resolveNativeTypeScriptServer(dir)).toBeUndefined()
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('selects native tsc when typescript is v7+', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-version-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      const result = resolveNativeTypeScriptServer(dir)
      expect(result?.command).toBe(tsc)
      expect(result?.label).toBe('native tsc')
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('selects native tsc when tsserver.js is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-no-tsserver-'))
    try {
      await writeTypeScriptPackage(dir, { version: '5.9.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('selects native tsc when getExePath.js marker is present', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-getexepath-'))
    try {
      await writeTypeScriptPackage(dir, { version: '5.9.0', tsserver: true, getExePath: true })
      const tsc = await makeBin(dir, 'tsc')
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('falls back to tsgo bin (@typescript/native-preview) when present', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-tsgo-'))
    try {
      // Classic typescript, but native-preview provides a tsgo bin.
      await writeTypeScriptPackage(dir, { version: '5.7.0', tsserver: true })
      const tsgo = await makeBin(dir, 'tsgo')
      const result = resolveNativeTypeScriptServer(dir)
      expect(result?.command).toBe(tsgo)
      expect(result?.label).toBe('native tsgo')
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('prefers tsrs over native tsc and tsgo when installed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-tsrs-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      await makeBin(dir, 'tsc')
      await makeBin(dir, 'tsgo')
      const tsrs = await makeTsrs(dir, { platformBinary: true })
      const result = resolveNativeTypeScriptServer(dir)
      expect(result?.command).toBe(tsrs)
      expect(result?.label).toBe('tsrs')
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('skips tsrs when no platform binary is installed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-tsrs-unsupported-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      await makeTsrs(dir, { platformBinary: false })
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('skips tsrs when only a different platform package is installed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-tsrs-wrong-platform-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      await makeTsrs(dir, { platformBinary: true, platformName: '@tsrs/other-platform' })
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('detects tsrs hoisted in a parent node_modules of a classic project', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-tsrs-monorepo-'))
    try {
      await writeTypeScriptPackage(dir, { version: '5.7.0', tsserver: true })
      const tsrs = await makeTsrs(dir, { platformBinary: true })
      const pkgDir = path.join(dir, 'packages', 'app')
      await fs.mkdir(pkgDir, { recursive: true })
      expect(resolveNativeTypeScriptServer(pkgDir)?.command).toBe(tsrs)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('selects native tsc when the project path contains an @-prefixed directory', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-at-path-'))
    const dir = path.join(base, '@workspace', 'app')
    try {
      await fs.mkdir(dir, { recursive: true })
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })

  test('selects native tsc through a package-manager wrapper shim', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-wrapper-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      if (process.platform !== 'win32') {
        await fs.unlink(tsc)
        await fs.writeFile(tsc, '#!/bin/sh\nexec node "$(dirname "$0")/../typescript/bin/tsc.js" "$@"\n')
      }
      expect(resolveNativeTypeScriptServer(dir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('rejects a shared shim that does not reference the package bin', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-unrelated-shim-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')
      await fs.unlink(tsc)
      await fs.writeFile(
        tsc,
        process.platform === 'win32'
          ? '@node "%~dp0\\..\\unrelated\\tsc.js" %*\n'
          : '#!/bin/sh\nexec node /unrelated/tsc.js "$@"\n',
      )
      expect(resolveNativeTypeScriptServer(dir)).toBeUndefined()
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('selects native tsc through a pnpm-style symlinked package', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-pnpm-'))
    try {
      const packageStore = path.join(
        base,
        'node_modules',
        '.pnpm',
        'typescript@7.0.0',
        'node_modules',
        'typescript',
      )
      await fs.mkdir(path.join(packageStore, 'lib'), { recursive: true })
      await fs.writeFile(
        path.join(packageStore, 'package.json'),
        JSON.stringify({ name: 'typescript', version: '7.0.0', bin: { tsc: 'bin/tsc.js' } }),
      )
      const target = path.join(packageStore, 'bin', 'tsc.js')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, '#!/usr/bin/env node\n')

      const linkedPackage = path.join(base, 'node_modules', 'typescript')
      await fs.symlink(path.relative(path.dirname(linkedPackage), packageStore), linkedPackage)
      const binDir = path.join(base, 'node_modules', '.bin')
      await fs.mkdir(binDir, { recursive: true })
      const ext = process.platform === 'win32' ? '.cmd' : ''
      const shim = path.join(binDir, `tsc${ext}`)
      if (process.platform === 'win32') {
        await fs.writeFile(
          shim,
          '@node "%~dp0\\..\\.pnpm\\typescript@7.0.0\\node_modules\\typescript\\bin\\tsc.js" %*\n',
        )
      }
      else {
        await fs.symlink(path.relative(binDir, target), shim)
      }

      expect(resolveNativeTypeScriptServer(base)?.command).toBe(shim)
    }
    finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })

  test('returns undefined when native package exists but no .bin/tsc', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-no-bin-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      // No .bin/tsc and no tsgo bin.
      expect(resolveNativeTypeScriptServer(dir)).toBeUndefined()
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('detects native typescript hoisted in a parent node_modules', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts7-monorepo-'))
    try {
      await writeTypeScriptPackage(dir, { version: '7.0.0', tsserver: false })
      const tsc = await makeBin(dir, 'tsc')

      const pkgDir = path.join(dir, 'packages', 'app', 'src')
      await fs.mkdir(pkgDir, { recursive: true })

      expect(resolveNativeTypeScriptServer(pkgDir)?.command).toBe(tsc)
    }
    finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
