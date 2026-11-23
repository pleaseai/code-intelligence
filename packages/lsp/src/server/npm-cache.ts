import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { autoInstallDisabled, log } from './utils'

export interface NpmPackage {
  package: string
  version: string
}

export interface NpmCacheSpec {
  serverId: string
  cacheDir: string
  packages: NpmPackage[]
  required: string[]
}

export function npmBin(name: string): string {
  return path.join('node_modules', '.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`)
}

export function npmCacheDir(cacheDir: string): string {
  return path.join(os.homedir(), '.cache', 'dora', cacheDir)
}

async function isInstalled(resourcesDir: string, spec: NpmCacheSpec, expectedVersion: string): Promise<boolean> {
  try {
    await Promise.all(spec.required.map(rel => fs.access(path.join(resourcesDir, rel))))
  }
  catch {
    return false
  }
  try {
    const installed = (await fs.readFile(path.join(resourcesDir, '.installed_version'), 'utf-8')).trim()
    if (installed === expectedVersion) {
      return true
    }
    log.warn({ serverId: spec.serverId, installed, expected: expectedVersion }, 'npm language server version mismatch')
  }
  catch {
    return false
  }
  return false
}

async function install(resourcesDir: string, spec: NpmCacheSpec, expectedVersion: string): Promise<boolean> {
  log.info({ serverId: spec.serverId }, 'Installing npm language server')
  try {
    await fs.mkdir(resourcesDir, { recursive: true })
    const specs = spec.packages.map(p => `${p.package}@${p.version}`)
    const proc = Bun.spawn(['npm', 'install', '--prefix', resourcesDir, ...specs], {
      cwd: resourcesDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      log.error({ serverId: spec.serverId, exitCode, stderr }, 'npm install failed')
      return false
    }
  }
  catch (err) {
    log.error({ serverId: spec.serverId, err }, 'Failed to install npm language server')
    return false
  }
  try {
    await fs.writeFile(path.join(resourcesDir, '.installed_version'), expectedVersion)
  }
  catch (err) {
    log.warn({ serverId: spec.serverId, err }, 'Failed to write npm language server version marker')
  }
  log.info({ serverId: spec.serverId }, 'npm language server installed')
  return true
}

export async function ensureNpmCache(spec: NpmCacheSpec): Promise<string | undefined> {
  const resourcesDir = npmCacheDir(spec.cacheDir)
  const expectedVersion = spec.packages.map(p => p.version).join('_')

  if (!await isInstalled(resourcesDir, spec, expectedVersion)
    && !autoInstallDisabled(spec.serverId)
    && !await install(resourcesDir, spec, expectedVersion)) {
    return undefined
  }

  for (const rel of spec.required) {
    const filePath = path.join(resourcesDir, rel)
    try {
      await fs.access(filePath)
    }
    catch {
      log.error({ serverId: spec.serverId, filePath }, 'npm language server file not found')
      return undefined
    }
  }
  return resourcesDir
}
