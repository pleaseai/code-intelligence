/**
 * @pleaseai/binaries
 *
 * Binary download, caching, and platform utilities for AI coding tools
 */

// Cache utilities
export {
  clearCache,
  DEFAULT_CACHE_DIR,
  ensureCacheDir,
  getCachedBinaryPath,
  getCacheDir,
  hasCachedBinary,
  isValidBinary,
  makeExecutable,
} from './cache'
// Download utilities
export {
  downloadAndExtract,
  downloadFile,
  extractTarGz,
  extractZip,
} from './download'

// Platform utilities
export {
  commandExists,
  detectMusl,
  getCommandOutput,
  getPlatformId,
  getPlatformInfo,
} from './platform'

export type { PlatformId, PlatformInfo } from './platform'
