#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${GENESIS_BIN:-$ROOT/.tools/bin/genesis-chaind}"
PRIMARY_HOME="${GENESIS_HOME:-$ROOT/.genesis-data}"
NODE2_HOME="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"
ENV_FILE="$NODE2_HOME/validator2.env"

echo "=================================================="
echo " GENESIS VALIDATOR 2 FUND"
echo "=================================================="

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Validator 2 is not prepared."
  echo "Run ./prepare-validator2.sh first."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if ! "$BIN" keys show treasury \
    --home "$PRIMARY_HOME" \
    --keyring-backend test \
    --output json >/dev/null 2>&1; then
  echo "ERROR: treasury key not found in the primary keyring."
  exit 1
fi

TREASURY_ADDRESS="$("$BIN" keys show treasury \
  --home "$PRIMARY_HOME" \
  --keyring-backend test \
  -a)"

echo "Treasury: $TREASURY_ADDRESS"
echo "Validator 2: $VALIDATOR2_ACCOUNT_ADDRESS"
echo "Amount: $VALIDATOR2_FUND_AMOUNT"
echo

BALANCE_BEFORE="$(curl -fsS \
  "http://127.0.0.1:1317/cosmos/bank/v1beta1/balances/$VALIDATOR2_ACCOUNT_ADDRESS/by_denom?denom=ugen" \
  2>/dev/null || true)"

if [ -n "$BALANCE_BEFORE" ]; then
  python3 - "$BALANCE_BEFORE" <<'PY'
import json,sys
d=json.loads(sys.argv[1])
a=(d.get("balance") or {}).get("amount","0")
print("Validator 2 balance before:", a, "ugen")
PY
fi

RESULT="$("$BIN" tx bank send treasury \
  "$VALIDATOR2_ACCOUNT_ADDRESS" \
  "$VALIDATOR2_FUND_AMOUNT" \
  --from treasury \
  --home "$PRIMARY_HOME" \
  --keyring-backend test \
  --chain-id "$GENESIS_CHAIN_ID" \
  --node tcp://127.0.0.1:26657 \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 5000ugen \
  --broadcast-mode sync \
  --output json \
  -y)"

printf '%s\n' "$RESULT" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("TX HASH:",d.get("txhash","—"))
print("CODE:",d.get("code",0))
if int(d.get("code",0) or 0)!=0:
    print("RAW LOG:",d.get("raw_log",""))
'

CODE="$(printf '%s\n' "$RESULT" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("code",0) or 0))')"
if [ "$CODE" -ne 0 ]; then
  echo "ERROR: funding transaction was rejected."
  exit 1
fi

echo "Funding transaction accepted by the node."
echo "Wait one or two blocks before registration."
echo "NEXT: ./register-validator2.sh"
