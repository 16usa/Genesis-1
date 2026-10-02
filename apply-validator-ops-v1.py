#!/usr/bin/env python3
from pathlib import Path

def need(text, marker, label):
    if marker not in text:
        raise SystemExit(f"ERROR: {label} marker not found.")

# server.js
p = Path("server.js")
s = p.read_text()

if "GENESIS_NODE2_RPC_URL" not in s:
    marker = "const API = String(process.env.GENESIS_API_URL || 'http://127.0.0.1:1317').replace(/\\/+$/,'');"
    need(s, marker, "server API constant")
    s = s.replace(
        marker,
        marker + "\nconst NODE2_RPC = String(process.env.GENESIS_NODE2_RPC_URL || 'http://127.0.0.1:26667').replace(/\\/+$/,'');",
        1
    )

ops_server = r"""
// GENESIS VALIDATOR OPERATIONS v1
function validatorOpsNode(label,statusResult,netResult){
  if(statusResult.status !== 'fulfilled'){
    return {
      label,online:false,id:null,moniker:null,height:null,
      catchingUp:null,validatorHex:null,votingPower:null,peers:null
    };
  }
  const root = statusResult.value?.result || {};
  const node = root?.node_info || {};
  const sync = root?.sync_info || {};
  const validator = root?.validator_info || {};
  const net = netResult.status === 'fulfilled' ? netResult.value?.result || {} : {};
  const peerCount = Number(net?.n_peers);
  return {
    label,
    online:true,
    id:node?.id || null,
    moniker:node?.moniker || label,
    height:Number(sync?.latest_block_height || 0),
    catchingUp:!!sync?.catching_up,
    validatorHex:String(validator?.address || '').toUpperCase() || null,
    votingPower:validator?.voting_power ?? null,
    peers:Number.isFinite(peerCount) ? peerCount : null
  };
}

async function validatorOperations(){
  const [
    validatorsR,slashingParamsR,primaryStatusR,secondaryStatusR,primaryNetR,secondaryNetR
  ] = await Promise.allSettled([
    fetchJson(API + '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100'),
    fetchJson(API + '/cosmos/slashing/v1beta1/params'),
    fetchJson(RPC + '/status'),
    fetchJson(NODE2_RPC + '/status'),
    fetchJson(RPC + '/net_info'),
    fetchJson(NODE2_RPC + '/net_info')
  ]);

  const primary = validatorOpsNode('PRIMARY',primaryStatusR,primaryNetR);
  const secondary = validatorOpsNode('NODE 2',secondaryStatusR,secondaryNetR);
  const nodes = [primary,secondary];

  const primaryPeers = primaryNetR.status === 'fulfilled'
    ? primaryNetR.value?.result?.peers || [] : [];
  const secondaryPeers = secondaryNetR.status === 'fulfilled'
    ? secondaryNetR.value?.result?.peers || [] : [];

  const connected = !!(
    primary.online && secondary.online && primary.id && secondary.id &&
    (
      primaryPeers.some((peer)=>peer?.node_info?.id === secondary.id) ||
      secondaryPeers.some((peer)=>peer?.node_info?.id === primary.id)
    )
  );

  const heightDelta = primary.online && secondary.online
    ? Math.abs(Number(primary.height || 0)-Number(secondary.height || 0))
    : null;

  const validators = validatorsR.status === 'fulfilled' && Array.isArray(validatorsR.value?.validators)
    ? validatorsR.value.validators : [];

  const signedBlocksWindow = slashingParamsR.status === 'fulfilled'
    ? Number(slashingParamsR.value?.params?.signed_blocks_window || 0) : 0;

  let consensusPowers = new Map();
  if(primary.online && primary.height){
    try{
      const data = await fetchJson(
        RPC + `/validators?height=${encodeURIComponent(primary.height)}&page=1&per_page=100`
      );
      const values = Array.isArray(data?.result?.validators) ? data.result.validators : [];
      consensusPowers = new Map(values.map((item)=>[
        String(item?.address || '').toUpperCase(),
        item?.voting_power ?? null
      ]));
    }catch{}
  }

  const operations = await Promise.all(validators.map(async(validator)=>{
    const identity = consensusIdentity(validator);
    const commission = validator?.commission?.commission_rates || {};
    let signing = null;

    if(identity.address){
      try{
        const data = await fetchJson(
          API + `/cosmos/slashing/v1beta1/signing_infos/${encodeURIComponent(identity.address)}`
        );
        signing = data?.val_signing_info || null;
      }catch{}
    }

    const missedBlocks = signing ? Number(signing?.missed_blocks_counter || 0) : null;
    const uptime = signedBlocksWindow > 0 && Number.isFinite(missedBlocks)
      ? Math.max(0,Math.min(100,100-(missedBlocks/signedBlocksWindow*100)))
      : null;

    const node = nodes.find((item)=>
      item?.validatorHex && identity.hex &&
      String(item.validatorHex).toUpperCase() === String(identity.hex).toUpperCase()
    ) || null;

    return {
      operatorAddress:validator?.operator_address || null,
      consensusAddress:identity.address,
      consensusHex:identity.hex,
      moniker:validator?.description?.moniker || 'VALIDATOR',
      status:validatorStatusLabel(validator?.status,!!validator?.jailed),
      jailed:!!validator?.jailed,
      tokens:validator?.tokens || null,
      commissionRate:commission?.rate || null,
      votingPower:identity.hex
        ? (consensusPowers.get(String(identity.hex).toUpperCase()) ?? null)
        : null,
      missedBlocksCounter:Number.isFinite(missedBlocks) ? missedBlocks : null,
      signedBlocksWindow:signedBlocksWindow || null,
      uptimePct:Number.isFinite(uptime) ? uptime : null,
      node:node ? {
        label:node.label,online:node.online,height:node.height,
        catchingUp:node.catchingUp,peers:node.peers,id:node.id
      } : null
    };
  }));

  const warnings = [];
  if(!primary.online) warnings.push('PRIMARY NODE OFFLINE');
  if(!secondary.online) warnings.push('NODE 2 OFFLINE');
  if(primary.online && primary.catchingUp) warnings.push('PRIMARY NODE SYNCING');
  if(secondary.online && secondary.catchingUp) warnings.push('NODE 2 SYNCING');
  if(primary.online && secondary.online && !connected) warnings.push('VALIDATOR PEER LINK NOT CONFIRMED');
  if(heightDelta != null && heightDelta > 3) warnings.push(`VALIDATOR HEIGHT DELTA ${heightDelta}`);

  for(const validator of operations){
    if(validator.jailed) warnings.push(`${validator.moniker.toUpperCase()} JAILED`);
    if(validator.status !== 'BONDED') warnings.push(`${validator.moniker.toUpperCase()} ${validator.status}`);
    if(!validator.node) warnings.push(`${validator.moniker.toUpperCase()} NODE UNMAPPED`);
    if(validator.uptimePct != null && validator.uptimePct < 99){
      warnings.push(`${validator.moniker.toUpperCase()} WINDOW UPTIME ${validator.uptimePct.toFixed(2)}%`);
    }
  }

  const critical = !primary.online || !secondary.online || operations.some((validator)=>validator.jailed);
  const degraded = !critical && (
    !connected ||
    (heightDelta != null && heightDelta > 3) ||
    operations.some((validator)=>!validator.node) ||
    operations.some((validator)=>validator.uptimePct != null && validator.uptimePct < 99)
  );

  return {
    state:critical ? 'CRITICAL' : (degraded ? 'DEGRADED' : 'HEALTHY'),
    connected,
    heightDelta,
    bondedValidators:operations.length,
    signedBlocksWindow:signedBlocksWindow || null,
    nodes:{primary,secondary},
    validators:operations,
    warnings
  };
}

"""
if "GENESIS VALIDATOR OPERATIONS v1" not in s:
    marker = "// GENESIS NODE HEALTH v1"
    need(s, marker, "server Node Health")
    s = s.replace(marker, ops_server + marker, 1)

if "/api/genesis/validator-operations" not in s:
    marker = "    if(u.pathname==='/api/genesis/node-health') return sendJson(res,200,await nodeHealth());\n"
    need(s, marker, "server node-health route")
    s = s.replace(
        marker,
        marker + "    if(u.pathname==='/api/genesis/validator-operations') return sendJson(res,200,await validatorOperations());\n",
        1
    )
p.write_text(s)

# index.html
p = Path("index.html")
s = p.read_text()
ops_html = r"""
        <!-- GENESIS VALIDATOR OPERATIONS v1 -->
        <div class="validator-ops">
          <div class="validator-ops-head">
            <div>
              <span>VALIDATOR OPERATIONS</span>
              <p>LIVE CONSENSUS AND NODE HEALTH</p>
            </div>
            <strong id="validatorOpsState">WAITING</strong>
          </div>

          <div class="validator-ops-summary">
            <div><span>CONSENSUS</span><strong id="validatorOpsConsensus">—</strong></div>
            <div><span>PEER LINK</span><strong id="validatorOpsPeerLink">—</strong></div>
            <div><span>HEIGHT DELTA</span><strong id="validatorOpsHeightDelta">—</strong></div>
            <div><span>WARNINGS</span><strong id="validatorOpsWarningCount">—</strong></div>
          </div>

          <div class="validator-ops-list" id="validatorOpsList">
            <div class="validator-ops-empty">WAITING FOR VALIDATOR OPERATIONS API</div>
          </div>

          <div class="validator-ops-alerts" id="validatorOpsAlerts">
            <span>NO OPERATIONAL DATA YET</span>
          </div>
        </div>
"""
if "GENESIS VALIDATOR OPERATIONS v1" not in s:
    start = s.find('<section class="section section-validators" id="validators">')
    if start < 0:
        raise SystemExit("ERROR: validators section not found in index.html.")
    closing = s.find('\n    <section class="closing">', start)
    if closing < 0:
        raise SystemExit("ERROR: closing section after validators not found in index.html.")
    tail = "      </div>\n    </section>"
    insert_at = s.rfind(tail, start, closing)
    if insert_at < 0:
        raise SystemExit("ERROR: validators section closing marker not found in index.html.")
    s = s[:insert_at] + ops_html + s[insert_at:]
p.write_text(s)

# script.js
p = Path("script.js")
s = p.read_text()
ops_client = r"""
  // GENESIS VALIDATOR OPERATIONS v1
  const fmtOpsUptime = (value) => {
    const n = Number(value);
    if(!Number.isFinite(n)) return '—';
    return `${n.toFixed(2)}%`;
  };

  function renderValidatorOperations(data={}){
    const validators = Array.isArray(data?.validators) ? data.validators : [];
    const state = String(data?.state || 'WAITING').toUpperCase();

    text('validatorOpsState',state);
    text('validatorOpsConsensus',data?.bondedValidators != null
      ? `${data.bondedValidators} BONDED` : '—');
    text('validatorOpsPeerLink',data?.connected === true ? 'CONNECTED'
      : (data?.connected === false ? 'NOT CONNECTED' : '—'));
    text('validatorOpsHeightDelta',data?.heightDelta != null ? String(data.heightDelta) : '—');
    text('validatorOpsWarningCount',Array.isArray(data?.warnings) ? String(data.warnings.length) : '—');

    const stateEl = $('validatorOpsState');
    if(stateEl){
      stateEl.classList.remove('ok','warn','critical');
      if(state === 'HEALTHY') stateEl.classList.add('ok');
      else if(state === 'CRITICAL') stateEl.classList.add('critical');
      else stateEl.classList.add('warn');
    }

    const list = $('validatorOpsList');
    if(list){
      if(!validators.length){
        list.innerHTML = '<div class="validator-ops-empty">NO BONDED VALIDATORS AVAILABLE</div>';
      }else{
        list.innerHTML = validators.map((validator)=>{
          const node = validator?.node || {};
          const nodeState = validator?.node
            ? (node?.online === true ? (node?.catchingUp ? 'SYNCING' : 'ONLINE') : 'OFFLINE')
            : 'UNMAPPED';

          return `
            <button class="validator-ops-card" type="button" data-validator-address="${escapeHtml(validator.operatorAddress || '')}">
              <span class="validator-ops-card-top">
                <span>
                  <b>${escapeHtml(validator.moniker || 'VALIDATOR')}</b>
                  <code>${escapeHtml(short(validator.operatorAddress,16,12))}</code>
                </span>
                <strong>${escapeHtml(node?.label || 'CONSENSUS')}</strong>
              </span>

              <span class="validator-ops-metrics">
                <span><small>STATUS</small><b>${escapeHtml(validatorStatusText(validator.status))}</b></span>
                <span><small>NODE</small><b>${escapeHtml(nodeState)}</b></span>
                <span><small>VOTING POWER</small><b>${escapeHtml(validator.votingPower ?? '—')}</b></span>
                <span><small>BONDED</small><b>${escapeHtml(fmtGen(validator.tokens))}</b></span>
                <span><small>COMMISSION</small><b>${escapeHtml(fmtPercent(validator.commissionRate))}</b></span>
                <span><small>WINDOW UPTIME</small><b>${escapeHtml(fmtOpsUptime(validator.uptimePct))}</b></span>
                <span><small>MISSED BLOCKS</small><b>${escapeHtml(validator.missedBlocksCounter ?? '—')}</b></span>
                <span><small>HEIGHT</small><b>${escapeHtml(node?.height != null ? Number(node.height).toLocaleString('en-US') : '—')}</b></span>
                <span><small>PEERS</small><b>${escapeHtml(node?.peers ?? '—')}</b></span>
              </span>

              <span class="validator-ops-open">OPEN VALIDATOR ↗</span>
            </button>
          `;
        }).join('');
      }
    }

    const alerts = $('validatorOpsAlerts');
    if(alerts){
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      alerts.innerHTML = warnings.length
        ? warnings.map((warning)=>`<span>${escapeHtml(warning)}</span>`).join('')
        : '<span>ALL VALIDATOR OPERATIONS NORMAL</span>';
      alerts.classList.toggle('has-warnings',warnings.length > 0);
    }
  }

  async function loadValidatorOperations(){
    try{
      const data = await getJson('/api/genesis/validator-operations');
      renderValidatorOperations(data || {});
    }catch{
      renderValidatorOperations({
        state:'OFFLINE',
        connected:null,
        heightDelta:null,
        bondedValidators:null,
        validators:[],
        warnings:['VALIDATOR OPERATIONS API UNAVAILABLE']
      });
    }
  }

  $('validatorOpsList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-validator-address]');
    if(row?.dataset?.validatorAddress) openValidator(row.dataset.validatorAddress);
  });

"""
if "GENESIS VALIDATOR OPERATIONS v1" not in s:
    marker = "// GENESIS NODE HEALTH v1"
    need(s, marker, "script Node Health")
    s = s.replace(marker, ops_client + marker, 1)

if "setInterval(loadValidatorOperations,5000)" not in s:
    marker = "  setInterval(loadNodeHealth,3000);\n"
    need(s, marker, "script node health poll")
    s = s.replace(
        marker,
        marker + "  setTimeout(loadValidatorOperations,420);\n  setInterval(loadValidatorOperations,5000);\n",
        1
    )
p.write_text(s)

# styles.css
p = Path("styles.css")
s = p.read_text()
ops_css = r"""

/* GENESIS VALIDATOR OPERATIONS v1 */
.validator-ops{margin-top:48px;border-top:1px solid var(--hair-strong)}
.validator-ops-head{
  min-height:78px;display:flex;align-items:center;justify-content:space-between;
  gap:24px;border-bottom:1px solid var(--hair-strong)
}
.validator-ops-head>div>span{
  display:block;color:#fff;font-size:10px;font-weight:700;line-height:1.2;
  letter-spacing:.10em;text-transform:uppercase
}
.validator-ops-head p{
  margin:7px 0 0;color:#66666b;font-size:9px;font-weight:700;
  letter-spacing:.10em;text-transform:uppercase
}
.validator-ops-head>strong{
  color:#8c8c91;font-size:10px;font-weight:700;letter-spacing:.10em;text-transform:uppercase
}
.validator-ops-head>strong.ok{color:#fff}
.validator-ops-head>strong.warn{color:#9b9ba0}
.validator-ops-head>strong.critical{color:#fff;text-decoration:underline;text-underline-offset:4px}

.validator-ops-summary{
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
  border-bottom:1px solid var(--hair-strong)
}
.validator-ops-summary>div{min-height:90px;padding:20px;border-right:1px solid var(--hair)}
.validator-ops-summary>div:first-child{padding-left:0}
.validator-ops-summary>div:last-child{border-right:0;padding-right:0}
.validator-ops-summary span,.validator-ops-metrics small{
  display:block;color:#66666b;font-size:8px;font-weight:700;
  letter-spacing:.10em;text-transform:uppercase
}
.validator-ops-summary strong{
  display:block;margin-top:13px;color:#d5d5da;font-family:var(--font-ui);
  font-size:13px;letter-spacing:.035em;text-transform:uppercase
}

.validator-ops-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.validator-ops-card{
  min-width:0;padding:24px 24px 22px 0;border:0;border-right:1px solid var(--hair);
  border-bottom:1px solid var(--hair-strong);background:transparent;color:#fff;
  text-align:left;appearance:none;cursor:pointer
}
.validator-ops-card:nth-child(even){padding-left:24px;padding-right:0;border-right:0}
.validator-ops-card:hover,.validator-ops-card:focus-visible{background:#070707;outline:none}

.validator-ops-card-top{
  display:flex;align-items:flex-start;justify-content:space-between;gap:20px
}
.validator-ops-card-top>span{min-width:0}
.validator-ops-card-top b{
  display:block;font-family:var(--font-display);font-size:23px;line-height:1;
  letter-spacing:.035em;text-transform:uppercase
}
.validator-ops-card-top code{
  display:block;margin-top:8px;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;color:#85858a;font-family:var(--font-ui);font-size:10px;
  letter-spacing:.035em;text-transform:none
}
.validator-ops-card-top>strong{
  color:#8c8c91;font-size:9px;font-weight:700;letter-spacing:.10em;text-transform:uppercase
}

.validator-ops-metrics{
  margin-top:23px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
  border-top:1px solid var(--hair)
}
.validator-ops-metrics>span{
  min-height:70px;padding:15px 12px 12px 0;border-right:1px solid var(--hair);
  border-bottom:1px solid var(--hair)
}
.validator-ops-metrics>span:nth-child(3n){border-right:0;padding-right:0;padding-left:12px}
.validator-ops-metrics>span:nth-child(3n+2){padding-left:12px}
.validator-ops-metrics b{
  display:block;margin-top:10px;color:#c8c8cd;font-family:var(--font-ui);
  font-size:11px;line-height:1.25;letter-spacing:.025em;text-transform:uppercase;
  overflow-wrap:anywhere
}
.validator-ops-open{
  display:block;margin-top:17px;color:#85858a;font-size:8px;font-weight:700;
  letter-spacing:.10em;text-transform:uppercase
}

.validator-ops-alerts{
  min-height:54px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  border-bottom:1px solid var(--hair-strong)
}
.validator-ops-alerts span{
  color:#777;font-size:8px;font-weight:700;letter-spacing:.10em;text-transform:uppercase
}
.validator-ops-alerts span:not(:last-child)::after{content:" · ";color:#404044}
.validator-ops-alerts.has-warnings span{color:#b2b2b7}
.validator-ops-empty{
  grid-column:1/-1;min-height:78px;display:flex;align-items:center;
  border-bottom:1px solid var(--hair-strong);color:#66666b;font-size:9px;
  font-weight:700;letter-spacing:.10em;text-transform:uppercase
}

@media (max-width:900px){
  .validator-ops-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
  .validator-ops-summary>div:nth-child(2){border-right:0}
  .validator-ops-summary>div:nth-child(3){padding-left:0}
  .validator-ops-list{grid-template-columns:1fr}
  .validator-ops-card,.validator-ops-card:nth-child(even){padding:22px 0;border-right:0}
}

@media (max-width:620px){
  .validator-ops-head{align-items:flex-start;flex-direction:column;padding:18px 0}
  .validator-ops-summary{grid-template-columns:1fr}
  .validator-ops-summary>div,.validator-ops-summary>div:first-child,.validator-ops-summary>div:last-child{
    min-height:72px;padding:16px 0;border-right:0;border-bottom:1px solid var(--hair)
  }
  .validator-ops-summary>div:last-child{border-bottom:0}
  .validator-ops-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .validator-ops-metrics>span,.validator-ops-metrics>span:nth-child(3n),.validator-ops-metrics>span:nth-child(3n+2){
    padding:14px 10px 11px 0;border-right:1px solid var(--hair)
  }
  .validator-ops-metrics>span:nth-child(even){padding-left:10px;padding-right:0;border-right:0}
}
"""
if "GENESIS VALIDATOR OPERATIONS v1" not in s:
    s += ops_css
p.write_text(s)

print("Validator Operations v1 source patch applied.")
