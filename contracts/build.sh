#!/usr/bin/env bash
# Builds both contracts with cargo-near.
#
# The robot contract has no `#[near]` macros (it must stay tiny), so it is built
# without ABI. Its wasm is copied into thecut/res/ because thecut embeds it with
# `include_bytes!`; thecut is built after that copy.
set -euo pipefail
cd "$(dirname "$0")"

cargo near build non-reproducible-wasm --no-abi --manifest-path robot/Cargo.toml
cp target/near/robot/robot.wasm thecut/res/robot.wasm
cargo near build non-reproducible-wasm --manifest-path thecut/Cargo.toml

sha256sum target/near/robot/robot.wasm target/near/thecut/thecut.wasm
