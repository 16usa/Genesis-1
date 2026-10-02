#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMARY="${GENESIS_HOME:-$ROOT/.genesis-data}"
NODE2="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"
MODE="${1:-all}"

python3 - "$PRIMARY" "$NODE2" "$MODE" <<'PY'
from pathlib import Path
import re,sys

primary,node2,mode=Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3]

def setkey(text,section,key,value,optional=False):
    if optional and not re.search(rf'(?m)^\s*\[{re.escape(section)}\]\s*$',text):
        return text
    lines=text.splitlines()
    current=""
    changed=False
    out=[]
    for line in lines:
        sm=re.match(r'^\s*\[([^\]]+)\]\s*$',line)
        if sm: current=sm.group(1).strip()
        km=re.match(r'^(\s*)([A-Za-z0-9_.-]+)\s*=\s*(.*)$',line)
        if km and current==section and km.group(2)==key:
            out.append(f'{km.group(1)}{key} = {value}')
            changed=True
        else:
            out.append(line)
    if not changed and not optional:
        raise SystemExit(f"ERROR: [{section}] {key} not found")
    return "\n".join(out)+"\n"

def harden(home,rpc,p2p,api,grpc,grpcweb):
    config=home/"config/config.toml"
    app=home/"config/app.toml"
    if not config.exists() or not app.exists():
        print("SKIP:",home)
        return
    c=config.read_text()
    c=setkey(c,"rpc","laddr",f'"tcp://127.0.0.1:{rpc}"')
    c=setkey(c,"p2p","laddr",f'"tcp://127.0.0.1:{p2p}"')
    config.write_text(c)

    a=app.read_text()
    a=setkey(a,"api","address",f'"tcp://127.0.0.1:{api}"')
    a=setkey(a,"grpc","address",f'"127.0.0.1:{grpc}"')
    a=setkey(a,"grpc-web","address",f'"127.0.0.1:{grpcweb}"',optional=True)
    app.write_text(a)
    print("HARDENED:",home)

if mode in ("all","--primary-only"):
    harden(primary,26657,26656,1317,9090,9091)
if mode in ("all","--node2-only"):
    harden(node2,26667,26666,1318,9091,9092)
PY

echo "No process was started, stopped, restarted, or reloaded."
