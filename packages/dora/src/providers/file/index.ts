/**
 * File Provider
 *
 * Provides file system operations inspired by Serena's file tools.
 * Includes: read_file, create_file, list_dir, find_file, search_for_pattern, replace_content
 */

import type { Provider, ToolDefinition, ToolResult } from '../provider'
import type { RegistryConfig } from '../registry'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

/**
 * Check if a path should be ignored (basic gitignore-like patterns)
 */
function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  const defaultIgnores = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv']
  const allPatterns = [...defaultIgnores, ...ignorePatterns]

  return allPatterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      return regex.test(relativePath) || regex.test(path.basename(relativePath))
    }
    return relativePath.includes(pattern) || path.basename(relativePath) === pattern
  })
}

/**
 * Recursively scan directory
 */
function scanDirectory(
  dirPath: string,
  relativeTo: string,
  recursive: boolean,
  ignorePatterns: string[] = [],
): { dirs: string[], files: string[] } {
  const dirs: string[] = []
  const files: string[] = []

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(relativeTo, fullPath)

      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue
      }

      if (entry.isDirectory()) {
        dirs.push(relativePath)
        if (recursive) {
          const sub = scanDirectory(fullPath, relativeTo, recursive, ignorePatterns)
          dirs.push(...sub.dirs)
          files.push(...sub.files)
        }
      }
      else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }
  catch {
    // Silently skip directories we can't read
  }

  return { dirs, files }
}

/**
 * Search for pattern in files
 */
function searchFiles(
  filePaths: string[],
  pattern: string,
  rootPath: string,
  contextLinesBefore: number = 0,
  contextLinesAfter: number = 0,
): Array<{ file: string, line: number, content: string, context: string }> {
  const results: Array<{ file: string, line: number, content: string, context: string }> = []
  const regex = new RegExp(pattern, 'gm')

  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(rootPath, filePath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i]
        if (currentLine !== undefined && regex.test(currentLine)) {
          const startLine = Math.max(0, i - contextLinesBefore)
          const endLine = Math.min(lines.length - 1, i + contextLinesAfter)
          const contextLines = lines.slice(startLine, endLine + 1)

          results.push({
            file: filePath,
            line: i + 1,
            content: currentLine,
            context: contextLines.map((l, idx) => `${startLine + idx + 1}: ${l}`).join('\n'),
          })
        }
        // Reset regex state for next line
        regex.lastIndex = 0
      }
    }
    catch {
      // Skip files we can't read
    }
  }

  return results
}

/**
 * Limit output length
 */
function limitLength(result: string, maxChars: number, defaultMax: number = 50000): string {
  const limit = maxChars === -1 ? defaultMax : maxChars
  if (result.length > limit) {
    return `The answer is too long (${result.length} characters). Please use more specific parameters to narrow down the results.`
  }
  return result
}

/**
 * Tool definitions for File provider
 */
const FILE_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      'Reads a file within the project directory. Supports reading specific line ranges. '
      + 'Prefer symbolic operations (find_symbol) when you know what symbol you need.',
    inputSchema: z.object({
      relative_path: z.string().describe('Relative path to the file from project root'),
      start_line: z.number().default(0).describe('0-based index of first line to read'),
      end_line: z.number().optional().describe('0-based index of last line to read (inclusive). If not provided, reads to end.'),
      max_answer_chars: z.number().default(-1).describe('Max characters in response. -1 for default limit.'),
    }),
  },
  {
    name: 'create_text_file',
    description:
      'Creates or overwrites a file in the project directory.',
    inputSchema: z.object({
      relative_path: z.string().describe('Relative path where file should be created'),
      content: z.string().describe('Content to write to the file'),
    }),
  },
  {
    name: 'list_dir',
    description:
      'Lists files and directories in the given directory. Can scan recursively and skip ignored files.',
    inputSchema: z.object({
      relative_path: z.string().describe('Relative path to directory. Pass "." for project root.'),
      recursive: z.boolean().describe('Whether to scan subdirectories recursively'),
      skip_ignored_files: z.boolean().default(true).describe('Whether to skip commonly ignored files (node_modules, .git, etc.)'),
      max_answer_chars: z.number().default(-1).describe('Max characters in response. -1 for default limit.'),
    }),
  },
  {
    name: 'find_file',
    description:
      'Finds files matching a filename pattern (with wildcards * and ?) within the project.',
    inputSchema: z.object({
      file_mask: z.string().describe('Filename or pattern with wildcards (* or ?) to search for'),
      relative_path: z.string().describe('Directory to search in. Pass "." for project root.'),
    }),
  },
  {
    name: 'search_for_pattern',
    description:
      'Searches for a regex pattern across files in the project. '
      + 'Returns matching lines with optional context. '
      + 'Prefer symbolic operations when searching for code symbols.',
    inputSchema: z.object({
      pattern: z.string().describe('Regular expression pattern to search for'),
      relative_path: z.string().default('.').describe('Restrict search to this path'),
      context_lines_before: z.number().default(0).describe('Lines of context before each match'),
      context_lines_after: z.number().default(0).describe('Lines of context after each match'),
      paths_include_glob: z.string().default('').describe('Glob pattern for files to include (e.g., "*.ts", "src/**/*.js")'),
      paths_exclude_glob: z.string().default('').describe('Glob pattern for files to exclude'),
      max_answer_chars: z.number().default(-1).describe('Max characters in response. -1 for default limit.'),
    }),
  },
  {
    name: 'replace_content',
    description:
      'Replaces content in a file using literal string or regex. '
      + 'IMPORTANT: Regex mode is powerful - use patterns like "beginning.*?end" to avoid specifying exact content. '
      + 'Use regex mode with wildcards for efficiency.',
    inputSchema: z.object({
      relative_path: z.string().describe('Relative path to the file'),
      needle: z.string().describe('String or regex pattern to find'),
      repl: z.string().describe('Replacement string. In regex mode, use $1, $2 for backreferences.'),
      mode: z.enum(['literal', 'regex']).describe('Search mode: "literal" for exact match, "regex" for pattern'),
      allow_multiple: z.boolean().default(false).describe('Allow replacing multiple occurrences. If false and multiple found, returns error.'),
    }),
  },
]

/**
 * File Provider implementation
 */
export class FileProvider implements Provider {
  readonly name = 'file'

  private config: RegistryConfig
  private connected = false

  constructor(config: RegistryConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    // Verify project path exists
    if (!fs.existsSync(this.config.projectPath)) {
      throw new Error(`Project path does not exist: ${this.config.projectPath}`)
    }
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  listTools(): ToolDefinition[] {
    return FILE_TOOLS
  }

  async callTool(name: string, args: unknown): Promise<ToolResult> {
    if (!this.connected) {
      return {
        content: [{ type: 'text', text: 'File provider not connected' }],
        isError: true,
      }
    }

    try {
      switch (name) {
        case 'read_file':
          return this.handleReadFile(args)
        case 'create_text_file':
          return this.handleCreateFile(args)
        case 'list_dir':
          return this.handleListDir(args)
        case 'find_file':
          return this.handleFindFile(args)
        case 'search_for_pattern':
          return this.handleSearchForPattern(args)
        case 'replace_content':
          return this.handleReplaceContent(args)
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }
    }
    catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `File error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }

  private handleReadFile(args: unknown): ToolResult {
    const parsed = z.object({
      relative_path: z.string(),
      start_line: z.number().default(0),
      end_line: z.number().optional(),
      max_answer_chars: z.number().default(-1),
    }).parse(args)

    const fullPath = path.join(this.config.projectPath, parsed.relative_path)

    if (!fs.existsSync(fullPath)) {
      return {
        content: [{ type: 'text', text: `File not found: ${parsed.relative_path}` }],
        isError: true,
      }
    }

    const content = fs.readFileSync(fullPath, 'utf-8')
    const lines = content.split('\n')

    const startLine = parsed.start_line
    const endLine = parsed.end_line ?? lines.length - 1

    const selectedLines = lines.slice(startLine, endLine + 1)
    const result = selectedLines.map((line, idx) => `${startLine + idx + 1}: ${line}`).join('\n')

    return {
      content: [{ type: 'text', text: limitLength(result, parsed.max_answer_chars) }],
    }
  }

  private handleCreateFile(args: unknown): ToolResult {
    const parsed = z.object({
      relative_path: z.string(),
      content: z.string(),
    }).parse(args)

    const fullPath = path.join(this.config.projectPath, parsed.relative_path)
    const willOverwrite = fs.existsSync(fullPath)

    // Ensure parent directory exists
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, parsed.content, 'utf-8')

    let message = `File created: ${parsed.relative_path}`
    if (willOverwrite) {
      message += ' (overwrote existing file)'
    }

    return {
      content: [{ type: 'text', text: message }],
    }
  }

  private handleListDir(args: unknown): ToolResult {
    const parsed = z.object({
      relative_path: z.string(),
      recursive: z.boolean(),
      skip_ignored_files: z.boolean().default(true),
      max_answer_chars: z.number().default(-1),
    }).parse(args)

    const fullPath = path.join(this.config.projectPath, parsed.relative_path)

    if (!fs.existsSync(fullPath)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Directory not found: ${parsed.relative_path}`,
              project_root: this.config.projectPath,
            }),
          },
        ],
        isError: true,
      }
    }

    const ignorePatterns = parsed.skip_ignored_files ? [] : ['__IGNORE_NOTHING__']
    const { dirs, files } = scanDirectory(
      fullPath,
      this.config.projectPath,
      parsed.recursive,
      ignorePatterns,
    )

    const result = JSON.stringify({ dirs, files }, null, 2)
    return {
      content: [{ type: 'text', text: limitLength(result, parsed.max_answer_chars) }],
    }
  }

  private handleFindFile(args: unknown): ToolResult {
    const parsed = z.object({
      file_mask: z.string(),
      relative_path: z.string(),
    }).parse(args)

    const fullPath = path.join(this.config.projectPath, parsed.relative_path)
    const { files } = scanDirectory(fullPath, this.config.projectPath, true)

    // Convert file mask to regex
    const maskRegex = new RegExp(
      `^${parsed.file_mask.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    )

    const matchingFiles = files.filter(f => maskRegex.test(path.basename(f)))

    return {
      content: [{ type: 'text', text: JSON.stringify({ files: matchingFiles }, null, 2) }],
    }
  }

  private handleSearchForPattern(args: unknown): ToolResult {
    const parsed = z.object({
      pattern: z.string(),
      relative_path: z.string().default('.'),
      context_lines_before: z.number().default(0),
      context_lines_after: z.number().default(0),
      paths_include_glob: z.string().default(''),
      paths_exclude_glob: z.string().default(''),
      max_answer_chars: z.number().default(-1),
    }).parse(args)

    const searchPath = path.join(this.config.projectPath, parsed.relative_path)

    if (!fs.existsSync(searchPath)) {
      return {
        content: [{ type: 'text', text: `Path not found: ${parsed.relative_path}` }],
        isError: true,
      }
    }

    // Get files to search
    let filesToSearch: string[]
    if (fs.statSync(searchPath).isFile()) {
      filesToSearch = [parsed.relative_path]
    }
    else {
      const { files } = scanDirectory(searchPath, this.config.projectPath, true)
      filesToSearch = files
    }

    // Apply include/exclude globs
    if (parsed.paths_include_glob) {
      const includeRegex = new RegExp(
        `^${parsed.paths_include_glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.')}$`,
      )
      filesToSearch = filesToSearch.filter(f => includeRegex.test(f))
    }

    if (parsed.paths_exclude_glob) {
      const excludeRegex = new RegExp(
        `^${parsed.paths_exclude_glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.')}$`,
      )
      filesToSearch = filesToSearch.filter(f => !excludeRegex.test(f))
    }

    const results = searchFiles(
      filesToSearch,
      parsed.pattern,
      this.config.projectPath,
      parsed.context_lines_before,
      parsed.context_lines_after,
    )

    // Group by file
    const grouped: Record<string, string[]> = {}
    for (const result of results) {
      const fileGroup = grouped[result.file]
      if (!fileGroup) {
        grouped[result.file] = [result.context || result.content]
      }
      else {
        fileGroup.push(result.context || result.content)
      }
    }

    const output = JSON.stringify(grouped, null, 2)
    return {
      content: [{ type: 'text', text: limitLength(output, parsed.max_answer_chars) }],
    }
  }

  private handleReplaceContent(args: unknown): ToolResult {
    const parsed = z.object({
      relative_path: z.string(),
      needle: z.string(),
      repl: z.string(),
      mode: z.enum(['literal', 'regex']),
      allow_multiple: z.boolean().default(false),
    }).parse(args)

    const fullPath = path.join(this.config.projectPath, parsed.relative_path)

    if (!fs.existsSync(fullPath)) {
      return {
        content: [{ type: 'text', text: `File not found: ${parsed.relative_path}` }],
        isError: true,
      }
    }

    const content = fs.readFileSync(fullPath, 'utf-8')

    let pattern: RegExp
    if (parsed.mode === 'literal') {
      pattern = new RegExp(parsed.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    }
    else {
      pattern = new RegExp(parsed.needle, 'gms')
    }

    const matches = content.match(pattern)
    const matchCount = matches?.length ?? 0

    if (matchCount === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for pattern in ${parsed.relative_path}` }],
        isError: true,
      }
    }

    if (!parsed.allow_multiple && matchCount > 1) {
      return {
        content: [{
          type: 'text',
          text: `Error: Pattern matches ${matchCount} occurrences. Use allow_multiple=true or make pattern more specific.`,
        }],
        isError: true,
      }
    }

    // Convert $1, $2 to regex backreferences
    let replacement = parsed.repl
    if (parsed.mode === 'regex') {
      replacement = replacement.replace(/\$(\d+)/g, '$$$$1')
    }

    const newContent = content.replace(pattern, replacement)
    fs.writeFileSync(fullPath, newContent, 'utf-8')

    return {
      content: [{ type: 'text', text: `OK - Replaced ${matchCount} occurrence(s) in ${parsed.relative_path}` }],
    }
  }
}

/**
 * Factory function for creating FileProvider
 */
export function createFileProvider(config: RegistryConfig): FileProvider {
  return new FileProvider(config)
}
