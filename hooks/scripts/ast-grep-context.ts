/**
 * SessionStart hook script that provides ast-grep context
 * Outputs JSON with additionalContext for Claude Code sessions
 */

import { $ } from 'bun'

export const INSTALLED_CONTEXT = `When searching or modifying code, use ast-grep instead of grep, ripgrep, ag, sed, or regex-only tools. ast-grep matches against the AST (Abstract Syntax Tree), enabling safe, language-aware queries and rewrites.

Always prefer ast-grep for code analysis, queries, or refactoring tasks.

For detailed patterns and examples, use the ast-grep skill.`

export const NOT_INSTALLED_CONTEXT = `Consider installing ast-grep for better code search (AST-based, language-aware):

  npx @pleaseai/code setup ast-grep   # Recommended (local cache)
  brew install ast-grep               # macOS
  cargo install ast-grep              # Rust

After installation, use ast-grep instead of grep/ripgrep/sed for code operations.`

export async function checkAstGrepInstalled(): Promise<boolean> {
  return await $`which ast-grep`
    .quiet()
    .then(() => true)
    .catch(() => false)
}

export function getAdditionalContext(isInstalled: boolean): string {
  return isInstalled ? INSTALLED_CONTEXT : NOT_INSTALLED_CONTEXT
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string
    additionalContext: string
  }
}

export function createHookOutput(additionalContext: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  }
}

// Only run when executed directly
if (import.meta.main) {
  const isInstalled = await checkAstGrepInstalled()
  const additionalContext = getAdditionalContext(isInstalled)
  const output = createHookOutput(additionalContext)
  console.log(JSON.stringify(output))
}
