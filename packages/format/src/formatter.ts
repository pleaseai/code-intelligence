import path from 'node:path'
import process from 'node:process'

export interface Info {
  name: string
  command: string[]
  environment?: Record<string, string>
  extensions: string[]
  enabled: (projectDir: string) => Promise<boolean>
}

/**
 * Find a file by searching upward from startDir to stopDir
 */
async function findUp(
  filename: string,
  startDir: string,
  stopDir?: string,
): Promise<string[]> {
  const results: string[] = []
  let currentDir = startDir
  const root = stopDir ?? path.parse(startDir).root

  while (currentDir !== root && currentDir !== path.dirname(currentDir)) {
    const filePath = path.join(currentDir, filename)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      results.push(filePath)
    }
    currentDir = path.dirname(currentDir)
  }

  return results
}

function bunExecutable(): string {
  return process.execPath ?? 'bun'
}

export const gofmt: Info = {
  name: 'gofmt',
  command: ['gofmt', '-w', '$FILE'],
  extensions: ['.go'],
  async enabled() {
    return Bun.which('gofmt') !== null
  },
}

export const mix: Info = {
  name: 'mix',
  command: ['mix', 'format', '$FILE'],
  extensions: ['.ex', '.exs', '.eex', '.heex', '.leex', '.neex', '.sface'],
  async enabled() {
    return Bun.which('mix') !== null
  },
}

export const prettier: Info = {
  name: 'prettier',
  command: [bunExecutable(), 'x', 'prettier', '--write', '$FILE'],
  environment: {
    BUN_BE_BUN: '1',
  },
  extensions: [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.vue',
    '.svelte',
    '.json',
    '.jsonc',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.md',
    '.mdx',
    '.graphql',
    '.gql',
  ],
  async enabled(projectDir: string) {
    const items = await findUp('package.json', projectDir)
    for (const item of items) {
      const json = await Bun.file(item).json()
      if (json.dependencies?.prettier)
        return true
      if (json.devDependencies?.prettier)
        return true
    }
    return false
  },
}

export const biome: Info = {
  name: 'biome',
  command: [bunExecutable(), 'x', '@biomejs/biome', 'format', '--write', '$FILE'],
  environment: {
    BUN_BE_BUN: '1',
  },
  extensions: [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.vue',
    '.svelte',
    '.json',
    '.jsonc',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.md',
    '.mdx',
    '.graphql',
    '.gql',
  ],
  async enabled(projectDir: string) {
    const configs = ['biome.json', 'biome.jsonc']
    for (const config of configs) {
      const found = await findUp(config, projectDir)
      if (found.length > 0) {
        return true
      }
    }
    return false
  },
}

export const zig: Info = {
  name: 'zig',
  command: ['zig', 'fmt', '$FILE'],
  extensions: ['.zig', '.zon'],
  async enabled() {
    return Bun.which('zig') !== null
  },
}

export const clang: Info = {
  name: 'clang-format',
  command: ['clang-format', '-i', '$FILE'],
  extensions: ['.c', '.cc', '.cpp', '.cxx', '.c++', '.h', '.hh', '.hpp', '.hxx', '.h++', '.ino', '.C', '.H'],
  async enabled(projectDir: string) {
    const items = await findUp('.clang-format', projectDir)
    return items.length > 0
  },
}

export const ktlint: Info = {
  name: 'ktlint',
  command: ['ktlint', '-F', '$FILE'],
  extensions: ['.kt', '.kts'],
  async enabled() {
    return Bun.which('ktlint') !== null
  },
}

export const ruff: Info = {
  name: 'ruff',
  command: ['ruff', 'format', '$FILE'],
  extensions: ['.py', '.pyi'],
  async enabled(projectDir: string) {
    if (!Bun.which('ruff'))
      return false
    const configs = ['pyproject.toml', 'ruff.toml', '.ruff.toml']
    for (const config of configs) {
      const found = await findUp(config, projectDir)
      const firstFound = found[0]
      if (firstFound) {
        if (config === 'pyproject.toml') {
          const content = await Bun.file(firstFound).text()
          if (content.includes('[tool.ruff]'))
            return true
        }
        else {
          return true
        }
      }
    }
    const deps = ['requirements.txt', 'pyproject.toml', 'Pipfile']
    for (const dep of deps) {
      const found = await findUp(dep, projectDir)
      const firstFound = found[0]
      if (firstFound) {
        const content = await Bun.file(firstFound).text()
        if (content.includes('ruff'))
          return true
      }
    }
    return false
  },
}

export const rlang: Info = {
  name: 'air',
  command: ['air', 'format', '$FILE'],
  extensions: ['.R'],
  async enabled() {
    const airPath = Bun.which('air')
    if (airPath == null)
      return false

    try {
      const proc = Bun.spawn(['air', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc.exited
      const output = await new Response(proc.stdout).text()

      // Check for "Air: An R language server and formatter"
      const firstLine = output.split('\n')[0] ?? ''
      const hasR = firstLine.includes('R language')
      const hasFormatter = firstLine.includes('formatter')
      return hasR && hasFormatter
    }
    catch {
      return false
    }
  },
}

export const uvformat: Info = {
  name: 'uv format',
  command: ['uv', 'format', '--', '$FILE'],
  extensions: ['.py', '.pyi'],
  async enabled(projectDir: string) {
    if (await ruff.enabled(projectDir))
      return false
    if (Bun.which('uv') !== null) {
      const proc = Bun.spawn(['uv', 'format', '--help'], { stderr: 'pipe', stdout: 'pipe' })
      const code = await proc.exited
      return code === 0
    }
    return false
  },
}

export const rubocop: Info = {
  name: 'rubocop',
  command: ['rubocop', '--autocorrect', '$FILE'],
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  async enabled() {
    return Bun.which('rubocop') !== null
  },
}

export const standardrb: Info = {
  name: 'standardrb',
  command: ['standardrb', '--fix', '$FILE'],
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  async enabled() {
    return Bun.which('standardrb') !== null
  },
}

export const htmlbeautifier: Info = {
  name: 'htmlbeautifier',
  command: ['htmlbeautifier', '$FILE'],
  extensions: ['.erb', '.html.erb'],
  async enabled() {
    return Bun.which('htmlbeautifier') !== null
  },
}

export const dart: Info = {
  name: 'dart',
  command: ['dart', 'format', '$FILE'],
  extensions: ['.dart'],
  async enabled() {
    return Bun.which('dart') !== null
  },
}

export const ocamlformat: Info = {
  name: 'ocamlformat',
  command: ['ocamlformat', '-i', '$FILE'],
  extensions: ['.ml', '.mli'],
  async enabled(projectDir: string) {
    if (!Bun.which('ocamlformat'))
      return false
    const items = await findUp('.ocamlformat', projectDir)
    return items.length > 0
  },
}

export const terraform: Info = {
  name: 'terraform',
  command: ['terraform', 'fmt', '$FILE'],
  extensions: ['.tf', '.tfvars'],
  async enabled() {
    return Bun.which('terraform') !== null
  },
}

export const latexindent: Info = {
  name: 'latexindent',
  command: ['latexindent', '-w', '-s', '$FILE'],
  extensions: ['.tex'],
  async enabled() {
    return Bun.which('latexindent') !== null
  },
}

export const gleam: Info = {
  name: 'gleam',
  command: ['gleam', 'format', '$FILE'],
  extensions: ['.gleam'],
  async enabled() {
    return Bun.which('gleam') !== null
  },
}
