/**
 * thermoprint — Receipt Builder (for developers)
 *
 * Rich semantic preview with proper alignment, barcode/QR rendering.
 * WASM builds the real ESC/POS bytes; preview is built from form state.
 *
 * Serve from project root:  make serve-demo
 */

import init, { WasmReceiptBuilder } from '../../pkg/thermoprint.js';

// ── State ─────────────────────────────────────────────────────────────────────

let wasmReady   = false;
let lastBytes   = null;
let lastCode    = '';
let itemCount   = 0;
let taxCount    = 0;
let customCount = 0;
let receiptNo   = Math.floor(Math.random() * 90000) + 10000;

const alignState = { 'header-align': 'center', 'footer-align': 'center' };

// Localized labels per language
const LABELS = {
  fr: { subtotal:'SOUS-TOTAL HT', total:'TOTAL TTC', received:'RECU', change:'MONNAIE', discount:'REMISE', servedBy:'Servi par', thanks:'Merci pour votre confiance!', inclTax:'(inclus)', exclTax:'(en sus)' },
  en: { subtotal:'SUBTOTAL', total:'TOTAL', received:'RECEIVED', change:'CHANGE', discount:'DISCOUNT', servedBy:'Served by', thanks:'Thank you for your trust!', inclTax:'(included)', exclTax:'(excluded)' },
  es: { subtotal:'SUBTOTAL', total:'TOTAL', received:'RECIBIDO', change:'CAMBIO', discount:'DESCUENTO', servedBy:'Atendido por', thanks:'Gracias por su confianza!', inclTax:'(incluido)', exclTax:'(excluido)' },
  pt: { subtotal:'SUBTOTAL', total:'TOTAL', received:'RECEBIDO', change:'TROCO', discount:'DESCONTO', servedBy:'Atendido por', thanks:'Obrigado pela confianca!', inclTax:'(incluido)', exclTax:'(excluido)' },
  ar: { subtotal:'AL-MAJMOU\' AL-JUZ\'I', total:'AL-MAJMOU\'', received:'AL-MABLAGH AL-MUSTALAM', change:'AL-BAQI', discount:'TAKHFID', servedBy:'Khadamakum', thanks:'Shukran lathiqatikum!', inclTax:'(mudamin)', exclTax:'(ghair mudamin)' },
  wo: { subtotal:'TOLLU BI', total:'TOLLU', received:'JOTNA', change:'DEMM', discount:'WANAAG', servedBy:'Kii lay teg', thanks:'Jere jef ci sa gott!', inclTax:'(ci biir)', exclTax:'(ci biti)' },
};

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
    showError('Failed to load WASM.\n\nRun `make build-wasm` and serve from project root.\n\n' + e.message);
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

// ── Helpers for preview HTML ─────────────────────────────────────────────────

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtMoney(n, cur) { return `${Math.round(n).toLocaleString()} ${cur}`; }

function pLine(text, align = 'left', cls = '') {
  return `<div class="r-line r-${align} ${cls}">${esc(text)}</div>`;
}

function pDivider(ch, cols) {
  return `<div class="r-line r-divider">${ch.repeat(cols)}</div>`;
}

function pRow(left, right, cls = '') {
  return `<div class="r-row ${cls}"><span class="r-row-left">${esc(left)}</span><span class="r-row-right">${esc(right)}</span></div>`;
}

function pBarcode(value) {
  // Generate a visual barcode pattern from the string
  const bars = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // Pseudo-random bar pattern from char code — visually convincing
    bars.push(code % 2 === 0 ? 'bar' : 'bar thin');
    bars.push('bar space');
    bars.push(code % 3 === 0 ? 'bar thin' : 'bar');
    bars.push('bar space thin');
  }
  // Add start/stop patterns
  const startStop = ['bar', 'bar thin', 'bar space', 'bar', 'bar space thin', 'bar thin'];
  const allBars = [...startStop, ...bars, ...startStop];
  const barsHtml = allBars.map(b => `<div class="r-barcode-bar ${b.includes('thin') ? 'thin' : ''} ${b.includes('space') ? 'space' : ''}"></div>`).join('');
  return `<div class="r-barcode"><div class="r-barcode-bars">${barsHtml}</div><div class="r-barcode-label">${esc(value)}</div></div>`;
}

function pQrCode(data) {
  // Generate a deterministic QR-like grid from the data string
  const size = 21; // QR version 1
  const cells = [];
  let hash = 0;
  for (let i = 0; i < data.length; i++) hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Finder patterns (top-left, top-right, bottom-left)
      const inFinder = (r, c) => r < 7 && c < 7;
      const isFinder = inFinder(row, col) || inFinder(row, col - (size - 7)) || inFinder(row - (size - 7), col);

      if (isFinder) {
        const lr = row < 7 ? row : row - (size - 7);
        const lc = col < 7 ? col : col - (size - 7);
        const border = lr === 0 || lr === 6 || lc === 0 || lc === 6;
        const inner = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
        cells.push(border || inner ? 'dark' : 'light');
      } else {
        // Data region: deterministic pseudo-random from hash + position
        const seed = Math.abs((hash * (row + 1) * 7 + (col + 1) * 13) ^ (hash >> (row % 8)));
        cells.push(seed % 3 !== 0 ? 'dark' : 'light');
      }
    }
  }

  const gridCss = `grid-template-columns: repeat(${size}, 4px)`;
  const cellsHtml = cells.map(c => `<div class="r-qr-cell ${c}"></div>`).join('');
  return `<div class="r-qr"><div class="r-qr-grid" style="${gridCss}">${cellsHtml}</div><div class="r-qr-label">${esc(data)}</div></div>`;
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

  const cols = width === '58mm' ? 32 : (width === 'a4' ? 90 : 48);
  const items = collectItems();
  const lbl = LABELS[lang] || LABELS.fr;

  let subtotal = 0;
  for (const it of items) subtotal += it.price * it.qty - it.discount;

  const taxes = collectTaxes(subtotal);
  const customLines = collectCustomLines();
  const nonIncludedTax = taxes.filter(t => !t.included).reduce((s, t) => s + t.amount, 0);
  const total = subtotal + nonIncludedTax;
  const recv = Math.round(parseFloat(received) || 0);

  // ── Build WASM bytes ──
  try {
    const alignFn = { left: 'align_left', center: 'align_center', right: 'align_right' };
    let b = new WasmReceiptBuilder(width);
    b = b.currency(currency);
    b = b.language(lang);
    b = b.init();

    b = b[alignFn[headerAlign]]();
    b = b.bold(true).double_size(true);
    b = b.text_line(shopName);
    b = b.bold(false).normal_size();
    if (shopPhone) b = b.text_line(shopPhone);
    if (shopAddress) b = b.text_line(shopAddress);

    if (optDate || optRecNo) {
      b = b.align_left();
      b = b.divider('-');
      if (optDate) {
        const now = new Date();
        b = b.text_line(now.toLocaleDateString() + '  ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      if (optRecNo) b = b.text_line(`#${receiptNo}`);
    }

    b = b.align_left();
    b = b.divider('=');

    for (const it of items) {
      const disc = it.discount > 0 ? String(Math.round(it.discount)) : undefined;
      b = b.item(it.name, it.qty, String(Math.round(it.price)), disc);
    }

    for (const cl of customLines) {
      if (!cl.text) continue;
      b = b[alignFn[cl.align]]();
      b = b.text_line(cl.text);
      b = b.align_left();
    }

    if (items.length > 0) {
      b = b.divider('-');
      b = b.subtotal_ht(String(Math.round(subtotal)));
    }

    for (const tax of taxes) {
      if (tax.amount > 0) b = b.add_tax(tax.label, String(tax.amount), tax.included);
    }

    b = b.total(String(Math.round(total)));

    if (recv > 0) {
      b = b.received(String(recv));
      const ch = recv - Math.round(total);
      if (ch > 0) b = b.change(String(ch));
    }

    b = b.divider('=');

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

    // ── Build semantic preview HTML ──
    const html = [];

    // Header
    html.push(pLine(shopName, headerAlign, 'r-big'));
    if (shopPhone) html.push(pLine(shopPhone, headerAlign));
    if (shopAddress) html.push(pLine(shopAddress, headerAlign));

    // Date & receipt number
    if (optDate || optRecNo) {
      html.push(pDivider('-', cols));
      if (optDate) {
        const now = new Date();
        html.push(pLine(now.toLocaleDateString() + '  ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'left'));
      }
      if (optRecNo) html.push(pLine(`#${receiptNo}`, 'left'));
    }

    html.push(pDivider('=', cols));

    // Items
    for (const it of items) {
      const lineTotal = it.price * it.qty;
      html.push(pRow(`${it.name} x${it.qty}`, fmtMoney(lineTotal, currency)));
      if (it.discount > 0) {
        html.push(pRow(`  ${lbl.discount}`, `- ${fmtMoney(it.discount, currency)}`));
      }
    }

    // Custom lines
    for (const cl of customLines) {
      if (cl.text) html.push(pLine(cl.text, cl.align));
    }

    // Subtotal & taxes
    if (items.length > 0) {
      html.push(pDivider('-', cols));
      html.push(pRow(lbl.subtotal, fmtMoney(subtotal, currency), 'r-bold'));
    }

    for (const tax of taxes) {
      if (tax.amount > 0) {
        const suffix = tax.included ? ` ${lbl.inclTax}` : ` ${lbl.exclTax}`;
        html.push(pRow(`${tax.label}${suffix}`, fmtMoney(tax.amount, currency)));
      }
    }

    // Total
    html.push(pRow(lbl.total, fmtMoney(total, currency), 'r-row-total r-bold'));

    // Payment
    if (recv > 0) {
      html.push(pRow(lbl.received, fmtMoney(recv, currency)));
      const ch = recv - Math.round(total);
      if (ch > 0) html.push(pRow(lbl.change, fmtMoney(ch, currency), 'r-bold'));
    }

    html.push(pDivider('=', cols));

    // Barcode
    if (optBarcode && orderRef) html.push(pBarcode(orderRef));

    // QR code
    if (optQr && qrData) html.push(pQrCode(qrData));

    // Served by
    if (servedBy) html.push(pLine(`${lbl.servedBy}: ${servedBy}`, 'center'));

    // Thank you
    if (optThanks && shopName) html.push(pLine(lbl.thanks, footerAlign, 'r-bold'));

    // Cut
    if (optCut) html.push('<div class="r-cut">--- CUT ---</div>');

    // Render
    const el = document.getElementById('receipt-content');
    const empty = document.getElementById('empty-state');
    el.innerHTML = html.join('');
    el.style.display = 'block';
    empty.style.display = 'none';

    // Code gen
    lastCode = generateCode({
      shopName, shopPhone, shopAddress, currency, width, lang,
      headerAlign, footerAlign, items, taxes, customLines,
      subtotal, total, received: recv, orderRef, servedBy,
      optDate, optRecNo, optBarcode, optQr, qrData, optThanks, optCut,
      receiptNo,
    });

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
  const L = [];
  L.push(`import init, { WasmReceiptBuilder } from 'thermoprint';`);
  L.push(`await init();`);
  L.push(``);
  L.push(`let b = new WasmReceiptBuilder(${s(cfg.width)});`);
  L.push(`b = b.currency(${s(cfg.currency)});`);
  if (cfg.lang !== 'fr') L.push(`b = b.language(${s(cfg.lang)});`);
  L.push(`b = b.init();`);
  L.push(``);

  L.push(`// Header`);
  L.push(`b = b.align_${cfg.headerAlign}();`);
  L.push(`b = b.bold(true).double_size(true);`);
  L.push(`b = b.text_line(${s(cfg.shopName)});`);
  L.push(`b = b.bold(false).normal_size();`);
  if (cfg.shopPhone) L.push(`b = b.text_line(${s(cfg.shopPhone)});`);
  if (cfg.shopAddress) L.push(`b = b.text_line(${s(cfg.shopAddress)});`);

  if (cfg.optDate || cfg.optRecNo) {
    L.push(`b = b.align_left();`);
    L.push(`b = b.divider("-");`);
    if (cfg.optDate) L.push(`b = b.text_line(new Date().toLocaleString());`);
    if (cfg.optRecNo) L.push(`b = b.text_line("#${cfg.receiptNo}");`);
  }

  L.push(`b = b.align_left();`);
  L.push(`b = b.divider("=");`);
  L.push(``);

  L.push(`// Items`);
  for (const it of cfg.items) {
    const disc = it.discount > 0 ? s(String(Math.round(it.discount))) : 'undefined';
    L.push(`b = b.item(${s(it.name)}, ${it.qty}, ${s(String(Math.round(it.price)))}, ${disc});`);
  }
  L.push(``);

  if (cfg.customLines.length > 0) {
    L.push(`// Custom lines`);
    for (const cl of cfg.customLines) {
      if (!cl.text) continue;
      if (cl.align !== 'left') L.push(`b = b.align_${cl.align}();`);
      L.push(`b = b.text_line(${s(cl.text)});`);
      if (cl.align !== 'left') L.push(`b = b.align_left();`);
    }
    L.push(``);
  }

  L.push(`// Totals`);
  if (cfg.items.length > 0) {
    L.push(`b = b.divider("-");`);
    L.push(`b = b.subtotal_ht(${s(String(Math.round(cfg.subtotal)))});`);
  }

  for (const tax of cfg.taxes) {
    if (tax.amount > 0) {
      L.push(`b = b.add_tax(${s(tax.label)}, ${s(String(tax.amount))}, ${tax.included});`);
    }
  }

  L.push(`b = b.total(${s(String(Math.round(cfg.total)))});`);

  if (cfg.received > 0) {
    L.push(`b = b.received(${s(String(cfg.received))});`);
    const ch = cfg.received - Math.round(cfg.total);
    if (ch > 0) L.push(`b = b.change(${s(String(ch))});`);
  }

  L.push(`b = b.divider("=");`);
  L.push(``);

  L.push(`// Footer`);
  if (cfg.optBarcode && cfg.orderRef) L.push(`b = b.barcode_code128(${s(cfg.orderRef)});`);
  if (cfg.optQr && cfg.qrData) L.push(`b = b.qr_code(${s(cfg.qrData)}, 6);`);
  if (cfg.servedBy) L.push(`b = b.served_by(${s(cfg.servedBy)});`);
  if (cfg.optThanks) {
    if (cfg.footerAlign !== 'center') L.push(`b = b.align_${cfg.footerAlign}();`);
    L.push(`b = b.thank_you(${s(cfg.shopName)});`);
  }
  if (cfg.optCut) { L.push(`b = b.feed(3);`); L.push(`b = b.cut();`); }

  L.push(``);
  L.push(`const bytes = b.build(); // Uint8Array — send to printer`);

  return L.join('\n');
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
  const el = document.getElementById('receipt-content');
  const empty = document.getElementById('empty-state');
  el.textContent      = msg;
  el.style.display    = 'block';
  empty.style.display = 'none';
  showToast('Error — see console');
}

// ── Start ────────────────────────────────────────────────────────────────────

boot();
