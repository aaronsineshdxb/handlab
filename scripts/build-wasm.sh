#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../rust/sw3d"
cargo test
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/handlab_sw3d.wasm ../../public/wasm/handlab_sw3d.wasm
ls -lh ../../public/wasm/handlab_sw3d.wasm
