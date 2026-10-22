import type { LSPServerInfo } from '../../src/server/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  BiomeServer,
  DartServer,
  DenoServer,
  EslintServer,
  getServerById,
  getServersForExtension,
  GoplsServer,
  KotlinServer,
  LSP_SERVERS,
  OxlintServer,
  PrismaServer,
  PyrightServer,
  RustAnalyzerServer,
  TypescriptServer,
  VueServer,
} from '../../src/server'
import { findRunnableBin } from '../../src/server/utils'

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
    expect(serverIds).toContain('vue')
    expect(serverIds).toContain('prisma')
    expect(serverIds).toContain('eslint')
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

describe('EslintServer', () => {
  test('has correct id', () => {
    expect(EslintServer.id).toBe('eslint')
  })

  test('supports JavaScript/TypeScript extensions', () => {
    expect(EslintServer.extensions).toContain('.ts')
    expect(EslintServer.extensions).toContain('.tsx')
    expect(EslintServer.extensions).toContain('.js')
    expect(EslintServer.extensions).toContain('.jsx')
    expect(EslintServer.extensions).toContain('.mjs')
    expect(EslintServer.extensions).toContain('.cjs')
    expect(EslintServer.extensions).toContain('.mts')
    expect(EslintServer.extensions).toContain('.cts')
  })

  test('supports Vue extension', () => {
    expect(EslintServer.extensions).toContain('.vue')
  })

  test('has root function', () => {
    expect(typeof EslintServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof EslintServer.spawn).toBe('function')
  })

  test('root function detects package-lock.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eslint-test-'))
    try {
      // Create package-lock.json
      await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{"name": "test"}\n')

      // Create a nested source file
      const srcDir = path.join(tempDir, 'src')
      await fs.mkdir(srcDir)
      const tsFile = path.join(srcDir, 'index.ts')
      await fs.writeFile(tsFile, '// test')

      const root = await EslintServer.root(tsFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects bun.lock', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eslint-bun-'))
    try {
      // Create bun.lock
      await fs.writeFile(path.join(tempDir, 'bun.lock'), '')

      const tsFile = path.join(tempDir, 'index.ts')
      await fs.writeFile(tsFile, '// test')

      const root = await EslintServer.root(tsFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function returns projectPath when no lock file found', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eslint-no-lock-'))
    try {
      // No lock files
      const tsFile = path.join(tempDir, 'index.ts')
      await fs.writeFile(tsFile, '// test')

      const root = await EslintServer.root(tsFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function finds nearest lock file in monorepo', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eslint-monorepo-'))
    try {
      // Create root lock file
      await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{"name": "root"}\n')

      // Create nested package with its own lock file
      const innerDir = path.join(tempDir, 'packages', 'app')
      await fs.mkdir(innerDir, { recursive: true })
      await fs.writeFile(path.join(innerDir, 'package-lock.json'), '{"name": "app"}\n')

      const srcDir = path.join(innerDir, 'src')
      await fs.mkdir(srcDir)
      const tsFile = path.join(srcDir, 'index.ts')
      await fs.writeFile(tsFile, '// test')

      // Should find the inner package's lock file
      const root = await EslintServer.root(tsFile, tempDir)
      expect(root).toBe(innerDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('spawn function returns promise', () => {
    const spawnFn = EslintServer.spawn
    expect(typeof spawnFn).toBe('function')
    expect(spawnFn.constructor.name).toBe('AsyncFunction')
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

describe.skipIf(process.platform === 'win32')('findRunnableBin', () => {
  async function findRunnableBinWith(script: string, rootFiles: string[] = []): Promise<{ result: string | undefined, fakeBin: string }> {
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runnable-bin-'))
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runnable-root-'))
    const savedPath = process.env.PATH
    try {
      const fakeBin = path.join(binDir, 'fake-tool')
      await fs.writeFile(fakeBin, script, { mode: 0o755 })
      for (const file of rootFiles) {
        await fs.writeFile(path.join(rootDir, file), '')
      }
      process.env.PATH = binDir
      return { result: await findRunnableBin('fake-tool', rootDir), fakeBin }
    }
    finally {
      process.env.PATH = savedPath
      await fs.rm(binDir, { recursive: true, force: true })
      await fs.rm(rootDir, { recursive: true, force: true })
    }
  }

  test('ignores a binary on PATH that fails --version', async () => {
    const { result } = await findRunnableBinWith('#!/bin/sh\necho "No version is set for shim: fake-tool" >&2\nexit 1\n')
    expect(result).toBeUndefined()
  })

  test('ignores a binary on PATH that cannot be spawned', async () => {
    const { result } = await findRunnableBinWith('\x7FELF not a real binary')
    expect(result).toBeUndefined()
  })

  test('returns a binary on PATH that runs --version', async () => {
    const { result, fakeBin } = await findRunnableBinWith('#!/bin/sh\nexit 0\n')
    expect(result).toBe(fakeBin)
  })

  test('probes --version in the project root', async () => {
    const { result, fakeBin } = await findRunnableBinWith('#!/bin/sh\n[ -f .tool-versions ] || exit 1\n', ['.tool-versions'])
    expect(result).toBe(fakeBin)
  })

  test('skips a failing binary for a runnable one later on PATH', async () => {
    const shimDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runnable-shim-'))
    const installDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runnable-install-'))
    const savedPath = process.env.PATH
    try {
      await fs.writeFile(path.join(shimDir, 'fake-tool'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
      const installed = path.join(installDir, 'fake-tool')
      await fs.writeFile(installed, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      process.env.PATH = [shimDir, installDir].join(path.delimiter)
      expect(await findRunnableBin('fake-tool', installDir)).toBe(installed)
    }
    finally {
      process.env.PATH = savedPath
      await fs.rm(shimDir, { recursive: true, force: true })
      await fs.rm(installDir, { recursive: true, force: true })
    }
  })
})

// Each fake server records its name and arguments in `invoked` under the project root.
const recorder = (name: string): string => `#!/bin/sh\necho "${name} $*" > invoked\n`

/** Spawn `server` with only `pathBins` on PATH and return what the launched binary recorded. */
async function spawnServerWith(
  server: LSPServerInfo,
  pathBins: Record<string, string>,
  setupRoot: (rootDir: string) => Promise<void> = async () => {},
): Promise<string> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-fallback-bin-'))
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-fallback-root-'))
  const savedPath = process.env.PATH
  try {
    for (const [name, script] of Object.entries(pathBins)) {
      await fs.writeFile(path.join(binDir, name), script, { mode: 0o755 })
    }
    await setupRoot(rootDir)
    process.env.PATH = binDir
    const handle = await server.spawn(rootDir)
    process.env.PATH = savedPath
    expect(handle).toBeDefined()
    const proc = handle!.process
    if (proc.exitCode === null && proc.signalCode === null) {
      await new Promise(resolve => proc.once('exit', resolve))
    }
    return (await fs.readFile(path.join(rootDir, 'invoked'), 'utf8')).trim()
  }
  finally {
    process.env.PATH = savedPath
    await fs.rm(binDir, { recursive: true, force: true })
    await fs.rm(rootDir, { recursive: true, force: true })
  }
}

describe.skipIf(process.platform === 'win32')('TypescriptServer classic fallback', () => {
  const spawnTypescriptWith = (
    pathBins: Record<string, string>,
    setupRoot?: (rootDir: string) => Promise<void>,
  ): Promise<string> => spawnServerWith(TypescriptServer, pathBins, setupRoot)

  test('falls back to bunx with a pinned typescript-language-server when the one on PATH cannot run', async () => {
    const invoked = await spawnTypescriptWith({
      'typescript-language-server': '#!/bin/sh\nexit 1\n',
      'bunx': recorder('bunx'),
    })
    expect(invoked).toBe('bunx typescript-language-server@4.3.3 --stdio')
  })

  async function installLocalServer(rootDir: string, script: string): Promise<void> {
    const packageDir = path.join(rootDir, 'node_modules', 'typescript-language-server')
    await fs.mkdir(path.join(packageDir, 'lib'), { recursive: true })
    await fs.writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({ name: 'typescript-language-server', bin: { 'typescript-language-server': 'lib/cli.mjs' } }),
    )
    await fs.writeFile(path.join(packageDir, 'lib', 'cli.mjs'), script, { mode: 0o755 })
    const binDir = path.join(rootDir, 'node_modules', '.bin')
    await fs.mkdir(binDir)
    await fs.symlink(path.join('..', 'typescript-language-server', 'lib', 'cli.mjs'), path.join(binDir, 'typescript-language-server'))
  }

  test('prefers a project-local typescript-language-server', async () => {
    const invoked = await spawnTypescriptWith({ bunx: recorder('bunx') }, rootDir => installLocalServer(rootDir, recorder('local')))
    expect(invoked).toBe('local --stdio')
  })

  test('skips a project-local typescript-language-server that fails --version', async () => {
    const invoked = await spawnTypescriptWith({ bunx: recorder('bunx') }, rootDir => installLocalServer(rootDir, '#!/bin/sh\nexit 1\n'))
    expect(invoked).toBe('bunx typescript-language-server@4.3.3 --stdio')
  })
})

describe.skipIf(process.platform === 'win32')('BiomeServer fallback', () => {
  test('falls back to bunx with a pinned @biomejs/biome when biome is not installed', async () => {
    const invoked = await spawnServerWith(BiomeServer, { bunx: recorder('bunx') })
    expect(invoked).toBe('bunx @biomejs/biome@2.6.2 lsp-proxy --stdio')
  })

  test('prefers biome on PATH over bunx', async () => {
    const invoked = await spawnServerWith(BiomeServer, { biome: recorder('path'), bunx: recorder('bunx') })
    expect(invoked).toBe('path lsp-proxy --stdio')
  })

  test('prefers a project-local biome', async () => {
    const invoked = await spawnServerWith(BiomeServer, { biome: recorder('path'), bunx: recorder('bunx') }, async (rootDir) => {
      const binDir = path.join(rootDir, 'node_modules', '.bin')
      await fs.mkdir(binDir, { recursive: true })
      await fs.writeFile(path.join(binDir, 'biome'), recorder('local'), { mode: 0o755 })
    })
    expect(invoked).toBe('local lsp-proxy --stdio')
  })
})

describe('VueServer', () => {
  test('has correct id', () => {
    expect(VueServer.id).toBe('vue')
  })

  test('supports Vue extension', () => {
    expect(VueServer.extensions).toContain('.vue')
  })

  test('has root function', () => {
    expect(typeof VueServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof VueServer.spawn).toBe('function')
  })

  test('root function detects package.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-test-'))
    try {
      // Create package.json
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test-vue-app"}\n')

      // Create a nested source file
      const srcDir = path.join(tempDir, 'src')
      await fs.mkdir(srcDir)
      const vueFile = path.join(srcDir, 'App.vue')
      await fs.writeFile(vueFile, '<template><div>Test</div></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function excludes deno projects', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-deno-'))
    try {
      // Create package.json
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test"}')
      // Create deno.json (exclusion marker)
      await fs.writeFile(path.join(tempDir, 'deno.json'), '{}')

      const vueFile = path.join(tempDir, 'App.vue')
      await fs.writeFile(vueFile, '<template></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBeUndefined()
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function excludes deno.jsonc projects', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-deno-jsonc-'))
    try {
      // Create package.json
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test"}')
      // Create deno.jsonc (exclusion marker)
      await fs.writeFile(path.join(tempDir, 'deno.jsonc'), '{}')

      const vueFile = path.join(tempDir, 'App.vue')
      await fs.writeFile(vueFile, '<template></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBeUndefined()
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects lock files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-lock-'))
    try {
      // Create lock file without package.json
      await fs.writeFile(path.join(tempDir, 'bun.lock'), '')

      const vueFile = path.join(tempDir, 'App.vue')
      await fs.writeFile(vueFile, '<template></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects nested monorepo package', async () => {
    // Simulates a monorepo with nested Vue packages
    // root/
    //   package.json (root package)
    //   packages/
    //     vue-app/
    //       package.json (inner package)
    //       src/
    //         App.vue
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-monorepo-'))
    try {
      // Create root package.json
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "root"}\n')

      // Create nested package structure
      const innerPkgDir = path.join(tempDir, 'packages', 'vue-app')
      await fs.mkdir(innerPkgDir, { recursive: true })
      await fs.writeFile(path.join(innerPkgDir, 'package.json'), '{"name": "vue-app"}\n')

      const srcDir = path.join(innerPkgDir, 'src')
      await fs.mkdir(srcDir)
      const vueFile = path.join(srcDir, 'App.vue')
      await fs.writeFile(vueFile, '<template></template>')

      // Should find the inner package's package.json, not root
      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBe(innerPkgDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function returns projectPath when no package.json found', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-no-pkg-'))
    try {
      // No package.json files
      const vueFile = path.join(tempDir, 'App.vue')
      await fs.writeFile(vueFile, '<template></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function finds nearest package.json in deep nesting', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vue-deep-'))
    try {
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "deep-app"}\n')

      const deepDir = path.join(tempDir, 'src', 'features', 'auth', 'components')
      await fs.mkdir(deepDir, { recursive: true })
      const vueFile = path.join(deepDir, 'LoginForm.vue')
      await fs.writeFile(vueFile, '<template></template>')

      const root = await VueServer.root(vueFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('spawn function returns promise', () => {
    // Verify spawn returns a promise (don't actually call it to avoid downloads)
    const spawnFn = VueServer.spawn
    expect(typeof spawnFn).toBe('function')
    // Verify it's an async function by checking the constructor name
    expect(spawnFn.constructor.name).toBe('AsyncFunction')
  })
})

describe('PrismaServer', () => {
  test('has correct id', () => {
    expect(PrismaServer.id).toBe('prisma')
  })

  test('supports Prisma extension', () => {
    expect(PrismaServer.extensions).toContain('.prisma')
  })

  test('has root function', () => {
    expect(typeof PrismaServer.root).toBe('function')
  })

  test('has spawn function', () => {
    expect(typeof PrismaServer.spawn).toBe('function')
  })

  test('root function detects schema.prisma', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prisma-test-'))
    try {
      // Create schema.prisma at root
      await fs.writeFile(path.join(tempDir, 'schema.prisma'), 'datasource db {\n  provider = "sqlite"\n  url = "file:./dev.db"\n}\n')

      const prismaFile = path.join(tempDir, 'schema.prisma')
      const root = await PrismaServer.root(prismaFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects prisma/schema.prisma from project root', async () => {
    // Test that prisma/schema.prisma pattern works from project root
    // When calling root() with a file outside prisma/, it should find the project root
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prisma-test-'))
    try {
      // Create prisma/schema.prisma (conventional location)
      const prismaDir = path.join(tempDir, 'prisma')
      await fs.mkdir(prismaDir)
      await fs.writeFile(path.join(prismaDir, 'schema.prisma'), 'datasource db {\n  provider = "sqlite"\n  url = "file:./dev.db"\n}\n')

      // Create a source file at project root level
      const srcDir = path.join(tempDir, 'src')
      await fs.mkdir(srcDir)
      const srcFile = path.join(srcDir, 'index.ts')
      await fs.writeFile(srcFile, '// test')

      // When root() is called with src/index.ts, it should find tempDir via prisma/schema.prisma
      const root = await PrismaServer.root(srcFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects nested monorepo package', async () => {
    // Simulates a monorepo with nested Prisma schema
    // root/
    //   packages/
    //     backend/
    //       prisma/
    //         schema.prisma
    //       src/
    //         index.ts
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prisma-monorepo-'))
    try {
      // Create nested package structure
      const backendDir = path.join(tempDir, 'packages', 'backend')
      const prismaDir = path.join(backendDir, 'prisma')
      await fs.mkdir(prismaDir, { recursive: true })
      await fs.writeFile(path.join(prismaDir, 'schema.prisma'), 'datasource db {\n  provider = "sqlite"\n  url = "file:./dev.db"\n}\n')

      // Create a source file in backend/src
      const srcDir = path.join(backendDir, 'src')
      await fs.mkdir(srcDir)
      const srcFile = path.join(srcDir, 'index.ts')
      await fs.writeFile(srcFile, '// test')

      // When root() is called with src/index.ts, it should find backendDir via prisma/schema.prisma
      const root = await PrismaServer.root(srcFile, tempDir)
      expect(root).toBe(backendDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('root function detects schema.prisma at project root', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prisma-root-schema-'))
    try {
      // schema.prisma at project root (not in prisma/ subdirectory)
      const prismaFile = path.join(tempDir, 'schema.prisma')
      await fs.writeFile(prismaFile, '// test')

      const root = await PrismaServer.root(prismaFile, tempDir)
      expect(root).toBe(tempDir)
    }
    finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  test('spawn function returns promise', () => {
    // Verify spawn returns a promise (don't actually call it to avoid downloads)
    const spawnFn = PrismaServer.spawn
    expect(typeof spawnFn).toBe('function')
    // Verify it's an async function by checking the constructor name
    expect(spawnFn.constructor.name).toBe('AsyncFunction')
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

  test('returns servers for .vue extension', () => {
    const servers = getServersForExtension('.vue')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('vue')
  })

  test('returns servers for .prisma extension', () => {
    const servers = getServersForExtension('.prisma')
    expect(servers.length).toBeGreaterThan(0)

    const serverIds = servers.map(s => s.id)
    expect(serverIds).toContain('prisma')
  })

  test('returns empty array for unknown extension', () => {
    const servers = getServersForExtension('.unknown')
    expect(servers).toEqual([])
  })
})
