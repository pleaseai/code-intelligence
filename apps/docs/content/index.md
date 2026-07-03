---
title: Code Please
description: Auto-format and type-check hooks for AI coding
---

::u-page-hero
# title
Code Please

# description
CLI and Claude Code plugin for AI-assisted coding with auto-formatting and LSP diagnostics.

# links
  :::u-button{to="/docs/getting-started/introduction" size="lg"}
  Get Started →
  :::

  :::u-button{to="https://github.com/chatbot-pf/code-please" target="_blank" variant="outline" size="lg"}
  View on GitHub
  :::
::

::u-page-section
# title
Features

# content
  ::u-page-grid
    :::u-page-card
    ---
    title: Auto-Formatting
    icon: lucide:wand-2
    ---
    Automatically format files after Claude Code edits with support for 20+ formatters including Biome, Prettier, gofmt, and more.
    :::

    :::u-page-card
    ---
    title: LSP Diagnostics
    icon: lucide:bug
    ---
    Real-time type checking feedback for AI coding sessions with support for 30+ language servers.
    :::

    :::u-page-card
    ---
    title: Multi-Language
    icon: lucide:languages
    ---
    Full support for TypeScript, Python, Go, Rust, Kotlin, Dart, and many more languages.
    :::

    :::u-page-card
    ---
    title: Zero Config
    icon: lucide:settings-2
    ---
    Works out of the box with sensible defaults. Customize when needed via `.please/config.yml`.
    :::
  ::
::

::u-page-section
# title
Quick Start

# content
Install globally and add hooks to your Claude Code settings:

```bash
npm install -g @pleaseai/code
```

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx @pleaseai/code format --stdin" },
          { "type": "command", "command": "npx @pleaseai/code lsp --stdin" }
        ]
      }
    ]
  }
}
```
::
