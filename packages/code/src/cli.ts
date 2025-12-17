#!/usr/bin/env bun
/**
 * Dora CLI - Entry Point
 *
 * Commands:
 *   dora [serve]           Start MCP server (default)
 *   dora format <file>     Format a file
 *   dora lsp <file>        Get LSP diagnostics for a file
 *   dora version           Show version
 *
 * Hook mode (--stdin):
 *   dora format --stdin    Read hook input from stdin
 *   dora lsp --stdin       Read hook input from stdin
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createDoraServer } from "./server"
import { Format } from "./format"
import { runLSPDiagnostics } from "./hooks/lsp"
import pkg from "../package.json"

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

interface ParsedArgs {
  command: string
  args: string[]
  flags: Record<string, string | boolean>
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=")
      flags[key!] = value ?? true
    } else if (arg.startsWith("-")) {
      flags[arg.slice(1)] = true
    } else {
      positional.push(arg)
    }
  }

  return {
    command: positional[0] ?? "serve",
    args: positional.slice(1),
    flags,
  }
}

async function readStdinJson(): Promise<HookInput> {
  const chunks: Buffer[] = []
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim()

  if (!text) {
    throw new Error("No input received from stdin")
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error("Invalid JSON input from stdin")
  }
}

async function serveCommand(projectPath: string, timeout: number): Promise<void> {
  console.error(`[dora] Starting MCP server for project: ${projectPath}`)

  const server = await createDoraServer({ projectPath, timeout })
  const transport = new StdioServerTransport()

  await server.connect(transport)
  console.error("[dora] MCP server connected and ready")
}

async function formatCommand(filePath: string, projectDir: string, isHookMode: boolean): Promise<void> {
  await Format.initFromProject(projectDir)
  const success = await Format.formatFile(filePath)

  if (isHookMode) {
    // Hook mode: output JSON for Claude Code
    if (success) {
      console.log(JSON.stringify({ suppressOutput: true }))
    }
  } else {
    // CLI mode: human-readable output
    if (success) {
      console.log(JSON.stringify({ success: true, file: filePath }))
    } else {
      console.log(JSON.stringify({ success: false, file: filePath, reason: "no formatter" }))
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
          hookEventName: "PostToolUse",
          additionalContext: `[dora lsp]: ${report}`,
        },
      }))
    } else {
      // CLI mode: direct output
      console.log(report)
      process.exit(1)
    }
  }
  // Silent exit if no issues
}

function versionCommand(): void {
  console.log(`dora ${VERSION}`)
}

function helpCommand(): void {
  console.log(`
dora - MCP server for JetBrains IDE integration

Usage:
  dora [command] [options]

Commands:
  serve              Start MCP server (default)
  format <file>      Format a file using configured formatters
  lsp <file>         Get LSP diagnostics for a file
  version            Show version
  help               Show this help

Options:
  --project=<path>   Project directory (default: cwd)
  --timeout=<ms>     Request timeout in ms (default: 30000)

Environment:
  DORA_PROJECT_PATH  Project path
  DORA_TIMEOUT       Request timeout in ms
`)
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv)

  const projectDir =
    (flags["project"] as string) ??
    process.env["DORA_PROJECT_PATH"] ??
    process.cwd()

  const timeout = flags["timeout"]
    ? parseInt(flags["timeout"] as string, 10)
    : process.env["DORA_TIMEOUT"]
      ? parseInt(process.env["DORA_TIMEOUT"], 10)
      : 30000

  switch (command) {
    case "serve":
      await serveCommand(projectDir, timeout)
      break

    case "format": {
      const isHookMode = flags["stdin"] === true
      let file = args[0]
      let dir = projectDir

      if (isHookMode) {
        const input = await readStdinJson()
        if (!input?.tool_input?.file_path) {
          throw new Error("Missing file_path in tool_input")
        }
        file = input.tool_input.file_path
        dir = process.env["CLAUDE_PROJECT_DIR"] || input.cwd || projectDir
      }

      if (!file) {
        console.error("Usage: dora format <file> | dora format --stdin")
        process.exit(1)
      }
      await formatCommand(file, dir, isHookMode)
      break
    }

    case "lsp": {
      const isHookMode = flags["stdin"] === true
      let file = args[0]
      let dir = projectDir

      if (isHookMode) {
        const input = await readStdinJson()
        if (!input?.tool_input?.file_path) {
          throw new Error("Missing file_path in tool_input")
        }
        file = input.tool_input.file_path
        dir = process.env["CLAUDE_PROJECT_DIR"] || input.cwd || projectDir
      }

      if (!file) {
        console.error("Usage: dora lsp <file> | dora lsp --stdin")
        process.exit(1)
      }
      await lspCommand(file, dir, isHookMode)
      break
    }

    case "version":
    case "-v":
    case "--version":
      versionCommand()
      break

    case "help":
    case "-h":
    case "--help":
      helpCommand()
      break

    default:
      console.error(`Unknown command: ${command}`)
      helpCommand()
      process.exit(1)
  }
}

main().catch((error) => {
  console.error("[dora] Error:", error)
  process.exit(1)
})
