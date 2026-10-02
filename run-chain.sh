#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/chain-env.sh"
cd "$ROOT/genesis-chain"
exec ignite cosmos chain serve
