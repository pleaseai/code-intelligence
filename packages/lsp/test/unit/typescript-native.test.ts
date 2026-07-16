import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { resolveNativeTypeScriptServer } from '../../src/server/typescript'

async function makeBin(dir: string, name: string): Promise<string> {
  const binDir = path.join(dir, 'node_modules', '.bin')
  await fs.mkdir(binDir, { recursive: true })
  const ext = process.platform === 'win32' ? '.cmd' : ''
  const bin = path.join(binDir, `${name}${ext}`)
  await fs.writeFile(bin, '#!/bin/sh\n')
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

describe('resolveNativeTypeScriptServer', () => {
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
