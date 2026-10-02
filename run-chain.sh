#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$ROOT/chain-env.sh" ]; then
  source "$ROOT/chain-env.sh"
fi

export GOMAXPROCS="${GOMAXPROCS:-2}"
export GOFLAGS="${GOFLAGS:--p=1}"
export GOMEMLIMIT="${GOMEMLIMIT:-700MiB}"

BIN="${GENESIS_BIN:-$ROOT/.tools/bin/genesis-chaind}"
HOME_DIR="${GENESIS_HOME:-$ROOT/.genesis-data}"

if [ ! -x "$BIN" ]; then
  echo "ERROR: genesis-chaind binary not found: $BIN"
  exit 1
fi

if [ -x "$ROOT/secure-private-bindings.sh" ]; then
  "$ROOT/secure-private-bindings.sh" --primary-only
fi

if [ ! -f "$HOME_DIR/config/genesis.json" ]; then
  echo "ERROR: Genesis state not initialized: $HOME_DIR"
  exit 1
fi

echo "Genesis Chain starting"
echo "Binary: $BIN"
echo "Home: $HOME_DIR"
echo "RPC: http://127.0.0.1:26657"
echo "API: http://127.0.0.1:1317"

exec "$BIN" start --home "$HOME_DIR"
