#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"

echo "=================================================="
echo " GENESIS VALIDATOR 2 v1"
echo "=================================================="

for file in setup-node2.sh run-node2.sh check-nodes.sh; do
  if [ ! -f "$ROOT/$file" ]; then
    echo "ERROR: $file not found in the current workspace."
    exit 1
  fi
done

for file in prepare-validator2.sh fund-validator2.sh register-validator2.sh check-validators.sh; do
  if [ ! -f "$ROOT/$file" ]; then
    echo "ERROR: $file is missing from the extracted patch."
    exit 1
  fi
  chmod +x "$ROOT/$file"
done

cp "$ROOT/check-nodes.sh" "$ROOT/check-nodes.sh.before-validator2-v1"

if ! grep -q "GENESIS VALIDATOR 2 v1" "$ROOT/check-nodes.sh"; then
cat >> "$ROOT/check-nodes.sh" <<'EOF'

echo
echo "BONDED VALIDATORS:"
curl -fsS "http://127.0.0.1:1317/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100" 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
vals=d.get("validators",[])
print(len(vals))
for v in vals:
    desc=v.get("description") or {}
    print("  {}  {}  tokens={}".format(
        desc.get("moniker","VALIDATOR"),
        v.get("operator_address","—"),
        v.get("tokens","0")
    ))
' || echo "STAKING API UNAVAILABLE"

# GENESIS VALIDATOR 2 v1
EOF
fi

echo "== Syntax checks =="
bash -n "$ROOT/prepare-validator2.sh"
bash -n "$ROOT/fund-validator2.sh"
bash -n "$ROOT/register-validator2.sh"
bash -n "$ROOT/check-validators.sh"
bash -n "$ROOT/check-nodes.sh"

echo
echo "=================================================="
echo " PATCH INSTALLED"
echo "=================================================="
echo "Validator 2 preparation script: installed"
echo "Validator 2 funding script: installed"
echo "Validator 2 registration script: installed"
echo "Validator set verification script: installed"
echo "check-nodes.sh validator summary: installed"
echo "Existing validator explorer UI: already dynamic"
echo "No process was started, stopped, restarted, or reloaded."
echo "No transaction was broadcast by this installer."
echo
echo "NEXT:"
echo "  ./prepare-validator2.sh"
echo "  ./fund-validator2.sh"
echo "  ./register-validator2.sh"
echo "  ./check-validators.sh"
