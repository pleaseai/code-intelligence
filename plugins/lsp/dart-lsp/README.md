# Dart LSP Plugin for Claude Code

This plugin provides real-time diagnostics and language features for Dart using the official [Dart Language Server](https://github.com/dart-lang/sdk/blob/main/pkg/analysis_server/tool/lsp_spec/README.md).

## Requirements

- Dart SDK installed and in PATH

## Installation

### Via Flutter (Recommended)

If you use Flutter, Dart is included:

```bash
# macOS
brew install flutter

# Or download from https://docs.flutter.dev/get-started/install
```

### Dart SDK Only

```bash
# macOS
brew tap dart-lang/dart
brew install dart

# Linux (Debian/Ubuntu)
sudo apt-get install dart

# Windows
choco install dart-sdk

# Or download from https://dart.dev/get-dart
```

## Supported File Types

- Dart: `.dart`

## Features

- Dart analysis and diagnostics
- Autocomplete
- Go to definition
- Find references
- Quick fixes
- Refactoring

## Configuration

The Dart language server detects projects with:
- `pubspec.yaml`
- `pubspec.lock`

## Auto-Download Fallback

If Dart is not in PATH, you can use `@pleaseai/code-lsp` for auto-download:

```bash
bunx @pleaseai/code-lsp setup dart
```

This downloads Dart SDK 3.7.1 to `~/.cache/dora/dart-lsp/`.
