#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${GENESIS_BIN:-$ROOT/.tools/bin/genesis-chaind}"
PRIMARY_HOME="${GENESIS_HOME:-$ROOT/.genesis-data}"
NODE2_HOME="${GENESIS_NODE2_HOME:-$ROOT/.genesis-node2}"
CHAIN_ID="genesis-1"

echo "=================================================="
echo " GENESIS NODE 2 SETUP v1.2"
echo "=================================================="

if [ ! -x "$BIN" ]; then
  echo "ERROR: genesis-chaind binary not found: $BIN"
  exit 1
fi

if [ ! -f "$PRIMARY_HOME/config/genesis.json" ]; then
  echo "ERROR: primary Genesis state not found: $PRIMARY_HOME"
  exit 1
fi

get_node_id() {
  local home="$1"
  local out=""

  if out="$("$BIN" comet show-node-id --home "$home" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi

  if out="$("$BIN" tendermint show-node-id --home "$home" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi

  if out="$("$BIN" show-node-id --home "$home" 2>/dev/null)" && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi

  return 1
}

if [ ! -f "$NODE2_HOME/config/config.toml" ]; then
  echo "Initializing Node 2 state..."
  mkdir -p "$NODE2_HOME"
  "$BIN" init node2 --chain-id "$CHAIN_ID" --home "$NODE2_HOME" >/dev/null
else
  echo "Node 2 state already exists. Reusing it."
fi

cp "$PRIMARY_HOME/config/genesis.json" "$NODE2_HOME/config/genesis.json"

PRIMARY_ID="$(get_node_id "$PRIMARY_HOME" || true)"
NODE2_ID="$(get_node_id "$NODE2_HOME" || true)"

if [ -z "$PRIMARY_ID" ]; then
  echo "ERROR: unable to determine the primary node ID."
  exit 1
fi

if [ -z "$NODE2_ID" ]; then
  echo "ERROR: unable to determine the Node 2 ID."
  exit 1
fi

python3 - "$PRIMARY_HOME" "$NODE2_HOME" "$PRIMARY_ID" <<'PY'
from pathlib import Path
import re, sys

primary_home = Path(sys.argv[1])
node2_home = Path(sys.argv[2])
primary_id = sys.argv[3].strip()

def replace_key(text, section, key, value, required=True):
    lines = text.splitlines()
    current = ""
    replaced = False
    out = []

    for line in lines:
        m = re.match(r'^\s*\[([^\]]+)\]\s*$', line)
        if m:
            current = m.group(1).strip()

        km = re.match(r'^(\s*)([A-Za-z0-9_.-]+)\s*=\s*(.*)$', line)
        if km and current == section and km.group(2) == key:
            out.append(f"{km.group(1)}{key} = {value}")
            replaced = True
            continue

        out.append(line)

    if required and not replaced:
        raise SystemExit(f"ERROR: TOML key not found: [{section}] {key}")

    return "\n".join(out) + "\n", replaced

def replace_global_key(text, key, value):
    pattern = re.compile(rf'(?m)^(\s*){re.escape(key)}\s*=.*$')
    if pattern.search(text):
        return pattern.sub(lambda m: f'{m.group(1)}{key} = {value}', text, count=1)
    return f'{key} = {value}\n' + text

config = node2_home / "config" / "config.toml"
app = node2_home / "config" / "app.toml"
client = node2_home / "config" / "client.toml"
primary_app = primary_home / "config" / "app.toml"

config_text = config.read_text()
config_text, _ = replace_key(config_text, "rpc", "laddr", '"tcp://127.0.0.1:26667"')
config_text, _ = replace_key(config_text, "p2p", "laddr", '"tcp://0.0.0.0:26666"')
config_text, _ = replace_key(
    config_text,
    "p2p",
    "persistent_peers",
    f'"{primary_id}@127.0.0.1:26656"'
)
config_text = re.sub(
    r'(?m)^(\s*)pprof_laddr\s*=.*$',
    r'\1pprof_laddr = "localhost:6061"',
    config_text,
    count=1
)
config.write_text(config_text)

app_text = app.read_text()
app_text, _ = replace_key(app_text, "api", "address", '"tcp://127.0.0.1:1318"')
app_text, _ = replace_key(app_text, "grpc", "address", '"127.0.0.1:9091"')

# grpc-web is optional in this Genesis build.
if re.search(r'(?m)^\s*\[grpc-web\]\s*$', app_text):
    app_text, _ = replace_key(
        app_text,
        "grpc-web",
        "address",
        '"127.0.0.1:9092"',
        required=False
    )

# Node 2 must always have a non-empty minimum gas price.
gas_price = "0ugen"
if primary_app.exists():
    m = re.search(
        r'(?m)^\s*minimum-gas-prices\s*=\s*"([^"]*)"',
        primary_app.read_text()
    )
    if m and m.group(1).strip():
        gas_price = m.group(1).strip()

app_text = replace_global_key(
    app_text,
    "minimum-gas-prices",
    f'"{gas_price}"'
)
app.write_text(app_text)

client_text = client.read_text()
client_text = re.sub(
    r'(?m)^(\s*)node\s*=.*$',
    r'\1node = "tcp://127.0.0.1:26667"',
    client_text,
    count=1
)
client_text = re.sub(
    r'(?m)^(\s*)chain-id\s*=.*$',
    r'\1chain-id = "genesis-1"',
    client_text,
    count=1
)
client.write_text(client_text)

print("Node 2 TOML configuration updated.")
print("minimum-gas-prices:", gas_price)
PY

mkdir -p "$NODE2_HOME/config"
printf '%s\n' "$PRIMARY_ID" > "$NODE2_HOME/config/primary-node-id.txt"
printf '%s\n' "$NODE2_ID" > "$NODE2_HOME/config/node2-node-id.txt"
printf '%s@127.0.0.1:26656\n' "$PRIMARY_ID" > "$NODE2_HOME/config/primary-peer.txt"

echo
echo "=================================================="
echo " NODE 2 READY"
echo "=================================================="
echo "Primary node ID: $PRIMARY_ID"
echo "Node 2 ID:       $NODE2_ID"
echo "Node 2 home:     $NODE2_HOME"
echo "Node 2 P2P:      tcp://127.0.0.1:26666"
echo "Node 2 RPC:      http://127.0.0.1:26667"
echo "Node 2 API:      http://127.0.0.1:1318"
echo
echo "No process was started, stopped, restarted, or reloaded."
