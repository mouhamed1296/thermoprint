/*!
# thermoprint

A fluent, correct ESC/POS receipt builder for thermal printers.

- **Native** (Rust / Tauri / CLI): outputs `Vec<u8>` you send to any printer
- **WASM / npm**: outputs `Uint8Array` you pass to WebUSB, WebSerial, or Node.js

## Quickstart (native)

```rust
use thermoprint::{ReceiptBuilder, PrintWidth};
use rust_decimal::prelude::*;

let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
    .init()
    .align_center()
    .bold(true).double_size(true)
    .text_line("MA BOUTIQUE")
    .bold(false).normal_size()
    .text_line("Tel: +221 77 000 00 00")
    .divider('=')
    .align_left()
    .item("Polo shirt", 2, dec!(15_000), None)
    .item("Jean Levis 501", 1, dec!(25_000), Some(dec!(2_000)))
    .divider('-')
    .subtotal_ht(dec!(53_000))
    .taxes(&[thermoprint::TaxEntry::new("TVA 18%", dec!(9_540), true)])
    .total(dec!(62_540))
    .received(dec!(70_000))
    .change(dec!(7_460))
    .divider('=')
    .barcode_code128("ORD-2024-001")
    .feed(3)
    .cut()
    .build();

// `bytes` is Vec<u8> — send it to your printer however you like
```

## WASM / TypeScript

```typescript
import init, { ReceiptBuilder, PrintWidth } from 'thermoprint';
await init();

const bytes = new ReceiptBuilder(PrintWidth.Mm80)
  .init()
  .alignCenter()
  .bold(true).doubleSize(true)
  .textLine("MA BOUTIQUE")
  .bold(false).normalSize()
  .divider("=")
  .item("Polo shirt", 2, "15000", null)
  .total("62540")
  .barcodeCode128("ORD-2024-001")
  .cut()
  .build(); // → Uint8Array
```
*/

#![forbid(unsafe_code)]
#![warn(missing_docs)]

/// Fluent receipt builder API.
pub mod builder;
/// Raw ESC/POS command byte sequences.
pub mod commands;
/// Image dithering — pure Rust, works in native and WASM.
pub mod dither;
/// CP-858 text encoding and layout helpers.
pub mod encoding;
/// Error types.
pub mod error;
/// Internationalisation — receipt label translations.
pub mod i18n;
/// JSON template engine for receipt generation.
pub mod template;
/// Shared domain types (alignment, print width, tax entries).
pub mod types;

/// Image rasterisation (native builds only).
#[cfg(feature = "native")]
pub mod image;

// Convenient top-level re-exports
pub use builder::ReceiptBuilder;
pub use dither::{dither_rgba, DitherMethod};
pub use error::ThermoprintError;
pub use i18n::{Language, ReceiptLabels};
pub use template::{render_json, ReceiptTemplate};
pub use types::{Align, PrintWidth, TaxEntry};

// ── WASM public surface ───────────────────────────────────────────────────────
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
pub use crate::builder::wasm::WasmReceiptBuilder;
