#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS="$ROOT/.tools"
GO_VERSION="1.26.7"

mkdir -p "$TOOLS/bin"

case "$(uname -m)" in
  x86_64) GOARCH="amd64" ;;
  aarch64|arm64) GOARCH="arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
esac

if [ ! -x "$TOOLS/go/bin/go" ]; then
  echo "== Installing local Go ${GO_VERSION} =="
  rm -rf "$TOOLS/go" "$TOOLS/go.tar.gz"
  curl -fL "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz" -o "$TOOLS/go.tar.gz"
  tar -C "$TOOLS" -xzf "$TOOLS/go.tar.gz"
  rm -f "$TOOLS/go.tar.gz"
fi

export PATH="$TOOLS/go/bin:$TOOLS/bin:$PATH"
export GOBIN="$TOOLS/bin"

if [ ! -x "$TOOLS/bin/ignite" ]; then
  echo "== Installing Ignite CLI locally =="
  TMP_IGNITE="$(mktemp -d)"
  (
    cd "$TMP_IGNITE"
    curl -fsSL https://get.ignite.com/cli | bash
    if [ -x ./ignite ]; then
      mv ./ignite "$TOOLS/bin/ignite"
    fi
  )
  rm -rf "$TMP_IGNITE"
fi

if [ ! -x "$TOOLS/bin/ignite" ]; then
  echo "ERROR: Ignite CLI installation failed."
  exit 1
fi

echo "== Versions =="
go version
ignite version

if [ ! -d "$ROOT/genesis-chain" ]; then
  echo "== Creating Genesis blockchain =="
  cd "$ROOT"
  ignite cosmos scaffold chain genesis-chain \
    --address-prefix gen \
    --default-denom ugen \
    --skip-git
else
  echo "== genesis-chain already exists; scaffold skipped =="
fi

cat > "$ROOT/genesis-chain/config.yml" <<'YAML'
version: 1
validation: sovereign

accounts:
  - name: validator
    coins:
      - "1000000000000ugen"
  - name: treasury
    coins:
      - "20000000000000ugen"

validators:
  - name: validator
    bonded: "100000000000ugen"

genesis:
  chain_id: "genesis-1"
  app_state:
    staking:
      params:
        bond_denom: "ugen"
    mint:
      params:
        mint_denom: "ugen"
        inflation_rate_change: "0.000000000000000000"
        inflation_max: "0.000000000000000000"
        inflation_min: "0.000000000000000000"
    bank:
      denom_metadata:
        - description: "Native coin of Genesis Network"
          denom_units:
            - denom: "ugen"
              exponent: 0
              aliases: ["microgen"]
            - denom: "gen"
              exponent: 6
              aliases: ["GEN"]
          base: "ugen"
          display: "gen"
          name: "Genesis"
          symbol: "GEN"
YAML

cat > "$ROOT/chain-env.sh" <<'SH'
#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$ROOT/.tools/go/bin:$ROOT/.tools/bin:$PATH"
export GOBIN="$ROOT/.tools/bin"
SH

cat > "$ROOT/run-chain.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/chain-env.sh"
cd "$ROOT/genesis-chain"
exec ignite cosmos chain serve
SH

chmod +x "$ROOT/chain-env.sh" "$ROOT/run-chain.sh"

echo
echo "GENESIS CHAIN CODE READY"
echo "Chain ID : genesis-1"
echo "Coin     : GEN"
echo "Base     : ugen"
echo "Decimals : 6"
echo "Supply   : 21,000,000 GEN at genesis"
echo "Prefix   : gen1..."
echo
echo "No process was started or restarted."
echo "Manual start: ./run-chain.sh"
