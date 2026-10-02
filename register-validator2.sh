#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${GENESIS_BIN:-$ROOT/.tools/bin/genesis-chaind}"
NODE2_HOME="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"
ENV_FILE="$NODE2_HOME/validator2.env"

echo "=================================================="
echo " GENESIS VALIDATOR 2 REGISTER"
echo "=================================================="

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Validator 2 is not prepared."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if ! curl -fsS http://127.0.0.1:26667/status >/dev/null 2>&1; then
  echo "ERROR: Node 2 is offline."
  echo "Do not register a validator while its consensus node is offline."
  exit 1
fi

HELP="$("$BIN" tx staking create-validator --help 2>&1 || true)"
if [ -z "$HELP" ]; then
  echo "ERROR: staking create-validator command is unavailable."
  exit 1
fi

if [ ! -f "$VALIDATOR2_CREATE_CONFIG" ]; then
  echo "ERROR: create-validator JSON config not found."
  exit 1
fi

BALANCE_JSON="$(curl -fsS \
  "http://127.0.0.1:1317/cosmos/bank/v1beta1/balances/$VALIDATOR2_ACCOUNT_ADDRESS/by_denom?denom=ugen")"

BALANCE="$(python3 - "$BALANCE_JSON" <<'PY'
import json,sys
d=json.loads(sys.argv[1])
print(int((d.get("balance") or {}).get("amount","0") or 0))
PY
)"

STAKE="$(python3 - "$VALIDATOR2_STAKE_AMOUNT" <<'PY'
import re,sys
m=re.fullmatch(r'([0-9]+)ugen',sys.argv[1])
if not m:
    raise SystemExit(1)
print(int(m.group(1)))
PY
)"

echo "Validator 2 balance: $BALANCE ugen"
echo "Self delegation: $STAKE ugen"

if [ "$BALANCE" -lt $((STAKE + 20000)) ]; then
  echo "ERROR: Validator 2 does not have enough ugen for self delegation and fees."
  echo "Run ./fund-validator2.sh first."
  exit 1
fi

echo
echo "Broadcasting create-validator transaction..."

RESULT="$("$BIN" tx staking create-validator \
  "$VALIDATOR2_CREATE_CONFIG" \
  --from "$VALIDATOR2_KEY_NAME" \
  --home "$NODE2_HOME" \
  --keyring-backend test \
  --chain-id "$GENESIS_CHAIN_ID" \
  --node tcp://127.0.0.1:26657 \
  --gas auto \
  --gas-adjustment 1.5 \
  --fees 10000ugen \
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
  echo "ERROR: create-validator transaction was rejected."
  exit 1
fi

echo
echo "Create-validator transaction accepted."
echo "Keep Genesis Node 2 running continuously after validator registration."
echo "Wait a few blocks, then run:"
echo "  ./check-validators.sh"
