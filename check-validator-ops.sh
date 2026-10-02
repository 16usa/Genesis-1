#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo " GENESIS VALIDATOR OPERATIONS CHECK"
echo "=================================================="

echo
echo "PRIMARY / NODE 2:"
./check-nodes.sh

echo
echo "VALIDATOR SET:"
./check-validators.sh

echo
echo "WEB OPERATIONS API:"
if ! curl -fsS http://127.0.0.1:3000/api/genesis/validator-operations > /tmp/genesis-validator-ops.json; then
  echo "ERROR: validator operations web API is unavailable."
  echo "Restart only the web interface workflow manually, then run this check again."
  exit 1
fi

python3 - <<'PY'
import json
with open("/tmp/genesis-validator-ops.json") as f:
    data=json.load(f)

print("STATE:",data.get("state","—"))
print("CONNECTED:",data.get("connected","—"))
print("HEIGHT DELTA:",data.get("heightDelta","—"))
print("BONDED VALIDATORS:",data.get("bondedValidators","—"))

warnings=data.get("warnings") or []
print("WARNINGS:",len(warnings))
for warning in warnings:
    print(" ",warning)

for validator in data.get("validators") or []:
    node=validator.get("node") or {}
    print()
    print("VALIDATOR:",validator.get("moniker","—"))
    print(" OPERATOR:",validator.get("operatorAddress","—"))
    print(" STATUS:",validator.get("status","—"))
    print(" JAILED:",validator.get("jailed","—"))
    print(" VOTING POWER:",validator.get("votingPower","—"))
    print(" BONDED:",validator.get("tokens","—"),"ugen")
    print(" COMMISSION:",validator.get("commissionRate","—"))
    print(" WINDOW UPTIME:",validator.get("uptimePct","—"))
    print(" MISSED BLOCKS:",validator.get("missedBlocksCounter","—"))
    print(" NODE:",node.get("label","UNMAPPED"))
    print(" NODE ONLINE:",node.get("online","—"))
    print(" HEIGHT:",node.get("height","—"))
    print(" PEERS:",node.get("peers","—"))
PY
