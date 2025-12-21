# Kotlin LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Kotlin using the official [JetBrains Kotlin Language Server](https://github.com/AjitZK/kotlin-language-server-docker/blob/master/README.md).

## Requirements

- Node.js and npm/bun in PATH (for running the setup)
- Internet access (for first-time download)

## Auto-Download

This plugin uses `@pleaseai/code-lsp` to automatically download:
- JetBrains Kotlin LSP (v0.253.10629)
- Bundled JRE 21 (platform-specific)

Files are cached in `~/.cache/dora/kotlin-lsp/`.

## Supported File Types

- Kotlin: `.kt`, `.kts`

## Supported Platforms

- Windows x64
- Linux x64 and ARM64
- macOS x64 and ARM64 (Apple Silicon)

## Features

- Full IntelliJ-grade Kotlin analysis
- Type inference and checking
- Smart completions
- Go to definition
- Find references

## Configuration

The Kotlin language server detects projects with:
- `build.gradle.kts` or `build.gradle`
- `settings.gradle.kts` or `settings.gradle`
- `pom.xml`

## Manual Setup

If auto-download fails, you can manually setup:

```bash
bunx @pleaseai/code-lsp setup kotlin
```

## Troubleshooting

If you encounter issues:

1. Clear the cache: `rm -rf ~/.cache/dora/kotlin-lsp`
2. Re-run setup: `bunx @pleaseai/code-lsp setup kotlin`
