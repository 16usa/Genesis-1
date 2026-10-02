#!/usr/bin/env bash
set -euo pipefail

detect_url() {
  if [ -n "${GENESIS_PUBLIC_URL:-}" ]; then
    printf '%s\n' "${GENESIS_PUBLIC_URL%/}"
    return 0
  fi

  if [ -n "${REPLIT_DEV_DOMAIN:-}" ]; then
    printf 'https://%s\n' "${REPLIT_DEV_DOMAIN}"
    return 0
  fi

  if [ -n "${REPLIT_DOMAINS:-}" ]; then
    local first
    first="$(printf '%s' "$REPLIT_DOMAINS" | tr ',' '\n' | head -n 1 | xargs)"
    if [ -n "$first" ]; then
      if printf '%s' "$first" | grep -qE '^https?://'; then
        printf '%s\n' "${first%/}"
      else
        printf 'https://%s\n' "${first%/}"
      fi
      return 0
    fi
  fi

  return 1
}

BASE="$(detect_url || true)"

if [ -z "$BASE" ]; then
  echo "ERROR: Could not detect the public Replit URL."
  echo
  echo "Run with:"
  echo "  GENESIS_PUBLIC_URL=https://YOUR-PUBLIC-DOMAIN ./check-public-external.sh"
  exit 1
fi

case "$BASE" in
  http://127.0.0.1*|http://localhost*|https://127.0.0.1*|https://localhost*)
    echo "ERROR: External check requires a public URL, not localhost."
    exit 1
    ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "=================================================="
echo " GENESIS EXTERNAL PUBLIC CHECK v1"
echo "=================================================="
echo "PUBLIC URL: $BASE"

echo
echo "== EXTERNAL INFO =="
curl -fsS --connect-timeout 8 --max-time 15 \
  "$BASE/api/public/info" \
  -o "$TMP/info.json"

python3 - "$TMP/info.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))

print("GATEWAY:",d.get("gateway"))
print("READ ONLY:",d.get("readOnly"))
print("CHAIN ID:",d.get("chainId"))
print("HEIGHT:",d.get("height"))
print("RPC ONLINE:",d.get("rpcOnline"))
print("REST ONLINE:",d.get("restOnline"))
print("RATE LIMIT:",d.get("rateLimitPerMinute"))
print("RAW VALIDATOR PORTS PUBLIC:",d.get("rawValidatorPortsPublic"))

assert d.get("gateway")=="ONLINE"
assert d.get("readOnly") is True
assert d.get("rpcOnline") is True
assert d.get("restOnline") is True
assert d.get("rawValidatorPortsPublic") is False
PY

echo
echo "== EXTERNAL HEALTH =="
curl -fsS --connect-timeout 8 --max-time 15 \
  "$BASE/api/public/health" \
  -o "$TMP/health.json"

python3 - "$TMP/health.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))

print("OK:",d.get("ok"))
print("RPC:",d.get("rpc"))
print("REST:",d.get("rest"))
print("HEIGHT:",d.get("height"))
print("CATCHING UP:",d.get("catchingUp"))

assert d.get("ok") is True
assert d.get("rpc") is True
assert d.get("rest") is True
PY

echo
echo "== EXTERNAL JSON-RPC STATUS =="
curl -fsS --connect-timeout 8 --max-time 15 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"status","params":{}}' \
  "$BASE/api/public/rpc" \
  -o "$TMP/rpc.json"

python3 - "$TMP/rpc.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
r=d.get("result") or {}
node=r.get("node_info") or {}
sync=r.get("sync_info") or {}

print("RPC CHAIN:",node.get("network"))
print("RPC HEIGHT:",sync.get("latest_block_height"))
print("RPC CATCHING UP:",sync.get("catching_up"))

assert node.get("network")=="genesis-1"
assert sync.get("latest_block_height")
PY

echo
echo "== EXTERNAL REST LATEST BLOCK =="
curl -fsS --connect-timeout 8 --max-time 15 \
  "$BASE/api/public/rest/cosmos/base/tendermint/v1beta1/blocks/latest" \
  -o "$TMP/rest.json"

python3 - "$TMP/rest.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
h=((d.get("block") or {}).get("header") or {})

print("REST CHAIN:",h.get("chain_id"))
print("REST HEIGHT:",h.get("height"))

assert h.get("chain_id")=="genesis-1"
assert h.get("height")
PY

echo
echo "== UNSAFE RPC MUST BE BLOCKED =="
BLOCKED="$(
  curl -sS --connect-timeout 8 --max-time 15 \
    -o "$TMP/blocked.json" \
    -w '%{http_code}' \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":2,"method":"broadcast_tx_sync","params":{"tx":""}}' \
    "$BASE/api/public/rpc"
)"

echo "HTTP: $BLOCKED"
cat "$TMP/blocked.json"
echo

if [ "$BLOCKED" != "403" ]; then
  echo "ERROR: unsafe public RPC was not blocked."
  exit 1
fi

echo
echo "== CORS HEADERS =="
curl -sS --connect-timeout 8 --max-time 15 \
  -D "$TMP/cors.headers" \
  -o /dev/null \
  -X OPTIONS \
  -H 'Origin: https://example.com' \
  -H 'Access-Control-Request-Method: POST' \
  "$BASE/api/public/rpc"

awk 'BEGIN{IGNORECASE=1}
  /^HTTP\// || /^access-control-allow-origin:/ || /^access-control-allow-methods:/ {
    print
  }
' "$TMP/cors.headers"

if ! grep -qi '^access-control-allow-origin:[[:space:]]*\*' "$TMP/cors.headers"; then
  echo "ERROR: public CORS allow-origin header is missing."
  exit 1
fi

echo
echo "== RAW ROUTES MUST NOT LEAK THROUGH WEB SERVICE =="

RAW_STATUS="$(
  curl -sS --connect-timeout 8 --max-time 15 \
    -o "$TMP/raw-status.body" \
    -w '%{http_code}' \
    "$BASE/status" || true
)"

RAW_REST="$(
  curl -sS --connect-timeout 8 --max-time 15 \
    -o "$TMP/raw-rest.body" \
    -w '%{http_code}' \
    "$BASE/cosmos/base/tendermint/v1beta1/blocks/latest" || true
)"

echo "DIRECT /status HTTP: $RAW_STATUS"
echo "DIRECT /cosmos/... HTTP: $RAW_REST"

if [ "$RAW_STATUS" = "200" ]; then
  echo "ERROR: raw Tendermint /status is exposed through the public web service."
  exit 1
fi

if [ "$RAW_REST" = "200" ]; then
  echo "ERROR: raw Cosmos REST path is exposed through the public web service."
  exit 1
fi

echo
echo "== HEIGHT CONSISTENCY =="
python3 - "$TMP/info.json" "$TMP/rpc.json" "$TMP/rest.json" <<'PY'
import json,sys

info=json.load(open(sys.argv[1]))
rpc=json.load(open(sys.argv[2]))
rest=json.load(open(sys.argv[3]))

a=int(info["height"])
b=int(rpc["result"]["sync_info"]["latest_block_height"])
c=int(rest["block"]["header"]["height"])

print("INFO HEIGHT:",a)
print("RPC HEIGHT:",b)
print("REST HEIGHT:",c)
print("MAX DELTA:",max(a,b,c)-min(a,b,c))

assert max(a,b,c)-min(a,b,c) <= 5
PY

echo
echo "=================================================="
echo " EXTERNAL PUBLIC TESTNET CHECK: PASS"
echo "=================================================="
echo "PUBLIC URL: $BASE"
echo "INFO:   $BASE/api/public/info"
echo "HEALTH: $BASE/api/public/health"
echo "RPC:    $BASE/api/public/rpc"
echo "REST:   $BASE/api/public/rest/{cosmos-path}"
