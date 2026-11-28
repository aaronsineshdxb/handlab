#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../rust/sw3d"
cargo test
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/handlab_sw3d.wasm ../../public/wasm/handlab_sw3d.wasm
# Optional: binaryen's optimizer typically trims a few more % and speeds up hot
# code. Skipped when not installed (`brew install binaryen`); output stays valid.
if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -O3 --enable-bulk-memory ../../public/wasm/handlab_sw3d.wasm -o ../../public/wasm/handlab_sw3d.wasm
fi
ls -lh ../../public/wasm/handlab_sw3d.wasm
