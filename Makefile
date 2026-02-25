# ── thermoprint Makefile ───────────────────────────────────────────────────────
# Prerequisites:
#   cargo, rustup, wasm-pack
#   rustup target add wasm32-unknown-unknown

.PHONY: build build-wasm test test-wasm lint fmt check publish publish-npm clean help

## Build native library
build:
	cargo build --release --features native

## Build WASM package (outputs to pkg/)
build-wasm:
	wasm-pack build \
		--target web \
		--release \
		--out-dir pkg \
		--features wasm \
		--no-default-features
	@echo "✅ WASM build complete → pkg/"

## Build WASM targeting Node.js
build-wasm-node:
	wasm-pack build \
		--target nodejs \
		--release \
		--out-dir pkg-node \
		--features wasm \
		--no-default-features
	@echo "✅ Node.js WASM build complete → pkg-node/"

## Run native tests
test:
	cargo test --features native

## Run tests in WASM via wasm-pack
test-wasm:
	wasm-pack test --headless --chrome --features wasm --no-default-features

## Lint (clippy)
lint:
	cargo clippy --features native -- -D warnings

## Format
fmt:
	cargo fmt --all

## Check everything compiles (native + wasm)
check:
	cargo check --features native
	cargo check --features wasm --no-default-features --target wasm32-unknown-unknown

## Publish to crates.io
publish:
	cargo publish --features native

## Publish WASM package to npm
publish-npm: build-wasm
	cd pkg && npm publish --access public

## Clean build artifacts
clean:
	cargo clean
	rm -rf pkg pkg-node

help:
	@grep -E '^##' Makefile | sed 's/## //'
