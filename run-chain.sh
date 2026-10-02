#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/chain-env.sh"
export GOMAXPROCS="${GOMAXPROCS:-2}"
export GOFLAGS="${GOFLAGS:--p=1}"
export GOMEMLIMIT="${GOMEMLIMIT:-700MiB}"
cd "$ROOT/genesis-chain"
exec ignite cosmos chain serve
