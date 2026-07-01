#!/usr/bin/env bun
/**
 * Generate platform-specific npm packages for @pleaseai/code CLI
 *
 * Based on oxc-project's approach:
 * https://github.com/oxc-project/oxc/blob/main/npm/oxfmt/scripts/generate-packages.js
 *
 * Features:
 *   - Bytecode compilation for 2x faster startup
 *   - Minification for smaller binary size
 *   - Cross-platform compilation
 *
 * Creates:
 *   npm/code-darwin-arm64/
 *   npm/code-darwin-x64/
 *   npm/code-linux-x64-glibc/
 *   npm/code-linux-arm64-glibc/
 *   npm/code-linux-x64-musl/
 *   npm/code-linux-arm64-musl/
 *   npm/code-win32-x64/
 *   npm/code/  (main package with launcher)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

const PACKAGE_NAME = 'code'
const PACKAGE_SCOPE = '@pleaseai'

const ROOT_DIR = path.resolve(import.meta.dir, '..')
const NPM_DIR = path.resolve(ROOT_DIR, 'npm')
const CODE_PKG_DIR = path.resolve(ROOT_DIR, 'packages/code')
const MANIFEST_PATH = path.resolve(CODE_PKG_DIR, 'package.json')

interface Target {
  platform: string
  arch: string
  bunTarget: string
  libc?: 'glibc' | 'musl'
}

// Supported targets from https://bun.sh/docs/bundler/executables#supported-targets
// Using -modern for x64 (AVX2, 2013+ CPUs) for better performance
const TARGETS: Target[] = [
  // macOS
  { platform: 'darwin', arch: 'arm64', bunTarget: 'bun-darwin-arm64' },
  { platform: 'darwin', arch: 'x64', bunTarget: 'bun-darwin-x64-modern' },
  // Linux glibc
  { platform: 'linux', arch: 'x64', bunTarget: 'bun-linux-x64-modern', libc: 'glibc' },
  { platform: 'linux', arch: 'arm64', bunTarget: 'bun-linux-arm64', libc: 'glibc' },
  // Linux musl (Alpine)
  { platform: 'linux', arch: 'x64', bunTarget: 'bun-linux-x64-modern-musl', libc: 'musl' },
  { platform: 'linux', arch: 'arm64', bunTarget: 'bun-linux-arm64-musl', libc: 'musl' },
  // Windows (arm64 not supported)
  { platform: 'win32', arch: 'x64', bunTarget: 'bun-windows-x64-modern' },
]

function getTargetName(target: Target): string {
  if (target.libc) {
    return `${target.platform}-${target.arch}-${target.libc}`
  }
  return `${target.platform}-${target.arch}`
}

function getBinaryName(target: Target): string {
  const ext = target.platform === 'win32' ? '.exe' : ''
  return `${PACKAGE_NAME}${ext}`
}

async function compileForTarget(target: Target): Promise<string | null> {
  const targetName = getTargetName(target)
  const outDir = path.resolve(NPM_DIR, `${PACKAGE_NAME}-${targetName}`)
  const binaryName = getBinaryName(target)
  const outFile = path.resolve(outDir, binaryName)
  const entrypoint = path.resolve(CODE_PKG_DIR, 'src/cli.ts')

  console.log(`Compiling for ${targetName}...`)

  try {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      // @ts-expect-error - compile option for single executable
      compile: {
        target: target.bunTarget,
        outfile: outFile,
      },
      // bytecode: 2x faster startup by pre-compiling to bytecode
      bytecode: true,
      // minify: Reduce binary size
      minify: true,
      // No sourcemaps for production
      sourcemap: 'none',
    })

    if (!result.success) {
      console.error(`  ✗ Failed to compile for ${targetName}:`, result.logs)
      return null
    }

    console.log(`  ✓ Compiled: ${outFile}`)
    return outFile
  }
  catch (error) {
    console.error(`  ✗ Failed to compile for ${targetName}:`, error)
    return null
  }
}

async function generateNativePackage(target: Target, rootManifest: Record<string, unknown>): Promise<void> {
  const targetName = getTargetName(target)
  const packageName = `${PACKAGE_SCOPE}/${PACKAGE_NAME}-${targetName}`
  const packageRoot = path.resolve(NPM_DIR, `${PACKAGE_NAME}-${targetName}`)

  // Remove existing directory
  fs.rmSync(packageRoot, { recursive: true, force: true })
  fs.mkdirSync(packageRoot, { recursive: true })

  // Compile binary
  const binaryPath = await compileForTarget(target)
  if (!binaryPath) {
    console.error(`  Skipping ${targetName} due to compilation failure`)
    return
  }

  // Generate package.json
  const { version, author, license, homepage, bugs, repository } = rootManifest

  const manifest: Record<string, unknown> = {
    name: packageName,
    version,
    description: `Platform-specific binary for ${PACKAGE_NAME} (${targetName})`,
    type: 'commonjs',
    os: [target.platform],
    cpu: [target.arch],
    author,
    license,
    homepage,
    bugs,
    repository,
    preferUnplugged: true,
  }

  if (target.libc) {
    manifest.libc = [target.libc]
  }

  const manifestPath = path.resolve(packageRoot, 'package.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`  Created: ${manifestPath}`)

  // Create README
  const readme = `# ${packageName}

Platform-specific binary package for [${PACKAGE_NAME}](https://github.com/pleaseai/code-intelligence).

This package is automatically installed as an optional dependency on ${target.platform} (${target.arch}).

## Manual Usage

\`\`\`bash
./${getBinaryName(target)} --help
\`\`\`
`
  fs.writeFileSync(path.resolve(packageRoot, 'README.md'), readme)
}

async function generateMainPackage(rootManifest: Record<string, unknown>): Promise<void> {
  const packageRoot = path.resolve(NPM_DIR, PACKAGE_NAME)

  // Remove existing directory
  fs.rmSync(packageRoot, { recursive: true, force: true })
  fs.mkdirSync(packageRoot, { recursive: true })

  // Generate optionalDependencies
  const optionalDependencies: Record<string, string> = {}
  for (const target of TARGETS) {
    const targetName = getTargetName(target)
    const packageName = `${PACKAGE_SCOPE}/${PACKAGE_NAME}-${targetName}`
    optionalDependencies[packageName] = rootManifest.version as string
  }

  // Generate package.json
  const { version, author, license, homepage, bugs, repository, description } = rootManifest

  const manifest = {
    name: `${PACKAGE_SCOPE}/${PACKAGE_NAME}`,
    version,
    description,
    type: 'module',
    bin: {
      [PACKAGE_NAME]: `bin/${PACKAGE_NAME}`,
    },
    author,
    license,
    homepage,
    bugs,
    repository,
    optionalDependencies,
    files: ['bin', 'dist'],
  }

  const manifestPath = path.resolve(packageRoot, 'package.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Created main package: ${manifestPath}`)

  // Compile launcher from packages/code/src/launcher/cli.ts
  const launcherSrc = path.resolve(CODE_PKG_DIR, 'src/launcher/cli.ts')
  const distDir = path.resolve(packageRoot, 'dist')
  fs.mkdirSync(distDir, { recursive: true })

  const result = await Bun.build({
    entrypoints: [launcherSrc],
    outdir: distDir,
    target: 'node',
    format: 'esm',
    minify: true,
  })

  if (!result.success) {
    console.error('Failed to compile launcher:', result.logs)
    throw new Error('Launcher compilation failed')
  }
  console.log(`  ✓ Compiled launcher: ${path.resolve(distDir, 'cli.js')}`)

  // Create bin directory with minimal entry point
  const binDir = path.resolve(packageRoot, 'bin')
  fs.mkdirSync(binDir, { recursive: true })

  const binScript = `#!/usr/bin/env node

import "../dist/cli.js";
`

  fs.writeFileSync(path.resolve(binDir, PACKAGE_NAME), binScript)
  fs.chmodSync(path.resolve(binDir, PACKAGE_NAME), 0o755)
  console.log(`Created bin entry: ${path.resolve(binDir, PACKAGE_NAME)}`)
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║  Generating platform-specific packages for @pleaseai/code  ║')
  console.log('║  Features: bytecode (2x startup), minify, cross-compile    ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  // Read root manifest
  const rootManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  console.log(`Version: ${rootManifest.version}\n`)

  // Ensure npm directory exists
  fs.mkdirSync(NPM_DIR, { recursive: true })

  // Generate native packages for each target
  console.log('=== Compiling native binaries (--bytecode --minify) ===\n')
  const startTime = performance.now()

  for (const target of TARGETS) {
    await generateNativePackage(target, rootManifest)
    console.log()
  }

  // Generate main package with launcher
  console.log('=== Generating main package ===\n')
  await generateMainPackage(rootManifest)

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log(`║${`  ✓ Done in ${elapsed}s`.padEnd(60)}║`)
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log(`\nGenerated packages in: ${NPM_DIR}`)
  console.log('\nTo publish all packages:')
  console.log('  bun run publish:npm')
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
