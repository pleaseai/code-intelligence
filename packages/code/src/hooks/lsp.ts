/**
 * LSP Hook Module
 *
 * Provides LSP diagnostics feedback after file modifications.
 * Based on OpenCode LSP integration approach.
 */

import path from "path"
import { LSPManager, type Diagnostic } from "@pleaseai/code-lsp"

const DIAGNOSTICS_MAX_DISPLAY = 5
const DIAGNOSTICS_WAIT_MS = 1500

/**
 * Diagnostic severity mapping
 */
const SEVERITY_MAP: Record<number, { icon: string; name: string }> = {
  1: { icon: "✗", name: "error" },
  2: { icon: "⚠", name: "warning" },
  3: { icon: "ℹ", name: "info" },
  4: { icon: "💡", name: "hint" },
}

/**
 * Format a single diagnostic for display
 */
function formatDiagnostic(
  diagnostic: Diagnostic,
  filePath: string,
  projectDir: string
): string {
  const severity = diagnostic.severity ?? 1
  const { icon } = SEVERITY_MAP[severity] ?? SEVERITY_MAP[1]!
  const relativePath = path.relative(projectDir, filePath)
  const line = diagnostic.range.start.line + 1
  const col = diagnostic.range.start.character + 1

  const code = diagnostic.code ? ` [${diagnostic.code}]` : ""
  const message = diagnostic.message.split("\n")[0] // First line only

  return `  ${icon} ${relativePath}:${line}:${col}${code}: ${message}`
}

/**
 * Format all diagnostics into a compact report
 */
export function formatDiagnosticsReport(
  diagnostics: Record<string, Diagnostic[]>,
  projectDir: string
): string | null {
  let errorCount = 0
  let warningCount = 0
  const lines: string[] = []

  for (const [filePath, diags] of Object.entries(diagnostics)) {
    for (const diag of diags) {
      const severity = diag.severity ?? 1
      if (severity === 1) errorCount++
      if (severity === 2) warningCount++

      if (lines.length < DIAGNOSTICS_MAX_DISPLAY) {
        lines.push(formatDiagnostic(diag, filePath, projectDir))
      }
    }
  }

  const total = errorCount + warningCount
  if (total === 0) return null

  // Build summary line
  const parts: string[] = []
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`)
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`)
  const summary = `✗ ${parts.join(", ")} found`

  // Add overflow indicator
  const overflow = total - lines.length
  if (overflow > 0) {
    lines.push(`  ... and ${overflow} more`)
  }

  return [summary, ...lines].join("\n")
}

/**
 * Get diagnostics for a file using LSP
 */
export async function getDiagnostics(
  filePath: string,
  projectDir: string
): Promise<Record<string, Diagnostic[]>> {
  const manager = new LSPManager(projectDir)

  try {
    // Touch the file and wait for diagnostics
    await manager.touchFile(filePath, true)

    // Small additional delay for diagnostics to settle
    await new Promise((resolve) => setTimeout(resolve, DIAGNOSTICS_WAIT_MS))

    return await manager.diagnostics()
  } finally {
    await manager.shutdown()
  }
}

/**
 * Run LSP diagnostics for a file and return formatted report
 */
export async function runLSPDiagnostics(
  filePath: string,
  projectDir: string
): Promise<string | null> {
  const diagnostics = await getDiagnostics(filePath, projectDir)
  return formatDiagnosticsReport(diagnostics, projectDir)
}