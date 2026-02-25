# Changelog

All notable changes to thermoprint will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.3.0] - 2026-02-25

### Added

- **JSON template engine** (`template` module)
  - `ReceiptTemplate::from_json(json)` — parse a JSON receipt definition
  - `render_json(json)` — one-liner: JSON string → ESC/POS bytes
  - `render_template(json)` WASM function for JavaScript
  - 30+ supported element types (init, shop_header, item, total, barcode, qr_code, etc.)
  - Full serde deserialization with sensible defaults
- **Image dithering** (`dither` module)
  - `dither_rgba(rgba, w, h, max_px, method)` — pure Rust, works in native + WASM
  - Floyd-Steinberg error-diffusion and simple threshold methods
  - Bilinear downscale for oversized images
  - Alpha-aware grayscale conversion (transparent → white)
  - `dither_image()` WASM function — accepts canvas `ImageData` directly
- **ThermoPrinter** (`js/printer.js`)
  - `ThermoPrinter` class for WebSerial and WebUSB browser printing
  - `ThermoPrinter.quickPrint(bytes)` — one-liner: connect → print → disconnect
  - Auto-detects available transport (WebSerial preferred, WebUSB fallback)
  - Chunked writes to avoid overflowing printer buffers
  - TypeScript declarations included
- **ReceiptExporter** (`js/export.js`)
  - Render receipt templates to PNG (data URL or Blob) or PDF
  - Uses offscreen canvas — works in web workers
  - Same JSON template format as the template engine
  - Visual barcode and QR code rendering
  - TypeScript declarations included
- **Tauri plugin** (`tauri-plugin-thermoprint/`)
  - `tauri_plugin_thermoprint::init()` — register with Tauri v2
  - `list_ports` command — discover serial printers
  - `print_serial` command — send raw ESC/POS bytes
  - `print_template` command — render JSON template + print in one call
  - Chunked serial writes with flush

### Changed

- `serde_json` added as a core dependency (for template engine)

## [0.2.0] - 2026-02-25

### Added

- **Multi-language support** (`Language` enum + `ReceiptLabels` struct in `i18n` module)
  - French (default), English, Spanish, Portuguese, Arabic (Latin-transliterated), Wolof
  - `ReceiptBuilder::language(lang)` to set receipt language
  - `ReceiptBuilder::labels(labels)` for fully custom label overrides
  - `WasmReceiptBuilder::language(lang_str)` for JS/WASM usage
- `make serve-demo` — builds WASM and serves the web example locally

### Fixed

- Web example: corrected all method names to snake_case (wasm-bindgen convention)
- Web example: fixed WASM loading by requiring project-root-relative serving
- Web example: added language selector dropdown
- Native example: accepts optional language argument (`en`, `es`, `pt`, `ar`, `wo`)

## [0.1.1] - 2026-02-25

### Added
- `WasmReceiptBuilder::add_tax(label, amount, included)` — add individual tax lines from JavaScript
- `examples/native.rs` — Rust CLI example that writes a full receipt to `receipt.bin`
- `examples/web/` — self-contained web app demonstrating the WASM API with a live receipt builder UI

### Fixed
- `missing_docs` warnings on `WasmReceiptBuilder` methods suppressed with `#[allow(missing_docs)]`

## [0.1.0] - 2026-02-24

### Added
- `ReceiptBuilder` fluent API for 58mm, 80mm, and A4 paper widths
- CP858 encoding for French, Spanish, Portuguese, and Euro sign
- `PrintWidth` enum with column counts and image width limits
- `TaxEntry` struct for multi-tax receipts (included and additional)
- ESC/POS command primitives: init, alignment, bold, size, feed, cut
- CODE128 barcode support
- EAN-13 barcode support
- QR code support
- Cash drawer kick command
- Raster image / logo pipeline (`native` feature)
- WASM bindings via `wasm-bindgen` (`wasm` feature)
- `WasmReceiptBuilder` with string-based decimal API for JavaScript
- Full integration test suite (11 tests)
- MIT license
- Contributing guide
