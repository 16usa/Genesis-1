const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const RPC = String(process.env.GENESIS_RPC_URL || 'http://127.0.0.1:26657').replace(/\/+$/,'');
const API = String(process.env.GENESIS_API_URL || 'http://127.0.0.1:1317').replace(/\/+$/,'');

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.ico':'image/x-icon'
};

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{
    'content-type':type,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(body);
}
function sendJson(res,status,data){send(res,status,JSON.stringify(data))}
async function fetchJson(url){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),4500);
  try{
    const r = await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
    const data = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(`upstream ${r.status}`);
    return data;
  }finally{clearTimeout(timer)}
}

async function rpcJson(method,params={}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),4500);
  try{
    const r = await fetch(RPC,{
      method:'POST',
      signal:controller.signal,
      headers:{
        accept:'application/json',
        'content-type':'application/json'
      },
      body:JSON.stringify({
        jsonrpc:'2.0',
        id:'genesis-web',
        method,
        params
      })
    });
    const data = await r.json().catch(()=>({}));
    if(!r.ok || data?.error) throw new Error(data?.error?.message || `upstream ${r.status}`);
    return data;
  }finally{clearTimeout(timer)}
}
function validAddress(v){return typeof v==='string' && /^gen1[0-9a-z]{20,}$/.test(v)}
function blockSummary(data){
  const b = data?.result?.block || {};
  const h = b?.header || {};
  return {
    height:h.height || null,
    time:h.time || null,
    proposer:h.proposer_address || null,
    txCount:Array.isArray(b?.data?.txs) ? b.data.txs.length : 0
  };
}

// GENESIS TRANSACTIONS EXPLORER v1
function validTxHash(v){return typeof v === 'string' && /^[0-9A-Fa-f]{64}$/.test(v);}
function firstBankSendMessage(tx){
  const messages = Array.isArray(tx?.body?.messages) ? tx.body.messages : [];
  return messages.find((message)=>{
    const type = String(message?.['@type'] || message?.type_url || '');
    return type === '/cosmos.bank.v1beta1.MsgSend' || type.endsWith('.MsgSend');
  }) || null;
}
function firstCoin(coins, preferredDenom='ugen'){
  if(!Array.isArray(coins) || !coins.length) return null;
  return coins.find((coin)=>coin?.denom === preferredDenom) || coins[0] || null;
}
function normalizeTx(tx, response){
  const message = firstBankSendMessage(tx);
  if(!message) return null;
  return {
    hash:String(response?.txhash || '').toUpperCase(),
    height:response?.height || null,
    from:message?.from_address || null,
    to:message?.to_address || null,
    amount:firstCoin(message?.amount),
    fee:firstCoin(tx?.auth_info?.fee?.amount),
    code:Number(response?.code || 0),
    status:Number(response?.code || 0) === 0 ? 'SUCCESS' : 'FAILED',
    timestamp:response?.timestamp || null,
    gasWanted:response?.gas_wanted || null,
    gasUsed:response?.gas_used || null
  };
}
async function recentTransactions(limit=12){
  const safeLimit = Math.max(1,Math.min(25,Number(limit) || 12));
  const params = new URLSearchParams({query:"message.action='/cosmos.bank.v1beta1.MsgSend'",page:'1',limit:String(safeLimit),order_by:'ORDER_BY_DESC'});
  const data = await fetchJson(API + '/cosmos/tx/v1beta1/txs?' + params.toString());
  const txs = Array.isArray(data?.txs) ? data.txs : [];
  const responses = Array.isArray(data?.tx_responses) ? data.tx_responses : [];
  return {transactions:txs.map((tx,index)=>normalizeTx(tx,responses[index])).filter(Boolean),total:Number(data?.total || data?.pagination?.total || txs.length || 0)};
}
async function transactionByHash(hash){
  const data = await fetchJson(API + '/cosmos/tx/v1beta1/txs/' + encodeURIComponent(hash));
  const transaction = normalizeTx(data?.tx,data?.tx_response);
  if(!transaction) throw new Error('unsupported transaction type');
  return transaction;
}


// GENESIS BLOCK + ADDRESS EXPLORER v1
function txHashFromBase64(value){
  try{
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''),'base64')).digest('hex').toUpperCase();
  }catch{
    return null;
  }
}
async function blockDetail(height){
  const data = await fetchJson(RPC + `/block?height=${encodeURIComponent(height)}`);
  const result = data?.result || {};
  const block = result?.block || {};
  const header = block?.header || {};
  const txs = Array.isArray(block?.data?.txs) ? block.data.txs : [];
  return {
    height:header.height || String(height),
    hash:result?.block_id?.hash || null,
    chainId:header.chain_id || null,
    time:header.time || null,
    proposer:header.proposer_address || null,
    previousHash:header?.last_block_id?.hash || null,
    txCount:txs.length,
    txHashes:txs.map(txHashFromBase64).filter(Boolean)
  };
}
async function transactionsByQuery(query,limit=50){
  const safeLimit = Math.max(1,Math.min(100,Number(limit) || 50));
  const params = new URLSearchParams({
    query:String(query || ''),
    page:'1',
    limit:String(safeLimit),
    order_by:'ORDER_BY_DESC'
  });
  const data = await fetchJson(API + '/cosmos/tx/v1beta1/txs?' + params.toString());
  const txs = Array.isArray(data?.txs) ? data.txs : [];
  const responses = Array.isArray(data?.tx_responses) ? data.tx_responses : [];
  return txs.map((tx,index)=>normalizeTx(tx,responses[index])).filter(Boolean);
}
async function addressDetail(address,limit=30){
  const [balancesR,sentR,receivedR] = await Promise.allSettled([
    fetchJson(API + `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`),
    transactionsByQuery(`message.sender='${address}'`,100),
    transactionsByQuery(`transfer.recipient='${address}'`,100)
  ]);

  const balances = balancesR.status === 'fulfilled' && Array.isArray(balancesR.value?.balances)
    ? balancesR.value.balances : [];

  const merged = new Map();
  for(const result of [sentR,receivedR]){
    if(result.status !== 'fulfilled') continue;
    for(const tx of result.value){
      if(tx?.hash) merged.set(tx.hash,tx);
    }
  }

  const transactions = Array.from(merged.values())
    .sort((a,b)=>{
      const ah = Number(a?.height || 0);
      const bh = Number(b?.height || 0);
      if(ah !== bh) return bh-ah;
      return String(b?.timestamp || '').localeCompare(String(a?.timestamp || ''));
    });

  const safeLimit = Math.max(1,Math.min(50,Number(limit) || 30));
  return {
    address,
    balances,
    indexedTransactionCount:transactions.length,
    transactions:transactions.slice(0,safeLimit)
  };
}


// GENESIS VALIDATOR EXPLORER v1
function validValidatorAddress(v){
  return typeof v === 'string' && /^genvaloper1[0-9a-z]{20,}$/.test(v);
}
function validatorStatusLabel(status,jailed=false){
  if(jailed) return 'JAILED';
  const value = String(status || '');
  if(value === 'BOND_STATUS_BONDED') return 'BONDED';
  if(value === 'BOND_STATUS_UNBONDING') return 'UNBONDING';
  if(value === 'BOND_STATUS_UNBONDED') return 'UNBONDED';
  return value.replace(/^BOND_STATUS_/,'') || 'UNKNOWN';
}
function averageBlockTimeSeconds(blocks){
  const times = (blocks || [])
    .map((b)=>Date.parse(b?.time || ''))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);
  const deltas = [];
  for(let i=1;i<times.length;i++){
    const seconds = (times[i]-times[i-1])/1000;
    if(Number.isFinite(seconds) && seconds > 0 && seconds < 120) deltas.push(seconds);
  }
  if(!deltas.length) return null;
  return deltas.reduce((sum,value)=>sum+value,0)/deltas.length;
}
async function totalTransactionCount(){
  const queries = [
    "tm.event='Tx'",
    'tx.height > 0'
  ];

  for(const query of queries){
    try{
      const data = await rpcJson('tx_search',{
        query,
        prove:false,
        page:'1',
        per_page:'1',
        order_by:'desc'
      });
      const total = Number(data?.result?.total_count);
      if(Number.isFinite(total)) return total;
    }catch{}
  }

  try{
    const recent = await recentTransactions(1);
    const total = Number(recent?.total);
    if(Number.isFinite(total)) return total;
  }catch{}

  try{
    const params = new URLSearchParams({
      'pagination.limit':'1',
      'pagination.count_total':'true',
      order_by:'ORDER_BY_DESC'
    });
    const data = await fetchJson(API + '/cosmos/tx/v1beta1/txs?' + params.toString());
    const total = Number(data?.pagination?.total ?? data?.total);
    if(Number.isFinite(total)) return total;
  }catch{}

  return null;
}
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Polymod(values){
  const generators = [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
  let chk = 1;
  for(const value of values){
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ value) >>> 0;
    for(let i=0;i<5;i++) if((top >>> i) & 1) chk = (chk ^ generators[i]) >>> 0;
  }
  return chk >>> 0;
}
function bech32HrpExpand(hrp){
  const values = [];
  for(const char of hrp) values.push(char.charCodeAt(0) >>> 5);
  values.push(0);
  for(const char of hrp) values.push(char.charCodeAt(0) & 31);
  return values;
}
function convertBits(data,fromBits,toBits,pad=true){
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;
  for(const value of data){
    if(value < 0 || (value >>> fromBits) !== 0) return null;
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while(bits >= toBits){
      bits -= toBits;
      ret.push((acc >>> bits) & maxv);
    }
  }
  if(pad){
    if(bits) ret.push((acc << (toBits-bits)) & maxv);
  }else if(bits >= fromBits || ((acc << (toBits-bits)) & maxv)){
    return null;
  }
  return ret;
}
function bech32Encode(hrp,bytes){
  const words = convertBits(Array.from(bytes),8,5,true);
  if(!words) return null;
  const values = [...bech32HrpExpand(hrp),...words,0,0,0,0,0,0];
  const mod = bech32Polymod(values) ^ 1;
  const checksum = [];
  for(let p=0;p<6;p++) checksum.push((mod >>> (5*(5-p))) & 31);
  return hrp + '1' + [...words,...checksum].map((v)=>BECH32_CHARSET[v]).join('');
}
function consensusIdentity(validator){
  try{
    const key = validator?.consensus_pubkey?.key || validator?.consensus_pubkey?.value;
    if(!key) return {address:null,hex:null,pubKey:null};
    const pubKey = Buffer.from(String(key),'base64');
    const addressBytes = crypto.createHash('sha256').update(pubKey).digest().subarray(0,20);
    return {
      address:bech32Encode('genvalcons',addressBytes),
      hex:addressBytes.toString('hex').toUpperCase(),
      pubKey:String(key)
    };
  }catch{
    return {address:null,hex:null,pubKey:null};
  }
}
function validatorSummary(validator){
  const commission = validator?.commission?.commission_rates || {};
  return {
    operatorAddress:validator?.operator_address || null,
    moniker:validator?.description?.moniker || 'VALIDATOR',
    status:validatorStatusLabel(validator?.status,!!validator?.jailed),
    jailed:!!validator?.jailed,
    tokens:validator?.tokens || null,
    commissionRate:commission?.rate || null
  };
}
async function validatorDetail(operatorAddress){
  const detail = await fetchJson(API + `/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}`);
  const validator = detail?.validator || {};
  const identity = consensusIdentity(validator);
  const commission = validator?.commission?.commission_rates || {};

  const [signingR,slashingParamsR,statusR] = await Promise.allSettled([
    identity.address
      ? fetchJson(API + `/cosmos/slashing/v1beta1/signing_infos/${encodeURIComponent(identity.address)}`)
      : Promise.reject(new Error('consensus address unavailable')),
    fetchJson(API + '/cosmos/slashing/v1beta1/params'),
    fetchJson(RPC + '/status')
  ]);

  const signing = signingR.status === 'fulfilled' ? signingR.value?.val_signing_info || null : null;
  const signedBlocksWindow = slashingParamsR.status === 'fulfilled'
    ? Number(slashingParamsR.value?.params?.signed_blocks_window || 0) : 0;
  const missedBlocks = signing ? Number(signing?.missed_blocks_counter || 0) : null;
  const windowUptimePct = signedBlocksWindow > 0 && Number.isFinite(missedBlocks)
    ? Math.max(0,Math.min(100,100-(missedBlocks/signedBlocksWindow*100))) : null;

  const latestHeight = statusR.status === 'fulfilled'
    ? Number(statusR.value?.result?.sync_info?.latest_block_height || 0) : 0;

  let votingPower = null;
  let proposedBlocks = [];

  if(identity.hex && latestHeight > 0){
    try{
      const validatorsData = await fetchJson(
        RPC + `/validators?height=${latestHeight}&page=1&per_page=100`
      );
      const values = validatorsData?.result?.validators || [];
      const match = values.find((item)=>String(item?.address || '').toUpperCase() === identity.hex);
      votingPower = match?.voting_power ?? null;
    }catch{}

    try{
      const minHeight = Math.max(1,latestHeight-19);
      const chain = await fetchJson(RPC + `/blockchain?minHeight=${minHeight}&maxHeight=${latestHeight}`);
      const metas = Array.isArray(chain?.result?.block_metas) ? chain.result.block_metas : [];
      proposedBlocks = metas
        .filter((meta)=>String(meta?.header?.proposer_address || '').toUpperCase() === identity.hex)
        .map((meta)=>({
          height:meta?.header?.height || null,
          time:meta?.header?.time || null,
          hash:meta?.block_id?.hash || null,
          txCount:Number(meta?.num_txs || 0)
        }))
        .sort((a,b)=>Number(b.height || 0)-Number(a.height || 0))
        .slice(0,12);
    }catch{}
  }

  return {
    operatorAddress:validator?.operator_address || operatorAddress,
    consensusAddress:identity.address,
    consensusHex:identity.hex,
    publicKey:identity.pubKey,
    moniker:validator?.description?.moniker || 'VALIDATOR',
    identity:validator?.description?.identity || null,
    website:validator?.description?.website || null,
    details:validator?.description?.details || null,
    status:validatorStatusLabel(validator?.status,!!validator?.jailed),
    jailed:!!validator?.jailed,
    tokens:validator?.tokens || null,
    votingPower,
    delegatorShares:validator?.delegator_shares || null,
    commissionRate:commission?.rate || null,
    commissionMaxRate:commission?.max_rate || null,
    commissionMaxChangeRate:commission?.max_change_rate || null,
    minSelfDelegation:validator?.min_self_delegation || null,
    signing:signing ? {
      missedBlocksCounter:signing?.missed_blocks_counter ?? null,
      indexOffset:signing?.index_offset ?? null,
      startHeight:signing?.start_height ?? null,
      jailedUntil:signing?.jailed_until ?? null,
      tombstoned:!!signing?.tombstoned,
      signedBlocksWindow:signedBlocksWindow || null,
      windowUptimePct
    } : null,
    proposedBlocks
  };
}

async function overview(){
  const status = await fetchJson(RPC + '/status');
  const sync = status?.result?.sync_info || {};
  const node = status?.result?.node_info || {};
  const latest = Number(sync.latest_block_height || 0);

  const heights = [];
  for(let h=latest;h>0 && heights.length<8;h--) heights.push(h);

  const blockResults = await Promise.allSettled(
    heights.map(h=>fetchJson(RPC + `/block?height=${h}`))
  );

  const blocks = blockResults
    .filter((item)=>item.status === 'fulfilled')
    .map((item)=>blockSummary(item.value));

  const [supplyR,validatorsR,poolR,totalTransactionsR] = await Promise.allSettled([
    fetchJson(API + '/cosmos/bank/v1beta1/supply/by_denom?denom=ugen'),
    fetchJson(API + '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100'),
    fetchJson(API + '/cosmos/staking/v1beta1/pool'),
    totalTransactionCount()
  ]);

  const validators = validatorsR.status === 'fulfilled' && Array.isArray(validatorsR.value?.validators)
    ? validatorsR.value.validators : [];

  return {
    chainId:node.network || 'genesis-1',
    height:sync.latest_block_height || null,
    latestTime:sync.latest_block_time || null,
    catchingUp:!!sync.catching_up,
    supplyAmount:supplyR.status === 'fulfilled' ? (supplyR.value?.amount?.amount ?? null) : null,
    validatorCount:validatorsR.status === 'fulfilled' ? validators.length : null,
    activeValidators:validatorsR.status === 'fulfilled' ? validators.length : null,
    validators:validators.map(validatorSummary),
    bondedAmount:poolR.status === 'fulfilled' ? (poolR.value?.pool?.bonded_tokens ?? null) : null,
    totalTransactions:totalTransactionsR.status === 'fulfilled' ? totalTransactionsR.value : null,
    totalBlocks:latest || null,
    averageBlockTimeSec:averageBlockTimeSeconds(blocks),
    blocks
  };
}

const server = http.createServer(async(req,res)=>{
  try{
    const u = new URL(req.url || '/',`http://${req.headers.host || 'localhost'}`);

    if(u.pathname==='/api/health') return sendJson(res,200,{ok:true,service:'genesis-web'});
    if(u.pathname==='/api/genesis/overview') return sendJson(res,200,await overview());


    if(u.pathname==='/api/genesis/transactions'){
      const limit = u.searchParams.get('limit') || '12';
      return sendJson(res,200,await recentTransactions(limit));
    }
    if(u.pathname==='/api/genesis/tx'){
      const hash = String(u.searchParams.get('hash') || '').toUpperCase();
      if(!validTxHash(hash)) return sendJson(res,400,{error:'invalid transaction hash'});
      return sendJson(res,200,{transaction:await transactionByHash(hash)});
    }


    if(u.pathname==='/api/genesis/block-detail'){
      const h = String(u.searchParams.get('height') || '');
      if(!/^\d+$/.test(h)) return sendJson(res,400,{error:'invalid height'});
      return sendJson(res,200,{block:await blockDetail(h)});
    }

    if(u.pathname==='/api/genesis/address'){
      const address = String(u.searchParams.get('address') || '').toLowerCase();
      const limit = u.searchParams.get('limit') || '30';
      if(!validAddress(address)) return sendJson(res,400,{error:'invalid genesis address'});
      return sendJson(res,200,await addressDetail(address,limit));
    }

    if(u.pathname==='/api/genesis/balance'){
      const address = String(u.searchParams.get('address') || '').toLowerCase();
      if(!validAddress(address)) return sendJson(res,400,{error:'invalid genesis address'});
      return sendJson(res,200,await fetchJson(API + `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`));
    }

    if(u.pathname==='/api/genesis/block'){
      const h = String(u.searchParams.get('height') || '');
      if(!/^\d+$/.test(h)) return sendJson(res,400,{error:'invalid height'});
      return sendJson(res,200,await fetchJson(RPC + `/block?height=${encodeURIComponent(h)}`));
    }


    if(u.pathname==='/api/genesis/validator'){
      const address = String(u.searchParams.get('address') || '').toLowerCase();
      if(!validValidatorAddress(address)) return sendJson(res,400,{error:'invalid validator operator address'});
      return sendJson(res,200,{validator:await validatorDetail(address)});
    }

    if(u.pathname==='/api/genesis/validators'){
      return sendJson(res,200,await fetchJson(API + '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100'));
    }

    let rel = decodeURIComponent(u.pathname);
    if(rel==='/') rel='/index.html';
    const file = path.resolve(ROOT,'.'+rel);
    if(!file.startsWith(ROOT)) return send(res,403,'Forbidden','text/plain; charset=utf-8');

    fs.stat(file,(err,st)=>{
      if(err || !st.isFile()) return send(res,404,'Not found','text/plain; charset=utf-8');
      res.writeHead(200,{
        'content-type':MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control':'no-store',
        'x-content-type-options':'nosniff'
      });
      fs.createReadStream(file).pipe(res);
    });
  }catch(e){
    sendJson(res,502,{error:'Genesis node unavailable'});
  }
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`GENESIS interface listening on 0.0.0.0:${PORT}`);
  console.log(`Genesis RPC: ${RPC}`);
  console.log(`Genesis API: ${API}`);
});
