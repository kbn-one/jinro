#!/usr/bin/env bash
# Runs a command with the tools that build the engine on PATH, installing what is missing:
#   - elan, Lean's toolchain manager (lake then fetches the Lean version in lean-toolchain);
#   - wasm-tools, which turns the backend's WasmGC text into a binary.
# Used by CI (.github/workflows/web.yml) and the Pages build (mise.toml).
#
#   scripts/with-lean.sh deno task wasm
set -euo pipefail

WASM_TOOLS_VERSION=1.263.0

export PATH="$HOME/.elan/bin:$HOME/.local/bin:$PATH"

if ! command -v lake >/dev/null; then
  curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh |
    sh -s -- -y --default-toolchain none
fi

if ! command -v wasm-tools >/dev/null; then
  case "$(uname -m)" in
  x86_64) arch=x86_64 ;;
  aarch64 | arm64) arch=aarch64 ;;
  *) echo "with-lean.sh: no wasm-tools build for $(uname -m)" >&2; exit 1 ;;
  esac
  case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) echo "with-lean.sh: no wasm-tools build for $(uname -s)" >&2; exit 1 ;;
  esac
  name="wasm-tools-$WASM_TOOLS_VERSION-$arch-$os"
  mkdir -p "$HOME/.local/bin"
  curl -sSfL "https://github.com/bytecodealliance/wasm-tools/releases/download/v$WASM_TOOLS_VERSION/$name.tar.gz" |
    tar xzf - -C "$HOME/.local/bin" --strip-components=1 "$name/wasm-tools"
fi

exec "$@"
