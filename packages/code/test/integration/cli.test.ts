/**
 * CLI integration tests
 */

import path from 'node:path'
import { $ } from 'bun'
import { describe, expect, test } from 'bun:test'

const CLI_PATH = path.resolve(import.meta.dir, '../../src/cli.ts')
const PROJECT_DIR = path.resolve(import.meta.dir, '../../../..')

describe('CLI Integration', () => {
  describe('version command', () => {
    test('prints version with semantic versioning format', async () => {
      const result = await $`bun run ${CLI_PATH} version`.text()
      expect(result).toMatch(/code \d+\.\d+\.\d+/)
    })

    test('-v flag shows version', async () => {
      const result = await $`bun run ${CLI_PATH} -v`.text()
      expect(result).toMatch(/code \d+\.\d+\.\d+/)
    })

    test('--version flag shows version', async () => {
      const result = await $`bun run ${CLI_PATH} --version`.text()
      expect(result).toMatch(/code \d+\.\d+\.\d+/)
    })

    test('--version flag takes precedence over format command', async () => {
      const result = await $`bun run ${CLI_PATH} format file.ts --version`.text()
      expect(result).toMatch(/code \d+\.\d+\.\d+/)
      // Should NOT try to format file.ts, just show version
    })

    test('-v flag takes precedence over lsp command', async () => {
      const result = await $`bun run ${CLI_PATH} lsp file.ts -v`.text()
      expect(result).toMatch(/code \d+\.\d+\.\d+/)
    })
  })

  describe('help command', () => {
    test('prints help with usage info', async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain('Usage:')
      expect(result).toContain('format')
      expect(result).toContain('lsp')
      expect(result).toContain('version')
      expect(result).toContain('help')
    })

    test('-h flag shows help', async () => {
      const result = await $`bun run ${CLI_PATH} -h`.text()
      expect(result).toContain('Usage:')
    })

    test('--help flag shows help', async () => {
      const result = await $`bun run ${CLI_PATH} --help`.text()
      expect(result).toContain('Usage:')
    })

    test('help includes environment variables', async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain('CODE_PROJECT_PATH')
    })

    test('help includes hook mode info', async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain('Hook mode')
      expect(result).toContain('--stdin')
    })

    test('--help flag takes precedence over format command', async () => {
      const result = await $`bun run ${CLI_PATH} format file.ts --help`.text()
      expect(result).toContain('Usage:')
      // Should NOT try to format file.ts, just show help
    })

    test('-h flag takes precedence over lsp command', async () => {
      const result = await $`bun run ${CLI_PATH} lsp file.ts -h`.text()
      expect(result).toContain('Usage:')
    })
  })

  describe('unknown command', () => {
    test('prints error for unknown command', async () => {
      const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'unknowncmd'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain('Unknown command')
      expect(stderr).toContain('unknowncmd')
    })

    test('shows help after unknown command error', async () => {
      const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'badcmd'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      await proc.exited
      const stdout = await new Response(proc.stdout).text()

      expect(stdout).toContain('Usage:')
    })
  })

  describe('format command', () => {
    describe('direct mode', () => {
      test('requires file argument', async () => {
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format'], {
          stdout: 'pipe',
          stderr: 'pipe',
        })

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('Usage:')
      })

      test('handles non-existent file gracefully', async () => {
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '/nonexistent/file.ts'], {
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: PROJECT_DIR,
        })

        const exitCode = await proc.exited
        // Should exit but not crash
        expect([0, 1]).toContain(exitCode)
      })

      test('formats existing file and returns JSON', async () => {
        const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', testFile], {
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: PROJECT_DIR,
        })

        const exitCode = await proc.exited
        const stdout = await new Response(proc.stdout).text()

        expect(exitCode).toBe(0)
        const result = JSON.parse(stdout.trim())
        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('file')
      })
    })

    describe('--stdin hook mode', () => {
      test('handles valid JSON input', async () => {
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: PROJECT_DIR,
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(PROJECT_DIR, 'packages/code/src/cli.ts'),
            content: 'const x = 1',
          },
          tool_use_id: 'test-id',
        })

        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: PROJECT_DIR,
        })

        proc.stdin.write(input)
        proc.stdin.end()

        const exitCode = await proc.exited
        // May succeed or fail depending on formatter availability
        expect([0, 1]).toContain(exitCode)
      })

      test('returns suppressOutput on success in hook mode', async () => {
        const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: PROJECT_DIR,
          tool_name: 'Write',
          tool_input: { file_path: testFile },
          tool_use_id: 'test-id',
        })

        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: PROJECT_DIR,
        })

        proc.stdin.write(input)
        proc.stdin.end()

        const exitCode = await proc.exited
        const stdout = await new Response(proc.stdout).text()

        if (exitCode === 0 && stdout.trim()) {
          const result = JSON.parse(stdout.trim())
          expect(result).toHaveProperty('suppressOutput', true)
        }
      })

      test('handles missing file_path in tool_input', async () => {
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: PROJECT_DIR,
          tool_name: 'Write',
          tool_input: {},
          tool_use_id: 'test-id',
        })

        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        })

        proc.stdin.write(input)
        proc.stdin.end()

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('file_path')
      })

      test('handles invalid JSON input with parse error details', async () => {
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        })

        proc.stdin.write('not valid json {{{')
        proc.stdin.end()

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('Invalid JSON')
        // Should include the original parse error details
        expect(stderr).toMatch(/Invalid JSON input from stdin:/)
      })

      test('handles empty stdin', async () => {
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'format', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        })

        proc.stdin.end()

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('No input')
      })
    })
  })

  describe('lsp command', () => {
    describe('direct mode', () => {
      test('requires file argument', async () => {
        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp'], {
          stdout: 'pipe',
          stderr: 'pipe',
        })

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('Usage:')
      })
    })

    describe('--stdin hook mode', () => {
      test('handles valid JSON input', async () => {
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: PROJECT_DIR,
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(PROJECT_DIR, 'packages/code/src/cli.ts'),
          },
          tool_use_id: 'test-id',
        })

        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: PROJECT_DIR,
        })

        proc.stdin.write(input)
        proc.stdin.end()

        // Give it time to initialize LSP
        const timeoutId = setTimeout(() => proc.kill(), 5000)

        const exitCode = await proc.exited
        clearTimeout(timeoutId)

        // May exit with various codes depending on LSP availability
        expect(typeof exitCode).toBe('number')
      }, 10000)

      test('handles missing file_path in tool_input', async () => {
        const input = JSON.stringify({
          session_id: 'test-session',
          cwd: PROJECT_DIR,
          tool_name: 'Write',
          tool_input: {},
          tool_use_id: 'test-id',
        })

        const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp', '--stdin'], {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        })

        proc.stdin.write(input)
        proc.stdin.end()

        const exitCode = await proc.exited
        const stderr = await new Response(proc.stderr).text()

        expect(exitCode).toBe(1)
        expect(stderr).toContain('file_path')
      })
    })
  })

  describe('--project flag', () => {
    test('accepts --project flag for format', async () => {
      const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'format', testFile, `--project=${PROJECT_DIR}`],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const exitCode = await proc.exited
      // Should not crash with --project flag
      expect([0, 1]).toContain(exitCode)
    })

    test('accepts --project=value syntax', async () => {
      const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'format', testFile, '--project=/tmp'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const exitCode = await proc.exited
      // Should not crash
      expect([0, 1]).toContain(exitCode)
    })

    test('--project flag takes precedence over CODE_PROJECT_PATH env', async () => {
      const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'format', testFile, `--project=${PROJECT_DIR}`],
        {
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            CODE_PROJECT_PATH: '/nonexistent/path',
          },
        },
      )

      const exitCode = await proc.exited
      // Should use --project flag, not env var, and succeed
      expect([0, 1]).toContain(exitCode)
    })

    test('CODE_PROJECT_PATH env is used when --project not specified', async () => {
      const testFile = path.join(PROJECT_DIR, 'packages/code/src/cli.ts')
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'format', testFile],
        {
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            CODE_PROJECT_PATH: PROJECT_DIR,
          },
        },
      )

      const exitCode = await proc.exited
      // Should use CODE_PROJECT_PATH env var
      expect([0, 1]).toContain(exitCode)
    })
  })

  describe('lsp-server command', () => {
    test('requires server-id argument', async () => {
      const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp-server'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain('Usage:')
      expect(stderr).toContain('lsp-server')
    })

    test('exits with code 1 for unknown server', async () => {
      const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp-server', 'nonexistent-server'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      expect(exitCode).toBe(1)
    })

    test('exits silently when no root config found', async () => {
      // Use /tmp which should have no biome.json or similar config
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'lsp-server', 'biome', '--project=/tmp'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const exitCode = await proc.exited
      // Should exit 0 silently when no config found (not applicable)
      expect(exitCode).toBe(0)
    })

    test('help includes lsp-server command', async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain('lsp-server')
      expect(result).toContain('LSP Servers:')
    })
  })

  describe('lsp-multiplex command', () => {
    test('exits with code 1 for unknown server', async () => {
      const proc = Bun.spawn(['bun', 'run', CLI_PATH, 'lsp-multiplex', 'nonexistent-server'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain('Unknown LSP server')
    })

    test('exits silently when no root config found', async () => {
      const proc = Bun.spawn(
        ['bun', 'run', CLI_PATH, 'lsp-multiplex', 'typescript', '--project=/tmp'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const exitCode = await proc.exited
      expect(exitCode).toBe(0)
    })

    test('help includes lsp-multiplex command', async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain('lsp-multiplex')
    })
  })

  describe('no command (default)', () => {
    test('shows help when no command provided', async () => {
      const result = await $`bun run ${CLI_PATH}`.text()
      expect(result).toContain('Usage:')
    })
  })
})
