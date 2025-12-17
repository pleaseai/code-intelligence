import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  DartServer,
  DenoServer,
  getServerById,
  getServersForExtension,
  GoplsServer,
  KotlinServer,
  LSP_SERVERS,
  OxlintServer,
  PyrightServer,
  RustAnalyzerServer,
  TypescriptServer,
} from '../server'

describe('LSP_SERVERS', () => {
  test('contains expected servers', () => {
    expect(LSP_SERVERS.length).toBeGreaterThan(0)

    const serverIds = LSP_SERVERS.map(s => s.id)
    expect(serverIds).toContain('typescript')
    expect(serverIds).toContain('deno')
    expect(serverIds).toContain('oxlint')
    expect(serverIds).toContain('pyright')
    expect(serverIds).toContain('gopls')
    expect(serverIds).toContain('rust-analyzer')
    expect(serverIds).toContain('kotlin')
    expect(serverIds).toContain('dart')
  })
})

describe('TypescriptServer', () => {
  test('has correct id', () => {
    expect(TypescriptServer.id).toBe('typescript')
  })

  test('supports TypeScript extensions', () => {
    expect(TypescriptServer.extensions).toContain('.ts')
    expect(TypescriptServer.extensions).toContain('.tsx')
    expect(TypescriptServer.extensions).toContain('.js')
    expect(TypescriptServer.extensions).toContain('.jsx')
  })

  test('has root function', () => {
    expect(typeof TypescriptServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof TypescriptServer.spawn).toBe('function')
  })
})

describe('DenoServer', () => {
  test('has correct id', () => {
    expect(DenoServer.id).toBe('deno')
  })

  test('supports TypeScript extensions', () => {
    expect(DenoServer.extensions).toContain('.ts')
    expect(DenoServer.extensions).toContain('.tsx')
    expect(DenoServer.extensions).toContain('.js')
  })
})

describe('OxlintServer', () => {
  test('has correct id', () => {
    expect(OxlintServer.id).toBe('oxlint')
  })

  test('supports JavaScript/TypeScript extensions', () => {
    expect(OxlintServer.extensions).toContain('.ts')
    expect(OxlintServer.extensions).toContain('.tsx')
    expect(OxlintServer.extensions).toContain('.js')
    expect(OxlintServer.extensions).toContain('.jsx')
    expect(OxlintServer.extensions).toContain('.mjs')
    expect(OxlintServer.extensions).toContain('.cjs')
    expect(OxlintServer.extensions).toContain('.mts')
    expect(OxlintServer.extensions).toContain('.cts')
  })

  test('supports framework-specific extensions', () => {
    expect(OxlintServer.extensions).toContain('.vue')
    expect(OxlintServer.extensions).toContain('.astro')
    expect(OxlintServer.extensions).toContain('.svelte')
  })

  test('has root function', () => {
    expect(typeof OxlintServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof OxlintServer.spawn).toBe('function')
  })
})

describe('PyrightServer', () => {
  test('has correct id', () => {
    expect(PyrightServer.id).toBe('pyright')
  })

  test('supports Python extensions', () => {
    expect(PyrightServer.extensions).toContain('.py')
    expect(PyrightServer.extensions).toContain('.pyi')
  })
})

describe('GoplsServer', () => {
  test('has correct id', () => {
    expect(GoplsServer.id).toBe('gopls')
  })

  test('supports Go extension', () => {
    expect(GoplsServer.extensions).toContain('.go')
  })
})

describe('RustAnalyzerServer', () => {
  test('has correct id', () => {
    expect(RustAnalyzerServer.id).toBe('rust-analyzer')
  })

  test('supports Rust extension', () => {
    expect(RustAnalyzerServer.extensions).toContain('.rs')
  })
})

describe('KotlinServer', () => {
  test('has correct id', () => {
    expect(KotlinServer.id).toBe('kotlin')
  })

  test('supports Kotlin extensions', () => {
    expect(KotlinServer.extensions).toContain('.kt')
    expect(KotlinServer.extensions).toContain('.kts')
  })

  test('has root function', () => {
    expect(typeof KotlinServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof KotlinServer.spawn).toBe('function')
  })
})

describe('DartServer', () => {
  test('has correct id', () => {
    expect(DartServer.id).toBe('dart')
  })

  test('supports Dart extension', () => {
    expect(DartServer.extensions).toContain('.dart')
  })

  test('has root function', () => {
    expect(typeof DartServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof DartServer.spawn).toBe('function')
  })

  test('root function detects pubspec.yaml', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dart-test-'))
    try {
      // Create pubspec.yaml
      await fs.writeFile(path.join(tempDir, 'pubspec.yaml'), 'name: test_app\n')

      // Create a nested source file
      const libDir = path.join(tempDir, 'lib')
      await fs.mkdir(libDir)
      const dartFile = path.join(libDir, 'main.dart')
      await fs.writeFile(dartFile, '// test')

      const root = await DartServer.root(dartFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects pubspec.lock', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dart-test-'))
    try {
      // Create pubspec.lock only
      await fs.writeFile(path.join(tempDir, 'pubspec.lock'), 'packages:\n')

      const dartFile = path.join(tempDir, 'main.dart')
      await fs.writeFile(dartFile, '// test')

      const root = await DartServer.root(dartFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function returns projectPath when no pubspec found', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dart-test-'))
    try {
      // No pubspec files
      const dartFile = path.join(tempDir, 'main.dart')
      await fs.writeFile(dartFile, '// test')

      const root = await DartServer.root(dartFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('spawn function returns promise', () => {
    // Verify spawn returns a promise (don't actually call it to avoid downloads)
    const spawnFn = DartServer.spawn
    expect(typeof spawnFn).toBe('function')
    // Verify it's an async function by checking the constructor name
    expect(spawnFn.constructor.name).toBe('AsyncFunction')
  })

  test('root function detects nested monorepo package', async () => {
    // Simulates a monorepo with nested Dart packages
    // root/
    //   pubspec.yaml (root package)
    //   packages/
    //     inner_app/
    //       pubspec.yaml (inner package)
    //       lib/
    //         main.dart
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dart-monorepo-'))
    try {
      // Create root pubspec.yaml
      await fs.writeFile(path.join(tempDir, 'pubspec.yaml'), 'name: root_app\n')

      // Create nested package structure
      const innerPkgDir = path.join(tempDir, 'packages', 'inner_app')
      await fs.mkdir(innerPkgDir, { recursive: true })
      await fs.writeFile(path.join(innerPkgDir, 'pubspec.yaml'), 'name: inner_app\n')

      const libDir = path.join(innerPkgDir, 'lib')
      await fs.mkdir(libDir)
      const dartFile = path.join(libDir, 'main.dart')
      await fs.writeFile(dartFile, '// inner package code')

      // Should find the inner package's pubspec.yaml, not root
      const root = await DartServer.root(dartFile, tempDir)
      expect(root).toBe(innerPkgDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function finds nearest pubspec in deep nesting', async () => {
    // Simulates deep directory structure
    // root/
    //   pubspec.yaml
    //   src/
    //     features/
    //       auth/
    //         login.dart
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dart-deep-'))
    try {
      await fs.writeFile(path.join(tempDir, 'pubspec.yaml'), 'name: deep_app\n')

      const deepDir = path.join(tempDir, 'src', 'features', 'auth')
      await fs.mkdir(deepDir, { recursive: true })
      const dartFile = path.join(deepDir, 'login.dart')
      await fs.writeFile(dartFile, '// login feature')

      const root = await DartServer.root(dartFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('getServerById', () => {
  test('returns typescript server', () => {
    const server = getServerById('typescript')
    expect(server).toBeDefined()
    expect(server?.id).toBe('typescript')
  })

  test('returns undefined for unknown id', () => {
    const server = getServerById('unknown')
    expect(server).toBeUndefined()
  })
})

describe('getServersForExtension', () => {
  test('returns servers for .ts extension', () => {
    const servers = getServersForExtension('.ts')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('typescript')
  })

  test('returns servers for .py extension', () => {
    const servers = getServersForExtension('.py')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('pyright')
  })

  test('returns servers for .go extension', () => {
    const servers = getServersForExtension('.go')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('gopls')
  })

  test('returns servers for .kt extension', () => {
    const servers = getServersForExtension('.kt')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('kotlin')
  })

  test('returns servers for .kts extension', () => {
    const servers = getServersForExtension('.kts')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('kotlin')
  })

  test('returns servers for .dart extension', () => {
    const servers = getServersForExtension('.dart')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('dart')
  })

  test('returns empty array for unknown extension', () => {
    const servers = getServersForExtension('.unknown')
    expect(servers).toEqual([])
  })
})
