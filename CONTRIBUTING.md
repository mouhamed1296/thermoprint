# Contributing to thermoprint

First off — thank you. Every issue filed, bug fixed, and printer tested helps.

---

## Ways to contribute

### Report a printer that doesn't work
Open an issue with:
- Printer brand and model (e.g. `Epson TM-T20III`)
- Connection type (USB, serial, network)
- OS (Windows 11, Ubuntu 22.04, macOS 14)
- What you expected vs what happened
- If possible, the raw bytes that were sent

### Add support for a new ESC/POS command
1. Add the command function to `src/commands.rs`
2. Expose it on `ReceiptBuilder` in `src/builder.rs`
3. Mirror it on `WasmReceiptBuilder` in the `wasm` module
4. Write a unit test in `src/commands.rs`
5. Write an integration test in `tests/integration.rs`

### Add a new code page / language encoding
Add the mapping to `src/encoding.rs` and add tests covering at least
5 characters from the target language.

### Fix a bug
- Link the issue in your PR description
- Add a regression test that fails before your fix and passes after

---

## Development setup

```bash
# Clone
git clone https://github.com/mamadousarr/thermoprint
cd thermoprint

# Native build + tests
cargo test --features native

# WASM build
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
make build-wasm

# WASM tests (requires Chrome)
make test-wasm

# Lint before submitting
make lint
make fmt
```

---

## Code style

- No `unsafe` code — ever. The crate is `#![forbid(unsafe_code)]`.
- All public items must have doc comments.
- Money values always use `rust_decimal::Decimal` — never `f64`.
- New ESC/POS commands go in `commands.rs` as pure functions returning
  `Vec<u8>` or `&'static [u8]`.
- Builder methods consume and return `Self` for chaining.
- WASM wrapper methods must exactly mirror their native counterparts.

---

## PR checklist

- [ ] `cargo test --features native` passes
- [ ] `cargo clippy --features native -- -D warnings` is clean
- [ ] `cargo fmt --all` has been run
- [ ] New public API has doc comments
- [ ] CHANGELOG.md updated under `[Unreleased]`

---

## Commit message format

```
type: short description

Longer explanation if needed.

Fixes #123
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

---

## Code of Conduct

Be kind. We're all here to build good software.
