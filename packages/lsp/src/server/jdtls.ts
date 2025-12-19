/**
 * JDTLS (Java) Language Server
 * Auto-downloads from Eclipse
 */

import type { LSPServerInfo } from './types'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { attachLSPProcessHandlers, downloadFile, log, nearestRoot } from './utils'

function getJdtlsResourcesDir(): string {
  return path.join(os.homedir(), '.cache', 'dora', 'jdtls-lsp')
}

export const JdtlsServer: LSPServerInfo = {
  id: 'jdtls',
  extensions: ['.java'],
  root: nearestRoot(['pom.xml', 'build.gradle', 'build.gradle.kts', '.project', '.classpath']),
  async spawn(root) {
    const resourcesDir = getJdtlsResourcesDir()

    // Check prerequisite
    const java = Bun.which('java')
    if (!java) {
      log.warn('Java 21 or newer is required for JDTLS. Install Java first.')
      return undefined
    }

    // Check Java version
    const versionProc = Bun.spawn(['java', '-version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await versionProc.exited
    const versionOutput = await new Response(versionProc.stderr).text()
    // Match various Java version formats:
    // - openjdk version "21.0.2" 2024-01-16
    // - java version "21.0.2" 2024-01-16 LTS
    // - version "21" (short format)
    const versionMatch = /version\s+"?(\d+)(?:\.\d+)*"?/.exec(versionOutput)
    const majorVersion = versionMatch && versionMatch[1] ? Number.parseInt(versionMatch[1]) : 0

    if (majorVersion < 21) {
      log.warn({ version: majorVersion }, 'JDTLS requires Java 21 or newer')
      return undefined
    }

    const distPath = path.join(resourcesDir, 'jdtls')
    const launcherDir = path.join(distPath, 'plugins')

    // Check if installed
    try {
      await fs.access(launcherDir)
    }
    catch {
      log.info('Downloading JDTLS from Eclipse')
      await fs.mkdir(distPath, { recursive: true })

      // Use specific milestone version for stability
      const JDTLS_VERSION = '1.40.0'
      const JDTLS_TIMESTAMP = '202409261450'
      const archivePath = path.join(distPath, 'release.tar.gz')
      const downloadUrl = `https://download.eclipse.org/jdtls/milestones/${JDTLS_VERSION}/jdt-language-server-${JDTLS_VERSION}-${JDTLS_TIMESTAMP}.tar.gz`
      await downloadFile(downloadUrl, archivePath)

      const extractProc = Bun.spawn(['tar', '-xzf', archivePath], {
        cwd: distPath,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const extractExitCode = await extractProc.exited
      if (extractExitCode !== 0) {
        const stderr = await new Response(extractProc.stderr).text()
        log.error({ extractExitCode, stderr }, 'Failed to extract JDTLS archive')
        await fs.rm(archivePath, { force: true })
        return undefined
      }

      await fs.rm(archivePath, { force: true })
      log.info('JDTLS installed')
    }

    // Find launcher JAR using fs.readdir (cross-platform)
    let files: string[]
    try {
      files = await fs.readdir(launcherDir)
    }
    catch {
      log.error({ launcherDir }, 'Failed to read JDTLS launcher directory')
      return undefined
    }
    const jarFileName = files.find(f => f.startsWith('org.eclipse.equinox.launcher_') && f.endsWith('.jar'))
    if (!jarFileName) {
      log.error('JDTLS launcher JAR not found')
      return undefined
    }

    const launcherJar = path.join(launcherDir, jarFileName)

    // Get platform-specific config
    const configMap: Record<string, string> = {
      darwin: 'config_mac',
      linux: 'config_linux',
      win32: 'config_windows',
    }
    const configFile = path.join(distPath, configMap[process.platform] || 'config_linux')

    // Create temp data directory
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dora-jdtls-data'))

    const proc = spawn(java, [
      '-jar',
      launcherJar,
      '-configuration',
      configFile,
      '-data',
      dataDir,
      '-Declipse.application=org.eclipse.jdt.ls.core.id1',
      '-Dosgi.bundles.defaultStartLevel=4',
      '-Declipse.product=org.eclipse.jdt.ls.core.product',
      '-Dlog.level=ALL',
      '--add-modules=ALL-SYSTEM',
      '--add-opens',
      'java.base/java.util=ALL-UNNAMED',
      '--add-opens',
      'java.base/java.lang=ALL-UNNAMED',
    ], { cwd: root })

    attachLSPProcessHandlers(proc, 'jdtls')
    return { process: proc }
  },
}
