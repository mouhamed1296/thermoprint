/**
 * thermoprint web example
 *
 * Loads the WASM package from ../../pkg/ (built by `make build-wasm`).
 * Must be served from the project root:
 *   npx serve .              # then open http://localhost:3000/examples/web/
 *   python3 -m http.server   # then open http://localhost:8000/examples/web/
 */

import init, { WasmReceiptBuilder } from '../../pkg/thermoprint.js';

// ── State ─────────────────────────────────────────────────────────────────────

let wasmReady = false;
let lastBytes  = null;
let itemCount  = 0;
let taxCount   = 0;

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    await init();
    wasmReady = true;
    document.getElementById('build-btn').disabled = false;
    addItem();   // one default item row
    addTax();    // one default tax row
    buildReceipt();
  } catch (e) {
    showError('Failed to load WASM. Make sure you ran `make build-wasm` and are serving from the project root.\n\n' + e.message);
    console.error(e);
  }
}

// ── Item rows ─────────────────────────────────────────────────────────────────

function addItem() {
  const id = ++itemCount;
  const list = document.getElementById('items-list');
  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = `item-${id}`;
  row.innerHTML = `
    <div class="item-row-grid">
      <div class="field">
        <label for="item-name-${id}">Name</label>
        <input type="text" id="item-name-${id}" value="Polo Ralph Lauren" />
      </div>
      <div class="field">
        <label for="item-qty-${id}">Qty</label>
        <input type="number" id="item-qty-${id}" value="1" min="1" />
      </div>
      <div class="field">
        <label for="item-price-${id}">Price</label>
        <input type="number" id="item-price-${id}" value="15000" min="0" />
      </div>
      <div class="field">
        <label for="item-disc-${id}">Discount</label>
        <input type="number" id="item-disc-${id}" value="" min="0" placeholder="0" />
      </div>
    </div>
    <button class="btn-remove" type="button" title="Remove item">&times;</button>
  `;
  list.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    buildReceipt();
  });
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', buildReceipt));
}

// ── Tax rows ──────────────────────────────────────────────────────────────────

function addTax() {
  const id = ++taxCount;
  const list = document.getElementById('taxes-list');
  const row = document.createElement('div');
  row.className = 'tax-row';
  row.id = `tax-${id}`;
  row.innerHTML = `
    <div class="tax-row-grid">
      <div class="field">
        <label for="tax-label-${id}">Label</label>
        <input type="text" id="tax-label-${id}" value="TVA 18%" />
      </div>
      <div class="field">
        <label for="tax-amount-${id}">Amount</label>
        <input type="number" id="tax-amount-${id}" value="0" min="0" />
      </div>
      <div class="field">
        <label for="tax-included-${id}">Included</label>
        <select id="tax-included-${id}">
          <option value="true" selected>Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    </div>
    <button class="btn-remove" type="button" title="Remove tax">&times;</button>
  `;
  list.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    buildReceipt();
  });
  row.querySelectorAll('input, select').forEach(i => i.addEventListener('input', buildReceipt));
}

// ── Build receipt ─────────────────────────────────────────────────────────────

function collectItems() {
  return [...document.querySelectorAll('.item-row')].map(row => {
    const id = row.id.replace('item-', '');
    return {
      name:     document.getElementById(`item-name-${id}`).value.trim() || 'Article',
      qty:      parseInt(document.getElementById(`item-qty-${id}`).value)  || 1,
      price:    document.getElementById(`item-price-${id}`).value          || '0',
      discount: document.getElementById(`item-disc-${id}`).value.trim()    || null,
    };
  });
}

function collectTaxes() {
  return [...document.querySelectorAll('.tax-row')].map(row => {
    const id = row.id.replace('tax-', '');
    return {
      label:    document.getElementById(`tax-label-${id}`).value.trim() || 'Tax',
      amount:   document.getElementById(`tax-amount-${id}`).value       || '0',
      included: document.getElementById(`tax-included-${id}`).value === 'true',
    };
  });
}

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
  const optBarcode  = document.getElementById('opt-barcode').checked;
  const optThanks   = document.getElementById('opt-thankyou').checked;
  const optCut      = document.getElementById('opt-cut').checked;

  const items  = collectItems();
  const taxes  = collectTaxes();

  try {
    // Note: wasm-bindgen keeps snake_case method names from Rust
    let b = new WasmReceiptBuilder(width);
    b = b.currency(currency);
    b = b.language(lang);
    b = b.init();

    // Header
    if (shopName) {
      b = b.shop_header(shopName, shopPhone, shopAddress);
      b = b.divider('=');
    }

    // Items
    let subtotal = 0;
    for (const it of items) {
      const price = Math.round(parseFloat(it.price) || 0);
      const disc  = it.discount ? Math.round(parseFloat(it.discount) || 0) : null;
      const qty   = it.qty;
      b = b.item(it.name, qty, String(price), disc ? String(disc) : undefined);
      subtotal += price * qty - (disc ?? 0);
    }

    // Taxes & totals
    const nonIncludedTax = taxes
      .filter(t => !t.included && parseFloat(t.amount) > 0)
      .reduce((s, t) => s + Math.round(parseFloat(t.amount) || 0), 0);

    const total = subtotal + nonIncludedTax;

    if (items.length > 0) {
      b = b.divider('-');
      b = b.subtotal_ht(String(subtotal));
    }

    for (const tax of taxes) {
      const amt = Math.round(parseFloat(tax.amount) || 0);
      if (amt > 0) {
        b = b.add_tax(tax.label, String(amt), tax.included);
      }
    }

    b = b.total(String(total));

    const recv = Math.round(parseFloat(received) || 0);
    if (recv > 0) {
      b = b.received(String(recv));
      const ch = recv - total;
      if (ch > 0) b = b.change(String(ch));
    }

    b = b.divider('=');

    if (optBarcode && orderRef) b = b.barcode_code128(orderRef);
    if (servedBy) b = b.served_by(servedBy);
    if (optThanks && shopName) b = b.thank_you(shopName);
    if (optCut) { b = b.feed(3); b = b.cut(); }

    const bytes = b.build();
    lastBytes = bytes;

    renderPreview(bytes);
    updateStats(bytes, items, total, currency);
    renderHex(bytes);

    document.getElementById('download-btn').disabled   = false;
    document.getElementById('copy-hex-btn').disabled   = false;
    document.getElementById('hex-panel').style.display = 'flex';
    document.getElementById('stats-bar').style.display = 'flex';

  } catch (e) {
    showError(e.message || String(e));
    console.error(e);
  }
}

// ── Render receipt as text preview ───────────────────────────────────────────

function renderPreview(bytes) {
  const widthVal = document.getElementById('paper-width').value;
  const cols     = widthVal === '58mm' ? 32 : (widthVal === 'a4' ? 90 : 48);
  const lines    = [];
  let   line     = '';

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];

    // Skip ESC sequences (ESC + command byte, optionally + param)
    if (b === 0x1B) {
      i++;
      const cmd = bytes[i];
      if (cmd === 0x64 || cmd === 0x74 || cmd === 0x21) i++; // ESC d n, ESC t n, ESC ! n
      continue;
    }
    // Skip GS sequences (barcodes, QR, cut, font size, etc.)
    if (b === 0x1D) {
      i++;
      const cmd = bytes[i];
      if (cmd === 0x56) { // GS V — cut
        i++;
        if (bytes[i] === 66) i++; // GS V 66 n
      }
      else if (cmd === 0x21) i++;     // GS ! n — font size
      else if (cmd === 0x77) i++;     // GS w n — barcode width
      else if (cmd === 0x68) i++;     // GS h n — barcode height
      else if (cmd === 0x48) i++;     // GS H n — HRI pos
      else if (cmd === 0x66) i++;     // GS f n — HRI font
      else if (cmd === 0x6B) {        // GS k — barcode data
        i++;                          // skip type
        const len = bytes[i]; i++;    // length byte
        i += len - 1;                 // skip data
      } else if (cmd === 0x28) {      // GS ( k — QR / 2D
        i++;                          // skip 'k'
        const pL = bytes[i]; i++;
        const pH = bytes[i]; i++;
        i += (pH << 8 | pL) - 1;
      }
      continue;
    }
    if (b === 0x0C) continue;         // FF
    if (b === 0x0A) { lines.push(line); line = ''; continue; }
    if (b >= 0x20 && b < 0x80) line += String.fromCharCode(b);
    else if (b > 0x80) line += cp858Char(b);
  }
  if (line) lines.push(line);

  const el    = document.getElementById('receipt-text');
  const empty = document.getElementById('empty-state');
  el.textContent    = lines.join('\n');
  el.style.display  = 'block';
  empty.style.display = 'none';
  el.style.fontSize = cols <= 32 ? '11px' : '12px';
}

// Minimal CP858 high-byte decode for preview
function cp858Char(b) {
  const map = {
    0x82:'e', 0x83:'a', 0x84:'a', 0x85:'a', 0x87:'c',
    0x88:'e', 0x89:'e', 0x8A:'e', 0x8B:'i', 0x8C:'i',
    0x81:'u', 0x90:'E', 0x93:'o', 0x94:'o', 0x96:'u',
    0x97:'u', 0xD5:'E', 0x80:'C', 0xA4:'n', 0xA5:'N',
    0xB7:'A', 0xB6:'A', 0xD4:'E', 0xD2:'E', 0xD7:'I',
    0xE4:'O', 0xEB:'U', 0xEA:'U',
  };
  return map[b] ?? '?';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function updateStats(bytes, items, total, currency) {
  document.getElementById('stat-bytes').textContent = `${bytes.length} bytes`;
  document.getElementById('stat-items').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-total').textContent = `Total: ${total.toLocaleString()} ${currency}`;
}

// ── Hex dump ──────────────────────────────────────────────────────────────────

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

// ── Download ──────────────────────────────────────────────────────────────────

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

// ── Copy hex ──────────────────────────────────────────────────────────────────

document.getElementById('copy-hex-btn').addEventListener('click', async () => {
  if (!lastBytes) return;
  const hex = [...lastBytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
  await navigator.clipboard.writeText(hex);
  showToast('Hex copied to clipboard');
});

// ── Toggle hex panel ──────────────────────────────────────────────────────────

document.getElementById('toggle-hex').addEventListener('click', () => {
  const dump   = document.getElementById('hex-dump');
  const btn    = document.getElementById('toggle-hex');
  const hidden = dump.style.display === 'none';
  dump.style.display = hidden ? 'block' : 'none';
  btn.textContent    = hidden ? 'Hide' : 'Show';
});

// ── Add item / tax buttons ────────────────────────────────────────────────────

document.getElementById('add-item').addEventListener('click', () => { addItem(); buildReceipt(); });
document.getElementById('add-tax').addEventListener('click',  () => { addTax();  buildReceipt(); });

// ── Form change listeners ─────────────────────────────────────────────────────

['shop-name','shop-phone','shop-address','currency','paper-width','language',
 'received','order-ref','served-by',
 'opt-barcode','opt-thankyou','opt-cut'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('change', buildReceipt);
  el?.addEventListener('input',  buildReceipt);
});

// ── Form submit ───────────────────────────────────────────────────────────────

document.getElementById('receipt-form').addEventListener('submit', e => {
  e.preventDefault();
  buildReceipt();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  showToast('Error — check console');
}

// ── Start ─────────────────────────────────────────────────────────────────────

boot();
