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

  function setAddressModal(open) {
    const modal = $('addressModal');
    if (!modal) return;
    modal.classList.toggle('open',open);
    modal.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('tx-modal-open',open);
  }

  function renderBlockTransactions(hashes=[]) {
    const list = $('blockTxList');
    if (!list) return;
    const clean = hashes.filter(Boolean);
    if (!clean.length) {
      list.innerHTML = '<div class="entity-empty">NO TRANSACTIONS IN THIS BLOCK</div>';
      return;
    }
    list.innerHTML = clean.map((hash,index)=>`
      <button class="entity-activity-row" type="button" data-tx-hash="${escapeHtml(hash)}">
        <span class="entity-activity-main">
          <b>TRANSACTION ${index + 1}</b>
          <code>${escapeHtml(short(hash,16,12))}</code>
        </span>
        <span class="entity-activity-arrow">↗</span>
      </button>
    `).join('');
  }

  function renderBlockDetail(block={}) {
    text('blockDetailHeight',block?.height ? `#${block.height}` : '—');
    text('blockDetailHash',block?.hash || '—');
    text('blockDetailChainId',(block?.chainId || '—').toUpperCase());
    text('blockDetailTime',fmtDateTime(block?.time));
    text('blockDetailTxCount',String(block?.txCount ?? '—'));
    text('blockDetailProposer',block?.proposer || '—');
    text('blockDetailPrevious',block?.previousHash || '—');
    renderBlockTransactions(block?.txHashes || []);
  }

  async function openBlock(height) {
    const h = String(height || '').replace(/^#/,'').trim();
    if (!/^\d+$/.test(h)) return;
    setTxModal(false);
    setAddressModal(false);
    renderBlockDetail({height:h});
    text('blockDetailHash','LOADING…');
    setBlockModal(true);
    try {
      const data = await getJson(`/api/genesis/block-detail?height=${encodeURIComponent(h)}`);
      renderBlockDetail(data.block || {});
    } catch {
      text('blockDetailHash','UNAVAILABLE');
      renderBlockTransactions([]);
    }
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
        <button class="entity-activity-row address-activity-row" type="button" data-tx-hash="${escapeHtml(tx.hash)}">
          <span class="entity-activity-main">
            <b>${sent ? 'SENT' : 'RECEIVED'} · ${escapeHtml(fmtCoin(tx.amount))}</b>
            <code>${sent ? 'TO' : 'FROM'} ${escapeHtml(short(peer,13,10))}</code>
          </span>
          <span class="entity-activity-meta">#${escapeHtml(tx.height || '—')} · ${escapeHtml(fmtTime(tx.timestamp))}</span>
          <span class="entity-activity-arrow">↗</span>
        </button>
      `;
    }).join('');
  }

  function renderAddressDetail(data={}) {
    const address = String(data?.address || '').toLowerCase();
    const coin = (data?.balances || []).find((item)=>item?.denom === 'ugen');
    text('addressDetailAddress',address || '—');
    text('addressDetailBalance',fmtGen(coin ? coin.amount : 0));
    text('addressDetailTxCount',String(data?.indexedTransactionCount ?? 0));
    renderAddressTransactions(address,data?.transactions || []);
  }

  async function openAddress(address) {
    const a = String(address || '').trim().toLowerCase();
    if (!/^gen1[0-9a-z]{20,}$/.test(a)) return;
    setTxModal(false);
    setBlockModal(false);
    renderAddressDetail({address:a,balances:[],indexedTransactionCount:'—',transactions:[]});
    text('addressDetailBalance','LOADING…');
    const list = $('addressTxList');
    if (list) list.innerHTML = '<div class="entity-empty">LOADING…</div>';
    setAddressModal(true);
    try {
      const data = await getJson(`/api/genesis/address?address=${encodeURIComponent(a)}&limit=30`);
      renderAddressDetail(data || {});
    } catch {
      text('addressDetailBalance','UNAVAILABLE');
      if (list) list.innerHTML = '<div class="entity-empty">ADDRESS API UNAVAILABLE</div>';
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
    const row = event.target.closest('[data-tx-hash]');
    if (!row?.dataset?.txHash) return;
    setAddressModal(false);
    openTransaction(row.dataset.txHash);
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
  addEventListener('keydown',(event)=>{if (event.key === 'Escape'){setTxModal(false);setBlockModal(false);setAddressModal(false);setValidatorModal(false);}});


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
      renderValidators([]);
      setOnline(false);
      renderBlocks([]);
    }
  }

  setTimeout(refresh,120);
  setInterval(refresh,5000);
  setTimeout(loadTransactions,240);
  setInterval(loadTransactions,7000);
})();
