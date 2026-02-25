/**
 * thermoprint — Receipt Builder
 *
 * Loads the WASM package from ../../pkg/ (built by `make build-wasm`).
 * Must be served from the project root:
 *   make serve-demo            # builds WASM + serves on :8000
 *   python3 -m http.server     # then open /examples/web/
 */

import init, { WasmReceiptBuilder } from '../../pkg/thermoprint.js';

// ── State ─────────────────────────────────────────────────────────────────────

let wasmReady     = false;
let lastBytes     = null;
let lastCode      = '';
let itemCount     = 0;
let taxCount      = 0;
let customCount   = 0;
let receiptNo     = Math.floor(Math.random() * 90000) + 10000;

// Alignment state (header/footer)
const alignState  = { 'header-align': 'center', 'footer-align': 'center' };

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    await init();
    wasmReady = true;
    document.getElementById('build-btn').disabled = false;
    addItem();
    addTax();
    buildReceipt();
  } catch (e) {
    showError('Failed to load WASM.\n\nMake sure you ran `make build-wasm` and are serving from the project root.\n\n' + e.message);
    console.error(e);
  }
}

// ── Item rows ─────────────────────────────────────────────────────────────────

function addItem(name = 'Polo Ralph Lauren', qty = 1, price = 15000, disc = '') {
  const id = ++itemCount;
  const list = document.getElementById('items-list');
  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = `item-${id}`;
  row.innerHTML = `
    <div class="item-row-grid">
      <div class="field">
        <label for="item-name-${id}">Name</label>
        <input type="text" id="item-name-${id}" value="${name}" />
      </div>
      <div class="field">
        <label for="item-qty-${id}">Qty</label>
        <input type="number" id="item-qty-${id}" value="${qty}" min="1" />
      </div>
      <div class="field">
        <label for="item-price-${id}">Unit Price</label>
        <input type="number" id="item-price-${id}" value="${price}" min="0" />
      </div>
      <div class="field">
        <label for="item-disc-${id}">Discount</label>
        <input type="number" id="item-disc-${id}" value="${disc}" min="0" placeholder="0" />
      </div>
    </div>
    <button class="btn-remove" type="button" title="Remove item">&times;</button>
  `;
  list.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); buildReceipt(); });
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', buildReceipt));
}

// ── Tax rows (percentage-based, auto-calculated) ─────────────────────────────

function addTax(label = 'TVA', pct = 18, included = true) {
  const id = ++taxCount;
  const list = document.getElementById('taxes-list');
  const row = document.createElement('div');
  row.className = 'tax-row';
  row.id = `tax-${id}`;
  row.innerHTML = `
    <div class="tax-row-grid">
      <div class="field">
        <label for="tax-label-${id}">Label</label>
        <input type="text" id="tax-label-${id}" value="${label}" />
      </div>
      <div class="field">
        <label for="tax-pct-${id}">Rate %</label>
        <input type="number" id="tax-pct-${id}" value="${pct}" min="0" max="100" step="0.1" />
      </div>
      <div class="field">
        <label for="tax-included-${id}">Included</label>
        <select id="tax-included-${id}">
          <option value="true" ${included ? 'selected' : ''}>Yes</option>
          <option value="false" ${!included ? 'selected' : ''}>No</option>
        </select>
      </div>
      <button class="btn-remove" type="button" title="Remove tax">&times;</button>
    </div>
    <div class="tax-computed" id="tax-computed-${id}">= 0</div>
  `;
  list.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); buildReceipt(); });
  row.querySelectorAll('input, select').forEach(i => i.addEventListener('input', buildReceipt));
}

// ── Custom text line rows ────────────────────────────────────────────────────

function addCustomLine(text = '', align = 'left') {
  const id = ++customCount;
  const list = document.getElementById('custom-lines-list');
  const row = document.createElement('div');
  row.className = 'custom-line-row';
  row.id = `cline-${id}`;
  row.innerHTML = `
    <div class="custom-line-grid">
      <div class="field">
        <label for="cline-text-${id}">Text</label>
        <div class="input-with-align">
          <input type="text" id="cline-text-${id}" value="${text}" placeholder="Extra info..." />
          <div class="align-btns" data-target="cline-align-${id}">
            <button type="button" class="align-btn ${align === 'left' ? 'active' : ''}" data-align="left" title="Left">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button type="button" class="align-btn ${align === 'center' ? 'active' : ''}" data-align="center" title="Center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
            </button>
            <button type="button" class="align-btn ${align === 'right' ? 'active' : ''}" data-align="right" title="Right">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
      <button class="btn-remove" type="button" title="Remove">&times;</button>
    </div>
  `;
  list.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); buildReceipt(); });
  row.querySelector('input').addEventListener('input', buildReceipt);
  // Align button wiring handled by delegation below
  alignState[`cline-align-${id}`] = align;
}

// ── Collect form data ────────────────────────────────────────────────────────

function collectItems() {
  return [...document.querySelectorAll('.item-row')].map(row => {
    const id = row.id.replace('item-', '');
    return {
      name:     document.getElementById(`item-name-${id}`).value.trim() || 'Article',
      qty:      parseInt(document.getElementById(`item-qty-${id}`).value) || 1,
      price:    parseFloat(document.getElementById(`item-price-${id}`).value) || 0,
      discount: parseFloat(document.getElementById(`item-disc-${id}`).value) || 0,
    };
  });
}

function collectTaxes(subtotal) {
  return [...document.querySelectorAll('.tax-row')].map(row => {
    const id  = row.id.replace('tax-', '');
    const pct = parseFloat(document.getElementById(`tax-pct-${id}`).value) || 0;
    const included = document.getElementById(`tax-included-${id}`).value === 'true';
    const label = document.getElementById(`tax-label-${id}`).value.trim() || 'Tax';
    const amount = Math.round(subtotal * pct / 100);

    // Update the computed display
    const comp = document.getElementById(`tax-computed-${id}`);
    if (comp) {
      const cur = document.getElementById('currency').value.trim() || 'FCFA';
      comp.textContent = `= ${amount.toLocaleString()} ${cur} (${pct}%)`;
    }

    return { label: `${label} ${pct}%`, amount, included, pct };
  });
}

function collectCustomLines() {
  return [...document.querySelectorAll('.custom-line-row')].map(row => {
    const id = row.id.replace('cline-', '');
    return {
      text:  document.getElementById(`cline-text-${id}`).value || '',
      align: alignState[`cline-align-${id}`] || 'left',
    };
  });
}

// ── Build receipt ─────────────────────────────────────────────────────────────

function buildReceipt() {
  if (!wasmReady) return;

  const shopName    = document.getElementById('shop-name').value.trim()    || 'MY SHOP';
  const shopPhone   = document.getElementById('shop-phone').value.trim()   || '';
  const shopAddress = document.getElementById('shop-address').value.trim() || '';
  const currency    = document.getElementById('currency').value.trim()     || 'FCFA';
  const width       = document.getElementById('paper-width').value;
  const lang        = document.getElementById('language').value;
  const received    = document.getElementById('received').value            || '0';
  const orderRef    = document.getElementById('order-ref').value.trim()    || '';
  const servedBy    = document.getElementById('served-by').value.trim()    || '';
  const optDate     = document.getElementById('opt-date').checked;
  const optRecNo    = document.getElementById('opt-receipt-no').checked;
  const optBarcode  = document.getElementById('opt-barcode').checked;
  const optQr       = document.getElementById('opt-qr').checked;
  const optThanks   = document.getElementById('opt-thankyou').checked;
  const optCut      = document.getElementById('opt-cut').checked;
  const qrData      = document.getElementById('qr-data').value.trim()     || '';
  const headerAlign = alignState['header-align'] || 'center';
  const footerAlign = alignState['footer-align'] || 'center';

  const items       = collectItems();

  // Compute subtotal (before tax)
  let subtotal = 0;
  for (const it of items) {
    subtotal += it.price * it.qty - it.discount;
  }

  const taxes       = collectTaxes(subtotal);
  const customLines = collectCustomLines();

  // Non-included taxes add to total
  const nonIncludedTax = taxes.filter(t => !t.included).reduce((s, t) => s + t.amount, 0);
  const total = subtotal + nonIncludedTax;

  try {
    let b = new WasmReceiptBuilder(width);
    b = b.currency(currency);
    b = b.language(lang);
    b = b.init();

    // ── Header ──
    const alignFn = { left: 'align_left', center: 'align_center', right: 'align_right' };
    b = b[alignFn[headerAlign]]();
    b = b.bold(true).double_size(true);
    b = b.text_line(shopName);
    b = b.bold(false).normal_size();
    if (shopPhone) b = b.text_line(shopPhone);
    if (shopAddress) b = b.text_line(shopAddress);

    // Date & receipt number
    if (optDate || optRecNo) {
      b = b.align_left();
      b = b.divider('-');
      if (optDate) {
        const now = new Date();
        const dateStr = now.toLocaleDateString() + '  ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        b = b.text_line(dateStr);
      }
      if (optRecNo) {
        b = b.text_line(`#${receiptNo}`);
      }
    }

    b = b.align_left();
    b = b.divider('=');

    // ── Items ──
    for (const it of items) {
      const disc = it.discount > 0 ? String(Math.round(it.discount)) : undefined;
      b = b.item(it.name, it.qty, String(Math.round(it.price)), disc);
    }

    // ── Custom lines ──
    for (const cl of customLines) {
      if (!cl.text) continue;
      b = b[alignFn[cl.align]]();
      b = b.text_line(cl.text);
      b = b.align_left();
    }

    // ── Subtotal & taxes ──
    if (items.length > 0) {
      b = b.divider('-');
      b = b.subtotal_ht(String(Math.round(subtotal)));
    }

    for (const tax of taxes) {
      if (tax.amount > 0) {
        b = b.add_tax(tax.label, String(tax.amount), tax.included);
      }
    }

    // ── Total ──
    b = b.total(String(Math.round(total)));

    // ── Payment ──
    const recv = Math.round(parseFloat(received) || 0);
    if (recv > 0) {
      b = b.received(String(recv));
      const ch = recv - Math.round(total);
      if (ch > 0) b = b.change(String(ch));
    }

    b = b.divider('=');

    // ── Footer ──
    if (optBarcode && orderRef) b = b.barcode_code128(orderRef);
    if (optQr && qrData) b = b.qr_code(qrData, 6);
    if (servedBy) b = b.served_by(servedBy);

    if (optThanks && shopName) {
      if (footerAlign !== 'center') b = b[alignFn[footerAlign]]();
      b = b.thank_you(shopName);
      b = b.align_left();
    }

    if (optCut) { b = b.feed(3); b = b.cut(); }

    const bytes = b.build();
    lastBytes = bytes;

    // Generate JS code
    lastCode = generateCode({
      shopName, shopPhone, shopAddress, currency, width, lang,
      headerAlign, footerAlign, items, taxes, customLines,
      subtotal, total, received: recv, orderRef, servedBy,
      optDate, optRecNo, optBarcode, optQr, qrData, optThanks, optCut,
      receiptNo,
    });

    renderPreview(bytes);
    updateStats(bytes, items, taxes, total, currency);
    renderHex(bytes);
    renderCode(lastCode);

    document.getElementById('download-btn').disabled  = false;
    document.getElementById('copy-hex-btn').disabled   = false;
    document.getElementById('copy-code-btn').disabled  = false;
    document.getElementById('stats-bar').style.display = 'flex';

  } catch (e) {
    showError(e.message || String(e));
    console.error(e);
  }
}

// ── Generate JS Code ─────────────────────────────────────────────────────────

function generateCode(cfg) {
  const s = (v) => JSON.stringify(v);
  const lines = [];
  lines.push(`import init, { WasmReceiptBuilder } from 'thermoprint';`);
  lines.push(`await init();`);
  lines.push(``);
  lines.push(`let b = new WasmReceiptBuilder(${s(cfg.width)});`);
  lines.push(`b = b.currency(${s(cfg.currency)});`);
  if (cfg.lang !== 'fr') lines.push(`b = b.language(${s(cfg.lang)});`);
  lines.push(`b = b.init();`);
  lines.push(``);
  lines.push(`// Header`);
  if (cfg.headerAlign !== 'center') lines.push(`b = b.align_${cfg.headerAlign}();`);
  else lines.push(`b = b.align_center();`);
  lines.push(`b = b.bold(true).double_size(true);`);
  lines.push(`b = b.text_line(${s(cfg.shopName)});`);
  lines.push(`b = b.bold(false).normal_size();`);
  if (cfg.shopPhone) lines.push(`b = b.text_line(${s(cfg.shopPhone)});`);
  if (cfg.shopAddress) lines.push(`b = b.text_line(${s(cfg.shopAddress)});`);

  if (cfg.optDate || cfg.optRecNo) {
    lines.push(`b = b.align_left();`);
    lines.push(`b = b.divider("-");`);
    if (cfg.optDate) lines.push(`b = b.text_line(new Date().toLocaleString());`);
    if (cfg.optRecNo) lines.push(`b = b.text_line("#${cfg.receiptNo}");`);
  }

  lines.push(`b = b.align_left();`);
  lines.push(`b = b.divider("=");`);
  lines.push(``);

  lines.push(`// Items`);
  for (const it of cfg.items) {
    const disc = it.discount > 0 ? s(String(Math.round(it.discount))) : 'undefined';
    lines.push(`b = b.item(${s(it.name)}, ${it.qty}, ${s(String(Math.round(it.price)))}, ${disc});`);
  }
  lines.push(``);

  if (cfg.customLines.length > 0) {
    lines.push(`// Custom lines`);
    for (const cl of cfg.customLines) {
      if (!cl.text) continue;
      if (cl.align !== 'left') lines.push(`b = b.align_${cl.align}();`);
      lines.push(`b = b.text_line(${s(cl.text)});`);
      if (cl.align !== 'left') lines.push(`b = b.align_left();`);
    }
    lines.push(``);
  }

  lines.push(`// Totals`);
  lines.push(`b = b.divider("-");`);
  lines.push(`b = b.subtotal_ht(${s(String(Math.round(cfg.subtotal)))});`);

  for (const tax of cfg.taxes) {
    if (tax.amount > 0) {
      lines.push(`b = b.add_tax(${s(tax.label)}, ${s(String(tax.amount))}, ${tax.included});`);
    }
  }

  lines.push(`b = b.total(${s(String(Math.round(cfg.total)))});`);

  if (cfg.received > 0) {
    lines.push(`b = b.received(${s(String(cfg.received))});`);
    const ch = cfg.received - Math.round(cfg.total);
    if (ch > 0) lines.push(`b = b.change(${s(String(ch))});`);
  }

  lines.push(`b = b.divider("=");`);
  lines.push(``);

  lines.push(`// Footer`);
  if (cfg.optBarcode && cfg.orderRef) lines.push(`b = b.barcode_code128(${s(cfg.orderRef)});`);
  if (cfg.optQr && cfg.qrData) lines.push(`b = b.qr_code(${s(cfg.qrData)}, 6);`);
  if (cfg.servedBy) lines.push(`b = b.served_by(${s(cfg.servedBy)});`);
  if (cfg.optThanks) lines.push(`b = b.thank_you(${s(cfg.shopName)});`);
  if (cfg.optCut) { lines.push(`b = b.feed(3);`); lines.push(`b = b.cut();`); }

  lines.push(``);
  lines.push(`const bytes = b.build(); // Uint8Array — send to printer`);

  return lines.join('\n');
}

// ── Render receipt as text preview ───────────────────────────────────────────

function renderPreview(bytes) {
  const widthVal = document.getElementById('paper-width').value;
  const cols     = widthVal === '58mm' ? 32 : (widthVal === 'a4' ? 90 : 48);
  const lines    = [];
  let   line     = '';

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];

    if (b === 0x1B) {
      i++;
      const cmd = bytes[i];
      if (cmd === 0x64 || cmd === 0x74 || cmd === 0x21) i++;
      continue;
    }
    if (b === 0x1D) {
      i++;
      const cmd = bytes[i];
      if (cmd === 0x56) { i++; if (bytes[i] === 66) i++; }
      else if (cmd === 0x21) i++;
      else if (cmd === 0x77) i++;
      else if (cmd === 0x68) i++;
      else if (cmd === 0x48) i++;
      else if (cmd === 0x66) i++;
      else if (cmd === 0x6B) { i++; const len = bytes[i]; i++; i += len - 1; }
      else if (cmd === 0x28) { i++; const pL = bytes[i]; i++; const pH = bytes[i]; i++; i += (pH << 8 | pL) - 1; }
      continue;
    }
    if (b === 0x0C) continue;
    if (b === 0x0A) { lines.push(line); line = ''; continue; }
    if (b >= 0x20 && b < 0x80) line += String.fromCharCode(b);
    else if (b > 0x80) line += cp858Char(b);
  }
  if (line) lines.push(line);

  const el    = document.getElementById('receipt-text');
  const empty = document.getElementById('empty-state');
  el.textContent      = lines.join('\n');
  el.style.display    = 'block';
  empty.style.display = 'none';
  el.style.fontSize   = cols <= 32 ? '11px' : '12px';
}

function cp858Char(b) {
  const map = {
    0x82:'e',0x83:'a',0x84:'a',0x85:'a',0x87:'c',
    0x88:'e',0x89:'e',0x8A:'e',0x8B:'i',0x8C:'i',
    0x81:'u',0x90:'E',0x93:'o',0x94:'o',0x96:'u',
    0x97:'u',0xD5:'E',0x80:'C',0xA4:'n',0xA5:'N',
    0xB7:'A',0xB6:'A',0xD4:'E',0xD2:'E',0xD7:'I',
    0xE4:'O',0xEB:'U',0xEA:'U',
  };
  return map[b] ?? '?';
}

// ── Render code output ───────────────────────────────────────────────────────

function renderCode(code) {
  document.getElementById('code-output').textContent = code;
}

// ── Stats bar ────────────────────────────────────────────────────────────────

function updateStats(bytes, items, taxes, total, currency) {
  document.getElementById('stat-bytes').textContent = `${bytes.length} bytes`;
  document.getElementById('stat-items').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-taxes').textContent = `${taxes.length} tax${taxes.length !== 1 ? 'es' : ''}`;
  document.getElementById('stat-total').textContent = `Total: ${Math.round(total).toLocaleString()} ${currency}`;
}

// ── Hex dump ─────────────────────────────────────────────────────────────────

function renderHex(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const addr  = i.toString(16).padStart(4, '0');
    const hex   = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
    parts.push(`${addr}  ${hex}`);
  }
  document.getElementById('hex-dump').textContent = parts.join('\n');
}

// ── Toolbar buttons ──────────────────────────────────────────────────────────

document.getElementById('download-btn').addEventListener('click', () => {
  if (!lastBytes) return;
  const blob = new Blob([lastBytes], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'receipt.bin';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded receipt.bin');
});

document.getElementById('copy-hex-btn').addEventListener('click', async () => {
  if (!lastBytes) return;
  const hex = [...lastBytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
  await navigator.clipboard.writeText(hex);
  showToast('Hex copied to clipboard');
});

document.getElementById('copy-code-btn').addEventListener('click', async () => {
  if (!lastCode) return;
  await navigator.clipboard.writeText(lastCode);
  showToast('JS code copied to clipboard');
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Alignment button delegation ──────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.align-btn');
  if (!btn) return;
  const group = btn.closest('.align-btns');
  if (!group) return;
  const target = group.dataset.target;
  group.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  alignState[target] = btn.dataset.align;
  buildReceipt();
});

// ── QR checkbox toggle ───────────────────────────────────────────────────────

document.getElementById('opt-qr').addEventListener('change', (e) => {
  document.getElementById('qr-data-field').style.display = e.target.checked ? 'block' : 'none';
  buildReceipt();
});

// ── Add buttons ──────────────────────────────────────────────────────────────

document.getElementById('add-item').addEventListener('click', () => { addItem(); buildReceipt(); });
document.getElementById('add-tax').addEventListener('click',  () => { addTax('Tax', 5, false); buildReceipt(); });
document.getElementById('add-custom-line').addEventListener('click', () => { addCustomLine(); buildReceipt(); });

// ── Form change listeners ────────────────────────────────────────────────────

['shop-name','shop-phone','shop-address','currency','paper-width','language',
 'received','order-ref','served-by','qr-data',
 'opt-date','opt-receipt-no','opt-barcode','opt-qr','opt-thankyou','opt-cut'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('change', buildReceipt);
  el?.addEventListener('input',  buildReceipt);
});

// ── Form submit ──────────────────────────────────────────────────────────────

document.getElementById('receipt-form').addEventListener('submit', e => {
  e.preventDefault();
  buildReceipt();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function showError(msg) {
  const el    = document.getElementById('receipt-text');
  const empty = document.getElementById('empty-state');
  el.textContent      = msg;
  el.style.display    = 'block';
  empty.style.display = 'none';
  showToast('Error — see console');
}

// ── Start ────────────────────────────────────────────────────────────────────

boot();
