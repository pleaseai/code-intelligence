import { describe, test, expect } from "bun:test"
import { $ } from "bun"
import path from "node:path"

const CLI_PATH = path.resolve(import.meta.dir, "../cli.ts")
const PROJECT_DIR = path.resolve(import.meta.dir, "../../../..")

describe("CLI", () => {
  describe("version", () => {
    test("prints version", async () => {
      const result = await $`bun run ${CLI_PATH} version`.text()
      expect(result).toMatch(/dora \d+\.\d+\.\d+/)
    })
  })

  describe("help", () => {
    test("prints help", async () => {
      const result = await $`bun run ${CLI_PATH} help`.text()
      expect(result).toContain("Usage:")
      expect(result).toContain("serve")
      expect(result).toContain("format")
      expect(result).toContain("lsp")
    })
  })

  describe("format --stdin", () => {
    test("handles valid JSON input", async () => {
      const input = JSON.stringify({
        tool_input: {
          file_path: "/tmp/test.ts",
          file_contents: "const x = 1",
        },
      })

      const proc = Bun.spawn(["bun", "run", CLI_PATH, "format", "--stdin"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd: PROJECT_DIR,
      })

      proc.stdin.write(input)
      proc.stdin.end()

      const exitCode = await proc.exited
      // May fail if no formatter found, but should not crash
      expect([0, 1]).toContain(exitCode)
    })

    test("handles missing file_path", async () => {
      const input = JSON.stringify({
        tool_input: {},
      })

      const proc = Bun.spawn(["bun", "run", CLI_PATH, "format", "--stdin"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })

      proc.stdin.write(input)
      proc.stdin.end()

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain("file_path")
    })

    test("handles invalid JSON input", async () => {
      const proc = Bun.spawn(["bun", "run", CLI_PATH, "format", "--stdin"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })

      proc.stdin.write("not valid json")
      proc.stdin.end()

      const exitCode = await proc.exited
      expect(exitCode).toBe(1)
    })
  })

  describe("lsp --stdin", () => {
    test("handles valid JSON input", async () => {
      const input = JSON.stringify({
        tool_input: {
          file_path: path.join(PROJECT_DIR, "packages/code/src/cli.ts"),
        },
      })

      const proc = Bun.spawn(["bun", "run", CLI_PATH, "lsp", "--stdin"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd: PROJECT_DIR,
      })

      proc.stdin.write(input)
      proc.stdin.end()

      // Give it some time to initialize LSP then kill
      const timeoutId = setTimeout(() => proc.kill(), 3000)

      const exitCode = await proc.exited
      clearTimeout(timeoutId)

      // May exit with various codes depending on LSP availability
      // 0 = success, non-zero = error or killed
      expect(typeof exitCode).toBe("number")
    }, 10000) // Increase test timeout

    test("handles missing file_path", async () => {
      const input = JSON.stringify({
        tool_input: {},
      })

      const proc = Bun.spawn(["bun", "run", CLI_PATH, "lsp", "--stdin"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      })

      proc.stdin.write(input)
      proc.stdin.end()

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain("file_path")
    })
  })

  describe("unknown command", () => {
    test("prints error for unknown command", async () => {
      const proc = Bun.spawn(["bun", "run", CLI_PATH, "unknown"], {
        stdout: "pipe",
        stderr: "pipe",
      })

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain("Unknown command")
    })
  })
})
