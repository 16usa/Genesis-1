#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$ROOT/.tools/go/bin:$ROOT/.tools/bin:$PATH"
export GOBIN="$ROOT/.tools/bin"
