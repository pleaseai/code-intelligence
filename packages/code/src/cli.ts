#!/usr/bin/env bun
/**
 * Code CLI - Entry Point
 *
 * Commands:
 *   code format <file>       Format a file
 *   code lsp <file>          Get LSP diagnostics for a file
 *   code lsp-server <id>     Start an LSP server (for Claude Code plugin)
 *   code lsp-multiplex [id...]  Start a multiplexing LSP server (merges multiple servers)
 *   code version             Show version
 *
 * Hook mode (--stdin):
 *   code format --stdin    Read hook input from stdin
 *   code lsp --stdin       Read hook input from stdin
 */

import type { LSPServerInfo } from '@pleaseai/code-lsp'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { Format } from '@pleaseai/code-format'
import { getServerById, isServerEnabled, loadLspConfig, LSP_SERVERS, LSPManager, runMultiplexer } from '@pleaseai/code-lsp'
import { createLogger } from '@pleaseai/logger'
import pkg from '../package.json'
import { createSetupCommand } from './commands/setup'
import { runLSPDiagnostics } from './hooks/lsp'
import { parseArgs } from './utils'

const log = createLogger('code')

const VERSION = pkg.version

interface HookInput {
  session_id: string
  cwd: string
  tool_name: string
  tool_input: {
    file_path?: string
    content?: string
  }
  tool_use_id: string
}

async function readStdinJson(): Promise<HookInput> {
  const chunks: Buffer[] = []
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf-8').trim()

  if (!text) {
    throw new Error('No input received from stdin')
  }

  try {
    return JSON.parse(text)
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown parse error'
    throw new Error(`Invalid JSON input from stdin: ${message}`)
  }
}

async function formatCommand(filePath: string, projectDir: string, isHookMode: boolean): Promise<void> {
  await Format.initFromProject(projectDir)
  const success = await Format.formatFile(filePath)

  if (isHookMode) {
    // Hook mode: output JSON for Claude Code
    if (success) {
      console.log(JSON.stringify({ suppressOutput: true }))
    }
  }
  else {
    // CLI mode: human-readable output
    if (success) {
      console.log(JSON.stringify({ success: true, file: filePath }))
    }
    else {
      console.log(JSON.stringify({ success: false, file: filePath, reason: 'no formatter' }))
    }
  }
}

async function lspCommand(filePath: string, projectDir: string, isHookMode: boolean): Promise<void> {
  const report = await runLSPDiagnostics(filePath, projectDir)

  if (report) {
    if (isHookMode) {
      // Hook mode: output as additionalContext for Claude Code
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[code lsp]: ${report}`,
        },
      }))
    }
    else {
      // CLI mode: direct output
      console.log(report)
      process.exit(1)
    }
  }
  // Silent exit if no issues
}

/**
 * Detect a server's project root. Uses a dummy file path inside projectDir so
 * the server's dirname-based root detection resolves to projectDir itself.
 * Returns undefined if no root is found (server should not start).
 */
async function resolveServerRoot(
  server: LSPServerInfo,
  projectDir: string,
): Promise<string | undefined> {
  const dummyFile = `${projectDir}/dummy.ts`
  return server.root(dummyFile, projectDir).catch(() => undefined)
}

/**
 * Start an LSP server for Claude Code plugin integration.
 * Uses root detection to ensure server only starts when appropriate config exists.
 */
async function lspServerCommand(serverId: string, projectDir: string): Promise<void> {
  const server = getServerById(serverId)
  if (!server) {
    log.error({ serverId }, 'Unknown LSP server')
    process.exit(1)
  }

  // Run root detection - only start if config file exists
  const root = await resolveServerRoot(server, projectDir)
  if (!root) {
    // No config file found - exit silently (don't start server)
    log.debug({ serverId, projectDir }, 'No root found, skipping LSP server')
    process.exit(0)
  }

  // Spawn the server with error handling
  let handle: Awaited<ReturnType<typeof server.spawn>>
  try {
    handle = await server.spawn(root)
  }
  catch (err) {
    // Spawn threw an exception - this is an unexpected failure
    log.error({ serverId, root, err }, 'LSP server spawn failed unexpectedly')
    console.error(`Error: Failed to start ${serverId} LSP server: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  if (!handle) {
    // Server binary not found - exit silently (expected when server not installed)
    log.debug({ serverId, root }, 'LSP server not available (binary not found)')
    process.exit(0)
  }

  // Pipe stdio between this process and the LSP server
  const serverProcess = handle.process

  // Forward stdin to server - with null check
  if (!serverProcess.stdin) {
    log.error({ serverId }, 'LSP server process has no stdin')
    console.error(`Error: ${serverId} LSP server cannot receive input`)
    process.exit(1)
  }

  process.stdin.on('error', (err) => {
    // EPIPE is expected when server closes stdin
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
      log.error({ serverId, err }, 'stdin pipe error')
    }
  })
  process.stdin.pipe(serverProcess.stdin)

  // Forward server stdout/stderr to this process
  serverProcess.stdout?.pipe(process.stdout)
  serverProcess.stderr?.pipe(process.stderr)

  // Handle process errors
  serverProcess.on('error', (err) => {
    log.error({ serverId, err }, 'LSP server process error')
    console.error(`Error: ${serverId} LSP server encountered an error: ${err.message}`)
    process.exit(1)
  })

  // Handle server exit
  serverProcess.on('exit', (code, signal) => {
    if (signal) {
      log.debug({ serverId, signal }, 'LSP server killed by signal')
    }
    else if (code !== 0) {
      log.warn({ serverId, code }, 'LSP server exited with non-zero code')
    }
    process.exit(code ?? 0)
  })

  // Handle this process being killed
  process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM')
  })
  process.on('SIGINT', () => {
    serverProcess.kill('SIGINT')
  })
}

/**
 * Start a multiplexing LSP server for Claude Code plugin integration.
 *
 * Unlike `lsp-server` (a 1:1 byte pipe to one server), this runs a real LSP
 * server that fans out to multiple downstream servers and merges their results,
 * working around Claude Code's "one server per extension" limit.
 *
 * @param serverIds Explicit downstream ids; empty = all config-enabled servers.
 */
async function lspMultiplexCommand(serverIds: string[], projectDir: string): Promise<void> {
  // Validate explicit ids.
  const unknown = serverIds.filter(id => !getServerById(id))
  if (unknown.length) {
    console.error(`Unknown LSP server(s): ${unknown.join(', ')}`)
    process.exit(1)
  }

  // Resolve the target set (explicit ids, or all config-enabled servers).
  const lspConfig = await loadLspConfig(projectDir)
  const targets = serverIds.length
    ? serverIds.map(id => getServerById(id)!)
    : LSP_SERVERS.filter(s => isServerEnabled(lspConfig, s.id))

  // Root-detection short-circuit: only start if at least one target resolves a
  // root in this project (mirrors lspServerCommand). Otherwise exit silently.
  const roots = await Promise.all(
    targets.map(s => resolveServerRoot(s, projectDir)),
  )
  if (!roots.some(Boolean)) {
    log.debug({ projectDir }, 'No root found for any target server, skipping multiplexer')
    process.exit(0)
  }

  const manager = await LSPManager.fromProject(
    projectDir,
    serverIds.length ? { serverIds } : undefined,
  )

  await runMultiplexer({ manager })
}

function versionCommand(): void {
  console.log(`code ${VERSION}`)
}

function helpCommand(): void {
  console.log(`
code - CLI for AI-assisted coding

Usage:
  code <command> [options]

Commands:
  format <file>        Format a file using configured formatters
  lsp <file>           Get LSP diagnostics for a file
  lsp-server <id>      Start an LSP server (for Claude Code plugin)
  lsp-multiplex [id...] Start a multiplexing LSP server (merges multiple servers per file)
  setup [tool]         Check and install required tools
  version              Show version
  help                 Show this help

Hook mode (for Claude Code):
  code format --stdin    Format file from hook input
  code lsp --stdin       Get diagnostics from hook input

Setup:
  code setup              Check and install all tools
  code setup --check      Check only, do not install
  code setup ast-grep     Setup specific tool

LSP Servers:
  biome, vue, svelte, deno, kotlin, dart, prisma, astro, typescript,
  pyright, gopls, rust-analyzer, and more.

Options:
  --project=<path>   Project directory (default: cwd)

Environment:
  CODE_PROJECT_PATH  Project path
`)
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv)

  // Check for version/help flags first (before command routing)
  if (flags.v || flags.version) {
    versionCommand()
    return
  }
  if (flags.h || flags.help) {
    helpCommand()
    return
  }

  const projectDir
    = (flags.project as string)
      ?? process.env.CODE_PROJECT_PATH
      ?? process.cwd()

  switch (command) {
    case 'format': {
      const isHookMode = flags.stdin === true
      let file = args[0]
      let dir = projectDir

      if (isHookMode) {
        const input = await readStdinJson()
        if (!input?.tool_input?.file_path) {
          throw new Error('Missing file_path in tool_input')
        }
        file = input.tool_input.file_path
        dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || projectDir
      }

      if (!file) {
        console.error('Usage: code format <file> | code format --stdin')
        process.exit(1)
      }
      await formatCommand(file, dir, isHookMode)
      break
    }

    case 'lsp': {
      const isHookMode = flags.stdin === true
      let file = args[0]
      let dir = projectDir

      if (isHookMode) {
        const input = await readStdinJson()
        if (!input?.tool_input?.file_path) {
          throw new Error('Missing file_path in tool_input')
        }
        file = input.tool_input.file_path
        dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || projectDir
      }

      if (!file) {
        console.error('Usage: code lsp <file> | code lsp --stdin')
        process.exit(1)
      }
      await lspCommand(file, dir, isHookMode)
      break
    }

    case 'lsp-server': {
      const serverId = args[0]
      if (!serverId) {
        console.error('Usage: code lsp-server <server-id>')
        console.error('Example: code lsp-server biome')
        process.exit(1)
      }
      await lspServerCommand(serverId, projectDir)
      break
    }

    case 'lsp-multiplex': {
      // Zero args = multiplex all config-enabled servers (routed per file).
      await lspMultiplexCommand(args, projectDir)
      break
    }

    case 'setup': {
      const setupCommand = createSetupCommand()
      // Parse remaining args with commander
      await setupCommand.parseAsync(['node', 'setup', ...args, ...Object.entries(flags)
        .filter(([k]) => k !== 'project')
        .flatMap(([k, v]) => v === true ? [`--${k}`] : [`--${k}`, String(v)])])
      break
    }

    case 'version':
      versionCommand()
      break

    case 'help':
      helpCommand()
      break

    default:
      console.error(`Unknown command: ${command}`)
      helpCommand()
      process.exit(1)
  }
}

main().catch((error) => {
  log.fatal({ err: error }, 'Unhandled error')
  process.exit(1)
})
