/**
 * @pleaseai/code - CLI tool for AI-assisted coding
 *
 * Provides auto-formatting and LSP diagnostics for Claude Code hooks.
 */

export { type Config, Format, Formatter, type FormatterConfig, loadConfig } from '@pleaseai/code-format'
export { formatDiagnostic, LSPManager } from '@pleaseai/code-lsp'
