/**
 * Port discovery for JetBrains plugin service
 * Scans ports 24226-24245 to find the running IDE instance
 */

import { createLogger } from '@pleaseai/logger'
import { ServerNotFoundError } from '../errors'
import { transformResponse } from './response-transformer'

const log = createLogger('dora')

const BASE_PORT = 0x5EA2 // 24226
const PORT_RANGE = 20
const DISCOVERY_TIMEOUT = 1000 // 1 second for port discovery

interface PortCache {
  port: number | null
  projectPath: string | null
}

const cache: PortCache = { port: null, projectPath: null }

interface StatusResponse {
  project_root: string
}

/**
 * Checks if a port has a JetBrains plugin service matching the project
 */
async function checkPort(
  port: number,
  expectedPath: string,
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT)

    const response = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok)
      return false

    const data = await response.json()
    const transformed = transformResponse<StatusResponse>(data)
    const projectRoot = transformed.project_root

    return projectRoot === expectedPath
  }
  catch {
    return false
  }
}

/**
 * Discovers the port of the JetBrains plugin service for the given project
 * @param projectPath The absolute path to the project root
 * @returns The port number where the service is running
 * @throws ServerNotFoundError if no service is found
 */
export async function discoverPort(projectPath: string): Promise<number> {
  // Try cached port first for performance
  if (cache.port !== null && cache.projectPath === projectPath) {
    if (await checkPort(cache.port, projectPath)) {
      return cache.port
    }
  }

  // Scan port range
  for (let port = BASE_PORT; port < BASE_PORT + PORT_RANGE; port++) {
    if (await checkPort(port, projectPath)) {
      cache.port = port
      cache.projectPath = projectPath
      log.debug({ port }, 'Found JetBrains IDE service')
      return port
    }
  }

  throw new ServerNotFoundError(projectPath)
}

/**
 * Clears the port cache (useful for testing or reconnection)
 */
export function clearPortCache(): void {
  cache.port = null
  cache.projectPath = null
}
