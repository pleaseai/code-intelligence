/**
 * Binary downloader utility
 * Re-exports from @pleaseai/binaries with local defaults
 */

export {
  DEFAULT_CACHE_DIR as CACHE_DIR,
  commandExists,
  downloadAndExtract,
  downloadFile,
  ensureCacheDir,
  extractTarGz,
  extractZip,
  getCachedBinaryPath,
  getCacheDir,
  getCommandOutput,
  getPlatformId,
  getPlatformInfo,
  hasCachedBinary,
  isValidBinary,
  makeExecutable,
} from '@pleaseai/binaries'
export type { PlatformId, PlatformInfo } from '@pleaseai/binaries'
