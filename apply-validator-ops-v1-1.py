#!/usr/bin/env python3
from pathlib import Path

def require(text, marker, name):
    if marker not in text:
        raise SystemExit(f"ERROR: {name} marker not found.")

# server.js
p = Path("server.js")
s = p.read_text()

recent_helper = """
// GENESIS VALIDATOR OPERATIONS v1.1 RECENT SIGNING
let validatorRecentSigningCache = { at:0, value:null };

async function validatorRecentSigning(windowSize=50){
  const now = Date.now();

  if(
    validatorRecentSigningCache.value &&
    now - validatorRecentSigningCache.at < 15000
  ){
    return validatorRecentSigningCache.value;
  }

  const status = await fetchJson(RPC + '/status');
  const latestHeight = Number(status?.result?.sync_info?.latest_block_height || 0);

  if(!latestHeight){
    return {
      windowSize:0,
      fromHeight:null,
      toHeight:null,
      rates:{}
    };
  }

  const toHeight = latestHeight;
  const fromHeight = Math.max(2,toHeight-windowSize+1);
  const heights = [];

  for(let height=fromHeight;height<=toHeight;height++){
    heights.push(height);
  }

  const results = await Promise.allSettled(
    heights.map((height)=>fetchJson(RPC + `/block?height=${height}`))
  );

  const rates = new Map();

  for(const result of results){
    if(result.status !== 'fulfilled') continue;

    const signatures =
      result.value?.result?.block?.last_commit?.signatures || [];

    const signed = new Set(
      signatures
        .map((signature)=>String(signature?.validator_address || '').toUpperCase())
        .filter(Boolean)
    );

    for(const address of signed){
      if(!rates.has(address)){
        rates.set(address,{signed:0});
      }
      rates.get(address).signed += 1;
    }
  }

  const observedBlocks = results.filter((result)=>result.status === 'fulfilled').length;
  const output = {};

  for(const [address,data] of rates.entries()){
    const signed = Number(data.signed || 0);
    const missed = Math.max(0,observedBlocks-signed);

    output[address] = {
      signed,
      missed,
      rate:observedBlocks > 0 ? signed/observedBlocks*100 : null
    };
  }

  const value = {
    windowSize:observedBlocks,
    fromHeight,
    toHeight,
    rates:output
  };

  validatorRecentSigningCache = { at:now, value };
  return value;
}

"""

if "GENESIS VALIDATOR OPERATIONS v1.1 RECENT SIGNING" not in s:
    marker = "// GENESIS VALIDATOR OPERATIONS v1\n"
    require(s, marker, "validator operations server")
    s = s.replace(marker, marker + recent_helper, 1)

old = "  const operations = await Promise.all(validators.map(async(validator)=>{"
new = """  let recentSigning = {
    windowSize:0,
    fromHeight:null,
    toHeight:null,
    rates:{}
  };

  try{
    recentSigning = await validatorRecentSigning(50);
  }catch{}

  const operations = await Promise.all(validators.map(async(validator)=>{"""

if "recentSigning = await validatorRecentSigning(50)" not in s:
    require(s, old, "operations map")
    s = s.replace(old,new,1)

old_return = """      uptimePct:Number.isFinite(uptime) ? uptime : null,
      node:node ? {"""
new_return = """      uptimePct:Number.isFinite(uptime) ? uptime : null,
      recentWindow:recentSigning.windowSize || null,
      recentSignedBlocks:identity.hex && recentSigning.rates?.[String(identity.hex).toUpperCase()]
        ? recentSigning.rates[String(identity.hex).toUpperCase()].signed
        : null,
      recentMissedBlocks:identity.hex && recentSigning.rates?.[String(identity.hex).toUpperCase()]
        ? recentSigning.rates[String(identity.hex).toUpperCase()].missed
        : null,
      recentSigningRate:identity.hex && recentSigning.rates?.[String(identity.hex).toUpperCase()]
        ? recentSigning.rates[String(identity.hex).toUpperCase()].rate
        : null,
      node:node ? {"""

if "recentSigningRate:" not in s:
    require(s, old_return, "validator operation return")
    s = s.replace(old_return,new_return,1)

warning_candidates = [
"""    if(validator.uptimePct != null && validator.uptimePct < 99){
      warnings.push(`${validator.moniker.toUpperCase()} WINDOW UPTIME ${validator.uptimePct.toFixed(2)}%`);
    }""",
"""    if(validator.uptimePct != null && validator.uptimePct < 99){
      warnings.push(`${validator.moniker.toUpperCase()} UPTIME ${validator.uptimePct.toFixed(2)}%`);
    }"""
]
new_warning = """    if(validator.recentSigningRate != null && validator.recentSigningRate < 99){
      warnings.push(
        `${validator.moniker.toUpperCase()} RECENT ${validator.recentWindow || 0} RATE ${validator.recentSigningRate.toFixed(2)}%`
      );
    }"""

if "RECENT ${validator.recentWindow" not in s:
    for candidate in warning_candidates:
        if candidate in s:
            s = s.replace(candidate,new_warning,1)
            break
    else:
        raise SystemExit("ERROR: historical uptime warning marker not found.")

s = s.replace(
    "operations.some((validator)=>validator.uptimePct != null && validator.uptimePct < 99)",
    "operations.some((validator)=>validator.recentSigningRate != null && validator.recentSigningRate < 99)"
)

old_meta = """    signedBlocksWindow:signedBlocksWindow || null,
    nodes:{primary,secondary},"""
new_meta = """    signedBlocksWindow:signedBlocksWindow || null,
    recentSigningWindow:recentSigning.windowSize || null,
    recentSigningFromHeight:recentSigning.fromHeight || null,
    recentSigningToHeight:recentSigning.toHeight || null,
    nodes:{primary,secondary},"""

if "recentSigningWindow:" not in s:
    require(s, old_meta, "validator operations response metadata")
    s = s.replace(old_meta,new_meta,1)

p.write_text(s)

# script.js
p = Path("script.js")
s = p.read_text()

candidates = [
"""                <span><small>UPTIME</small><b>${escapeHtml(fmtOpsUptime(validator.uptimePct))}</b></span>
                <span><small>MISSED BLOCKS</small><b>${escapeHtml(validator.missedBlocksCounter ?? '—')}</b></span>
                <span><small>HEIGHT</small><b>${escapeHtml(node?.height != null ? Number(node.height).toLocaleString('en-US') : '—')}</b></span>""",
"""                <span><small>WINDOW UPTIME</small><b>${escapeHtml(fmtOpsUptime(validator.uptimePct))}</b></span>
                <span><small>MISSED BLOCKS</small><b>${escapeHtml(validator.missedBlocksCounter ?? '—')}</b></span>
                <span><small>HEIGHT</small><b>${escapeHtml(node?.height != null ? Number(node.height).toLocaleString('en-US') : '—')}</b></span>"""
]

new_metrics = """                <span><small>RECENT ${escapeHtml(validator.recentWindow ?? 50)} RATE</small><b>${escapeHtml(fmtOpsUptime(validator.recentSigningRate))}</b></span>
                <span><small>RECENT MISSED</small><b>${escapeHtml(validator.recentMissedBlocks ?? '—')}</b></span>
                <span><small>SLASHING UPTIME</small><b>${escapeHtml(fmtOpsUptime(validator.uptimePct))}</b></span>
                <span><small>WINDOW MISSED</small><b>${escapeHtml(validator.missedBlocksCounter ?? '—')}</b></span>
                <span><small>HEIGHT</small><b>${escapeHtml(node?.height != null ? Number(node.height).toLocaleString('en-US') : '—')}</b></span>"""

if "RECENT ${escapeHtml(validator.recentWindow" not in s:
    for candidate in candidates:
        if candidate in s:
            s = s.replace(candidate,new_metrics,1)
            break
    else:
        raise SystemExit("ERROR: validator UI metrics marker not found.")

if "GENESIS VALIDATOR OPERATIONS v1.1" not in s:
    marker = "// GENESIS VALIDATOR OPERATIONS v1\n"
    require(s, marker, "validator operations client")
    s = s.replace(marker, marker + "  // GENESIS VALIDATOR OPERATIONS v1.1\n", 1)

p.write_text(s)

# styles.css
p = Path("styles.css")
s = p.read_text()
if "GENESIS VALIDATOR OPERATIONS v1.1" not in s:
    s += """

/* GENESIS VALIDATOR OPERATIONS v1.1 */
.validator-ops-metrics b{
  min-height:1.25em;
}
"""
p.write_text(s)

print("Validator Operations v1.1 applied.")
