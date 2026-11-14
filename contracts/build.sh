#!/usr/bin/env bash
# Builds both contracts with cargo-near.
#
# The agent contract has no `#[near]` macros (it must stay tiny), so it is built
# without ABI. Its wasm is copied into thecut/res/ because thecut embeds it with
# `include_bytes!`; thecut is built after that copy.
set -euo pipefail
cd "$(dirname "$0")"

cargo near build non-reproducible-wasm --no-abi --manifest-path agent/Cargo.toml
cp target/near/agent/agent.wasm thecut/res/agent.wasm
cargo near build non-reproducible-wasm --manifest-path thecut/Cargo.toml

sha256sum target/near/agent/agent.wasm target/near/thecut/thecut.wasm
