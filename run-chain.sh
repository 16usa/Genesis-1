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

if [ ! -x "$BIN" ]; then
  BIN="$(command -v genesis-chaind 2>/dev/null || true)"
fi

HOME_DIR="${GENESIS_HOME:-$HOME/.genesis-chain}"

if [ ! -x "$BIN" ]; then
  echo "ERROR: genesis-chaind binary not found."
  echo "Run the one-time chain build from Shell before starting the workflow."
  exit 1
fi

if [ ! -f "$HOME_DIR/config/genesis.json" ]; then
  echo "ERROR: Genesis chain data directory not found: $HOME_DIR"
  exit 1
fi

echo "Genesis Chain starting"
echo "Binary: $BIN"
echo "Home: $HOME_DIR"
echo "RPC: http://127.0.0.1:26657"
echo "API: http://127.0.0.1:1317"

exec "$BIN" start --home "$HOME_DIR"
