#!/usr/bin/env bun
/**
 * Dora CLI - MCP Server Entry Point
 *
 * Commands:
 *   dora [serve]       Start MCP server (default)
 *   dora version       Show version
 *   dora help          Show help
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createDoraServer } from "./server"
import pkg from "../package.json"

const VERSION = pkg.version

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

async function serveCommand(projectPath: string, timeout: number): Promise<void> {
  console.error(`[dora] Starting MCP server for project: ${projectPath}`)

  const server = await createDoraServer({ projectPath, timeout })
  const transport = new StdioServerTransport()

  await server.connect(transport)
  console.error("[dora] MCP server connected and ready")
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
  const { command, flags } = parseArgs(process.argv)

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
