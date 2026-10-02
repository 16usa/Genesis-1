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

  const [supplyR,validatorsR] = await Promise.allSettled([
    fetchJson(API + '/cosmos/bank/v1beta1/supply/by_denom?denom=ugen'),
    fetchJson(API + '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100')
  ]);

  return {
    chainId:node.network || 'genesis-1',
    height:sync.latest_block_height || null,
    latestTime:sync.latest_block_time || null,
    catchingUp:!!sync.catching_up,
    supplyAmount:supplyR.status==='fulfilled' ? (supplyR.value?.amount?.amount ?? null) : null,
    validatorCount:validatorsR.status==='fulfilled' && Array.isArray(validatorsR.value?.validators)
      ? validatorsR.value.validators.length : null,
    blocks:blockResults.filter(x=>x.status==='fulfilled').map(x=>blockSummary(x.value))
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
