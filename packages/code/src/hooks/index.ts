/**
 * Claude Code Hooks
 *
 * Hook scripts are located in the /hooks directory (for plugin distribution).
 * See hooks/hooks.json for the hook configuration.
 *
 * Available hooks:
 * - hooks/format-hook.ts: Auto-format files after Write/Edit operations
 * - hooks/lsp-hook.ts: LSP diagnostics feedback after Write/Edit operations
 *
 * This module re-exports utilities for use in hooks.
 */

export { Format, Formatter } from "../format"
export {
  runLSPDiagnostics,
  getDiagnostics,
  formatDiagnosticsReport,
} from "./lsp"
