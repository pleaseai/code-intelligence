/**
 * SessionStart hook script that provides ast-grep context
 * Outputs JSON with additionalContext for Claude Code sessions
 */

import { $ } from 'bun'

// Check if ast-grep is installed (use ast-grep, not sg - sg is setgroups on Linux)
const isInstalled = await $`which ast-grep`
  .quiet()
  .then(() => true)
  .catch(() => false)

let additionalContext: string

if (isInstalled) {
  additionalContext = `When searching or modifying code, use ast-grep instead of grep, ripgrep, ag, sed, or regex-only tools. ast-grep matches against the AST (Abstract Syntax Tree), enabling safe, language-aware queries and rewrites.

Always prefer ast-grep for code analysis, queries, or refactoring tasks.

For detailed patterns and examples, use the ast-grep skill.`
}
else {
  additionalContext = `Consider installing ast-grep for better code search (AST-based, language-aware):

  npx @pleaseai/code setup ast-grep   # Recommended (local cache)
  brew install ast-grep               # macOS
  cargo install ast-grep              # Rust

After installation, use ast-grep instead of grep/ripgrep/sed for code operations.`
}

const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext,
  },
}

console.log(JSON.stringify(output))
