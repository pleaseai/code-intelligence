#!/usr/bin/env bash
set -euo pipefail
if command -v ocamllsp &>/dev/null; then exec ocamllsp; fi
if command -v opam &>/dev/null && opam exec -- ocamllsp --version &>/dev/null; then exec opam exec -- ocamllsp; fi
echo "[ocaml-lsp] ocamllsp not found. Install: opam install ocaml-lsp-server" >&2
exit 1
