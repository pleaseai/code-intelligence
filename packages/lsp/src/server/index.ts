/**
 * LSP Server Registry
 *
 * This module exports all LSP servers and provides utilities for server lookup.
 */

// Import type for LSP_SERVERS array
import type { LSPServerInfo } from './types'

import path from 'node:path'
// Import all servers
import { AstroServer } from './astro'
import { BashServer } from './bash'
import { BiomeServer } from './biome'
import { ClangdServer } from './clangd'
import { CsharpServer } from './csharp'
import { DartServer } from './dart'
import { DenoServer } from './deno'
import { DockerfileServer } from './dockerfile'
import { ElixirLsServer } from './elixir'
import { EslintServer } from './eslint'
import { FsharpServer } from './fsharp'
import { GleamServer } from './gleam'
import { GoplsServer } from './gopls'
import { JdtlsServer } from './jdtls'
import { KotlinServer } from './kotlin'
import { LuaLsServer } from './lua'
import { OcamlServer } from './ocaml'
import { OxlintServer } from './oxlint'
import { PhpServer } from './php'
import { PrismaServer } from './prisma'
import { PyrightServer } from './pyright'
import { RubocopServer } from './rubocop'
import { RustAnalyzerServer } from './rust-analyzer'
import { SourceKitServer } from './sourcekit'
import { SvelteServer } from './svelte'
import { TerraformServer } from './terraform'
import { TexlabServer } from './texlab'
import { TypescriptServer } from './typescript'
import { VueServer } from './vue'
import { YamlServer } from './yaml'

import { ZlsServer } from './zls'

// Re-export types
export type { LSPServerHandle, LSPServerInfo, PlatformId, RootFunction } from './types'

// Re-export utilities
export {
  attachLSPProcessHandlers,
  downloadAndExtract,
  downloadFile,
  extractZip,
  getPlatformId,
  log,
  nearestRoot,
} from './utils'

// Re-export all servers
export {
  AstroServer,
  BashServer,
  BiomeServer,
  ClangdServer,
  CsharpServer,
  DartServer,
  DenoServer,
  DockerfileServer,
  ElixirLsServer,
  EslintServer,
  FsharpServer,
  GleamServer,
  GoplsServer,
  JdtlsServer,
  KotlinServer,
  LuaLsServer,
  OcamlServer,
  OxlintServer,
  PhpServer,
  PrismaServer,
  PyrightServer,
  RubocopServer,
  RustAnalyzerServer,
  SourceKitServer,
  SvelteServer,
  TerraformServer,
  TexlabServer,
  TypescriptServer,
  VueServer,
  YamlServer,
  ZlsServer,
}

/**
 * All available LSP servers
 * Order matters - higher priority servers should come first for extension matching
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  VueServer, // Vue before TypeScript for .vue files
  SvelteServer, // Svelte before TypeScript for .svelte files
  AstroServer, // Astro before TypeScript for .astro files
  TypescriptServer,
  BiomeServer, // Biome after TypeScript for linting
  OxlintServer,
  EslintServer, // ESLint after OxlintServer for JS/TS linting
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
  KotlinServer,
  DartServer,
  PrismaServer,
  YamlServer,
  BashServer,
  DockerfileServer,
  RubocopServer,
  ElixirLsServer,
  ZlsServer,
  CsharpServer,
  FsharpServer,
  SourceKitServer,
  ClangdServer,
  JdtlsServer,
  LuaLsServer,
  PhpServer,
  OcamlServer,
  TerraformServer,
  TexlabServer,
  GleamServer,
]

/**
 * Get server info by ID
 */
export function getServerById(id: string): LSPServerInfo | undefined {
  return LSP_SERVERS.find(s => s.id === id)
}

/**
 * Get servers that support a file extension
 */
export function getServersForExtension(extension: string): LSPServerInfo[] {
  return LSP_SERVERS.filter(s => s.extensions.includes(extension))
}

/**
 * Get servers that support a specific filename (for files like Dockerfile, Makefile)
 */
export function getServersForFilename(filename: string): LSPServerInfo[] {
  return LSP_SERVERS.filter(s => s.filenames?.includes(filename))
}

/**
 * Get servers that support a file by checking both extension and filename
 */
export function getServersForFile(filePath: string): LSPServerInfo[] {
  const ext = path.extname(filePath)
  const filename = path.basename(filePath)

  const byExtension = ext ? getServersForExtension(ext) : []
  const byFilename = getServersForFilename(filename)

  // Combine and deduplicate
  const serverIds = new Set<string>()
  const result: LSPServerInfo[] = []

  for (const server of [...byExtension, ...byFilename]) {
    if (!serverIds.has(server.id)) {
      serverIds.add(server.id)
      result.push(server)
    }
  }

  return result
}
