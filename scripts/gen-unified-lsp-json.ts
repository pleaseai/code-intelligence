#!/usr/bin/env bun
/**
 * Generate the unified `code-intelligence-lsp` plugin's `.lsp.json`.
 *
 * The unified plugin registers ONE LSP server that claims every code extension
 * supported by LSP_SERVERS. At runtime `code lsp-multiplex` fans each file out
 * to the matching downstream servers (filtered by .please/config.yml) and
 * merges their results — working around Claude Code's one-server-per-extension
 * limit.
 *
 * This script collects the union of extensions across all server definitions
 * and maps each to an LSP language id, then writes the plugin's `.lsp.json`.
 *
 * Run after adding/changing a server's extensions:
 *   bun run scripts/gen-unified-lsp-json.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { getLanguageId, LSP_SERVERS } from '../packages/lsp/src/index'

const ROOT_DIR = path.resolve(import.meta.dir, '..')
const PLUGIN_DIR = path.resolve(ROOT_DIR, 'plugins/code-intelligence-lsp')
const OUT_PATH = path.resolve(PLUGIN_DIR, '.lsp.json')

function buildExtensionToLanguage(): Record<string, string> {
  // Collect the union of extensions across every server, preserving a stable
  // (sorted) order for deterministic output.
  const extensions = new Set<string>()
  for (const server of LSP_SERVERS) {
    for (const ext of server.extensions)
      extensions.add(ext)
  }

  const map: Record<string, string> = {}
  for (const ext of [...extensions].sort()) {
    // getLanguageId falls back to a sane default; strip leading dot for that.
    map[ext] = getLanguageId(ext)
  }
  return map
}

function main(): void {
  const extensionToLanguage = buildExtensionToLanguage()

  const lspJson = {
    'code-intelligence': {
      // eslint-disable-next-line no-template-curly-in-string -- literal Claude Code plugin variable
      command: '${CLAUDE_PLUGIN_DATA}/node_modules/.bin/code',
      args: ['lsp-multiplex'],
      extensionToLanguage,
      startupTimeout: 60000,
    },
  }

  fs.mkdirSync(PLUGIN_DIR, { recursive: true })
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(lspJson, null, 2)}\n`)

  const count = Object.keys(extensionToLanguage).length
  console.log(`✓ Wrote ${OUT_PATH} (${count} extensions)`)
}

main()

process.exit(0)
