#!/usr/bin/env bash
set -euo pipefail
if [ -x "./node_modules/.bin/biome" ]; then exec ./node_modules/.bin/biome lsp-proxy --stdio; fi
if command -v biome &>/dev/null; then exec biome lsp-proxy --stdio; fi
echo "[biome-lsp] biome not found. Install: npm install --save-dev @biomejs/biome" >&2
exit 1
