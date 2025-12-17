/**
 * @pleaseai/code - CLI tool for AI-assisted coding
 *
 * Provides auto-formatting and LSP diagnostics for Claude Code hooks.
 */

export { Format, Formatter } from "./format"
export { LSPManager, formatDiagnostic } from "./lsp"
export { loadConfig, type Config, type FormatterConfig } from "./config"
