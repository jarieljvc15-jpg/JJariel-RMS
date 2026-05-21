(function () {
  if (!localStorage.getItem('adminToken')) return;

  /* ── helpers ────────────────────────────────────────────────── */
  function peso(n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ── inject CSS ─────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    #qpFab {
      position: fixed; bottom: 80px; right: 20px;
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--accent, #4f7ef8);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(79,126,248,0.4);
      z-index: 8000;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    #qpFab:active { transform: scale(0.93); box-shadow: 0 2px 8px rgba(79,126,248,0.3); }

    #qpOverlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 9000;
      display: flex; align-items: flex-end;
      opacity: 0; pointer-events: none;
      transition: opacity 0.25s;
    }
    #qpOverlay.qp-open { opacity: 1; pointer-events: all; }

    #qpSheet {
      width: 100%;
      background: var(--surface-1, #ffffff);
      border-radius: 20px 20px 0 0;
      max-height: 85vh; overflow-y: auto;
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
      padding-bottom: env(safe-area-inset-bottom, 16px);
    }
    #qpOverlay.qp-open #qpSheet { transform: translateY(0); }

    .qp-handle {
      width: 36px; height: 4px; border-radius: 2px;
      background: var(--border, #e5e7eb);
      margin: 12px auto 0;
    }
    .qp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px 12px;
    }
    .qp-title {
      font-family: 'Satoshi', sans-serif; font-weight: 700; font-size: 18px;
      color: var(--text-primary, #111827);
    }
    .qp-close {
      width: 32px; height: 32px; border: none;
      background: var(--surface-2, #f3f4f6); border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: var(--text-secondary, #6b7280);
    }
    .qp-steps-ind {
      display: flex; gap: 6px; justify-content: center; padding: 0 20px 16px;
    }
    .qp-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--border, #e5e7eb);
      transition: background 0.2s, width 0.2s, border-radius 0.2s;
    }
    .qp-dot.active { background: var(--accent, #4f7ef8); width: 20px; border-radius: 4px; }

    .qp-body { padding: 0 20px 24px; }

    .qp-balance-card {
      background: var(--surface-2, #f3f4f6);
      border-radius: 12px; padding: 12px 16px; margin: 12px 0;
    }
    .qp-balance-row {
      display: flex; justify-content: space-between;
      font-size: 13px; color: var(--text-secondary, #6b7280); padding: 2px 0;
    }
    .qp-balance-total {
      display: flex; justify-content: space-between; font-weight: 600; font-size: 15px;
      color: var(--text-primary, #111827);
      padding-top: 8px; margin-top: 6px; border-top: 1px solid var(--border, #e5e7eb);
    }
    .qp-val-debit  { color: var(--danger, #dc2626) !important; }
    .qp-val-credit { color: var(--success, #16a34a) !important; }

    .qp-toggle {
      display: flex; background: var(--surface-2, #f3f4f6);
      border-radius: 10px; padding: 3px; gap: 3px; margin: 12px 0;
    }
    .qp-toggle-btn {
      flex: 1; border: none; background: transparent; border-radius: 8px;
      padding: 8px 0; font-size: 13px; font-weight: 500;
      color: var(--text-secondary, #6b7280); cursor: pointer; transition: all 0.15s;
    }
    .qp-toggle-btn.active {
      background: var(--surface-1, #fff);
      color: var(--text-primary, #111827);
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }

    .qp-amounts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
    .qp-amounts .qp-flabel { margin-top: 0; }

    .qp-flabel {
      display: block; font-size: 12px; font-weight: 600;
      color: var(--text-secondary, #6b7280); text-transform: uppercase;
      letter-spacing: 0.04em; margin-bottom: 6px; margin-top: 14px;
    }
    .qp-flabel span { font-weight: 400; text-transform: none; letter-spacing: 0; }
    .qp-input {
      width: 100%; border: 1.5px solid var(--border, #e5e7eb); border-radius: 10px;
      padding: 10px 14px; font-size: 15px; background: var(--surface-1, #fff);
      color: var(--text-primary, #111827); box-sizing: border-box;
      font-family: inherit; transition: border-color 0.15s; outline: none;
    }
    .qp-input:focus { border-color: var(--accent, #4f7ef8); }
    select.qp-input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px;
    }

    .qp-total-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; background: var(--surface-2, #f3f4f6);
      border-radius: 10px; margin: 12px 0 0;
    }
    .qp-total-label { font-size: 14px; color: var(--text-secondary, #6b7280); }
    .qp-total-val {
      font-family: 'Satoshi', sans-serif; font-weight: 700; font-size: 18px;
      color: var(--text-primary, #111827);
    }

    .qp-pills { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .qp-pill {
      border: 1.5px solid var(--border, #e5e7eb); border-radius: 20px;
      padding: 6px 14px; font-size: 13px; font-weight: 500;
      background: transparent; color: var(--text-secondary, #6b7280);
      cursor: pointer; transition: all 0.15s;
    }
    .qp-pill.active {
      border-color: var(--accent, #4f7ef8);
      background: rgba(79,126,248,0.08); color: var(--accent, #4f7ef8);
    }

    .qp-proof-box {
      border: 1.5px dashed var(--border, #e5e7eb); border-radius: 12px;
      padding: 20px; text-align: center; cursor: pointer;
      transition: border-color 0.15s; margin: 8px 0;
    }
    .qp-proof-box:hover { border-color: var(--accent, #4f7ef8); }
    .qp-proof-preview {
      width: 100%; max-height: 160px; object-fit: cover;
      border-radius: 8px; margin-top: 8px;
    }

    .qp-btn {
      width: 100%; border: none; border-radius: 12px; padding: 14px 0;
      font-size: 15px; font-weight: 600; cursor: pointer;
      margin-top: 12px; transition: opacity 0.15s, transform 0.15s; font-family: inherit;
    }
    .qp-btn:active { transform: scale(0.98); }
    .qp-btn--primary { background: var(--accent, #4f7ef8); color: #fff; }
    .qp-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .qp-btn--ghost { background: var(--surface-2, #f3f4f6); color: var(--text-secondary, #6b7280); }

    /* receipt */
    .qp-rc-icon {
      width: 56px; height: 56px; border-radius: 50%;
      background: rgba(22,163,74,0.12);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .qp-rc-title {
      font-family: 'Satoshi', sans-serif; font-weight: 800; font-size: 22px;
      color: var(--text-primary, #111827); text-align: center; margin-bottom: 4px;
    }
    .qp-rc-sub {
      font-size: 13px; color: var(--text-secondary, #6b7280);
      text-align: center; margin-bottom: 20px;
    }
    .qp-rc-card { background: var(--surface-2, #f3f4f6); border-radius: 12px; padding: 16px; }
    .qp-rc-row {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 5px 0; font-size: 13px;
    }
    .qp-rc-rlabel { color: var(--text-secondary, #6b7280); flex: 0 0 120px; }
    .qp-rc-rval   { color: var(--text-primary, #111827); font-weight: 500; text-align: right; flex: 1; }
    .qp-rc-divider { border: none; border-top: 1px solid var(--border, #e5e7eb); margin: 10px 0; }
    .qp-rc-total {
      display: flex; justify-content: space-between; align-items: center; padding: 4px 0;
    }
    .qp-rc-total-label { font-weight: 600; font-size: 15px; color: var(--text-primary, #111827); }
    .qp-rc-total-val {
      font-family: 'Satoshi', sans-serif; font-weight: 700; font-size: 18px;
      color: var(--accent, #4f7ef8);
    }
    .qp-rc-balance {
      display: flex; justify-content: space-between; margin-top: 12px;
      padding: 10px 16px; border-radius: 10px; background: var(--surface-1, #fff);
      font-size: 13px;
    }

    .qp-hidden { display: none !important; }
    .qp-spinner {
      width: 20px; height: 20px; border: 2px solid var(--border, #e5e7eb);
      border-top-color: var(--accent, #4f7ef8); border-radius: 50%;
      animation: qp-spin 0.6s linear infinite; margin: 16px auto;
    }
    @keyframes qp-spin { to { transform: rotate(360deg); } }
    .qp-err { color: var(--danger, #dc2626); font-size: 13px; margin-top: 8px; text-align: center; }
  `;
  document.head.appendChild(style);

  /* ── inject HTML ─────────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="qpFab" aria-label="Quick Payment">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    </button>

    <div id="qpOverlay">
      <div id="qpSheet">
        <div class="qp-handle"></div>
        <div class="qp-header">
          <div class="qp-title" id="qpTitle">Quick Payment</div>
          <button class="qp-close" id="qpClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="qp-steps-ind" id="qpDots">
          <div class="qp-dot active" id="qpDot0"></div>
          <div class="qp-dot" id="qpDot1"></div>
          <div class="qp-dot" id="qpDot2"></div>
        </div>

        <!-- Step 1: Tenant -->
        <div class="qp-body" id="qpStep1">
          <div class="qp-spinner" id="qpSpinner1"></div>
          <div id="qpStep1Loaded" class="qp-hidden">
            <label class="qp-flabel">Tenant</label>
            <select class="qp-input" id="qpTenantSel">
              <option value="">— Select tenant —</option>
            </select>
            <div class="qp-balance-card qp-hidden" id="qpBalCard">
              <div class="qp-balance-row"><span>Rent owed</span><span id="qpB1R">—</span></div>
              <div class="qp-balance-row"><span>Electricity owed</span><span id="qpB1E">—</span></div>
              <div class="qp-balance-row"><span>Water owed</span><span id="qpB1W">—</span></div>
              <div class="qp-balance-total"><span>Total balance</span><span id="qpB1T">—</span></div>
            </div>
            <button class="qp-btn qp-btn--primary" id="qpS1Next" disabled>Continue</button>
          </div>
        </div>

        <!-- Step 2: Amount -->
        <div class="qp-body qp-hidden" id="qpStep2">
          <div class="qp-toggle">
            <button class="qp-toggle-btn active" id="qpPayFull">Pay in Full</button>
            <button class="qp-toggle-btn" id="qpPayCustom">Custom Amount</button>
          </div>
          <div class="qp-amounts">
            <div>
              <div class="qp-flabel">Rent</div>
              <input type="number" class="qp-input" id="qpRent" min="0" step="0.01" placeholder="0.00">
            </div>
            <div>
              <div class="qp-flabel">Electricity</div>
              <input type="number" class="qp-input" id="qpElec" min="0" step="0.01" placeholder="0.00">
            </div>
            <div>
              <div class="qp-flabel">Water</div>
              <input type="number" class="qp-input" id="qpWater" min="0" step="0.01" placeholder="0.00">
            </div>
          </div>
          <div class="qp-total-row">
            <span class="qp-total-label">Total</span>
            <span class="qp-total-val" id="qpTotalDisplay">₱0.00</span>
          </div>
          <div class="qp-err qp-hidden" id="qpS2Err"></div>
          <button class="qp-btn qp-btn--primary" id="qpS2Next">Continue</button>
          <button class="qp-btn qp-btn--ghost" id="qpS2Back">Back</button>
        </div>

        <!-- Step 3: Payment Details -->
        <div class="qp-body qp-hidden" id="qpStep3">
          <label class="qp-flabel">Billing Month</label>
          <input type="month" class="qp-input" id="qpMonth">
          <label class="qp-flabel">Payment Mode</label>
          <div class="qp-pills">
            <button class="qp-pill active" data-mode="GCash">GCash</button>
            <button class="qp-pill" data-mode="Cash">Cash</button>
            <button class="qp-pill" data-mode="Bank Transfer">Bank Transfer</button>
          </div>
          <label class="qp-flabel">Reference No. <span>(optional)</span></label>
          <input type="text" class="qp-input" id="qpRefNo" placeholder="e.g. GCash ref #">
          <label class="qp-flabel">Notes <span>(optional)</span></label>
          <textarea class="qp-input" id="qpNotes" rows="2" placeholder="Additional notes" style="resize:none;"></textarea>
          <label class="qp-flabel">Proof of Payment <span>(optional)</span></label>
          <div class="qp-proof-box" id="qpProofBox">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-secondary,#6b7280)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div style="font-size:13px;color:var(--text-secondary,#6b7280);margin-top:6px;">Tap to upload image</div>
            <input type="file" id="qpProofFile" accept="image/*" style="display:none;">
            <img id="qpProofImg" class="qp-proof-preview qp-hidden" alt="Proof">
          </div>
          <div class="qp-err qp-hidden" id="qpS3Err"></div>
          <button class="qp-btn qp-btn--primary" id="qpConfirm">Confirm Payment</button>
          <button class="qp-btn qp-btn--ghost" id="qpS3Back">Back</button>
        </div>

        <!-- Receipt -->
        <div class="qp-body qp-hidden" id="qpReceipt">
          <div style="padding-top:12px;">
            <div class="qp-rc-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#16a34a" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="qp-rc-title">Payment Recorded</div>
            <div class="qp-rc-sub" id="qpRcSub">Receipt has been sent to tenant.</div>
            <div class="qp-rc-card">
              <div class="qp-rc-row"><span class="qp-rc-rlabel">Tenant</span><span class="qp-rc-rval" id="qpRcTenant">—</span></div>
              <div class="qp-rc-row"><span class="qp-rc-rlabel">Unit</span><span class="qp-rc-rval" id="qpRcUnit">—</span></div>
              <div class="qp-rc-row"><span class="qp-rc-rlabel">Billing Month</span><span class="qp-rc-rval" id="qpRcMonth">—</span></div>
              <hr class="qp-rc-divider">
              <div class="qp-rc-row" id="qpRcRentRow"><span class="qp-rc-rlabel">Rent</span><span class="qp-rc-rval" id="qpRcRent">—</span></div>
              <div class="qp-rc-row" id="qpRcElecRow"><span class="qp-rc-rlabel">Electricity</span><span class="qp-rc-rval" id="qpRcElec">—</span></div>
              <div class="qp-rc-row" id="qpRcWaterRow"><span class="qp-rc-rlabel">Water</span><span class="qp-rc-rval" id="qpRcWater">—</span></div>
              <hr class="qp-rc-divider">
              <div class="qp-rc-total">
                <span class="qp-rc-total-label">Total Paid</span>
                <span class="qp-rc-total-val" id="qpRcTotal">—</span>
              </div>
              <hr class="qp-rc-divider">
              <div class="qp-rc-row"><span class="qp-rc-rlabel">Payment Mode</span><span class="qp-rc-rval" id="qpRcMode">—</span></div>
              <div class="qp-rc-row qp-hidden" id="qpRcRefRow"><span class="qp-rc-rlabel">Reference No.</span><span class="qp-rc-rval" id="qpRcRef">—</span></div>
              <div class="qp-rc-row"><span class="qp-rc-rlabel">Date</span><span class="qp-rc-rval" id="qpRcDate">—</span></div>
            </div>
            <div class="qp-rc-balance">
              <span style="color:var(--text-secondary,#6b7280);">Remaining Balance</span>
              <span id="qpRcBalance" style="font-weight:600;">—</span>
            </div>
            <button class="qp-btn qp-btn--primary" id="qpDone">Done</button>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* ── state ───────────────────────────────────────────────────── */
  let tenants      = [];
  let tenantsLoaded = false;
  let selectedTenant = null;
  let currentBalance = null;
  let isFullPay    = true;
  let payMode      = 'GCash';
  let proofBase64  = null;
  let proofFileName = null;

  /* ── DOM ─────────────────────────────────────────────────────── */
  const overlay = document.getElementById('qpOverlay');
  const step1   = document.getElementById('qpStep1');
  const step2   = document.getElementById('qpStep2');
  const step3   = document.getElementById('qpStep3');
  const receipt = document.getElementById('qpReceipt');
  const dots    = document.getElementById('qpDots');

  /* ── panel open / close ──────────────────────────────────────── */
  function openPanel() {
    overlay.classList.add('qp-open');
    document.getElementById('qpMonth').value = currentMonth();
    loadTenants();
  }

  function closePanel() {
    overlay.classList.remove('qp-open');
    setTimeout(resetPanel, 320);
  }

  function resetPanel() {
    showStep(1);
    selectedTenant = null; currentBalance = null;
    isFullPay = true; proofBase64 = null; proofFileName = null;
    document.getElementById('qpTenantSel').value = '';
    document.getElementById('qpBalCard').classList.add('qp-hidden');
    document.getElementById('qpS1Next').disabled = true;
    ['qpRent','qpElec','qpWater'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('qpTotalDisplay').textContent = '₱0.00';
    document.getElementById('qpRefNo').value = '';
    document.getElementById('qpNotes').value = '';
    document.getElementById('qpProofImg').classList.add('qp-hidden');
    document.getElementById('qpProofFile').value = '';
    document.getElementById('qpS2Err').classList.add('qp-hidden');
    document.getElementById('qpS3Err').classList.add('qp-hidden');
    document.getElementById('qpConfirm').disabled = false;
    document.getElementById('qpConfirm').textContent = 'Confirm Payment';
    document.getElementById('qpPayFull').classList.add('active');
    document.getElementById('qpPayCustom').classList.remove('active');
    setReadonly(true);
    payMode = 'GCash';
    document.querySelectorAll('.qp-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === 'GCash'));
    dots.classList.remove('qp-hidden');
    document.getElementById('qpTitle').textContent = 'Quick Payment';
  }

  function showStep(n) {
    step1.classList.toggle('qp-hidden', n !== 1);
    step2.classList.toggle('qp-hidden', n !== 2);
    step3.classList.toggle('qp-hidden', n !== 3);
    receipt.classList.add('qp-hidden');
    [0,1,2].forEach(i => {
      document.getElementById('qpDot' + i).classList.toggle('active', i === n - 1);
    });
    // scroll sheet to top on step change
    document.getElementById('qpSheet').scrollTop = 0;
  }

  /* ── load tenants ────────────────────────────────────────────── */
  async function loadTenants() {
    if (tenantsLoaded) return;
    try {
      const res  = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=getTenants');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load tenants');
      tenants = json.data || [];
      const sel = document.getElementById('qpTenantSel');
      tenants.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.TenantID;
        const unit = t.UnitName || t.UnitID || '';
        const bld  = t.BuildingName ? ' (' + t.BuildingName + ')' : '';
        opt.textContent = t.Name + ' — ' + unit + bld;
        sel.appendChild(opt);
      });
      tenantsLoaded = true;
      document.getElementById('qpSpinner1').classList.add('qp-hidden');
      document.getElementById('qpStep1Loaded').classList.remove('qp-hidden');
    } catch (err) {
      document.getElementById('qpSpinner1').innerHTML =
        '<div style="color:var(--danger,#dc2626);font-size:13px;text-align:center;padding:12px 0;">' + esc(err.message) + '</div>';
    }
  }

  /* ── fetch balance ───────────────────────────────────────────── */
  async function fetchBalance(tenantId) {
    const card = document.getElementById('qpBalCard');
    const next = document.getElementById('qpS1Next');
    card.innerHTML = `
      <div class="qp-balance-row"><span>Rent owed</span><span id="qpB1R">—</span></div>
      <div class="qp-balance-row"><span>Electricity owed</span><span id="qpB1E">—</span></div>
      <div class="qp-balance-row"><span>Water owed</span><span id="qpB1W">—</span></div>
      <div class="qp-balance-total"><span>Total balance</span><span id="qpB1T">—</span></div>`;
    card.classList.remove('qp-hidden');
    next.disabled = true;
    try {
      const res  = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=getBalance&tenantId=' + encodeURIComponent(tenantId));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Could not load balance');
      currentBalance = json.data;
      const { rent, elec, water, total } = currentBalance;
      document.getElementById('qpB1R').textContent = peso(rent);
      document.getElementById('qpB1E').textContent = peso(elec);
      document.getElementById('qpB1W').textContent = peso(water);
      const tEl = document.getElementById('qpB1T');
      if (total > 0)      { tEl.textContent = peso(total) + ' owed';   tEl.className = 'qp-val-debit'; }
      else if (total < 0) { tEl.textContent = peso(Math.abs(total)) + ' credit'; tEl.className = 'qp-val-credit'; }
      else                { tEl.textContent = 'No outstanding balance'; tEl.className = ''; }
      next.disabled = false;
    } catch (err) {
      card.innerHTML = '<div class="qp-err" style="padding:8px 0;">' + esc(err.message) + '</div>';
    }
  }

  /* ── amount helpers ──────────────────────────────────────────── */
  function setReadonly(ro) {
    ['qpRent','qpElec','qpWater'].forEach(id => {
      const el = document.getElementById(id);
      el.readOnly = ro;
      el.style.background = ro ? 'var(--surface-2,#f3f4f6)' : '';
    });
  }

  function fillFullPay() {
    if (!currentBalance) return;
    document.getElementById('qpRent').value  = Math.max(0, currentBalance.rent  || 0).toFixed(2);
    document.getElementById('qpElec').value  = Math.max(0, currentBalance.elec  || 0).toFixed(2);
    document.getElementById('qpWater').value = Math.max(0, currentBalance.water || 0).toFixed(2);
    updateTotal();
  }

  function updateTotal() {
    const t = (parseFloat(document.getElementById('qpRent').value)  || 0)
            + (parseFloat(document.getElementById('qpElec').value)  || 0)
            + (parseFloat(document.getElementById('qpWater').value) || 0);
    document.getElementById('qpTotalDisplay').textContent = peso(t);
  }

  /* ── receipt view ────────────────────────────────────────────── */
  function showReceipt(apiData) {
    step1.classList.add('qp-hidden');
    step2.classList.add('qp-hidden');
    step3.classList.add('qp-hidden');
    dots.classList.add('qp-hidden');
    receipt.classList.remove('qp-hidden');
    document.getElementById('qpTitle').textContent = 'Receipt';

    const t = selectedTenant;
    const rentAmt  = parseFloat(document.getElementById('qpRent').value)  || 0;
    const elecAmt  = parseFloat(document.getElementById('qpElec').value)  || 0;
    const waterAmt = parseFloat(document.getElementById('qpWater').value) || 0;
    const total    = rentAmt + elecAmt + waterAmt;
    const refNo    = document.getElementById('qpRefNo').value.trim();

    document.getElementById('qpRcTenant').textContent = t.Name || t.TenantID;
    document.getElementById('qpRcUnit').textContent   = (t.UnitName || t.UnitID || '') + (t.BuildingName ? ' · ' + t.BuildingName : '');
    document.getElementById('qpRcMonth').textContent  = document.getElementById('qpMonth').value;

    // Only show non-zero breakdown rows
    const rRow = document.getElementById('qpRcRentRow');
    const eRow = document.getElementById('qpRcElecRow');
    const wRow = document.getElementById('qpRcWaterRow');
    document.getElementById('qpRcRent').textContent  = peso(rentAmt);
    document.getElementById('qpRcElec').textContent  = peso(elecAmt);
    document.getElementById('qpRcWater').textContent = peso(waterAmt);
    rRow.classList.toggle('qp-hidden', rentAmt  === 0);
    eRow.classList.toggle('qp-hidden', elecAmt  === 0);
    wRow.classList.toggle('qp-hidden', waterAmt === 0);

    document.getElementById('qpRcTotal').textContent = peso(total);
    document.getElementById('qpRcMode').textContent  = payMode;

    const refRow = document.getElementById('qpRcRefRow');
    if (refNo) {
      document.getElementById('qpRcRef').textContent = refNo;
      refRow.classList.remove('qp-hidden');
    } else {
      refRow.classList.add('qp-hidden');
    }

    document.getElementById('qpRcDate').textContent = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const rb    = apiData.remainingBalance || {};
    const rem   = rb.total || 0;
    const balEl = document.getElementById('qpRcBalance');
    if (rem > 0)      { balEl.textContent = peso(rem) + ' remaining';  balEl.style.color = 'var(--danger,#dc2626)'; }
    else if (rem < 0) { balEl.textContent = peso(Math.abs(rem)) + ' credit'; balEl.style.color = 'var(--success,#16a34a)'; }
    else              { balEl.textContent = 'Fully paid';               balEl.style.color = 'var(--success,#16a34a)'; }

    document.getElementById('qpSheet').scrollTop = 0;
  }

  /* ── event listeners ─────────────────────────────────────────── */
  document.getElementById('qpFab').addEventListener('click', openPanel);
  document.getElementById('qpClose').addEventListener('click', closePanel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

  // Step 1 — tenant select
  document.getElementById('qpTenantSel').addEventListener('change', function () {
    selectedTenant = tenants.find(t => t.TenantID === this.value) || null;
    if (selectedTenant) fetchBalance(this.value);
    else {
      document.getElementById('qpBalCard').classList.add('qp-hidden');
      document.getElementById('qpS1Next').disabled = true;
    }
  });
  document.getElementById('qpS1Next').addEventListener('click', () => {
    showStep(2);
    fillFullPay();
  });

  // Step 2 — amount mode
  document.getElementById('qpPayFull').addEventListener('click', () => {
    isFullPay = true;
    document.getElementById('qpPayFull').classList.add('active');
    document.getElementById('qpPayCustom').classList.remove('active');
    setReadonly(true);
    fillFullPay();
  });
  document.getElementById('qpPayCustom').addEventListener('click', () => {
    isFullPay = false;
    document.getElementById('qpPayCustom').classList.add('active');
    document.getElementById('qpPayFull').classList.remove('active');
    setReadonly(false);
    ['qpRent','qpElec','qpWater'].forEach(id => { document.getElementById(id).value = ''; });
    updateTotal();
    document.getElementById('qpRent').focus();
  });
  ['qpRent','qpElec','qpWater'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateTotal);
  });
  document.getElementById('qpS2Next').addEventListener('click', () => {
    const t = (parseFloat(document.getElementById('qpRent').value) || 0)
            + (parseFloat(document.getElementById('qpElec').value) || 0)
            + (parseFloat(document.getElementById('qpWater').value) || 0);
    const err = document.getElementById('qpS2Err');
    if (t <= 0) {
      err.textContent = 'Enter an amount greater than ₱0.';
      err.classList.remove('qp-hidden');
      return;
    }
    err.classList.add('qp-hidden');
    showStep(3);
  });
  document.getElementById('qpS2Back').addEventListener('click', () => showStep(1));
  document.getElementById('qpS3Back').addEventListener('click', () => showStep(2));

  // Payment mode pills
  document.querySelectorAll('.qp-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      payMode = btn.dataset.mode;
      document.querySelectorAll('.qp-pill').forEach(p => p.classList.toggle('active', p === btn));
    });
  });

  // Proof upload
  const proofBox  = document.getElementById('qpProofBox');
  const proofFile = document.getElementById('qpProofFile');
  const proofImg  = document.getElementById('qpProofImg');
  proofBox.addEventListener('click', () => proofFile.click());
  proofFile.addEventListener('change', () => {
    const file = proofFile.files[0];
    if (!file) return;
    proofFileName = file.name;
    const reader  = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      proofBase64   = dataUrl.split(',')[1];
      proofImg.src  = dataUrl;
      proofImg.classList.remove('qp-hidden');
    };
    reader.readAsDataURL(file);
  });

  // Confirm payment
  document.getElementById('qpConfirm').addEventListener('click', async () => {
    const btn = document.getElementById('qpConfirm');
    const err = document.getElementById('qpS3Err');
    err.classList.add('qp-hidden');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    const adminToken  = localStorage.getItem('adminToken') || '';
    const rentAmount  = parseFloat(document.getElementById('qpRent').value)  || 0;
    const elecAmount  = parseFloat(document.getElementById('qpElec').value)  || 0;
    const waterAmount = parseFloat(document.getElementById('qpWater').value) || 0;
    const totalPaid   = rentAmount + elecAmount + waterAmount;
    const billingMonth = document.getElementById('qpMonth').value;
    const referenceNo  = document.getElementById('qpRefNo').value.trim();
    const notes        = document.getElementById('qpNotes').value.trim();

    try {
      // Upload proof first if provided
      let proofUrl = '';
      if (proofBase64) {
        const upRes  = await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'uploadProof', adminToken, base64Image: proofBase64, fileName: proofFileName || 'proof.jpg' })
        });
        const upJson = await upRes.json();
        if (!upJson.success) throw new Error(upJson.error || 'Proof upload failed');
        proofUrl = (upJson.data || {}).driveUrl || '';
      }

      // Record payment
      const payRes  = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'recordPayment', adminToken,
          tenantId:     selectedTenant.TenantID,
          billingMonth, rentAmount, elecAmount, waterAmount,
          totalPaid,    paymentMode: payMode,
          referenceNo,  notes, proofUrl
        })
      });
      const payJson = await payRes.json();
      if (!payJson.success) throw new Error(payJson.error || 'Payment failed');

      showReceipt(payJson.data);

    } catch (e) {
      err.textContent = e.message || 'Something went wrong.';
      err.classList.remove('qp-hidden');
      btn.disabled    = false;
      btn.textContent = 'Confirm Payment';
    }
  });

  document.getElementById('qpDone').addEventListener('click', closePanel);
})();
