#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo " GENESIS VALIDATOR SET"
echo "=================================================="

python3 - <<'PY'
import json, urllib.request

def get(url):
    with urllib.request.urlopen(url, timeout=4) as r:
        return json.load(r)

try:
    bonded=get("http://127.0.0.1:1317/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100")
    vals=bonded.get("validators",[])
    print("BONDED VALIDATORS:",len(vals))
    for v in vals:
        d=v.get("description") or {}
        print()
        print("MONIKER:",d.get("moniker","VALIDATOR"))
        print("OPERATOR:",v.get("operator_address","—"))
        print("STATUS:",v.get("status","—"))
        print("JAILED:",v.get("jailed",False))
        print("TOKENS:",v.get("tokens","0"),"ugen")
        c=((v.get("commission") or {}).get("commission_rates") or {})
        print("COMMISSION:",c.get("rate","—"))
except Exception as e:
    print("STAKING API ERROR:",e)

print()
try:
    comet=get("http://127.0.0.1:26657/validators?per_page=100")
    vals=((comet.get("result") or {}).get("validators") or [])
    print("CONSENSUS VALIDATORS:",len(vals))
    for v in vals:
        print(" ",v.get("address","—"),"power="+str(v.get("voting_power","—")))
except Exception as e:
    print("CONSENSUS RPC ERROR:",e)
PY

echo
echo "NODE STATUS:"
./check-nodes.sh
