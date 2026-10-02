#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json, urllib.request

def read(url):
    with urllib.request.urlopen(url, timeout=3) as r:
        return json.load(r)

def status(label, url):
    try:
        data = read(url)
        result = data.get("result", {})
        node = result.get("node_info", {})
        sync = result.get("sync_info", {})
        return {
            "label": label,
            "online": True,
            "id": node.get("id"),
            "height": int(sync.get("latest_block_height") or 0),
            "catching_up": bool(sync.get("catching_up")),
        }
    except Exception:
        return {"label": label, "online": False, "id": None, "height": 0, "catching_up": None}

primary = status("PRIMARY", "http://127.0.0.1:26657/status")
node2 = status("NODE 2", "http://127.0.0.1:26667/status")

for node in (primary, node2):
    print(f"{node['label']}: {'ONLINE' if node['online'] else 'OFFLINE'}")
    if node["online"]:
        print(f"  ID: {node['id']}")
        print(f"  HEIGHT: {node['height']}")
        print(f"  SYNC: {'SYNCING' if node['catching_up'] else 'READY'}")

if primary["online"] and node2["online"]:
    print(f"HEIGHT DELTA: {abs(primary['height'] - node2['height'])}")
PY

echo
echo "PRIMARY PEERS:"
curl -fsS http://127.0.0.1:26657/net_info 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin).get("result",{})
print(d.get("n_peers","0"))
for p in d.get("peers",[]):
    n=p.get("node_info",{})
    print("  {}  {}  outbound={}  ip={}".format(
        n.get("id","—"),
        n.get("moniker","—"),
        p.get("is_outbound",False),
        p.get("remote_ip","—")
    ))
' || true

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
