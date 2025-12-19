/**
 * CLI argument parsing utilities
 */

export interface ParsedArgs {
  command: string
  args: string[]
  flags: Record<string, string | boolean>
}

/**
 * Parse command-line arguments into structured format.
 *
 * Supports:
 * - --flag=value (equals syntax)
 * - --flag (boolean flag)
 * - -f (short boolean flag)
 * - Positional arguments
 *
 * @param argv - Process argv array (first 2 elements are node/bun path and script path)
 * @returns Parsed arguments with command, positional args, and flags
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex > -1) {
        const key = arg.slice(2, eqIndex)
        const value = arg.slice(eqIndex + 1)
        flags[key] = value
      }
      else {
        flags[arg.slice(2)] = true
      }
    }
    else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true
    }
    else {
      positional.push(arg)
    }
  }

  return {
    command: positional[0] ?? 'help',
    args: positional.slice(1),
    flags,
  }
}
