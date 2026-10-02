const http = require('http');
const fs = require('fs');
const path = require('path');

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
