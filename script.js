(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const header = $('siteHeader');
  const menuButton = $('menuButton');
  const mobileMenu = $('mobileMenu');
  let lastBlockTime = null;
  let currentAddress = '';

  const text = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  const short = (v, a=8, b=6) => {
    if (!v) return '—';
    const s = String(v);
    return s.length > a+b+3 ? `${s.slice(0,a)}…${s.slice(-b)}` : s;
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };

  const fmtGen = (micro) => {
    const n = Number(micro || 0) / 1_000_000;
    if (!Number.isFinite(n)) return '— GEN';
    return `${n.toLocaleString(undefined,{maximumFractionDigits:6})} GEN`;
  };

  async function getJson(url) {
    const r = await fetch(url,{cache:'no-store'});
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  function setMenu(open) {
    menuButton?.classList.toggle('open',open);
    mobileMenu?.classList.toggle('open',open);
    menuButton?.setAttribute('aria-expanded',String(open));
    mobileMenu?.setAttribute('aria-hidden',String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  menuButton?.addEventListener('click',()=>setMenu(!mobileMenu.classList.contains('open')));
  mobileMenu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));

  addEventListener('scroll',()=>{
    header?.classList.toggle('scrolled',scrollY > 24);
  },{passive:true});

  function setOnline(online, catchingUp=false) {
    text('headerStatus',online ? (catchingUp?'SYNCING':'LIVE') : 'OFFLINE');
    text('networkState',online ? (catchingUp?'SYNCING':'LIVE') : 'OFFLINE');
    text('syncStatus',online ? (catchingUp?'SYNCING':'READY') : 'OFFLINE');

    $('statusDot')?.classList.toggle('online',online);
    $('networkStateWrap')?.classList.toggle('online',online);
  }

  function renderBlocks(blocks=[]) {
    const list = $('blocksList');
    if (!list) return;
    const clean = blocks.filter(Boolean).slice(0,8);
    if (!clean.length) {
      list.innerHTML = `
        <div class="data-row placeholder-row">
          <strong>—</strong><span>WAITING FOR RPC</span><span>—</span><code>—</code><span class="row-arrow">↗</span>
        </div>`;
      return;
    }
    list.innerHTML = clean.map(b=>`
      <div class="data-row">
        <strong>${b.height || '—'}</strong>
        <span>${fmtTime(b.time)}</span>
        <span>${b.txCount ?? 0} TX</span>
        <code>${short(b.proposer,10,8)}</code>
        <span class="row-arrow">↗</span>
      </div>`).join('');
  }


  // GENESIS TRANSACTIONS EXPLORER v1
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const fmtCoin = (coin) => {
    if (!coin) return '—';
    if (coin.denom === 'ugen') return fmtGen(coin.amount);
    return `${coin.amount ?? '—'} ${String(coin.denom || '').toUpperCase()}`.trim();
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString([],{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).toUpperCase();
  };
  function renderTransactions(transactions=[]) {
    const list = $('transactionsList');
    if (!list) return;
    const clean = transactions.filter((tx)=>tx && tx.hash).slice(0,12);
    if (!clean.length) {
      list.innerHTML = `<div class="tx-row tx-placeholder"><span class="tx-cell tx-hash" data-label="TX HASH"><code>—</code></span><span class="tx-cell tx-block" data-label="BLOCK">—</span><span class="tx-cell tx-from" data-label="FROM"><code>NO TRANSACTIONS YET</code></span><span class="tx-cell tx-to" data-label="TO"><code>—</code></span><span class="tx-cell tx-amount" data-label="AMOUNT">—</span><span class="tx-cell tx-fee" data-label="FEE">—</span><span class="tx-cell tx-status" data-label="STATUS">—</span><span class="tx-cell tx-time" data-label="TIME">—</span><span class="tx-arrow">↗</span></div>`;
      return;
    }
    list.innerHTML = clean.map((tx)=>{
      const statusClass = tx.status === 'SUCCESS' ? 'success' : 'failed';
      return `<button class="tx-row" type="button" data-tx-hash="${escapeHtml(tx.hash)}" aria-label="Open transaction ${escapeHtml(tx.hash)}"><span class="tx-cell tx-hash" data-label="TX HASH"><code>${escapeHtml(short(tx.hash,10,8))}</code></span><span class="tx-cell tx-block" data-label="BLOCK">#${escapeHtml(tx.height || '—')}</span><span class="tx-cell tx-from" data-label="FROM"><code>${escapeHtml(short(tx.from,9,7))}</code></span><span class="tx-cell tx-to" data-label="TO"><code>${escapeHtml(short(tx.to,9,7))}</code></span><span class="tx-cell tx-amount" data-label="AMOUNT">${escapeHtml(fmtCoin(tx.amount))}</span><span class="tx-cell tx-fee" data-label="FEE">${escapeHtml(fmtCoin(tx.fee))}</span><span class="tx-cell tx-status ${statusClass}" data-label="STATUS">${escapeHtml(tx.status || '—')}</span><span class="tx-cell tx-time" data-label="TIME">${escapeHtml(fmtTime(tx.timestamp))}</span><span class="tx-arrow">↗</span></button>`;
    }).join('');
  }
  function setTxModal(open) {
    const modal = $('txModal');
    if (!modal) return;
    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('tx-modal-open',open);
  }
  function renderTxDetail(tx) {
    text('txDetailHash',tx?.hash || '—');
    text('txDetailBlock',tx?.height ? `#${tx.height}` : '—');
    text('txDetailFrom',tx?.from || '—');
    text('txDetailTo',tx?.to || '—');
    text('txDetailAmount',fmtCoin(tx?.amount));
    text('txDetailFee',fmtCoin(tx?.fee));
    text('txDetailStatus',tx?.status || '—');
    text('txDetailTime',fmtDateTime(tx?.timestamp));
    text('txDetailGas',tx?.gasUsed ? `${tx.gasUsed} / ${tx.gasWanted || '—'}` : '—');
  }
  async function openTransaction(hash) {
    const normalized = String(hash || '').trim().toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(normalized)) {
      text('txDetailHash','INVALID TRANSACTION HASH');
      return;
    }
    renderTxDetail({hash:normalized,status:'LOADING'});
    setTxModal(true);
    try {
      const data = await getJson(`/api/genesis/tx?hash=${encodeURIComponent(normalized)}`);
      renderTxDetail(data.transaction || {});
    } catch {
      renderTxDetail({hash:normalized,status:'UNAVAILABLE'});
    }
  }
  async function loadTransactions() {
    try {
      const data = await getJson('/api/genesis/transactions?limit=12');
      renderTransactions(data.transactions || []);
    } catch {
      const list = $('transactionsList');
      if (list) list.innerHTML = `<div class="tx-row tx-placeholder"><span class="tx-cell tx-hash" data-label="TX HASH"><code>—</code></span><span class="tx-cell tx-block" data-label="BLOCK">—</span><span class="tx-cell tx-from" data-label="FROM"><code>TRANSACTION API UNAVAILABLE</code></span><span class="tx-cell tx-to" data-label="TO"><code>—</code></span><span class="tx-cell tx-amount" data-label="AMOUNT">—</span><span class="tx-cell tx-fee" data-label="FEE">—</span><span class="tx-cell tx-status" data-label="STATUS">—</span><span class="tx-cell tx-time" data-label="TIME">—</span><span class="tx-arrow">↗</span></div>`;
    }
  }

  async function lookupAddress(address) {
    const a = String(address || '').trim().toLowerCase();
    if (!/^gen1[0-9a-z]{20,}$/.test(a)) {
      text('addressValue',a ? 'INVALID GEN1 ADDRESS' : 'NOT SELECTED');
      text('addressBalance','— GEN');
      return;
    }

    currentAddress = a;
    text('addressValue',short(a,14,11));
    text('addressBalance','LOADING…');

    try {
      const d = await getJson(`/api/genesis/balance?address=${encodeURIComponent(a)}`);
      const coin = (d.balances || []).find(x=>x.denom === 'ugen');
      text('addressBalance',fmtGen(coin ? coin.amount : 0));
    } catch {
      text('addressBalance','UNAVAILABLE');
    }
  }

  $('addressForm')?.addEventListener('submit',(e)=>{
    e.preventDefault();
    lookupAddress($('addressInput')?.value || '');
  });


  $('transactionsList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-tx-hash]');
    if (row?.dataset?.txHash) openTransaction(row.dataset.txHash);
  });
  $('txSearchForm')?.addEventListener('submit',(event)=>{
    event.preventDefault();
    openTransaction($('txSearchInput')?.value || '');
  });
  $('txModalClose')?.addEventListener('click',()=>setTxModal(false));
  $('txModal')?.querySelectorAll('[data-tx-close]').forEach((element)=>element.addEventListener('click',()=>setTxModal(false)));
  addEventListener('keydown',(event)=>{if (event.key === 'Escape') setTxModal(false);});

  async function refresh() {
    try {
      const d = await getJson('/api/genesis/overview');
      const chainId = (d.chainId || 'genesis-1').toUpperCase();
      const height = d.height || '—';

      text('chainId',chainId);
      text('verifyChainId',chainId);
      text('blockHeight',height);
      text('verifyHeight',height);

      if (d.supplyAmount != null) text('totalSupply',fmtGen(d.supplyAmount));

      if (d.latestTime) {
        if (lastBlockTime && d.latestTime !== lastBlockTime) {
          const sec = Math.max(0,(new Date(d.latestTime)-new Date(lastBlockTime))/1000);
          if (Number.isFinite(sec) && sec > 0 && sec < 120) text('blockTime',`${sec.toFixed(1)} SEC`);
        }
        lastBlockTime = d.latestTime;
      }

      if (d.validatorCount != null) {
        text('validatorCount',String(d.validatorCount));
        text('validatorSummary',`${d.validatorCount} BONDED VALIDATOR${d.validatorCount===1?'':'S'} CURRENTLY SECURE THE NETWORK.`);
      } else {
        text('validatorCount','—');
        text('validatorSummary','STAKING API UNAVAILABLE.');
      }

      text('networkCopy',d.catchingUp
        ? 'GENESIS NODE IS ONLINE AND SYNCHRONIZING. ALL VISIBLE NETWORK VALUES ARE READ DIRECTLY FROM RPC / API.'
        : 'GENESIS NETWORK IS ONLINE. BLOCKS, SUPPLY AND VALIDATOR STATE ARE READ DIRECTLY FROM THE BLOCKCHAIN.');

      setOnline(true,!!d.catchingUp);
      renderBlocks(d.blocks || []);

      if (currentAddress) lookupAddress(currentAddress);
    } catch {
      text('blockHeight','—');
      text('verifyHeight','—');
      text('blockTime','—');
      text('networkCopy','WAITING FOR GENESIS RPC. NO SIMULATED BLOCKCHAIN ACTIVITY IS DISPLAYED WHILE THE NODE IS OFFLINE.');
      text('validatorSummary','WAITING FOR STAKING API.');
      text('validatorCount','—');
      setOnline(false);
      renderBlocks([]);
    }
  }

  setTimeout(refresh,120);
  setInterval(refresh,5000);
  setTimeout(loadTransactions,240);
  setInterval(loadTransactions,7000);
})();
