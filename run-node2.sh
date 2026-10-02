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
HOME_DIR="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"

if [ ! -x "$BIN" ]; then
  echo "ERROR: genesis-chaind binary not found: $BIN"
  exit 1
fi

if [ ! -f "$HOME_DIR/config/genesis.json" ]; then
  echo "ERROR: Node 2 is not initialized."
  echo "Run ./setup-node2.sh once before starting this workflow."
  exit 1
fi

echo "Genesis Node 2 starting"
echo "Home: $HOME_DIR"
echo "P2P: tcp://127.0.0.1:26666"
echo "RPC: http://127.0.0.1:26667"
echo "API: http://127.0.0.1:1318"
echo

exec "$BIN" start --home "$HOME_DIR"
