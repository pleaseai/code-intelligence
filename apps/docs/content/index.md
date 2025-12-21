---
title: Code Please
description: Auto-format and type-check hooks for AI coding
---

::page-hero
---
title: Code Please
description: CLI and Claude Code plugin for AI-assisted coding with auto-formatting and LSP diagnostics.
---

#actions
::button-link{to="/docs/getting-started/introduction" variant="primary"}
Get Started
::

::button-link{to="https://github.com/chatbot-pf/code-please" variant="outline" external}
View on GitHub
::
::

::page-section
#title
Features

#content
::page-card-group
  ::page-card
  ---
  title: Auto-Formatting
  icon: lucide:wand-2
  ---
  Automatically format files after Claude Code edits with support for 20+ formatters including Biome, Prettier, gofmt, and more.
  ::

  ::page-card
  ---
  title: LSP Diagnostics
  icon: lucide:bug
  ---
  Real-time type checking feedback for AI coding sessions with support for 30+ language servers.
  ::

  ::page-card
  ---
  title: Multi-Language
  icon: lucide:languages
  ---
  Full support for TypeScript, Python, Go, Rust, Kotlin, Dart, and many more languages.
  ::

  ::page-card
  ---
  title: Zero Config
  icon: lucide:settings-2
  ---
  Works out of the box with sensible defaults. Customize when needed via `.please/config.yml`.
  ::
::
::

::page-section
#title
Quick Start

#content
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
