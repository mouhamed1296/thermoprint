<p align="center">
  <img src="assets/logo.svg" alt="thermoprint" width="420"/>
</p>

[![Crates.io](https://img.shields.io/crates/v/thermoprint.svg)](https://crates.io/crates/thermoprint)
[![docs.rs](https://docs.rs/thermoprint/badge.svg)](https://docs.rs/thermoprint)
[![npm](https://img.shields.io/npm/v/thermoprint.svg)](https://www.npmjs.com/package/thermoprint)
[![CI](https://github.com/mouhamed1296/thermoprint/actions/workflows/ci.yml/badge.svg)](https://github.com/mouhamed1296/thermoprint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-Receipt%20Builder-e94560)](https://mouhamed1296.github.io/thermoprint/)

> Fluent ESC/POS receipt builder for thermal printers — works natively in Rust and in any JavaScript runtime via WASM.

Built by **Mamadou Sarr** — battle-tested on real POS hardware in Dakar, Senegal.

**[Try the Receipt Builder →](https://mouhamed1296.github.io/thermoprint/)** — design your receipt visually, then copy the JS code.

---

## Features

- ✅ Fluent builder API — chain calls, get bytes
- ✅ 58mm, 80mm, and A4 paper widths
- ✅ Correct money arithmetic with `rust_decimal` — no float rounding errors
- ✅ CP858 encoding — French, Spanish, Portuguese accents + Euro sign
- ✅ CODE128 barcodes, EAN-13, QR codes
- ✅ Logo / image printing (raster, native feature)
- ✅ Cash drawer kick
- ✅ WASM/npm — same API in browser (WebUSB / WebSerial) and Node.js
- ✅ Zero unsafe code
- ✅ **JSON template engine** — define receipts as JSON, render to bytes
- ✅ **Image dithering** — Floyd-Steinberg dithering, works in WASM (logos from canvas)
- ✅ **One-liner browser printing** — `ThermoPrinter` class for WebSerial / WebUSB
- ✅ **PNG / PDF export** — render receipts to images for email or archiving
- ✅ **Tauri plugin** — `tauri-plugin-thermoprint` for desktop POS apps
- ✅ **i18n** — 6 languages (FR, EN, ES, PT, AR, WO)

---

## Installation

### Rust / Tauri

```toml
[dependencies]
thermoprint  = { version = "0.1", features = ["native"] }  # default; includes image support
rust_decimal = { version = "1", features = ["macros"] }    # for the dec!() macro
```

Minimal (no image support):

```toml
[dependencies]
thermoprint  = { version = "0.1", default-features = false }
rust_decimal = { version = "1", features = ["macros"] }
```

### npm / JavaScript

```bash
npm install thermoprint
```

---

## Rust Usage

```rust
use thermoprint::{ReceiptBuilder, PrintWidth, TaxEntry};
use rust_decimal::prelude::*;

let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
    .init()
    .shop_header("MA BOUTIQUE", "+221 77 000 00 00", "Dakar, Sénégal")
    .divider('=')
    .item("Polo Ralph Lauren", 2, dec!(15_000), None)
    .item("Jean Levis 501",    1, dec!(25_000), Some(dec!(2_000)))
    .divider('-')
    .subtotal_ht(dec!(53_000))
    .taxes(&[
        TaxEntry::new("TVA 18%", dec!(9_540), true),
    ])
    .total(dec!(62_540))
    .received(dec!(70_000))
    .change(dec!(7_460))
    .divider('=')
    .barcode_code128("ORD-2024-001")
    .served_by("Mamadou")
    .thank_you("MA BOUTIQUE")
    .feed(3)
    .cut()
    .build(); // → Vec<u8>

// Send `bytes` to your printer however you like.
// thermoprint never touches the OS — that's your call.
```

### With logo (native feature)

```rust
let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
    .init()
    .align_center()
    .logo("/path/to/logo.png")? // resized automatically
    .shop_header("MA BOUTIQUE", "+221 77 000 00 00", "Dakar")
    // ...
    .build();
```

### Cash drawer

```rust
let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
    .init()
    .open_cash_drawer()
    .build();
```

---

## JavaScript / TypeScript Usage

```typescript
import init, { WasmReceiptBuilder } from 'thermoprint';

await init();

// All money amounts are strings — no floating-point surprises
const bytes: Uint8Array = new WasmReceiptBuilder("80mm")
  .init()
  .shopHeader("MA BOUTIQUE", "+221 77 000 00 00", "Dakar, Sénégal")
  .divider("=")
  .item("Polo shirt", 2, "15000", null)
  .item("Jean Levis 501", 1, "25000", "2000")  // with discount
  .divider("-")
  .subtotalHt("53000")
  .total("62540")
  .received("70000")
  .change("7460")
  .divider("=")
  .barcodeCode128("ORD-2024-001")
  .feed(3)
  .cut()
  .build(); // → Uint8Array

// Send to printer via WebUSB / WebSerial / Node.js serial port
```

### WebUSB example

```typescript
const device = await navigator.usb.requestDevice({ filters: [] });
await device.open();
await device.selectConfiguration(1);
await device.claimInterface(0);
await device.transferOut(1, bytes);
```

### WebSerial example

```typescript
const port = await navigator.serial.requestPort();
await port.open({ baudRate: 9600 });
const writer = port.writable.getWriter();
await writer.write(bytes);
writer.releaseLock();
```

---

## JSON Template Engine

Define receipts as JSON — no code required. Works in Rust, WASM, and the Tauri plugin.

```json
{
  "width": "80mm",
  "currency": "FCFA",
  "language": "fr",
  "elements": [
    { "type": "init" },
    { "type": "shop_header", "name": "MA BOUTIQUE", "phone": "+221 77 000", "address": "Dakar" },
    { "type": "divider", "char": "=" },
    { "type": "item", "name": "Polo shirt", "qty": 2, "unit_price": "15000" },
    { "type": "divider", "char": "-" },
    { "type": "total", "amount": "30000" },
    { "type": "barcode_code128", "value": "ORD-2024-001" },
    { "type": "feed", "lines": 3 },
    { "type": "cut" }
  ]
}
```

**Rust:**

```rust
use thermoprint::render_json;
let bytes = render_json(json_str).unwrap();
```

**JavaScript (WASM):**

```js
import init, { render_template } from 'thermoprint';
await init();
const bytes = render_template(JSON.stringify(template));
```

Supported element types: `init`, `shop_header`, `text_line`, `centered`, `right`, `row`, `divider`, `blank`, `bold`, `double_size`, `double_height`, `normal_size`, `underline`, `align`, `item`, `subtotal`, `tax`, `discount`, `total`, `received`, `change`, `served_by`, `thank_you`, `barcode_code128`, `barcode_ean13`, `qr_code`, `feed`, `cut`, `cut_full`, `form_feed`, `open_cash_drawer`.

---

## One-Liner Browser Printing

`ThermoPrinter` handles WebSerial and WebUSB connections automatically.

```js
import { ThermoPrinter } from 'thermoprint/printer';

// One-liner: connect → print → disconnect
await ThermoPrinter.quickPrint(bytes);

// Or with more control
const printer = new ThermoPrinter({ baudRate: 9600 });
await printer.connect();   // prompts user to select device
await printer.print(bytes);
await printer.disconnect();
```

Options: `transport` (`'webserial'` or `'webusb'`), `baudRate`, `usbFilters`, `usbEndpoint`, `chunkSize`, `chunkDelay`.

---

## Image Dithering (WASM + Native)

Convert any image to print-ready ESC/POS raster bytes with Floyd-Steinberg dithering. Pure Rust — works everywhere, no `image` crate needed.

**JavaScript (from canvas):**

```js
import init, { dither_image } from 'thermoprint';
await init();

const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const raster = dither_image(imageData.data, canvas.width, canvas.height, 384, "floyd_steinberg");

const receipt = new WasmReceiptBuilder("80mm")
  .init().align_center().logo_raw(raster).cut().build();
```

**Rust:**

```rust
use thermoprint::dither::{dither_rgba, DitherMethod};
let raster = dither_rgba(&rgba_bytes, width, height, 384, DitherMethod::FloydSteinberg);
```

---

## PNG / PDF Export

Render receipts to images for email receipts, archiving, or previews. Uses the same JSON template format.

```js
import { ReceiptExporter } from 'thermoprint/export';

const exporter = new ReceiptExporter(template);
const dataUrl = exporter.toPNG();              // data:image/png;base64,...
const blob = await exporter.toPNGBlob();       // Blob
exporter.downloadPNG('receipt.png');            // triggers download
exporter.downloadPDF('receipt.pdf');            // triggers PDF download
const canvas = exporter.getCanvas();           // for embedding
```

---

## Tauri Plugin

For desktop POS apps built with Tauri v2. See [`tauri-plugin-thermoprint/README.md`](tauri-plugin-thermoprint/README.md).

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_thermoprint::init())
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

```js
import { invoke } from '@tauri-apps/api/core';

const ports = await invoke('plugin:thermoprint|list_ports');
await invoke('plugin:thermoprint|print_template', {
  port: ports[0].name,
  baudRate: 9600,
  template: JSON.stringify(myTemplate),
});
```

---

## API Reference

### `ReceiptBuilder::new(width: PrintWidth)`

| Method | Description |
|---|---|
| `.init()` | Reset printer + set code page. Always call first. |
| `.currency(symbol)` | Override currency symbol (default: `"FCFA"`) |
| `.align_left/center/right()` | Set text alignment |
| `.bold(bool)` | Toggle bold |
| `.double_size(bool)` | Toggle double width + height |
| `.double_height(bool)` | Toggle double height only |
| `.normal_size()` | Reset to normal size |
| `.underline(bool)` | Toggle underline |
| `.text(s)` | Append text (no newline) |
| `.text_line(s)` | Append text + newline |
| `.centered(s)` | Append centred text line |
| `.right(s)` | Append right-aligned text line |
| `.row(left, right)` | Two-column row (label + value) |
| `.divider(ch)` | Full-width divider line |
| `.blank()` | Blank line |
| `.feed(n)` | Feed n lines |
| `.cut()` | Partial cut |
| `.cut_full()` | Full cut |
| `.form_feed()` | Page eject (A4) |
| `.shop_header(name, phone, addr)` | Centred bold header block |
| `.item(name, qty, price, discount?)` | Line item with optional discount |
| `.subtotal_ht(amount)` | Subtotal excl. tax |
| `.discount(amount, coupon?)` | Discount line |
| `.taxes(entries)` | Multiple tax lines |
| `.total(amount)` | Grand total (bold, double height) |
| `.received(amount)` | Amount received |
| `.change(amount)` | Change to return |
| `.served_by(name)` | Cashier name footer |
| `.thank_you(shop_name)` | Thank you footer |
| `.barcode_code128(value)` | CODE128 barcode |
| `.barcode_ean13(value)` | EAN-13 barcode |
| `.qr_code(data, size)` | QR code |
| `.open_cash_drawer()` | Cash drawer kick |
| `.logo(path)` *(native)* | Logo from file |
| `.logo_raw(bytes)` | Pre-rasterised logo bytes |
| `.build()` | Finalise → `Vec<u8>` / `Uint8Array` |

---

## Building

```bash
# Native
make build

# WASM (browser)
make build-wasm

# WASM (Node.js)
make build-wasm-node

# Tests
make test

# Publish to crates.io
make publish

# Publish to npm
make publish-npm
```

---

## License

MIT © Mamadou Sarr
