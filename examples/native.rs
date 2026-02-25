/// Thermoprint native example
///
/// Builds a full 80mm receipt and writes the raw ESC/POS bytes to `receipt.bin`.
///
/// Run (default French):
///   cargo run --example native --features native
///
/// Run with a specific language:
///   cargo run --example native --features native -- en
///   cargo run --example native --features native -- wo
///
/// Send to a real printer (Linux/macOS):
///   cat receipt.bin > /dev/usb/lp0
use std::fs;
use thermoprint::{ReceiptBuilder, PrintWidth, TaxEntry, Language};
use rust_decimal::prelude::*;

fn main() {
    let lang = match std::env::args().nth(1).as_deref() {
        Some("en") => Language::En,
        Some("es") => Language::Es,
        Some("pt") => Language::Pt,
        Some("ar") => Language::Ar,
        Some("wo") => Language::Wo,
        _          => Language::Fr,
    };

    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .language(lang)
        // ── Header ────────────────────────────────────────────────────────
        .init()
        .shop_header("MA BOUTIQUE", "+221 77 000 00 00", "Dakar, Sénégal")
        .divider('=')
        // ── Items ─────────────────────────────────────────────────────────
        .item("Polo Ralph Lauren",  2, dec!(15_000), None)
        .item("Jean Levis 501",     1, dec!(25_000), Some(dec!(2_000)))
        .item("Sneakers Nike Air",  1, dec!(45_000), None)
        .divider('-')
        // ── Totals ────────────────────────────────────────────────────────
        .subtotal_ht(dec!(98_000))
        .taxes(&[
            TaxEntry::new("TVA 18%",            dec!(17_640), true),
            TaxEntry::new("Taxe Municipale 2%", dec!(1_960),  false),
        ])
        .total(dec!(99_960))
        .received(dec!(100_000))
        .change(dec!(40))
        .divider('=')
        // ── Footer ────────────────────────────────────────────────────────
        .barcode_code128("ORD-2024-001")
        .served_by("Mamadou")
        .thank_you("MA BOUTIQUE")
        .feed(3)
        .cut()
        .build();

    let out = "receipt.bin";
    fs::write(out, &bytes).expect("failed to write receipt.bin");
    println!("✅  Written {out} ({} bytes)", bytes.len());
    println!("    Send to printer:  cat {out} > /dev/usb/lp0");
}
