#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${GENESIS_BIN:-$ROOT/.tools/bin/genesis-chaind}"
NODE2_HOME="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"
KEY_NAME="${VALIDATOR2_KEY_NAME:-validator2}"
CHAIN_ID="${GENESIS_CHAIN_ID:-genesis-1}"
FUND_AMOUNT="${VALIDATOR2_FUND_AMOUNT:-200000000ugen}"
STAKE_AMOUNT="${VALIDATOR2_STAKE_AMOUNT:-100000000ugen}"
MONIKER="${VALIDATOR2_MONIKER:-validator2}"

echo "=================================================="
echo " GENESIS VALIDATOR 2 PREPARE"
echo "=================================================="

if [ ! -x "$BIN" ]; then
  echo "ERROR: genesis-chaind binary not found: $BIN"
  exit 1
fi

if [ ! -f "$NODE2_HOME/config/genesis.json" ]; then
  echo "ERROR: Node 2 is not initialized."
  exit 1
fi

if ! curl -fsS http://127.0.0.1:26667/status >/dev/null 2>&1; then
  echo "ERROR: Node 2 RPC is not online on port 26667."
  echo "Start the Genesis Node 2 workflow before preparing Validator 2."
  exit 1
fi

KEY_EXISTS=0
if "$BIN" keys show "$KEY_NAME" \
    --home "$NODE2_HOME" \
    --keyring-backend test \
    --output json >/dev/null 2>&1; then
  KEY_EXISTS=1
fi

if [ "$KEY_EXISTS" -eq 0 ]; then
  echo "Creating Validator 2 account key..."
  umask 077
  "$BIN" keys add "$KEY_NAME" \
    --home "$NODE2_HOME" \
    --keyring-backend test \
    --output json \
    > "$NODE2_HOME/validator2-key-backup.json"
  chmod 600 "$NODE2_HOME/validator2-key-backup.json"
  echo "Validator 2 key created."
  echo "Private key backup saved inside .genesis-node2 with mode 600."
  echo "The mnemonic is not printed to the terminal."
else
  echo "Validator 2 account key already exists. Reusing it."
fi

ACCOUNT_ADDRESS="$("$BIN" keys show "$KEY_NAME" \
  --home "$NODE2_HOME" \
  --keyring-backend test \
  -a)"

show_validator() {
  local out=""
  if out="$("$BIN" comet show-validator --home "$NODE2_HOME" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi
  if out="$("$BIN" tendermint show-validator --home "$NODE2_HOME" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi
  if out="$("$BIN" show-validator --home "$NODE2_HOME" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi
  return 1
}

PUBKEY_RAW="$(show_validator || true)"
if [ -z "$PUBKEY_RAW" ]; then
  echo "ERROR: unable to read Node 2 consensus public key."
  exit 1
fi

PUBKEY_JSON="$(python3 - "$PUBKEY_RAW" <<'PY'
import json,sys
raw=sys.argv[1].strip()
try:
    obj=json.loads(raw)
except Exception:
    raise SystemExit(1)

if "@type" in obj and "key" in obj:
    print(json.dumps(obj,separators=(",",":")))
elif obj.get("type") == "tendermint/PubKeyEd25519" and obj.get("value"):
    print(json.dumps({
        "@type":"/cosmos.crypto.ed25519.PubKey",
        "key":obj["value"]
    },separators=(",",":")))
else:
    raise SystemExit(1)
PY
)" || {
  echo "ERROR: unsupported consensus public key format:"
  echo "$PUBKEY_RAW"
  exit 1
}

CONFIG="$NODE2_HOME/validator2-create.json"

python3 - "$CONFIG" "$PUBKEY_JSON" "$STAKE_AMOUNT" "$MONIKER" <<'PY'
import json,sys
path,pubkey,amount,moniker=sys.argv[1:]
data={
  "pubkey":json.loads(pubkey),
  "amount":amount,
  "moniker":moniker,
  "identity":"",
  "website":"",
  "security":"",
  "details":"Genesis secondary validator",
  "commission-rate":"0.05",
  "commission-max-rate":"0.20",
  "commission-max-change-rate":"0.01",
  "min-self-delegation":"1"
}
with open(path,"w") as f:
    json.dump(data,f,indent=2)
    f.write("\n")
PY

ENV_FILE="$NODE2_HOME/validator2.env"
cat > "$ENV_FILE" <<EOF
VALIDATOR2_KEY_NAME=$KEY_NAME
VALIDATOR2_ACCOUNT_ADDRESS=$ACCOUNT_ADDRESS
VALIDATOR2_MONIKER=$MONIKER
VALIDATOR2_FUND_AMOUNT=$FUND_AMOUNT
VALIDATOR2_STAKE_AMOUNT=$STAKE_AMOUNT
VALIDATOR2_CREATE_CONFIG=$CONFIG
GENESIS_CHAIN_ID=$CHAIN_ID
EOF
chmod 600 "$ENV_FILE"

echo
echo "=================================================="
echo " VALIDATOR 2 PREPARED"
echo "=================================================="
echo "Account: $ACCOUNT_ADDRESS"
echo "Moniker: $MONIKER"
echo "Funding target: $FUND_AMOUNT"
echo "Self delegation: $STAKE_AMOUNT"
echo "Create-validator config: $CONFIG"
echo
echo "No transaction was broadcast."
echo "NEXT: ./fund-validator2.sh"
