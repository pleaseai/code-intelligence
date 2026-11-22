#!/usr/bin/env bash
set -euo pipefail
if command -v gopls &>/dev/null; then exec gopls serve; fi
if [ -x "${CLAUDE_PLUGIN_DATA:-}/bin/gopls" ]; then exec "${CLAUDE_PLUGIN_DATA}/bin/gopls" serve; fi
echo "[gopls-lsp] gopls not found. Install: go install golang.org/x/tools/gopls@latest" >&2
exit 1
