#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo " GENESIS VALIDATOR OPERATIONS v1.1 CHECK"
echo "=================================================="

if ! curl -fsS http://127.0.0.1:3000/api/genesis/validator-operations \
  > /tmp/genesis-validator-ops-v1-1.json; then
  echo "ERROR: web operations API is unavailable."
  echo "Restart only Genesis Site / web interface manually."
  exit 1
fi

python3 - <<'PY'
import json

with open("/tmp/genesis-validator-ops-v1-1.json") as f:
    data=json.load(f)

print("STATE:",data.get("state","—"))
print("CONNECTED:",data.get("connected","—"))
print("HEIGHT DELTA:",data.get("heightDelta","—"))
print("BONDED VALIDATORS:",data.get("bondedValidators","—"))
print("RECENT SIGNING WINDOW:",data.get("recentSigningWindow","—"))
print("RECENT RANGE:",data.get("recentSigningFromHeight","—"),"->",data.get("recentSigningToHeight","—"))

warnings=data.get("warnings") or []
print("WARNINGS:",len(warnings))
for warning in warnings:
    print(" ",warning)

for validator in data.get("validators") or []:
    node=validator.get("node") or {}
    print()
    print("VALIDATOR:",validator.get("moniker","—"))
    print(" STATUS:",validator.get("status","—"))
    print(" JAILED:",validator.get("jailed","—"))
    print(" VOTING POWER:",validator.get("votingPower","—"))
    print(" RECENT WINDOW:",validator.get("recentWindow","—"))
    print(" RECENT SIGNED:",validator.get("recentSignedBlocks","—"))
    print(" RECENT MISSED:",validator.get("recentMissedBlocks","—"))
    print(" RECENT RATE:",validator.get("recentSigningRate","—"))
    print(" SLASHING WINDOW UPTIME:",validator.get("uptimePct","—"))
    print(" SLASHING WINDOW MISSED:",validator.get("missedBlocksCounter","—"))
    print(" NODE:",node.get("label","UNMAPPED"))
    print(" NODE ONLINE:",node.get("online","—"))
    print(" HEIGHT:",node.get("height","—"))
    print(" PEERS:",node.get("peers","—"))
PY
