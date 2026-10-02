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
    return `${n.toLocaleString('en-US',{maximumFractionDigits:6})} GEN`;
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
      <button class="data-row data-row-button" type="button" data-block-height="${escapeHtml(b.height || '')}" aria-label="Open block ${escapeHtml(b.height || '')}">
        <strong>${escapeHtml(b.height || '—')}</strong>
        <span>${escapeHtml(fmtTime(b.time))}</span>
        <span>${escapeHtml(b.txCount ?? 0)} TX</span>
        <code>${escapeHtml(short(b.proposer,10,8))}</code>
        <span class="row-arrow">↗</span>
      </button>`).join('');
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
    return d.toLocaleString('en-US',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'UTC'}).replace(',', '').toUpperCase() + ' UTC';
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

    const blockLink = $('txDetailBlock');
    const fromLink = $('txDetailFrom');
    const toLink = $('txDetailTo');
    if (blockLink) blockLink.dataset.blockHeight = tx?.height || '';
    if (fromLink) fromLink.dataset.address = tx?.from || '';
    if (toLink) toLink.dataset.address = tx?.to || '';
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


  // GENESIS BLOCK + ADDRESS EXPLORER v1
  function setBlockModal(open) {
    const modal = $('blockModal');
    if (!modal) return;
    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('tx-modal-open',open);
  }

  const addressExplorerState = {
    address:'',
    filter:'all',
    page:1,
    limit:10,
    hasPrev:false,
    hasNext:false
  };

  function setAddressModal(open) {
    const modal = $('addressModal');
    if (!modal) return;
    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('tx-modal-open',open);
  }

  function fmtActivityDate(iso) {
    if(!iso) return '—';
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US',{
      year:'numeric',
      month:'short',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false,
      timeZone:'UTC'
    }).replace(',', '').toUpperCase() + ' UTC';
  }

  function renderAddressTransactions(address,transactions=[]) {
    const list = $('addressTxList');
    if (!list) return;
    const a = String(address || '').toLowerCase();
    const clean = transactions.filter((tx)=>tx && tx.hash);

    if (!clean.length) {
      list.innerHTML = '<div class="entity-empty">NO INDEXED TRANSACTIONS</div>';
      return;
    }

    list.innerHTML = clean.map((tx)=>{
      const sent = String(tx.from || '').toLowerCase() === a;
      const peer = sent ? tx.to : tx.from;
      return `
        <div class="address-activity-card">
          <button class="address-tx-open" type="button" data-tx-hash="${escapeHtml(tx.hash)}">
            <span class="entity-activity-main">
              <b>${sent ? 'SENT' : 'RECEIVED'} · ${escapeHtml(fmtCoin(tx.amount))}</b>
              <code>${escapeHtml(short(tx.hash,16,12))}</code>
            </span>
            <span class="entity-activity-meta">#${escapeHtml(tx.height || '—')} · ${escapeHtml(fmtTime(tx.timestamp))}</span>
            <span class="entity-activity-arrow">↗</span>
          </button>
          <button class="address-peer-open" type="button" data-address-open="${escapeHtml(peer || '')}">
            <span>${sent ? 'TO' : 'FROM'}</span>
            <code>${escapeHtml(peer || '—')}</code>
          </button>
        </div>
      `;
    }).join('');
  }

  function renderAddressDetail(data={}) {
    const address = String(data?.address || addressExplorerState.address || '').toLowerCase();
    const coin = (data?.balances || []).find((item)=>item?.denom === 'ugen');
    const pagination = data?.pagination || {};

    addressExplorerState.address = address;
    addressExplorerState.filter = String(data?.filter || addressExplorerState.filter || 'all');
    addressExplorerState.page = Number(pagination?.page || 1);
    addressExplorerState.hasPrev = !!pagination?.hasPrev;
    addressExplorerState.hasNext = !!pagination?.hasNext;

    text('addressDetailAddress',address || '—');
    text('addressDetailBalance',fmtGen(coin ? coin.amount : 0));
    text('addressDetailTxCount',String(data?.indexedTransactionCount ?? 0));
    text('addressDetailSentCount',String(data?.sentCount ?? 0));
    text('addressDetailReceivedCount',String(data?.receivedCount ?? 0));
    text('addressDetailSentAmount',data?.sentAmountMicro != null ? fmtGen(data.sentAmountMicro) : '—');
    text('addressDetailReceivedAmount',data?.receivedAmountMicro != null ? fmtGen(data.receivedAmountMicro) : '—');
    text('addressDetailFirstActivity',fmtActivityDate(data?.firstActivity));
    text('addressDetailLastActivity',fmtActivityDate(data?.lastActivity));
    text('addressPageIndicator',`PAGE ${pagination?.page || 1} / ${pagination?.pages || 1}`);

    document.querySelectorAll('[data-address-filter]').forEach((button)=>{
      button.classList.toggle('active',button.dataset.addressFilter === addressExplorerState.filter);
    });

    const prev = $('addressPrevPage');
    const next = $('addressNextPage');
    if(prev) prev.disabled = !addressExplorerState.hasPrev;
    if(next) next.disabled = !addressExplorerState.hasNext;

    renderAddressTransactions(address,data?.transactions || []);
  }

  async function loadAddressPage() {
    const a = addressExplorerState.address;
    if(!a) return;

    const list = $('addressTxList');
    if(list) list.innerHTML = '<div class="entity-empty">LOADING…</div>';

    try {
      const params = new URLSearchParams({
        address:a,
        filter:addressExplorerState.filter,
        page:String(addressExplorerState.page),
        limit:String(addressExplorerState.limit)
      });
      const data = await getJson(`/api/genesis/address?${params.toString()}`);
      renderAddressDetail(data || {});
    } catch {
      text('addressDetailBalance','UNAVAILABLE');
      if (list) list.innerHTML = '<div class="entity-empty">ADDRESS API UNAVAILABLE</div>';
    }
  }

  async function openAddress(address) {
    const a = String(address || '').trim().toLowerCase();
    if (!/^gen1[0-9a-z]{20,}$/.test(a)) return;

    setTxModal(false);
    setBlockModal(false);
    setValidatorModal(false);

    addressExplorerState.address = a;
    addressExplorerState.filter = 'all';
    addressExplorerState.page = 1;
    addressExplorerState.hasPrev = false;
    addressExplorerState.hasNext = false;

    renderAddressDetail({
      address:a,
      balances:[],
      indexedTransactionCount:'—',
      sentCount:'—',
      receivedCount:'—',
      sentAmountMicro:null,
      receivedAmountMicro:null,
      firstActivity:null,
      lastActivity:null,
      transactions:[],
      filter:'all',
      pagination:{page:1,pages:1,hasPrev:false,hasNext:false}
    });
    text('addressDetailBalance','LOADING…');
    setAddressModal(true);
    await loadAddressPage();
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


  // GENESIS GLOBAL SEARCH v1
  function setGlobalSearch(open) {
    const modal = $('globalSearch');
    if(!modal) return;

    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('global-search-open',open);

    if(open){
      setMenu(false);
      text('globalSearchStatus','AUTO-DETECTS THE IDENTIFIER TYPE.');
      setTimeout(()=>{
        const input = $('globalSearchInput');
        if(input){
          input.focus({preventScroll:true});
          input.select();
        }
      },40);
    }
  }

  function detectGlobalSearchType(rawValue) {
    const value = String(rawValue || '').trim();
    const lower = value.toLowerCase();
    const upper = value.toUpperCase();

    if(/^[0-9A-F]{64}$/.test(upper)){
      return {type:'transaction',value:upper};
    }

    if(/^genvaloper1[0-9a-z]{20,}$/.test(lower)){
      return {type:'validator',value:lower};
    }

    if(/^gen1[0-9a-z]{20,}$/.test(lower)){
      return {type:'address',value:lower};
    }

    const blockMatch = value.match(/^#?([0-9]+)$/);
    if(blockMatch){
      return {type:'block',value:blockMatch[1]};
    }

    return {type:null,value};
  }

  function runGlobalSearch(rawValue) {
    const result = detectGlobalSearchType(rawValue);

    if(!result.value){
      text('globalSearchStatus','ENTER A BLOCK, TX HASH, ADDRESS OR VALIDATOR.');
      return;
    }

    if(!result.type){
      text('globalSearchStatus','UNRECOGNIZED IDENTIFIER.');
      return;
    }

    if(result.type === 'transaction'){
      setGlobalSearch(false);
      openTransaction(result.value);
      return;
    }

    if(result.type === 'validator'){
      setGlobalSearch(false);
      openValidator(result.value);
      return;
    }

    if(result.type === 'address'){
      setGlobalSearch(false);
      openAddress(result.value);
      return;
    }

    if(result.type === 'block'){
      setGlobalSearch(false);
      openBlock(result.value);
    }
  }

  $('addressForm')?.addEventListener('submit',(e)=>{
    e.preventDefault();
    lookupAddress($('addressInput')?.value || '');
  });




  $('globalSearchTrigger')?.addEventListener('click',()=>setGlobalSearch(true));
  $('globalSearchClose')?.addEventListener('click',()=>setGlobalSearch(false));
  $('globalSearch')?.querySelectorAll('[data-global-search-close]').forEach((element)=>{
    element.addEventListener('click',()=>setGlobalSearch(false));
  });
  $('globalSearchForm')?.addEventListener('submit',(event)=>{
    event.preventDefault();
    runGlobalSearch($('globalSearchInput')?.value || '');
  });

  $('blocksList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-block-height]');
    if (row?.dataset?.blockHeight) openBlock(row.dataset.blockHeight);
  });

  $('txDetailBlock')?.addEventListener('click',()=>{
    const height = $('txDetailBlock')?.dataset?.blockHeight;
    if (height) openBlock(height);
  });
  $('txDetailFrom')?.addEventListener('click',()=>{
    const address = $('txDetailFrom')?.dataset?.address;
    if (address) openAddress(address);
  });
  $('txDetailTo')?.addEventListener('click',()=>{
    const address = $('txDetailTo')?.dataset?.address;
    if (address) openAddress(address);
  });

  $('addressValue')?.addEventListener('click',()=>{
    if (currentAddress) openAddress(currentAddress);
  });

  $('blockModalClose')?.addEventListener('click',()=>setBlockModal(false));
  $('blockModal')?.querySelectorAll('[data-block-close]').forEach((element)=>element.addEventListener('click',()=>setBlockModal(false)));
  $('addressModalClose')?.addEventListener('click',()=>setAddressModal(false));
  $('addressModal')?.querySelectorAll('[data-address-close]').forEach((element)=>element.addEventListener('click',()=>setAddressModal(false)));

  $('blockTxList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-tx-hash]');
    if (!row?.dataset?.txHash) return;
    setBlockModal(false);
    openTransaction(row.dataset.txHash);
  });
  $('addressTxList')?.addEventListener('click',(event)=>{
    const addressButton = event.target.closest('[data-address-open]');
    if(addressButton?.dataset?.addressOpen){
      openAddress(addressButton.dataset.addressOpen);
      return;
    }

    const row = event.target.closest('[data-tx-hash]');
    if (!row?.dataset?.txHash) return;
    setAddressModal(false);
    openTransaction(row.dataset.txHash);
  });

  $('addressFilterGroup')?.addEventListener('click',(event)=>{
    const button = event.target.closest('[data-address-filter]');
    if(!button?.dataset?.addressFilter) return;
    addressExplorerState.filter = button.dataset.addressFilter;
    addressExplorerState.page = 1;
    loadAddressPage();
  });

  $('addressPrevPage')?.addEventListener('click',()=>{
    if(!addressExplorerState.hasPrev) return;
    addressExplorerState.page = Math.max(1,addressExplorerState.page-1);
    loadAddressPage();
  });

  $('addressNextPage')?.addEventListener('click',()=>{
    if(!addressExplorerState.hasNext) return;
    addressExplorerState.page += 1;
    loadAddressPage();
  });

  $('addressCopyButton')?.addEventListener('click',async()=>{
    const value = addressExplorerState.address;
    if(!value) return;
    const button = $('addressCopyButton');
    try{
      await navigator.clipboard.writeText(value);
      if(button) button.textContent = 'COPIED';
      setTimeout(()=>{if(button) button.textContent='COPY';},1200);
    }catch{
      if(button) button.textContent = 'COPY FAILED';
      setTimeout(()=>{if(button) button.textContent='COPY';},1200);
    }
  });


  $('validatorList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-validator-address]');
    if(row?.dataset?.validatorAddress) openValidator(row.dataset.validatorAddress);
  });

  $('validatorModalClose')?.addEventListener('click',()=>setValidatorModal(false));
  $('validatorModal')?.querySelectorAll('[data-validator-close]').forEach((element)=>element.addEventListener('click',()=>setValidatorModal(false)));

  $('validatorBlocksList')?.addEventListener('click',(event)=>{
    const row = event.target.closest('[data-block-height]');
    if(!row?.dataset?.blockHeight) return;
    setValidatorModal(false);
    openBlock(row.dataset.blockHeight);
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
  addEventListener('keydown',(event)=>{
    if(event.key === 'Escape'){
      setGlobalSearch(false);
      setTxModal(false);
      setBlockModal(false);
      setAddressModal(false);
      setValidatorModal(false);
      return;
    }

    if(event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey){
      const tag = String(document.activeElement?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
      if(!isTyping){
        event.preventDefault();
        setGlobalSearch(true);
      }
    }
  });


  // GENESIS VALIDATOR EXPLORER v1
  const validatorStatusText = (value) => {
    const status = String(value || '').toUpperCase();
    if(status.includes('JAILED')) return 'JAILED';
    if(status.includes('UNBONDING')) return 'UNBONDING';
    if(status.includes('UNBONDED')) return 'UNBONDED';
    if(status.includes('BONDED')) return 'BONDED';
    return status || 'UNKNOWN';
  };
  const fmtPercent = (value) => {
    const n = Number(value);
    if(!Number.isFinite(n)) return '—';
    return `${(n*100).toLocaleString('en-US',{maximumFractionDigits:2})}%`;
  };
  const fmtPlainNumber = (value) => {
    const n = Number(value);
    if(!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US',{maximumFractionDigits:6});
  };

  function renderValidators(validators=[]) {
    const list = $('validatorList');
    if(!list) return;
    const clean = validators.filter((validator)=>validator?.operatorAddress);
    if(!clean.length){
      list.innerHTML = `<div class="validator-row validator-placeholder"><span class="validator-main"><b>WAITING FOR STAKING API</b><code>—</code></span><span>—</span><span>—</span><span>—</span><span class="validator-arrow">↗</span></div>`;
      return;
    }

    list.innerHTML = clean.map((validator)=>`
      <button class="validator-row" type="button" data-validator-address="${escapeHtml(validator.operatorAddress)}" aria-label="Open validator ${escapeHtml(validator.moniker || '')}">
        <span class="validator-main">
          <b>${escapeHtml(validator.moniker || 'VALIDATOR')}</b>
          <code>${escapeHtml(short(validator.operatorAddress,16,12))}</code>
        </span>
        <span class="validator-status">${escapeHtml(validatorStatusText(validator.status))}</span>
        <span>${escapeHtml(fmtGen(validator.tokens))}</span>
        <span>${escapeHtml(fmtPercent(validator.commissionRate))}</span>
        <span class="validator-arrow">↗</span>
      </button>
    `).join('');
  }

  function setValidatorModal(open) {
    const modal = $('validatorModal');
    if(!modal) return;
    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('tx-modal-open',open);
  }

  function renderValidatorBlocks(blocks=[]) {
    const list = $('validatorBlocksList');
    if(!list) return;
    const clean = blocks.filter((block)=>block?.height);
    if(!clean.length){
      list.innerHTML = '<div class="entity-empty">NO PROPOSED BLOCKS IN RECENT WINDOW</div>';
      return;
    }
    list.innerHTML = clean.map((block)=>`
      <button class="entity-activity-row validator-block-row" type="button" data-block-height="${escapeHtml(block.height)}">
        <span class="entity-activity-main">
          <b>BLOCK #${escapeHtml(block.height)}</b>
          <code>${escapeHtml(short(block.hash,16,12))}</code>
        </span>
        <span class="entity-activity-meta">${escapeHtml(fmtTime(block.time))} · ${escapeHtml(block.txCount ?? 0)} TX</span>
        <span class="entity-activity-arrow">↗</span>
      </button>
    `).join('');
  }

  function renderValidatorDetail(validator={}) {
    text('validatorDetailMoniker',validator?.moniker || '—');
    text('validatorDetailOperator',validator?.operatorAddress || '—');
    text('validatorDetailConsensus',validator?.consensusAddress || '—');
    text('validatorDetailStatus',validatorStatusText(validator?.status));
    text('validatorDetailTokens',fmtGen(validator?.tokens));
    text('validatorDetailPower',validator?.votingPower != null ? fmtPlainNumber(validator.votingPower) : '—');
    text('validatorDetailShares',validator?.delegatorShares != null ? fmtPlainNumber(validator.delegatorShares) : '—');
    text('validatorDetailCommission',fmtPercent(validator?.commissionRate));
    text('validatorDetailMaxCommission',fmtPercent(validator?.commissionMaxRate));
    text('validatorDetailMaxChange',fmtPercent(validator?.commissionMaxChangeRate));
    text('validatorDetailMissed',validator?.signing?.missedBlocksCounter != null ? String(validator.signing.missedBlocksCounter) : '—');
    text('validatorDetailUptime',validator?.signing?.windowUptimePct != null
      ? `${Number(validator.signing.windowUptimePct).toFixed(2)}%` : '—');
    text('validatorDetailPubKey',validator?.publicKey || '—');
    renderValidatorBlocks(validator?.proposedBlocks || []);
  }

  async function openValidator(address) {
    const operator = String(address || '').trim().toLowerCase();
    if(!/^genvaloper1[0-9a-z]{20,}$/.test(operator)) return;

    setTxModal(false);
    setBlockModal(false);
    setAddressModal(false);
    renderValidatorDetail({operatorAddress:operator,status:'LOADING'});
    text('validatorDetailMoniker','LOADING…');
    setValidatorModal(true);

    try{
      const data = await getJson(`/api/genesis/validator?address=${encodeURIComponent(operator)}`);
      renderValidatorDetail(data.validator || {});
    }catch{
      text('validatorDetailMoniker','UNAVAILABLE');
      renderValidatorBlocks([]);
    }
  }



  // GENESIS MEMPOOL EXPLORER v1
  function renderMempool(data={}){
    const list = $('mempoolList');
    if(!list) return;

    const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
    const total = Number(data?.total || 0);

    text('mempoolPendingCount',`${total.toLocaleString('en-US')} PENDING`);
    text('mempoolTotalSize',data?.totalBytes != null ? fmtNodeBytes(data.totalBytes) : '—');

    if(!transactions.length){
      list.innerHTML = '<div class="mempool-empty">NO PENDING TRANSACTIONS</div>';
      return;
    }

    list.innerHTML = transactions.map((tx)=>`
      <div class="mempool-row">
        <span class="mempool-cell mempool-hash" data-label="TX HASH">
          <code>${escapeHtml(short(tx.hash,12,10))}</code>
        </span>
        <span class="mempool-cell" data-label="TYPE">${escapeHtml(tx.type || 'RAW TRANSACTION')}</span>
        <span class="mempool-cell" data-label="FROM"><code>${escapeHtml(short(tx.from,10,8))}</code></span>
        <span class="mempool-cell" data-label="TO"><code>${escapeHtml(short(tx.to,10,8))}</code></span>
        <span class="mempool-cell" data-label="AMOUNT">${escapeHtml(fmtCoin(tx.amount))}</span>
        <span class="mempool-cell" data-label="FEE">${escapeHtml(fmtCoin(tx.fee))}</span>
        <span class="mempool-cell" data-label="SIZE">${escapeHtml(fmtNodeBytes(tx.sizeBytes))}</span>
        <button class="mempool-copy" type="button" data-mempool-copy="${escapeHtml(tx.hash || '')}" aria-label="Copy pending transaction hash">COPY</button>
      </div>
    `).join('');
  }

  async function loadMempool(){
    try{
      const data = await getJson('/api/genesis/mempool');
      renderMempool(data || {});
    }catch{
      text('mempoolPendingCount','—');
      text('mempoolTotalSize','—');
      const list = $('mempoolList');
      if(list) list.innerHTML = '<div class="mempool-empty">MEMPOOL API UNAVAILABLE</div>';
    }
  }


  // GENESIS MULTI-NODE v1
  function renderPeerList(peers=[]){
    const list = $('peerList');
    if(!list) return;
    const clean = peers.filter((peer)=>peer?.id);

    if(!clean.length){
      list.innerHTML = '<div class="peer-empty">NO CONNECTED PEERS</div>';
      return;
    }

    list.innerHTML = clean.map((peer)=>`
      <div class="peer-row">
        <code>${escapeHtml(short(peer.id,14,10))}</code>
        <span>${escapeHtml(peer.moniker || '—')}</span>
        <span>${peer.outbound ? 'OUTBOUND' : 'INBOUND'}</span>
        <code>${escapeHtml(peer.remoteIp || '—')}</code>
        <span>${escapeHtml(peer.version || '—')}</span>
      </div>
    `).join('');
  }

  function renderPeers(data={}){
    const primary = data?.primary || {};
    const secondary = data?.secondary || {};

    text('peerPrimaryStatus',primary.online ? (primary.catchingUp ? 'SYNCING' : 'ONLINE') : 'OFFLINE');
    text('peerPrimaryId',primary.id || '—');
    text('peerPrimaryHeight',primary.height != null ? Number(primary.height).toLocaleString('en-US') : '—');
    text('peerPrimaryCount',primary.peers != null ? String(primary.peers) : '—');

    text('peerSecondaryStatus',secondary.online ? (secondary.catchingUp ? 'SYNCING' : 'ONLINE') : (data?.configured ? 'OFFLINE' : 'NOT SET UP'));
    text('peerSecondaryId',secondary.id || '—');
    text('peerSecondaryHeight',secondary.height != null ? Number(secondary.height).toLocaleString('en-US') : '—');
    text('peerSecondaryCount',secondary.peers != null ? String(secondary.peers) : '—');

    text('peerHeightDelta',data?.heightDelta != null ? String(data.heightDelta) : '—');

    if(data?.connected){
      text('peerConnectionState','CONNECTED');
      text('peerSyncSummary',data?.heightDelta === 0
        ? 'PRIMARY AND NODE 2 ARE AT THE SAME HEIGHT.'
        : `NODE 2 IS ${data.heightDelta} BLOCK${data.heightDelta===1?'':'S'} FROM PRIMARY.`);
    }else if(secondary.online){
      text('peerConnectionState','DISCOVERING');
      text('peerSyncSummary','NODE 2 IS ONLINE BUT THE PRIMARY P2P LINK IS NOT CONFIRMED YET.');
    }else if(data?.configured){
      text('peerConnectionState','NODE 2 OFFLINE');
      text('peerSyncSummary','START THE GENESIS NODE 2 WORKFLOW MANUALLY.');
    }else{
      text('peerConnectionState','NOT CONFIGURED');
      text('peerSyncSummary','RUN ./setup-node2.sh ONCE.');
    }

    renderPeerList(data?.peers || []);
  }

  async function loadPeers(){
    try{
      const data = await getJson('/api/genesis/peers');
      renderPeers(data || {});
    }catch{
      renderPeers({});
    }
  }

  
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

// GENESIS NODE HEALTH v1
  const fmtNodeAge = (iso) => {
    if(!iso) return '—';
    const time = Date.parse(iso);
    if(!Number.isFinite(time)) return '—';
    const seconds = Math.max(0,Math.floor((Date.now()-time)/1000));
    if(seconds < 60) return `${seconds} SEC`;
    if(seconds < 3600) return `${Math.floor(seconds/60)} MIN`;
    return `${Math.floor(seconds/3600)} HR`;
  };

  const fmtNodeBytes = (value) => {
    const bytes = Number(value);
    if(!Number.isFinite(bytes)) return '—';
    if(bytes < 1024) return `${bytes} B`;
    if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  };

  function setNodeHealthClass(id,state){
    const el = $(id);
    if(!el) return;
    el.classList.remove('ok','warn');
    if(state === 'ok') el.classList.add('ok');
    if(state === 'warn') el.classList.add('warn');
  }

  function renderNodeHealth(data={}){
    const rpcOnline = data?.rpcOnline === true;
    const apiOnline = data?.apiOnline === true;
    const catchingUp = data?.catchingUp;

    text('nodeRpcStatus',rpcOnline ? 'ONLINE' : 'OFFLINE');
    text('nodeApiStatus',apiOnline ? 'ONLINE' : 'OFFLINE');
    text('nodeSyncHealth',catchingUp === null || catchingUp === undefined ? '—' : (catchingUp ? 'SYNCING' : 'READY'));
    text('nodePeers',data?.peers != null ? String(data.peers) : '—');
    text('nodeBlockAge',fmtNodeAge(data?.latestBlockTime));
    text('nodeVersion',data?.nodeVersion || '—');
    text('nodePendingTx',data?.pendingTxs != null ? String(data.pendingTxs) : '—');
    text('nodeMempoolBytes',data?.mempoolBytes != null ? fmtNodeBytes(data.mempoolBytes) : '—');

    setNodeHealthClass('nodeRpcStatus',rpcOnline ? 'ok' : 'warn');
    setNodeHealthClass('nodeApiStatus',apiOnline ? 'ok' : 'warn');
    setNodeHealthClass('nodeSyncHealth',catchingUp === false ? 'ok' : 'warn');

    const healthy = rpcOnline && apiOnline && catchingUp === false;
    text('nodeHealthState',healthy ? 'HEALTHY' : (rpcOnline ? 'DEGRADED' : 'OFFLINE'));
    setNodeHealthClass('nodeHealthState',healthy ? 'ok' : 'warn');
  }

  async function loadNodeHealth(){
    try{
      const data = await getJson('/api/genesis/node-health');
      renderNodeHealth(data || {});
    }catch{
      renderNodeHealth({
        rpcOnline:false,
        apiOnline:false,
        catchingUp:null,
        peers:null,
        latestBlockTime:null,
        nodeVersion:null,
        pendingTxs:null,
        mempoolBytes:null
      });
    }
  }

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

      if (d.averageBlockTimeSec != null) {
        text('blockTime',`${Number(d.averageBlockTimeSec).toFixed(1)} SEC`);
      } else {
        text('blockTime','—');
      }

      text('totalTransactions',d.totalTransactions != null
        ? Number(d.totalTransactions).toLocaleString('en-US') : '—');
      text('bondedGen',d.bondedAmount != null ? fmtGen(d.bondedAmount) : '— GEN');
      text('totalBlocks',d.totalBlocks != null
        ? Number(d.totalBlocks).toLocaleString('en-US') : '—');
      text('activeValidators',d.activeValidators != null
        ? Number(d.activeValidators).toLocaleString('en-US') : '—');
      renderValidators(d.validators || []);

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
      text('totalTransactions','—');
      text('bondedGen','— GEN');
      text('totalBlocks','—');
      text('activeValidators','—');
      renderValidators([]);
      setOnline(false);
      renderBlocks([]);
    }
  }

  setTimeout(refresh,120);
  setInterval(refresh,5000);
  setTimeout(loadTransactions,240);
  setInterval(loadTransactions,7000);
  setTimeout(loadNodeHealth,320);
  setInterval(loadNodeHealth,3000);
  setTimeout(loadValidatorOperations,420);
  setInterval(loadValidatorOperations,5000);
  setTimeout(loadPeers,520);
  setInterval(loadPeers,3000);
  setTimeout(loadMempool,420);
  setInterval(loadMempool,2500);
})();
