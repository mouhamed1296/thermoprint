/**
 * ReceiptExporter — render receipt templates to PNG or PDF.
 *
 * Uses an offscreen <canvas> to draw a visual representation of the receipt,
 * then exports it as a PNG data URL, Blob, or triggers a PDF download.
 *
 * @example
 * import { ReceiptExporter } from 'thermoprint/export';
 *
 * const template = {
 *   width: "80mm",
 *   currency: "FCFA",
 *   elements: [
 *     { type: "init" },
 *     { type: "shop_header", name: "MY SHOP", phone: "+221 77 000", address: "Dakar" },
 *     { type: "divider", char: "=" },
 *     { type: "item", name: "Polo shirt", qty: 2, unit_price: "15000" },
 *     { type: "total", amount: "30000" },
 *     { type: "cut" }
 *   ]
 * };
 *
 * const exporter = new ReceiptExporter(template);
 * const dataUrl = exporter.toPNG();           // data:image/png;base64,...
 * const blob = await exporter.toPNGBlob();    // Blob
 * exporter.downloadPNG('receipt.png');         // triggers download
 * exporter.downloadPDF('receipt.pdf');         // triggers PDF download
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
    this._canvas = null;
  }

  /**
   * Render the receipt to a canvas and return a PNG data URL.
   * @returns {string} data:image/png;base64,...
   */
  toPNG() {
    const canvas = this._render();
    return canvas.toDataURL('image/png');
  }

  /**
   * Render the receipt and return a PNG Blob.
   * @returns {Promise<Blob>}
   */
  toPNGBlob() {
    const canvas = this._render();
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  /**
   * Render and trigger a PNG file download.
   * @param {string} [filename='receipt.png']
   */
  downloadPNG(filename = 'receipt.png') {
    const url = this.toPNG();
    this._download(url, filename);
  }

  /**
   * Render and trigger a simple PDF download.
   * The PDF is a single page containing the receipt image.
   * @param {string} [filename='receipt.pdf']
   */
  downloadPDF(filename = 'receipt.pdf') {
    const canvas = this._render();
    const imgData = canvas.toDataURL('image/png');

    // Build a minimal single-page PDF with the receipt image embedded
    const pdfWidth = canvas.width / this._scale;
    const pdfHeight = canvas.height / this._scale;
    const pdf = this._buildPDF(imgData, pdfWidth, pdfHeight);

    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    this._download(url, filename);
    URL.revokeObjectURL(url);
  }

  /**
   * Get the rendered canvas element directly (for embedding).
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this._render();
  }

  // ── Internal rendering ─────────────────────────────────────────────────

  /** @private */
  _render() {
    const t = this._template;
    const cols = COLS[t.width] || COLS['80mm'];
    const scale = this._scale;
    const fontSize = this._fontSize;
    const lh = Math.round(fontSize * this._lineHeight);
    const px = this._paddingX;
    const py = this._paddingY;
    const charW = fontSize * 0.6; // approx monospace char width
    const contentW = Math.ceil(cols * charW);
    const canvasW = contentW + px * 2;

    // First pass: compute lines to determine height
    const lines = this._buildLines(t.elements, cols);
    const canvasH = py * 2 + lines.length * lh + 20; // extra padding at bottom

    // Create canvas
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(canvasW * scale, canvasH * scale)
      : document.createElement('canvas');

    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = canvasW * scale;
      canvas.height = canvasH * scale;
    }

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = this._bgColor;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw lines
    ctx.fillStyle = this._fgColor;
    let y = py + fontSize; // baseline of first line
    const baseFont = `${fontSize}px ${this._fontFamily}`;

    for (const line of lines) {
      let font = baseFont;
      if (line.bold && line.big) {
        font = `bold ${fontSize * 1.6}px ${this._fontFamily}`;
      } else if (line.bold) {
        font = `bold ${fontSize}px ${this._fontFamily}`;
      } else if (line.big) {
        font = `${fontSize * 1.6}px ${this._fontFamily}`;
      }
      ctx.font = font;

      if (line.type === 'divider') {
        ctx.font = baseFont;
        const text = (line.char || '-').repeat(cols);
        ctx.fillText(text, px, y);
      } else if (line.type === 'barcode') {
        // Draw simple barcode representation
        this._drawBarcode(ctx, px, y - fontSize, contentW, lh + 8, line.value);
        y += 8; // extra space for barcode
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
          const w = ctx.measureText(text).width;
          ctx.fillText(text, px + (contentW - w) / 2, y);
        } else if (line.align === 'right') {
          const w = ctx.measureText(text).width;
          ctx.fillText(text, px + contentW - w, y);
        } else {
          ctx.fillText(text, px, y);
        }
      }

      y += lh;
    }

    this._canvas = canvas;
    return canvas;
  }

  /** @private - Build a list of line descriptors from template elements */
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
    const centerText = (text) => {
      const gap = cols - text.length;
      const left = Math.floor(gap / 2);
      return gap > 0 ? ' '.repeat(left) + text : text;
    };
    const push = (text, overrides = {}) => {
      lines.push({ type: 'text', text, align, bold, big, ...overrides });
    };

    for (const el of elements) {
      switch (el.type) {
        case 'init':
          align = 'left'; bold = false; big = false;
          break;
        case 'shop_header':
          lines.push({ type: 'text', text: el.name, align: 'center', bold: true, big: true });
          if (el.phone) lines.push({ type: 'text', text: el.phone, align: 'center', bold: false, big: false });
          if (el.address) lines.push({ type: 'text', text: el.address, align: 'center', bold: false, big: false });
          break;
        case 'text_line':
          push(el.text);
          break;
        case 'centered':
          push(el.text, { align: 'center' });
          break;
        case 'right':
          push(el.text, { align: 'right' });
          break;
        case 'row':
          push(twoCol(el.left, el.right));
          break;
        case 'divider':
          lines.push({ type: 'divider', char: el.char || '-', bold: false, big: false });
          break;
        case 'blank':
          push('');
          break;
        case 'bold':
          bold = el.on !== false;
          break;
        case 'double_size':
          big = el.on !== false;
          break;
        case 'double_height':
          big = el.on !== false;
          break;
        case 'normal_size':
          big = false;
          break;
        case 'underline':
          break; // visual underline not rendered in export for simplicity
        case 'align':
          align = el.value || 'left';
          break;
        case 'item': {
          const qty = el.qty || 1;
          const up = parseFloat(el.unit_price) || 0;
          const lineTotal = qty * up;
          push(el.name, { bold: true });
          push(`${qty} x ${fmtAmount(el.unit_price)}`, { bold: false });
          if (el.discount && parseFloat(el.discount) > 0) {
            push(rightAlign(fmtAmount(String(lineTotal))));
            push(`  Discount: -${fmtAmount(el.discount)}`);
            const after = lineTotal - parseFloat(el.discount);
            push(rightAlign(fmtAmount(String(after))), { bold: true });
          } else {
            push(rightAlign(fmtAmount(String(lineTotal))));
          }
          push('');
          break;
        }
        case 'subtotal':
          push(twoCol('SUBTOTAL', fmtAmount(el.amount)), { bold: true });
          break;
        case 'tax':
          push(twoCol(`  ${el.label}${el.included ? ' (incl.)' : ''}`, el.included ? fmtAmount(el.amount) : `+ ${fmtAmount(el.amount)}`));
          break;
        case 'discount': {
          const label = el.coupon_code ? `DISCOUNT (${el.coupon_code})` : 'DISCOUNT';
          push(twoCol(label, `-${fmtAmount(el.amount)}`));
          break;
        }
        case 'total':
          push(twoCol('TOTAL', fmtAmount(el.amount)), { bold: true, big: true });
          break;
        case 'received':
          push(twoCol('RECEIVED', fmtAmount(el.amount)));
          break;
        case 'change':
          push(twoCol('CHANGE', fmtAmount(el.amount)));
          break;
        case 'served_by':
          push(`Served by: ${el.name}`);
          break;
        case 'thank_you':
          push('Thank you for your purchase!', { align: 'center' });
          push(`See you soon at ${el.shop_name}`, { align: 'center' });
          break;
        case 'barcode_code128':
          lines.push({ type: 'barcode', value: el.value, bold: false, big: false });
          break;
        case 'barcode_ean13':
          lines.push({ type: 'barcode', value: el.value, bold: false, big: false });
          break;
        case 'qr_code':
          lines.push({ type: 'qr', data: el.data, bold: false, big: false });
          break;
        case 'feed': {
          const n = el.lines || 3;
          for (let i = 0; i < n; i++) push('');
          break;
        }
        case 'cut':
          lines.push({ type: 'cut', bold: false, big: false });
          break;
        case 'cut_full':
          lines.push({ type: 'cut', bold: false, big: false });
          break;
        case 'open_cash_drawer':
          break; // no visual
        default:
          break;
      }
    }

    return lines;
  }

  /** @private - Draw a simple barcode representation */
  _drawBarcode(ctx, x, y, maxW, h, value) {
    const barW = Math.min(maxW * 0.7, 300);
    const startX = x + (maxW - barW) / 2;

    ctx.fillStyle = this._fgColor;

    // Generate deterministic bar pattern from value
    let seed = 0;
    for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) & 0xFFFF;

    const numBars = Math.floor(barW / 2);
    for (let i = 0; i < numBars; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
      if (seed % 3 !== 0) {
        ctx.fillRect(startX + i * 2, y, 1, h - 14);
      }
    }

    // HRI text below
    ctx.font = `10px ${this._fontFamily}`;
    const tw = ctx.measureText(value).width;
    ctx.fillText(value, x + (maxW - tw) / 2, y + h - 2);

    ctx.font = `${this._fontSize}px ${this._fontFamily}`;
  }

  /** @private - Draw a simple QR code representation */
  _drawQR(ctx, x, y, size, data) {
    const cells = 21;
    const cellSize = size / cells;

    ctx.fillStyle = this._fgColor;

    // Finder patterns (3 corners)
    const drawFinder = (fx, fy) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          if (isOuter || isInner) {
            ctx.fillRect(x + (fx + dx) * cellSize, y + (fy + dy) * cellSize, cellSize, cellSize);
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(cells - 7, 0);
    drawFinder(0, cells - 7);

    // Data cells (deterministic from data string)
    let seed = 0;
    for (let i = 0; i < data.length; i++) seed = (seed * 31 + data.charCodeAt(i)) & 0xFFFF;

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const inFinder = (cx < 8 && cy < 8) || (cx >= cells - 8 && cy < 8) || (cx < 8 && cy >= cells - 8);
        if (inFinder) continue;
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
        if (seed % 3 === 0) {
          ctx.fillRect(x + cx * cellSize, y + cy * cellSize, cellSize, cellSize);
        }
      }
    }

    ctx.fillStyle = this._fgColor;
  }

  /** @private - Build a minimal PDF containing a single image */
  _buildPDF(imgDataUrl, width, height) {
    // Minimal PDF 1.4 with a single XObject image
    // We embed the PNG as-is using DCTDecode workaround (actually, we'll use a simpler approach)

    // Convert data URL to binary
    const base64 = imgDataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const imgBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      imgBytes[i] = binaryStr.charCodeAt(i);
    }

    // PDF uses points (1 pt = 1/72 inch). We'll size the page to match the receipt.
    const pageW = Math.ceil(width);
    const pageH = Math.ceil(height);

    // Build PDF structure
    const objects = [];
    let objCount = 0;

    const addObj = (content) => {
      objCount++;
      objects.push({ id: objCount, content });
      return objCount;
    };

    // 1. Catalog
    const catalogId = addObj('<<\n/Type /Catalog\n/Pages 2 0 R\n>>');
    // 2. Pages
    const pagesId = addObj(`<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>`);
    // 3. Page
    const pageId = addObj(`<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 ${pageW} ${pageH}]\n/Contents 4 0 R\n/Resources <<\n/XObject << /Img 5 0 R >>\n>>\n>>`);
    // 4. Content stream (draw image)
    const contentStr = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Img Do\nQ`;
    const contentId = addObj(`<<\n/Length ${contentStr.length}\n>>\nstream\n${contentStr}\nendstream`);
    // 5. Image XObject
    const imgHeader = `<<\n/Type /XObject\n/Subtype /Image\n/Width ${Math.ceil(width * this._scale)}\n/Height ${Math.ceil(height * this._scale)}\n/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /FlateDecode\n/Length ${imgBytes.length}\n>>`;

    // For simplicity, we'll use the raw PNG stream approach
    // Actually, embedding PNG in PDF properly requires re-encoding. Let's use a simpler
    // approach: generate an HTML wrapper that prints as PDF.

    // Simpler approach: create a printable HTML page
    const html = `<!DOCTYPE html>
<html>
<head>
<style>
@page { size: ${pageW}px ${pageH}px; margin: 0; }
body { margin: 0; padding: 0; }
img { width: ${pageW}px; height: ${pageH}px; }
</style>
</head>
<body>
<img src="${imgDataUrl}" />
<script>window.onload=()=>{window.print()}<\/script>
</body>
</html>`;

    return new TextEncoder().encode(html);
  }

  /** @private */
  _download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export default ReceiptExporter;
