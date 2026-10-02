#!/usr/bin/env python3
from pathlib import Path
import re

def need(s,m,label):
    if m not in s:
        raise SystemExit(f"ERROR: {label} marker not found")

p=Path("server.js")
s=p.read_text()

node2="const NODE2_RPC = String(process.env.GENESIS_NODE2_RPC_URL || 'http://127.0.0.1:26667').replace(/\\/+$/,'');"
if "GENESIS_PUBLIC_RATE_LIMIT" not in s:
    need(s,node2,"NODE2_RPC")
    s=s.replace(node2,node2+'''
const PUBLIC_RATE_LIMIT = Math.max(10,Math.min(1000,Number(process.env.GENESIS_PUBLIC_RATE_LIMIT || 120)));
const PUBLIC_MAX_BODY_BYTES = Math.max(1024,Math.min(262144,Number(process.env.GENESIS_PUBLIC_MAX_BODY_BYTES || 32768)));
const PUBLIC_RATE_WINDOW_MS = 60000;
''',1)

gateway=r'''
// GENESIS PUBLIC TESTNET ACCESS v1
const PUBLIC_RPC_METHODS = new Set([
  'health','status','net_info','block','block_by_hash','block_results',
  'commit','validators','consensus_params','tx','tx_search'
]);

const PUBLIC_REST_PATTERNS = [
  /^\/cosmos\/base\/tendermint\/v1beta1\/blocks\/(?:latest|\d+)$/,
  /^\/cosmos\/base\/tendermint\/v1beta1\/node_info$/,
  /^\/cosmos\/bank\/v1beta1\/balances\/gen1[0-9a-z]{20,}(?:\/by_denom)?$/,
  /^\/cosmos\/bank\/v1beta1\/supply(?:\/by_denom)?$/,
  /^\/cosmos\/staking\/v1beta1\/validators(?:\/genvaloper[0-9a-z]{20,})?$/,
  /^\/cosmos\/staking\/v1beta1\/pool$/,
  /^\/cosmos\/slashing\/v1beta1\/signing_infos(?:\/genvalcons[0-9a-z]{20,})?$/,
  /^\/cosmos\/auth\/v1beta1\/accounts\/gen1[0-9a-z]{20,}$/,
  /^\/cosmos\/tx\/v1beta1\/txs(?:\/[0-9A-Fa-f]{64})?$/
];

const publicRateBuckets = new Map();

function publicClientKey(req){
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
}

function publicRateTake(req){
  const now=Date.now();
  const key=publicClientKey(req);
  let b=publicRateBuckets.get(key);
  if(!b || now>=b.resetAt) b={count:0,resetAt:now+PUBLIC_RATE_WINDOW_MS};
  b.count+=1;
  publicRateBuckets.set(key,b);
  return {allowed:b.count<=PUBLIC_RATE_LIMIT,resetAt:b.resetAt};
}

function publicHeaders(extra={}){
  return {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-allow-headers':'Content-Type',
    'access-control-max-age':'600',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    ...extra
  };
}

function sendPublicJson(res,status,data,extra={}){
  res.writeHead(status,publicHeaders(extra));
  res.end(JSON.stringify(data));
}

function sendPublicEmpty(res,status=204){
  const h=publicHeaders();
  delete h['content-type'];
  res.writeHead(status,h);
  res.end();
}

async function readPublicJson(req){
  return await new Promise((resolve,reject)=>{
    let size=0,done=false;
    const chunks=[];
    req.on('data',(c)=>{
      if(done) return;
      size+=c.length;
      if(size>PUBLIC_MAX_BODY_BYTES){
        done=true;
        reject(Object.assign(new Error('too large'),{statusCode:413}));
        return;
      }
      chunks.push(c);
    });
    req.on('end',()=>{
      if(done) return;
      done=true;
      try{
        const raw=Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      }catch{
        reject(Object.assign(new Error('bad json'),{statusCode:400}));
      }
    });
    req.on('error',(e)=>{if(!done){done=true;reject(e)}});
  });
}

function publicRestAllowed(pathname){
  return PUBLIC_REST_PATTERNS.some((r)=>r.test(pathname));
}

async function publicInfo(){
  const [rpcR,restR]=await Promise.allSettled([
    fetchJson(RPC+'/status'),
    fetchJson(API+'/cosmos/base/tendermint/v1beta1/blocks/latest')
  ]);
  const st=rpcR.status==='fulfilled' ? rpcR.value : null;
  const sync=st?.result?.sync_info || {};
  const node=st?.result?.node_info || {};
  return {
    gateway:'ONLINE',
    readOnly:true,
    chainId:node?.network || 'genesis-1',
    height:sync?.latest_block_height || null,
    rpcOnline:rpcR.status==='fulfilled',
    restOnline:restR.status==='fulfilled',
    cors:'*',
    rateLimitPerMinute:PUBLIC_RATE_LIMIT,
    maxRequestBytes:PUBLIC_MAX_BODY_BYTES,
    nativeAsset:{symbol:'GEN',baseDenom:'ugen',decimals:6},
    endpoints:{
      info:'/api/public/info',
      health:'/api/public/health',
      rpc:'/api/public/rpc',
      restBase:'/api/public/rest'
    },
    rpcMethods:[...PUBLIC_RPC_METHODS],
    rawValidatorPortsPublic:false
  };
}

async function publicHealth(){
  const [rpcR,restR]=await Promise.allSettled([
    fetchJson(RPC+'/status'),
    fetchJson(API+'/cosmos/base/tendermint/v1beta1/blocks/latest')
  ]);
  const sync=rpcR.status==='fulfilled' ? rpcR.value?.result?.sync_info || {} : {};
  return {
    ok:rpcR.status==='fulfilled' && restR.status==='fulfilled',
    rpc:rpcR.status==='fulfilled',
    rest:restR.status==='fulfilled',
    height:sync?.latest_block_height || null
  };
}

async function publicRpc(req,res){
  if(req.method!=='POST'){
    return sendPublicJson(res,405,{error:'method not allowed'},{allow:'POST, OPTIONS'});
  }

  let body;
  try{body=await readPublicJson(req)}
  catch(e){
    return sendPublicJson(res,e?.statusCode || 400,{
      jsonrpc:'2.0',id:null,error:{code:-32600,message:e?.statusCode===413?'request too large':'invalid request'}
    });
  }

  if(!body || Array.isArray(body) || body.jsonrpc!=='2.0' || typeof body.method!=='string'){
    return sendPublicJson(res,400,{
      jsonrpc:'2.0',id:body?.id ?? null,error:{code:-32600,message:'invalid JSON-RPC request'}
    });
  }

  if(!PUBLIC_RPC_METHODS.has(body.method)){
    return sendPublicJson(res,403,{
      jsonrpc:'2.0',id:body.id ?? null,
      error:{code:-32601,message:'method blocked by read-only public gateway'}
    });
  }

  try{
    const up=await rpcJson(body.method,body.params ?? {});
    return sendPublicJson(res,200,{jsonrpc:'2.0',id:body.id ?? null,result:up?.result ?? null});
  }catch{
    return sendPublicJson(res,502,{
      jsonrpc:'2.0',id:body.id ?? null,error:{code:-32000,message:'Genesis RPC unavailable'}
    });
  }
}

async function publicRest(req,res,u){
  if(req.method!=='GET'){
    return sendPublicJson(res,405,{error:'method not allowed'},{allow:'GET, OPTIONS'});
  }

  let target=u.pathname.slice('/api/public/rest'.length);
  try{target=decodeURIComponent(target)}catch{return sendPublicJson(res,400,{error:'invalid path'})}

  if(!target.startsWith('/') || target.includes('..') || target.includes('\\') || !publicRestAllowed(target)){
    return sendPublicJson(res,403,{error:'REST path blocked by read-only public gateway'});
  }

  try{return sendPublicJson(res,200,await fetchJson(API+target+u.search))}
  catch{return sendPublicJson(res,502,{error:'Genesis REST unavailable'})}
}

async function handlePublicGateway(req,res,u){
  if(req.method==='OPTIONS') return sendPublicEmpty(res,204);

  const rate=publicRateTake(req);
  if(!rate.allowed){
    return sendPublicJson(res,429,{error:'rate limit exceeded',limitPerMinute:PUBLIC_RATE_LIMIT},{
      'retry-after':String(Math.max(1,Math.ceil((rate.resetAt-Date.now())/1000)))
    });
  }

  if((u.pathname==='/api/public' || u.pathname==='/api/public/info') && req.method==='GET'){
    return sendPublicJson(res,200,await publicInfo());
  }
  if(u.pathname==='/api/public/health' && req.method==='GET'){
    return sendPublicJson(res,200,await publicHealth());
  }
  if(u.pathname==='/api/public/rpc') return await publicRpc(req,res);
  if(u.pathname==='/api/public/rest' || u.pathname.startsWith('/api/public/rest/')){
    return await publicRest(req,res,u);
  }
  return sendPublicJson(res,404,{error:'public gateway endpoint not found'});
}

'''

if "GENESIS PUBLIC TESTNET ACCESS v1" not in s:
    marker="// GENESIS TRANSACTIONS EXPLORER v1\n"
    need(s,marker,"transactions explorer")
    s=s.replace(marker,gateway+marker,1)

route="    if(u.pathname==='/api/health') return sendJson(res,200,{ok:true,service:'genesis-web'});\n"
if "u.pathname.startsWith('/api/public')" not in s:
    need(s,route,"health route")
    s=s.replace(route,
        "    if(u.pathname==='/api/public' || u.pathname.startsWith('/api/public/')) return await handlePublicGateway(req,res,u);\n\n"+route,1)

p.write_text(s)

p=Path(".replit")
s=p.read_text()
if "GENESIS PUBLIC TESTNET ACCESS v1" not in s:
    raw={1317,26656,26657,26666,26667}
    pat=re.compile(r'(?ms)(^|\n)\[\[ports\]\]\nlocalPort\s*=\s*(\d+)\nexternalPort\s*=\s*(\d+)\n?')
    def repl(m):
        return m.group(1) if int(m.group(2)) in raw else m.group(0)
    s=pat.sub(repl,s)
    marker='[[ports]]\nlocalPort = 3000\nexternalPort = 80'
    need(s,marker,"web port")
    s=s.replace(marker,
        '# GENESIS PUBLIC TESTNET ACCESS v1\n'
        '# Only the web gateway is explicitly published. Validator services remain local.\n'
        + marker,1)
p.write_text(s)

for name,mode in (("run-chain.sh","--primary-only"),("run-node2.sh","--node2-only")):
    p=Path(name)
    s=p.read_text()
    if "secure-private-bindings.sh" not in s:
        marker='if [ ! -f "$HOME_DIR/config/genesis.json" ]; then\n'
        need(s,marker,name)
        insert=f'''if [ -x "$ROOT/secure-private-bindings.sh" ]; then
  "$ROOT/secure-private-bindings.sh" {mode}
fi

'''
        s=s.replace(marker,insert+marker,1)
    p.write_text(s)

print("Genesis Public Testnet Access v1 applied.")
