use rust_decimal::Decimal;
use rust_decimal::prelude::Zero;

use crate::commands::{self, LF};
use crate::encoding::{encode_cp858, truncate, two_col, center, right_align};
use crate::error::ThermoprintError;
use crate::types::{Align, PrintWidth, TaxEntry};

// ── Money formatting ──────────────────────────────────────────────────────────

/// Format a `Decimal` as a whole-unit currency string.
/// The currency symbol is intentionally left generic — callers can override
/// by building the string themselves and calling `.text_line()`.
fn fmt_amount(amount: Decimal, currency: &str) -> String {
    format!("{} {}", amount.round(), currency)
}

// ── Core builder ──────────────────────────────────────────────────────────────

/// Fluent ESC/POS byte-stream builder.
///
/// # Usage
/// ```rust
/// use thermoprint::{ReceiptBuilder, PrintWidth};
/// use rust_decimal::prelude::*;
///
/// let bytes = ReceiptBuilder::new(PrintWidth::Mm80)
///     .init()
///     .align_center()
///     .bold(true)
///     .text_line("MY SHOP")
///     .bold(false)
///     .total(dec!(5000))
///     .cut()
///     .build();
/// ```
pub struct ReceiptBuilder {
    data:     Vec<u8>,
    width:    PrintWidth,
    currency: String,
}

impl ReceiptBuilder {
    /// Create a new builder for the given paper width.
    /// Currency symbol defaults to `"FCFA"` — change with [`currency`](Self::currency).
    pub fn new(width: PrintWidth) -> Self {
        Self {
            data:     Vec::new(),
            width,
            currency: "FCFA".to_owned(),
        }
    }

    /// Set the currency symbol used in all money formatting.
    ///
    /// ```rust
    /// use thermoprint::{ReceiptBuilder, PrintWidth};
    /// let b = ReceiptBuilder::new(PrintWidth::Mm80).currency("XOF");
    /// ```
    pub fn currency(mut self, symbol: impl Into<String>) -> Self {
        self.currency = symbol.into();
        self
    }

    /// Consume the builder and return the raw ESC/POS byte stream.
    pub fn build(self) -> Vec<u8> {
        self.data
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn cols(&self) -> usize { self.width.cols() }

    fn push(&mut self, bytes: &[u8]) {
        self.data.extend_from_slice(bytes);
    }

    fn push_lf(&mut self) {
        self.data.push(LF);
    }

    fn push_text(&mut self, text: &str) {
        self.data.extend_from_slice(&encode_cp858(text));
    }

    fn push_text_line(&mut self, text: &str) {
        self.push_text(text);
        self.push_lf();
    }

    fn fmt(&self, amount: Decimal) -> String {
        fmt_amount(amount, &self.currency)
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    /// Send `ESC @` (printer reset) plus code page 858 and sane defaults.
    /// Always call this first.
    pub fn init(mut self) -> Self {
        // Double reset to clear residual state on stubborn printers
        self.push(commands::init());
        self.push_lf();
        self.push(commands::init());
        self.push_lf();
        self.push(commands::code_page_858());
        self.push(commands::align_left());
        self.push(commands::normal_size());
        self.push(commands::bold_off());
        self.push_lf();
        self
    }

    // ── Alignment ─────────────────────────────────────────────────────────────

    /// Set text alignment (left, center, or right).
    pub fn align(mut self, a: Align) -> Self {
        match a {
            Align::Left   => self.push(commands::align_left()),
            Align::Center => self.push(commands::align_center()),
            Align::Right  => self.push(commands::align_right()),
        }
        self
    }

    /// Shorthand for left alignment.
    pub fn align_left(self)   -> Self { self.align(Align::Left) }
    /// Shorthand for center alignment.
    pub fn align_center(self) -> Self { self.align(Align::Center) }
    /// Shorthand for right alignment.
    pub fn align_right(self)  -> Self { self.align(Align::Right) }

    // ── Text style ────────────────────────────────────────────────────────────

    /// Toggle bold text.
    pub fn bold(mut self, on: bool) -> Self {
        self.push(if on { commands::bold_on() } else { commands::bold_off() });
        self
    }

    /// Toggle double-width and double-height text.
    pub fn double_size(mut self, on: bool) -> Self {
        self.push(if on { commands::double_size_on() } else { commands::normal_size() });
        self
    }

    /// Toggle double-height text (normal width).
    pub fn double_height(mut self, on: bool) -> Self {
        self.push(if on { commands::double_height_on() } else { commands::normal_size() });
        self
    }

    /// Reset text size to normal (single width and height).
    pub fn normal_size(mut self) -> Self {
        self.push(commands::normal_size());
        self
    }

    /// Toggle underline.
    pub fn underline(mut self, on: bool) -> Self {
        self.push(if on { commands::underline_on() } else { commands::underline_off() });
        self
    }

    // ── Text output ───────────────────────────────────────────────────────────

    /// Append encoded text **without** a trailing line feed.
    pub fn text(mut self, s: &str) -> Self {
        self.push_text(s);
        self
    }

    /// Append encoded text **with** a trailing line feed.
    pub fn text_line(mut self, s: &str) -> Self {
        self.push_text_line(s);
        self
    }

    /// Append a blank line.
    pub fn blank(mut self) -> Self {
        self.push_lf();
        self
    }

    /// Append a horizontal divider repeated to the full column width.
    ///
    /// ```rust
    /// use thermoprint::{ReceiptBuilder, PrintWidth};
    /// let b = ReceiptBuilder::new(PrintWidth::Mm80).divider('=');
    /// ```
    pub fn divider(mut self, ch: char) -> Self {
        let line = ch.to_string().repeat(self.cols());
        self.data.extend_from_slice(line.as_bytes());
        self.push_lf();
        self
    }

    /// Append a centred text line.
    pub fn centered(mut self, text: &str) -> Self {
        let cols = self.cols();
        let s = center(text, cols);
        self.push_text_line(&s);
        self
    }

    /// Append a right-aligned text line.
    pub fn right(mut self, text: &str) -> Self {
        let cols = self.cols();
        let s = right_align(text, cols);
        self.push_text_line(&s);
        self
    }

    /// Append a two-column row (label left, value right).
    pub fn row(mut self, left: &str, right: &str) -> Self {
        let cols = self.cols();
        let s = two_col(left, right, cols);
        self.push_text_line(&s);
        self
    }

    // ── Paper movement ────────────────────────────────────────────────────────

    /// Feed `n` blank lines.
    pub fn feed(mut self, n: u8) -> Self {
        self.push(&commands::feed_lines(n));
        self
    }

    /// Cut the paper (partial cut — safest for most printers).
    pub fn cut(mut self) -> Self {
        self.push(commands::cut_partial());
        self
    }

    /// Full cut.
    pub fn cut_full(mut self) -> Self {
        self.push(commands::cut_full());
        self
    }

    /// Form feed (page eject — use for A4 / impact printers).
    pub fn form_feed(mut self) -> Self {
        self.push(commands::form_feed());
        self
    }

    // ── Barcodes & QR ─────────────────────────────────────────────────────────

    /// Print a CODE128 barcode.
    ///
    /// `bar_width` — module width in dots (1–6, default 2)
    /// `bar_height` — height in dots (default 60)
    pub fn barcode_code128(mut self, value: &str) -> Self {
        self.push(&commands::barcode_width(2));
        self.push(&commands::barcode_height(60));
        self.push(&commands::barcode_hri_position(2));
        self.push(&commands::barcode_hri_font(0));
        self.push(&commands::barcode_code128(value));
        self.push_lf();
        self
    }

    /// Print a CODE128 barcode with custom dimensions.
    pub fn barcode_code128_custom(mut self, value: &str, bar_width: u8, bar_height: u8) -> Self {
        self.push(&commands::barcode_width(bar_width));
        self.push(&commands::barcode_height(bar_height));
        self.push(&commands::barcode_hri_position(2));
        self.push(&commands::barcode_hri_font(0));
        self.push(&commands::barcode_code128(value));
        self.push_lf();
        self
    }

    /// Print an EAN-13 barcode. `value` must be 12 digits.
    pub fn barcode_ean13(mut self, value: &str) -> Self {
        self.push(&commands::barcode_width(2));
        self.push(&commands::barcode_height(60));
        self.push(&commands::barcode_hri_position(2));
        self.push(&commands::barcode_ean13(value));
        self.push_lf();
        self
    }

    /// Print a QR code. `size` controls the module size (1–8).
    pub fn qr_code(mut self, data: &str, size: u8) -> Self {
        self.push(&commands::qr_code(data, size));
        self.push_lf();
        self
    }

    // ── Cash drawer ───────────────────────────────────────────────────────────

    /// Emit a cash drawer kick pulse.
    pub fn open_cash_drawer(mut self) -> Self {
        self.push(&commands::cash_drawer_kick());
        self
    }

    // ── Logo ──────────────────────────────────────────────────────────────────

    /// Render a logo image to raster ESC/POS bytes and append them.
    ///
    /// Available only when the `native` feature is enabled.
    /// The image is resized to fit the print width automatically.
    #[cfg(feature = "native")]
    pub fn logo(mut self, path: &str) -> Result<Self, ThermoprintError> {
        let max_px = self.width.max_image_px();
        let raster = crate::image::load_and_rasterise(path, max_px)?;
        self.data.extend_from_slice(&raster);
        self.push_lf();
        Ok(self)
    }

    /// Append pre-rasterised image bytes directly (use when you have already
    /// converted the image outside the library, e.g. in WASM context).
    pub fn logo_raw(mut self, raster_bytes: &[u8]) -> Self {
        self.data.extend_from_slice(raster_bytes);
        self.push_lf();
        self
    }

    // ── High-level receipt helpers ────────────────────────────────────────────

    /// Print a shop header block (name, phone, address) centred and bold.
    pub fn shop_header(
        self,
        name: &str,
        phone: &str,
        address: &str,
    ) -> Self {
        self
            .align_center()
            .bold(true).double_size(true)
            .text_line(name)
            .bold(false).normal_size()
            .text_line(phone)
            .text_line(address)
            .align_left()
    }

    /// Print a single line item: name, quantity, unit price, line total.
    ///
    /// If `discount` is `Some`, show the original total, the discount, and
    /// the final price after discount.
    pub fn item(
        mut self,
        name: &str,
        qty: i32,
        unit_price: Decimal,
        discount: Option<Decimal>,
    ) -> Self {
        let cols = self.cols();
        let line_total = unit_price * Decimal::from(qty);

        // Item name (bold, truncated to fit)
        self = self.bold(true);
        self.push_text_line(&truncate(name, cols - 2));
        self = self.bold(false);

        // Quantity × unit price
        let qty_line = format!("{} x {}", qty, self.fmt(unit_price));
        self.push_text_line(&qty_line);

        match discount {
            Some(disc) if disc > Decimal::zero() => {
                // Original total (right-aligned)
                let original = self.fmt(line_total);
                let orig_line = right_align(&original, cols);
                self.push_text_line(&orig_line);

                // Discount
                let disc_line = format!("  Remise: -{}", self.fmt(disc));
                self.push_text_line(&disc_line);

                // Final price (bold, right-aligned)
                let after = line_total - disc;
                let after_str = self.fmt(after);
                self = self.bold(true);
                let final_line = right_align(&after_str, cols);
                self.push_text_line(&final_line);
                self = self.bold(false);
            }
            _ => {
                let total_str = self.fmt(line_total);
                let total_line = right_align(&total_str, cols);
                self.push_text_line(&total_line);
            }
        }

        self.push_lf();
        self
    }

    /// Print the subtotal HT (excluding tax) line.
    pub fn subtotal_ht(mut self, amount: Decimal) -> Self {
        let cols = self.cols();
        let label = "SOUS-TOTAL HT";
        let value = self.fmt(amount);
        let row = two_col(label, &value, cols);
        self.push_text_line(&row);
        let ht_label = "(Hors TVA)";
        let ht_line = right_align(ht_label, cols);
        self.push_text_line(&ht_line);
        self
    }

    /// Print a discount line.
    pub fn discount(mut self, amount: Decimal, coupon_code: Option<&str>) -> Self {
        if amount <= Decimal::zero() { return self; }
        let cols = self.cols();
        let label = match coupon_code {
            Some(code) => format!("REMISE ({})", code),
            None       => "REMISE".to_owned(),
        };
        let value = format!("-{}", self.fmt(amount));
        let row = two_col(&label, &value, cols);
        self.push_text_line(&row);
        self
    }

    /// Print one or more tax lines.
    ///
    /// Included taxes (e.g. VAT already in price) are labelled `"(incluse)"`.
    /// Non-included taxes are prefixed with `"+"`.
    pub fn taxes(mut self, entries: &[TaxEntry]) -> Self {
        let cols = self.cols();

        // Compute non-included total for the summary line
        let additional: Decimal = entries.iter()
            .filter(|t| !t.included)
            .map(|t| t.amount)
            .sum();

        self.push_text_line("DETAIL DES TAXES:");

        for entry in entries {
            if entry.amount <= Decimal::zero() { continue; }
            let label = if entry.included {
                format!("  {} (incluse)", entry.label)
            } else {
                format!("  {}", entry.label)
            };
            let value = if entry.included {
                self.fmt(entry.amount)
            } else {
                format!("+ {}", self.fmt(entry.amount))
            };
            let row = two_col(&label, &value, cols);
            self.push_text_line(&row);
        }

        if additional > Decimal::zero() {
            let sep = "-".repeat(cols.saturating_sub(2));
            self.push_text_line(&format!("  {}", sep));
            let row = two_col("  Taxes additionnelles", &format!("+ {}", self.fmt(additional)), cols);
            self.push_text_line(&row);
        }

        self
    }

    /// Print the grand total line (bold, double height).
    pub fn total(mut self, amount: Decimal) -> Self {
        let cols  = self.cols();
        let value = self.fmt(amount);
        let row   = two_col("TOTAL", &value, cols);
        self = self.bold(true).double_height(true);
        self.push_text_line(&row);
        self = self.normal_size().bold(false);
        self
    }

    /// Print the amount received by the customer.
    pub fn received(mut self, amount: Decimal) -> Self {
        if amount <= Decimal::zero() { return self; }
        let cols  = self.cols();
        let value = self.fmt(amount);
        let row   = two_col("MONTANT RECU", &value, cols);
        self.push_text_line(&row);
        self
    }

    /// Print the change to return to the customer.
    pub fn change(mut self, amount: Decimal) -> Self {
        if amount <= Decimal::zero() { return self; }
        let cols  = self.cols();
        let value = self.fmt(amount);
        let row   = two_col("MONNAIE", &value, cols);
        self.push_text_line(&row);
        self
    }

    /// Print a "served by" footer line.
    pub fn served_by(mut self, name: &str) -> Self {
        self.push_text_line(&format!("Servi par: {}", name));
        self
    }

    /// Print a thank-you footer centred on the page.
    pub fn thank_you(self, shop_name: &str) -> Self {
        self
            .align_center()
            .text_line("Merci pour votre confiance!")
            .text_line(&format!("A bientot chez {}", shop_name))
            .align_left()
    }
}

// ── WASM wrapper ──────────────────────────────────────────────────────────────

/// WASM-bindgen wrapper around [`ReceiptBuilder`].
///
/// All `Decimal` amounts are accepted as numeric strings (e.g. `"15000"` or
/// `"149.99"`) to avoid JavaScript's floating-point imprecision.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[allow(missing_docs)]
pub mod wasm {
    use super::*;
    use std::str::FromStr;
    use wasm_bindgen::prelude::*;
    use js_sys::Uint8Array;

    fn parse_decimal(s: &str) -> Result<Decimal, JsValue> {
        Decimal::from_str(s).map_err(|_| {
            JsValue::from_str(&format!(
                "thermoprint: invalid decimal '{}'. Use a numeric string e.g. \"15000\"", s
            ))
        })
    }

    #[wasm_bindgen]
    pub struct WasmReceiptBuilder {
        inner: ReceiptBuilder,
    }

    #[wasm_bindgen]
    impl WasmReceiptBuilder {
        /// Create a new builder.
        /// `width`: `"58mm"`, `"80mm"`, or `"a4"` (case-insensitive).
        #[wasm_bindgen(constructor)]
        pub fn new(width: &str) -> Result<WasmReceiptBuilder, JsValue> {
            let pw = match width.to_lowercase().as_str() {
                "58mm" | "58" => PrintWidth::Mm58,
                "80mm" | "80" => PrintWidth::Mm80,
                "a4"          => PrintWidth::A4,
                other => return Err(JsValue::from_str(
                    &format!("thermoprint: unknown width '{}'. Use '58mm', '80mm', or 'a4'", other)
                )),
            };
            Ok(WasmReceiptBuilder { inner: ReceiptBuilder::new(pw) })
        }

        /// Set currency symbol (default: `"FCFA"`).
        pub fn currency(self, symbol: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.currency(symbol) }
        }

        pub fn init(self)          -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.init() } }
        pub fn blank(self)         -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.blank() } }
        pub fn align_left(self)    -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.align_left() } }
        pub fn align_center(self)  -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.align_center() } }
        pub fn align_right(self)   -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.align_right() } }
        pub fn bold(self, on: bool)-> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.bold(on) } }
        pub fn double_size(self, on: bool) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.double_size(on) } }
        pub fn double_height(self, on: bool) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.double_height(on) } }
        pub fn normal_size(self)   -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.normal_size() } }
        pub fn underline(self, on: bool) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.underline(on) } }
        pub fn text(self, s: &str) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.text(s) } }
        pub fn text_line(self, s: &str) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.text_line(s) } }
        pub fn centered(self, s: &str)  -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.centered(s) } }
        pub fn right(self, s: &str)     -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.right(s) } }
        pub fn row(self, left: &str, right: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.row(left, right) }
        }
        pub fn divider(self, ch: &str) -> WasmReceiptBuilder {
            let c = ch.chars().next().unwrap_or('-');
            WasmReceiptBuilder { inner: self.inner.divider(c) }
        }
        pub fn feed(self, n: u8)   -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.feed(n) } }
        pub fn cut(self)           -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.cut() } }
        pub fn cut_full(self)      -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.cut_full() } }
        pub fn form_feed(self)     -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.form_feed() } }
        pub fn open_cash_drawer(self) -> WasmReceiptBuilder { WasmReceiptBuilder { inner: self.inner.open_cash_drawer() } }

        pub fn barcode_code128(self, value: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.barcode_code128(value) }
        }
        pub fn barcode_ean13(self, value: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.barcode_ean13(value) }
        }
        pub fn qr_code(self, data: &str, size: u8) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.qr_code(data, size) }
        }

        /// Append pre-rasterised logo bytes (pass a `Uint8Array` from your own image pipeline).
        pub fn logo_raw(self, bytes: &[u8]) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.logo_raw(bytes) }
        }

        pub fn shop_header(self, name: &str, phone: &str, address: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.shop_header(name, phone, address) }
        }

        /// Add a line item. `unit_price` and `discount` are decimal strings.
        pub fn item(
            self,
            name: &str,
            qty: i32,
            unit_price: &str,
            discount: Option<String>,
        ) -> Result<WasmReceiptBuilder, JsValue> {
            let price = parse_decimal(unit_price)?;
            let disc  = discount.as_deref().map(parse_decimal).transpose()?;
            Ok(WasmReceiptBuilder { inner: self.inner.item(name, qty, price, disc) })
        }

        pub fn subtotal_ht(self, amount: &str) -> Result<WasmReceiptBuilder, JsValue> {
            Ok(WasmReceiptBuilder { inner: self.inner.subtotal_ht(parse_decimal(amount)?) })
        }

        /// Add a single tax line. Call once per tax entry.
        /// `amount` is a decimal string; `included` is whether the tax is already in the item prices.
        pub fn add_tax(self, label: &str, amount: &str, included: bool) -> Result<WasmReceiptBuilder, JsValue> {
            let amt = parse_decimal(amount)?;
            let entry = crate::types::TaxEntry::new(label, amt, included);
            Ok(WasmReceiptBuilder { inner: self.inner.taxes(&[entry]) })
        }

        pub fn discount(self, amount: &str, coupon_code: Option<String>) -> Result<WasmReceiptBuilder, JsValue> {
            Ok(WasmReceiptBuilder {
                inner: self.inner.discount(parse_decimal(amount)?, coupon_code.as_deref())
            })
        }

        pub fn total(self, amount: &str) -> Result<WasmReceiptBuilder, JsValue> {
            Ok(WasmReceiptBuilder { inner: self.inner.total(parse_decimal(amount)?) })
        }

        pub fn received(self, amount: &str) -> Result<WasmReceiptBuilder, JsValue> {
            Ok(WasmReceiptBuilder { inner: self.inner.received(parse_decimal(amount)?) })
        }

        pub fn change(self, amount: &str) -> Result<WasmReceiptBuilder, JsValue> {
            Ok(WasmReceiptBuilder { inner: self.inner.change(parse_decimal(amount)?) })
        }

        pub fn served_by(self, name: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.served_by(name) }
        }

        pub fn thank_you(self, shop_name: &str) -> WasmReceiptBuilder {
            WasmReceiptBuilder { inner: self.inner.thank_you(shop_name) }
        }

        /// Finalise and return the ESC/POS bytes as a `Uint8Array`.
        pub fn build(self) -> Uint8Array {
            let bytes = self.inner.build();
            let arr   = Uint8Array::new_with_length(bytes.len() as u32);
            arr.copy_from(&bytes);
            arr
        }
    }
}
