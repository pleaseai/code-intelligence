#!/usr/bin/env bash
set -euo pipefail
if [ -x "./node_modules/.bin/oxc_language_server" ]; then exec ./node_modules/.bin/oxc_language_server; fi
if command -v oxc_language_server &>/dev/null; then exec oxc_language_server; fi
if [ -x "./node_modules/.bin/oxlint" ]; then exec ./node_modules/.bin/oxlint --lsp; fi
if command -v oxlint &>/dev/null; then exec oxlint --lsp; fi
echo "[oxlint-lsp] oxlint/oxc_language_server not found. Install: npm install --save-dev oxlint" >&2
exit 1
