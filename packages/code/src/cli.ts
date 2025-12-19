#!/usr/bin/env bun
/**
 * Code CLI - Entry Point
 *
 * Commands:
 *   code format <file>     Format a file
 *   code lsp <file>        Get LSP diagnostics for a file
 *   code version           Show version
 *
 * Hook mode (--stdin):
 *   code format --stdin    Read hook input from stdin
 *   code lsp --stdin       Read hook input from stdin
 */

import { Buffer } from 'node:buffer'
import process from 'node:process'
import { Format } from '@pleaseai/code-format'
import { createLogger } from '@pleaseai/logger'
import pkg from '../package.json'
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

function versionCommand(): void {
  console.log(`code ${VERSION}`)
}

function helpCommand(): void {
  console.log(`
code - CLI for AI-assisted coding

Usage:
  code <command> [options]

Commands:
  format <file>      Format a file using configured formatters
  lsp <file>         Get LSP diagnostics for a file
  version            Show version
  help               Show this help

Hook mode (for Claude Code):
  code format --stdin    Format file from hook input
  code lsp --stdin       Get diagnostics from hook input

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
