# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dora is an MCP (Model Context Protocol) server that provides JetBrains IDE integration. It communicates with a JetBrains plugin (Serena) to provide symbol finding and navigation capabilities.

## Build & Development Commands

```bash
bun run build        # Build for distribution (outputs to dist/)
bun run dev          # Development mode with watch
bun run typecheck    # Type check with TypeScript
bun run test         # Run tests with Bun
bun run start        # Start the MCP server
```

## Environment Variables

- `DORA_PROJECT_PATH` - Project path (defaults to argv[2] or cwd)
- `DORA_TIMEOUT` - Request timeout in ms (default: 30000)

## Architecture

### Communication Flow

```
Claude/MCP Client <-> StdioTransport <-> McpServer <-> JetBrainsClient <-> JetBrains IDE (Serena Plugin)
```

### Key Components

**Entry Point** (`src/index.ts`): Initializes the MCP server with stdio transport. Configures project path and timeout from environment/arguments.

**Server** (`src/server.ts`): Creates the MCP server and registers three tools:
- `jet_brains_find_symbol` - Find symbols by name path pattern
- `jet_brains_find_referencing_symbols` - Find references to a symbol
- `jet_brains_get_symbols_overview` - Get overview of symbols in a file

Uses lazy client initialization - discovers IDE port on first tool use.

**Client Layer** (`src/client/`):
- `JetBrainsClient` - HTTP client for JetBrains plugin API (127.0.0.1)
- `port-discovery.ts` - Scans ports 24226-24245 to find running IDE instance matching project path
- `response-transformer.ts` - Converts camelCase API responses to snake_case

**Tool Layer** (`src/tools/`): Each tool has its own file with description constant and execute function. Parameters defined with Zod schemas in `src/types/tool-params.ts`.

**Error Handling** (`src/errors/`): Custom error hierarchy with `DoraError` base class and specific errors for connection, API, timeout, and server-not-found cases.

### Name Path Convention

Symbols are identified by "name paths" - paths in the symbol tree within a source file:
- `MyClass/myMethod` - method inside a class
- `MyClass/myMethod[0]` - first overload of a method
- Patterns: simple name, relative path suffix, or absolute path (prefix with `/`)
