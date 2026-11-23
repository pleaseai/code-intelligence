import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { downloadFile, extractZip, log } from './utils'

export interface GithubRelease {
  tag_name: string
  assets: Array<{ name: string, browser_download_url: string }>
}

export interface ReleaseBinarySpec {
  serverId: string
  /** GitHub `owner/name` whose latest release ships the server. */
  repo: string
  /** Name of this platform's asset; `.zip` assets are unzipped, all others untarred. */
  assetName: (release: GithubRelease) => string
}

export function serverCacheDir(name: string): string {
  return path.join(os.homedir(), '.cache', 'dora', name)
}

/** Looks up `name` on PATH, then in `dirs`. */
export function findCachedBinary(name: string, ...dirs: string[]): string | null {
  return Bun.which(name, {
    PATH: [process.env.PATH, ...dirs].filter(Boolean).join(path.delimiter),
  })
}

/**
 * Extracts this platform's asset from the latest release of `spec.repo` into `destDir`
 * and makes `bin` executable. Returns false, after logging, when any step fails.
 */
export async function downloadReleaseBinary(spec: ReleaseBinarySpec, destDir: string, bin: string): Promise<boolean> {
  const { serverId, repo } = spec
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`)
  if (!response.ok) {
    log.error({ serverId, repo, status: response.status, statusText: response.statusText }, 'Failed to fetch release info from GitHub')
    return false
  }

  const release = await response.json() as GithubRelease
  const assetName = spec.assetName(release)
  const asset = release.assets.find(a => a.name === assetName)
  if (!asset) {
    log.error({ serverId, assetName, availableAssets: release.assets.map(a => a.name).slice(0, 10) }, 'Release asset not found for this platform')
    return false
  }

  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), `dora-${serverId}-`))
  const archivePath = path.join(downloadDir, assetName)
  try {
    await downloadFile(asset.browser_download_url, archivePath)
    await extractArchive(archivePath, destDir)
    await fs.access(bin)
    if (process.platform !== 'win32') {
      await fs.chmod(bin, 0o755)
    }
  }
  catch (err) {
    log.error({ serverId, assetName, bin, err }, 'Failed to install language server from GitHub release')
    return false
  }
  finally {
    await fs.rm(downloadDir, { force: true, recursive: true }).catch((err) => {
      log.warn({ serverId, downloadDir, err }, 'Failed to clean up release download')
    })
  }
  return true
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, destDir)
    return
  }
  await fs.mkdir(destDir, { recursive: true })
  const proc = Bun.spawn(['tar', '-xzf', archivePath, '-C', destDir], { stdout: 'pipe', stderr: 'pipe' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`tar exited ${exitCode}: ${await new Response(proc.stderr).text()}`)
  }
}
