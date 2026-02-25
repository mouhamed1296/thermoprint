/// Thermoprint native example
///
/// Builds a full 80mm receipt and writes the raw ESC/POS bytes to `receipt.bin`.
///
/// Run:
///   cargo run --example native --features native
///
/// Send to a real printer (Linux/macOS):
///   cat receipt.bin > /dev/usb/lp0
use std::fs;
use thermoprint::{ReceiptBuilder, PrintWidth, TaxEntry};
use rust_decimal::prelude::*;

fn main() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
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
