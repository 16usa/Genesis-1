#!/usr/bin/env bash
set -euo pipefail
SITE="${GENESIS_PUBLIC_SITE:-http://127.0.0.1:3000}"

echo "=================================================="
echo " GENESIS PUBLIC TESTNET ACCESS v1 CHECK"
echo "=================================================="

curl -fsS http://127.0.0.1:26657/status >/dev/null
curl -fsS http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest >/dev/null
echo "PRIMARY RPC: LOCAL ONLINE"
echo "PRIMARY REST: LOCAL ONLINE"

curl -fsS "$SITE/api/public/info" >/tmp/genesis-public-info.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/genesis-public-info.json"))
for k in ("gateway","readOnly","chainId","height","rpcOnline","restOnline","rateLimitPerMinute","rawValidatorPortsPublic"):
    print(k.upper()+":",d.get(k))
assert d.get("gateway")=="ONLINE"
assert d.get("readOnly") is True
assert d.get("rpcOnline") is True
assert d.get("restOnline") is True
assert d.get("rawValidatorPortsPublic") is False
PY

curl -fsS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"status","params":{}}' \
  "$SITE/api/public/rpc" >/tmp/genesis-public-rpc.json

python3 - <<'PY'
import json
d=json.load(open("/tmp/genesis-public-rpc.json"))
r=d.get("result") or {}
print("RPC CHAIN:",(r.get("node_info") or {}).get("network"))
print("RPC HEIGHT:",(r.get("sync_info") or {}).get("latest_block_height"))
assert (r.get("sync_info") or {}).get("latest_block_height")
PY

curl -fsS "$SITE/api/public/rest/cosmos/base/tendermint/v1beta1/blocks/latest" >/tmp/genesis-public-rest.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/genesis-public-rest.json"))
h=(d.get("block") or {}).get("header") or {}
print("REST CHAIN:",h.get("chain_id"))
print("REST HEIGHT:",h.get("height"))
assert h.get("height")
PY

HTTP="$(curl -sS -o /tmp/genesis-blocked.json -w '%{http_code}' \
 -H 'content-type: application/json' \
 -d '{"jsonrpc":"2.0","id":2,"method":"broadcast_tx_sync","params":{"tx":""}}' \
 "$SITE/api/public/rpc")"
echo "UNSAFE RPC HTTP: $HTTP"
[ "$HTTP" = "403" ] || { echo "ERROR: unsafe RPC not blocked"; exit 1; }

OPTIONS="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$SITE/api/public/rpc")"
echo "CORS OPTIONS HTTP: $OPTIONS"
[ "$OPTIONS" = "204" ] || { echo "ERROR: CORS failed"; exit 1; }

if grep -Eq 'localPort = (1317|26656|26657|26666|26667)' .replit; then
  echo "ERROR: raw service port still published"
  exit 1
fi

echo
echo "PUBLIC TESTNET GATEWAY READY"
echo "RPC: POST /api/public/rpc"
echo "REST: GET /api/public/rest/{cosmos-path}"
echo "INFO: GET /api/public/info"
echo "HEALTH: GET /api/public/health"
