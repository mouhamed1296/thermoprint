/**
 * ReceiptExporter — render receipt templates to PNG or PDF.
 *
 * Zero dependencies. Browser-only (uses HTMLCanvasElement, Blob, FileReader).
 *
 * @example
 * import { ReceiptExporter } from 'thermoprint/export';
 *
 * const exporter = new ReceiptExporter(template);
 * const dataUrl = await exporter.toPNG();        // data:image/png;base64,...
 * const blob    = await exporter.toPNGBlob();    // Blob
 * await exporter.downloadPNG('receipt.png');
 * await exporter.downloadPDF('receipt.pdf');     // real PDF, no dependencies
 */

/**
 * @typedef {Object} ExportOptions
 * @property {number} [scale=2]         - Pixel scale factor (2 = retina).
 * @property {string} [fontFamily='Courier New, monospace'] - Monospace font.
 * @property {number} [fontSize=14]     - Base font size in pixels.
 * @property {number} [lineHeight=1.4]  - Line height multiplier.
 * @property {number} [paddingX=16]     - Horizontal padding in pixels.
 * @property {number} [paddingY=16]     - Vertical padding in pixels.
 * @property {string} [bgColor='#fff']  - Background colour.
 * @property {string} [fgColor='#000']  - Text colour.
 */

/** Column widths for each paper size */
const COLS = { '58mm': 32, '80mm': 48, 'a4': 90 };

export class ReceiptExporter {
  /**
   * @param {object} template - Receipt template (same format as JSON template engine).
   * @param {ExportOptions} [opts]
   */
  constructor(template, opts = {}) {
    this._template = template;
    this._scale = opts.scale || 2;
    this._fontFamily = opts.fontFamily || 'Courier New, monospace';
    this._fontSize = opts.fontSize || 14;
    this._lineHeight = opts.lineHeight || 1.4;
    this._paddingX = opts.paddingX || 16;
    this._paddingY = opts.paddingY || 16;
    this._bgColor = opts.bgColor || '#fff';
    this._fgColor = opts.fgColor || '#000';
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Render the receipt and return a PNG data URL.
   * @returns {Promise<string>} data:image/png;base64,...
   */
  async toPNG() {
    const canvas = this._render();
    return canvas.toDataURL('image/png');
  }

  /**
   * Render the receipt and return a PNG Blob.
   * @returns {Promise<Blob>}
   */
  toPNGBlob() {
    const canvas = this._render();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('ReceiptExporter: toBlob() returned null')),
        'image/png'
      );
    });
  }

  /**
   * Render and trigger a PNG file download.
   * @param {string} [filename='receipt.png']
   * @returns {Promise<void>}
   */
  async downloadPNG(filename = 'receipt.png') {
    const url = await this.toPNG();
    this._triggerDownload(url, filename);
  }

  /**
   * Render and trigger a real PDF file download.
   * Zero dependencies — builds a valid PDF 1.4 binary from scratch,
   * embedding the receipt as a PNG image XObject.
   * @param {string} [filename='receipt.pdf']
   * @returns {Promise<void>}
   */
  async downloadPDF(filename = 'receipt.pdf') {
    const blob = await this._buildPDF();
    const url = URL.createObjectURL(blob);
    this._triggerDownload(url, filename);
    // Delay revoke so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Get the rendered HTMLCanvasElement (for embedding in the DOM).
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this._render();
  }

  // ── PDF construction ───────────────────────────────────────────────────

  /**
   * Build a valid PDF 1.4 binary that embeds the receipt PNG as an image
   * XObject on a single page sized to fit the receipt exactly.
   *
   * PDF structure:
   *   1 0 obj  Catalog
   *   2 0 obj  Pages
   *   3 0 obj  Page  (MediaBox sized to receipt)
   *   4 0 obj  Content stream  (q … cm /Img Do Q)
   *   5 0 obj  Image XObject   (raw IDAT deflate stream, /Filter /FlateDecode)
   *
   * PNG IDAT chunks already contain a zlib-wrapped deflate stream, which is
   * exactly what PDF's /FlateDecode filter consumes. We strip the PNG envelope
   * (signature + chunk headers/CRCs) and embed the raw IDAT bytes directly —
   * no re-encoding, no compression library needed.
   * @private
   * @returns {Promise<Blob>}
   */
  async _buildPDF() {
    const canvas = this._render();

    // Logical size (un-scaled) → PDF points (1pt = 1/72in, screen ~96dpi)
    const pxW = canvas.width / this._scale;
    const pxH = canvas.height / this._scale;
    const ptW = +(pxW * 0.75).toFixed(2);
    const ptH = +(pxH * 0.75).toFixed(2);

    // Full scaled canvas size goes into the PDF image descriptor
    const imgW = canvas.width;
    const imgH = canvas.height;

    // Get PNG bytes from the canvas
    const pngBlob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('ReceiptExporter: toBlob() returned null')),
        'image/png'
      )
    );
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    // ── Extract IDAT (deflate) payload from PNG chunks ────────────────────
    // PNG layout: 8-byte signature, then chunks: [4 len][4 type][data][4 CRC]
    const idatChunks = [];
    let pos = 8; // skip signature
    while (pos + 12 <= pngBytes.length) {
      const chunkLen =
        (pngBytes[pos]     << 24 | pngBytes[pos + 1] << 16 |
         pngBytes[pos + 2] <<  8 | pngBytes[pos + 3]) >>> 0;
      const chunkType = String.fromCharCode(
        pngBytes[pos + 4], pngBytes[pos + 5],
        pngBytes[pos + 6], pngBytes[pos + 7]
      );
      if (chunkType === 'IDAT') {
        idatChunks.push(pngBytes.subarray(pos + 8, pos + 8 + chunkLen));
      }
      if (chunkType === 'IEND') break;
      pos += 12 + chunkLen;
    }

    // Concatenate all IDAT payloads
    const idatLen = idatChunks.reduce((s, c) => s + c.length, 0);
    const idat = new Uint8Array(idatLen);
    let idatCursor = 0;
    for (const chunk of idatChunks) { idat.set(chunk, idatCursor); idatCursor += chunk.length; }

    // ── Assemble PDF ──────────────────────────────────────────────────────
    const enc = new TextEncoder();
    const parts   = []; // Uint8Array segments
    const offsets = []; // byte offset of each PDF object (for xref)
    let byteLen = 0;

    const pushStr = (str) => {
      const b = enc.encode(str); parts.push(b); byteLen += b.length;
    };
    const pushBin = (bin) => {
      parts.push(bin); byteLen += bin.length;
    };
    const markObj = () => offsets.push(byteLen);

    // Header — the 4 high-bit bytes tell PDF readers this file is binary
    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // 1 — Catalog
    markObj();
    pushStr('1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n');

    // 2 — Pages
    markObj();
    pushStr('2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n');

    // 3 — Page
    markObj();
    pushStr(
      '3 0 obj\n<<\n' +
      '/Type /Page\n' +
      '/Parent 2 0 R\n' +
      `/MediaBox [0 0 ${ptW} ${ptH}]\n` +
      '/Contents 4 0 R\n' +
      '/Resources << /XObject << /Img 5 0 R >> >>\n' +
      '>>\nendobj\n'
    );

    // 4 — Content stream: place image filling the whole page
    // PDF origin is bottom-left; the cm matrix [w 0 0 h tx ty] maps the unit
    // square to the full page rect.
    const cs = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n/Img Do\nQ\n`;
    markObj();
    pushStr(`4 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}endstream\nendobj\n`);

    // 5 — Image XObject (PNG IDAT bytes = zlib deflate, consumed by FlateDecode)
    // /DecodeParms tells the PDF renderer how to unfilter the deflate stream
    // back into raw RGB scanlines (same params the PNG encoder used).
    markObj();
    pushStr(
      '5 0 obj\n<<\n' +
      '/Type /XObject\n/Subtype /Image\n' +
      `/Width ${imgW}\n/Height ${imgH}\n` +
      '/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n' +
      '/Filter /FlateDecode\n' +
      `/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${imgW} >>\n` +
      `/Length ${idat.length}\n` +
      '>>\nstream\n'
    );
    pushBin(idat);
    pushStr('\nendstream\nendobj\n');

    // xref table
    const xrefOffset = byteLen;
    pushStr('xref\n');
    pushStr(`0 ${offsets.length + 1}\n`);
    pushStr('0000000000 65535 f \n');
    for (const off of offsets) {
      pushStr(off.toString().padStart(10, '0') + ' 00000 n \n');
    }

    // Trailer
    pushStr(
      'trailer\n<<\n' +
      `/Size ${offsets.length + 1}\n` +
      '/Root 1 0 R\n' +
      '>>\n' +
      `startxref\n${xrefOffset}\n%%EOF\n`
    );

    // Merge all parts
    const total = parts.reduce((s, p) => s + p.length, 0);
    const pdf = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) { pdf.set(part, cursor); cursor += part.length; }

    return new Blob([pdf], { type: 'application/pdf' });
  }

  // ── Canvas rendering ───────────────────────────────────────────────────

  /** @private */
  _render() {
    const t = this._template;
    const cols = COLS[t.width] || COLS['80mm'];
    const scale = this._scale;
    const fontSize = this._fontSize;
    const lh = Math.round(fontSize * this._lineHeight);
    const px = this._paddingX;
    const py = this._paddingY;
    const charW = fontSize * 0.6;
    const contentW = Math.ceil(cols * charW);
    const canvasW = contentW + px * 2;

    const lines = this._buildLines(t.elements, cols);
    const canvasH = py * 2 + lines.length * lh + 20;

    // Always use HTMLCanvasElement in the browser — it has toDataURL() and toBlob().
    const canvas = document.createElement('canvas');
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = this._bgColor;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = this._fgColor;
    let y = py + fontSize;
    const baseFont = `${fontSize}px ${this._fontFamily}`;

    for (const line of lines) {
      let font = baseFont;
      if (line.bold && line.big)   font = `bold ${fontSize * 1.6}px ${this._fontFamily}`;
      else if (line.bold)          font = `bold ${fontSize}px ${this._fontFamily}`;
      else if (line.big)           font = `${fontSize * 1.6}px ${this._fontFamily}`;
      ctx.font = font;

      if (line.type === 'divider') {
        ctx.font = baseFont;
        ctx.fillText((line.char || '-').repeat(cols), px, y);
      } else if (line.type === 'barcode') {
        this._drawBarcode(ctx, px, y - fontSize, contentW, lh + 8, line.value);
        y += 8;
      } else if (line.type === 'qr') {
        this._drawQR(ctx, px + contentW / 2 - 40, y - fontSize, 80, line.data);
        y += 80 - lh + 8;
      } else if (line.type === 'cut') {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(px, y - fontSize / 2);
        ctx.lineTo(px + contentW, y - fontSize / 2);
        ctx.stroke();
        ctx.restore();
      } else {
        const text = line.text || '';
        if (line.align === 'center') {
          ctx.fillText(text, px + (contentW - ctx.measureText(text).width) / 2, y);
        } else if (line.align === 'right') {
          ctx.fillText(text, px + contentW - ctx.measureText(text).width, y);
        } else {
          ctx.fillText(text, px, y);
        }
      }

      y += lh;
    }

    return canvas;
  }

  /** @private */
  _buildLines(elements, cols) {
    const lines = [];
    let align = 'left';
    let bold = false;
    let big = false;
    const currency = this._template.currency || 'FCFA';

    const fmtAmount = (amt) => `${parseFloat(amt).toLocaleString()} ${currency}`;
    const twoCol = (left, right) => {
      const gap = cols - left.length - right.length;
      if (gap <= 0) return left.substring(0, cols - right.length - 1) + ' ' + right;
      return left + ' '.repeat(gap) + right;
    };
    const rightAlign = (text) => {
      const gap = cols - text.length;
      return gap > 0 ? ' '.repeat(gap) + text : text;
    };
    const push = (text, overrides = {}) =>
      lines.push({ type: 'text', text, align, bold, big, ...overrides });

    for (const el of elements) {
      switch (el.type) {
        case 'init':
          align = 'left'; bold = false; big = false;
          break;
        case 'shop_header':
          lines.push({ type: 'text', text: el.name,    align: 'center', bold: true,  big: true  });
          if (el.phone)   lines.push({ type: 'text', text: el.phone,   align: 'center', bold: false, big: false });
          if (el.address) lines.push({ type: 'text', text: el.address, align: 'center', bold: false, big: false });
          break;
        case 'text_line':   push(el.text); break;
        case 'centered':    push(el.text, { align: 'center' }); break;
        case 'right':       push(el.text, { align: 'right'  }); break;
        case 'row':         push(twoCol(el.left, el.right)); break;
        case 'divider':     lines.push({ type: 'divider', char: el.char || '-', bold: false, big: false }); break;
        case 'blank':       push(''); break;
        case 'bold':        bold = el.on !== false; break;
        case 'double_size': big  = el.on !== false; break;
        case 'double_height': big = el.on !== false; break;
        case 'normal_size': big  = false; break;
        case 'underline':   break;
        case 'align':       align = el.value || 'left'; break;
        case 'item': {
          const qty = el.qty || 1;
          const up = parseFloat(el.unit_price) || 0;
          const lineTotal = qty * up;
          push(el.name, { bold: true });
          push(`${qty} x ${fmtAmount(el.unit_price)}`, { bold: false });
          if (el.discount && parseFloat(el.discount) > 0) {
            push(rightAlign(fmtAmount(String(lineTotal))));
            push(`  Discount: -${fmtAmount(el.discount)}`);
            push(rightAlign(fmtAmount(String(lineTotal - parseFloat(el.discount)))), { bold: true });
          } else {
            push(rightAlign(fmtAmount(String(lineTotal))));
          }
          push('');
          break;
        }
        case 'subtotal': push(twoCol('SUBTOTAL', fmtAmount(el.amount)), { bold: true }); break;
        case 'tax':
          push(twoCol(
            `  ${el.label}${el.included ? ' (incl.)' : ''}`,
            el.included ? fmtAmount(el.amount) : `+ ${fmtAmount(el.amount)}`
          ));
          break;
        case 'discount': {
          const label = el.coupon_code ? `DISCOUNT (${el.coupon_code})` : 'DISCOUNT';
          push(twoCol(label, `-${fmtAmount(el.amount)}`));
          break;
        }
        case 'total':    push(twoCol('TOTAL',    fmtAmount(el.amount)), { bold: true, big: true }); break;
        case 'received': push(twoCol('RECEIVED', fmtAmount(el.amount))); break;
        case 'change':   push(twoCol('CHANGE',   fmtAmount(el.amount))); break;
        case 'served_by': push(`Served by: ${el.name}`); break;
        case 'thank_you':
          push('Thank you for your purchase!', { align: 'center' });
          push(`See you soon at ${el.shop_name}`, { align: 'center' });
          break;
        case 'barcode_code128':
        case 'barcode_ean13':
          lines.push({ type: 'barcode', value: el.value, bold: false, big: false });
          break;
        case 'qr_code':
          lines.push({ type: 'qr', data: el.data, bold: false, big: false });
          break;
        case 'feed':
          for (let i = 0; i < (el.lines || 3); i++) push('');
          break;
        case 'cut':
        case 'cut_full':
          lines.push({ type: 'cut', bold: false, big: false });
          break;
        default:
          break;
      }
    }

    return lines;
  }

  /** @private */
  _drawBarcode(ctx, x, y, maxW, h, value) {
    const barW = Math.min(maxW * 0.7, 300);
    const startX = x + (maxW - barW) / 2;
    ctx.fillStyle = this._fgColor;
    let seed = 0;
    for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) & 0xFFFF;
    const numBars = Math.floor(barW / 2);
    for (let i = 0; i < numBars; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      if (seed % 3 !== 0) ctx.fillRect(startX + i * 2, y, 1, h - 14);
    }
    ctx.font = `10px ${this._fontFamily}`;
    const tw = ctx.measureText(value).width;
    ctx.fillText(value, x + (maxW - tw) / 2, y + h - 2);
    ctx.font = `${this._fontSize}px ${this._fontFamily}`;
  }

  /** @private */
  _drawQR(ctx, x, y, size, data) {
    const cells = 21;
    const cellSize = size / cells;
    ctx.fillStyle = this._fgColor;
    const drawFinder = (fx, fy) => {
      for (let dy = 0; dy < 7; dy++)
        for (let dx = 0; dx < 7; dx++) {
          const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          if (isOuter || isInner)
            ctx.fillRect(x + (fx + dx) * cellSize, y + (fy + dy) * cellSize, cellSize, cellSize);
        }
    };
    drawFinder(0, 0);
    drawFinder(cells - 7, 0);
    drawFinder(0, cells - 7);
    let seed = 0;
    for (let i = 0; i < data.length; i++) seed = (seed * 31 + data.charCodeAt(i)) & 0xFFFF;
    for (let cy = 0; cy < cells; cy++)
      for (let cx = 0; cx < cells; cx++) {
        const inFinder =
          (cx < 8 && cy < 8) || (cx >= cells - 8 && cy < 8) || (cx < 8 && cy >= cells - 8);
        if (inFinder) continue;
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
        if (seed % 3 === 0)
          ctx.fillRect(x + cx * cellSize, y + cy * cellSize, cellSize, cellSize);
      }
  }

  /** @private */
  _triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export default ReceiptExporter;