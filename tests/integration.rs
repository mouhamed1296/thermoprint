use thermoprint::{ReceiptBuilder, PrintWidth, TaxEntry};
use rust_decimal::prelude::*;

// ── Smoke tests: make sure builds don't panic and produce non-empty output ───

#[test]
fn minimal_80mm_receipt() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .align_center()
        .bold(true).double_size(true)
        .text_line("MA BOUTIQUE")
        .bold(false).normal_size()
        .text_line("Tel: +221 77 000 00 00")
        .divider('=')
        .align_left()
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
        .feed(3)
        .cut()
        .build();

    assert!(!bytes.is_empty(), "receipt must not be empty");
}

#[test]
fn minimal_58mm_receipt() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm58)
        .init()
        .shop_header("Boutique Test", "+221 77 000 00 00", "Dakar, Sénégal")
        .divider('=')
        .item("Produit A", 1, dec!(5_000), None)
        .total(dec!(5_000))
        .cut()
        .build();

    assert!(!bytes.is_empty());
}

#[test]
fn a4_receipt() {
    let bytes = ReceiptBuilder::new(PrintWidth::A4)
        .init()
        .align_center()
        .bold(true)
        .text_line("SOCIETE TEST SARL")
        .bold(false)
        .divider('═')
        .align_left()
        .item("Facture Service Conseil", 3, dec!(50_000), None)
        .divider('-')
        .subtotal_ht(dec!(150_000))
        .taxes(&[
            TaxEntry::new("TVA 18%", dec!(27_000), false),
        ])
        .total(dec!(177_000))
        .divider('═')
        .form_feed()
        .build();

    assert!(!bytes.is_empty());
}

#[test]
fn discount_item_contains_remise_bytes() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .item("Article avec remise", 1, dec!(10_000), Some(dec!(1_000)))
        .build();

    // "Remise" should appear in the output
    let output = String::from_utf8_lossy(&bytes);
    assert!(output.contains("Remise"), "discount label must appear in output");
}

#[test]
fn zero_discount_not_shown() {
    let bytes_with_zero = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .item("Article", 1, dec!(10_000), Some(dec!(0)))
        .build();

    let bytes_without = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .item("Article", 1, dec!(10_000), None)
        .build();

    // Both should produce the same output (zero discount is a no-op)
    assert_eq!(bytes_with_zero, bytes_without);
}

#[test]
fn currency_symbol_override() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .currency("XOF")
        .init()
        .total(dec!(5_000))
        .build();

    let output = String::from_utf8_lossy(&bytes);
    assert!(output.contains("XOF"), "custom currency symbol must appear");
    assert!(!output.contains("FCFA"), "default symbol must not appear after override");
}

#[test]
fn barcode_code128_bytes_present() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .barcode_code128("TEST-123")
        .build();

    // GS k 73 is the CODE128 command prefix
    let gs = 0x1Du8;
    let k  = b'k';
    let ty = 73u8;
    let has_barcode = bytes.windows(3).any(|w| w == [gs, k, ty]);
    assert!(has_barcode, "CODE128 command must be present in output");
}

#[test]
fn qr_code_bytes_present() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .qr_code("https://example.com", 3)
        .build();

    // GS ( k is the QR code function block prefix
    let gs = 0x1Du8;
    let has_qr = bytes.windows(3).any(|w| w == [gs, b'(', b'k']);
    assert!(has_qr, "QR code command block must be present");
}

#[test]
fn width_cols() {
    assert_eq!(PrintWidth::Mm58.cols(), 32);
    assert_eq!(PrintWidth::Mm80.cols(), 48);
    assert_eq!(PrintWidth::A4.cols(),   90);
}

#[test]
fn multiple_taxes_additional_sum() {
    let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
        .init()
        .taxes(&[
            TaxEntry::new("TVA 18%",            dec!(4_500), true),
            TaxEntry::new("Taxe Municipale 2%", dec!(500),   false),
            TaxEntry::new("Autre taxe 1%",      dec!(250),   false),
        ])
        .build();

    let output = String::from_utf8_lossy(&bytes);
    assert!(output.contains("TVA 18%"));
    assert!(output.contains("Taxe Municipale"));
    // Additional taxes total should be shown
    assert!(output.contains("additionnelles"));
}
