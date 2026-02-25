//! JSON template engine for receipt generation.
//!
//! Define receipt layouts as JSON and fill them with data at runtime.
//! This allows non-developers to design receipts while developers
//! just pass structured data.
//!
//! # Example JSON
//!
//! ```json
//! {
//!   "width": "80mm",
//!   "currency": "FCFA",
//!   "language": "fr",
//!   "elements": [
//!     { "type": "shop_header", "name": "MA BOUTIQUE", "phone": "+221 77 000 00 00", "address": "Dakar" },
//!     { "type": "divider", "char": "=" },
//!     { "type": "item", "name": "Polo shirt", "qty": 2, "unit_price": "15000" },
//!     { "type": "divider", "char": "-" },
//!     { "type": "subtotal", "amount": "30000" },
//!     { "type": "tax", "label": "TVA 18%", "amount": "5400", "included": true },
//!     { "type": "total", "amount": "35400" },
//!     { "type": "received", "amount": "40000" },
//!     { "type": "change", "amount": "4600" },
//!     { "type": "divider", "char": "=" },
//!     { "type": "barcode_code128", "value": "ORD-2024-001" },
//!     { "type": "qr_code", "data": "https://example.com", "size": 4 },
//!     { "type": "served_by", "name": "Mamadou" },
//!     { "type": "thank_you", "shop_name": "MA BOUTIQUE" },
//!     { "type": "feed", "lines": 3 },
//!     { "type": "cut" }
//!   ]
//! }
//! ```

use rust_decimal::Decimal;
use serde::Deserialize;
use std::str::FromStr;

use crate::builder::ReceiptBuilder;
use crate::i18n::Language;
use crate::types::{PrintWidth, TaxEntry};

/// A complete receipt template that can be rendered to ESC/POS bytes.
#[derive(Debug, Deserialize)]
pub struct ReceiptTemplate {
    /// Paper width: `"58mm"`, `"80mm"`, or `"a4"`.
    #[serde(default = "default_width")]
    pub width: String,

    /// Currency symbol (default: `"FCFA"`).
    #[serde(default = "default_currency")]
    pub currency: String,

    /// Receipt language code (default: `"fr"`).
    #[serde(default = "default_language")]
    pub language: String,

    /// Ordered list of receipt elements.
    pub elements: Vec<Element>,
}

fn default_width() -> String {
    "80mm".to_owned()
}
fn default_currency() -> String {
    "FCFA".to_owned()
}
fn default_language() -> String {
    "fr".to_owned()
}

/// A single element in a receipt template.
///
/// Each variant maps to a JSON object with `"type": "variant_name"`.
/// Fields are deserialized from the same JSON object.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(missing_docs)]
pub enum Element {
    /// Printer init (reset + code page). Should be first.
    Init,

    /// Shop header block (centered, bold, large name).
    ShopHeader {
        name: String,
        #[serde(default)]
        phone: String,
        #[serde(default)]
        address: String,
    },

    /// A single text line.
    TextLine { text: String },

    /// Centered text line.
    Centered { text: String },

    /// Right-aligned text line.
    Right { text: String },

    /// Two-column row (label left, value right).
    Row { left: String, right: String },

    /// Full-width divider.
    Divider {
        #[serde(default = "default_divider_char", rename = "char")]
        ch: String,
    },

    /// Blank line.
    Blank,

    /// Toggle bold.
    Bold {
        #[serde(default = "default_true")]
        on: bool,
    },

    /// Toggle double size.
    DoubleSize {
        #[serde(default = "default_true")]
        on: bool,
    },

    /// Toggle double height.
    DoubleHeight {
        #[serde(default = "default_true")]
        on: bool,
    },

    /// Reset to normal size.
    NormalSize,

    /// Toggle underline.
    Underline {
        #[serde(default = "default_true")]
        on: bool,
    },

    /// Set alignment.
    Align {
        /// `"left"`, `"center"`, or `"right"`.
        value: String,
    },

    /// Line item.
    Item {
        name: String,
        qty: i32,
        /// Decimal string, e.g. `"15000"`.
        unit_price: String,
        /// Optional discount as decimal string.
        #[serde(default)]
        discount: Option<String>,
    },

    /// Subtotal excluding tax.
    Subtotal {
        /// Decimal string.
        amount: String,
    },

    /// Single tax line.
    Tax {
        label: String,
        /// Decimal string.
        amount: String,
        #[serde(default)]
        included: bool,
    },

    /// Discount line.
    Discount {
        /// Decimal string.
        amount: String,
        #[serde(default)]
        coupon_code: Option<String>,
    },

    /// Grand total.
    Total {
        /// Decimal string.
        amount: String,
    },

    /// Amount received.
    Received {
        /// Decimal string.
        amount: String,
    },

    /// Change to return.
    Change {
        /// Decimal string.
        amount: String,
    },

    /// Served by footer.
    ServedBy { name: String },

    /// Thank you footer.
    ThankYou { shop_name: String },

    /// CODE128 barcode.
    BarcodeCode128 { value: String },

    /// EAN-13 barcode.
    BarcodeEan13 { value: String },

    /// QR code.
    QrCode {
        data: String,
        #[serde(default = "default_qr_size")]
        size: u8,
    },

    /// Feed n lines.
    Feed {
        #[serde(default = "default_feed")]
        lines: u8,
    },

    /// Partial cut.
    Cut,

    /// Full cut.
    CutFull,

    /// Form feed (A4 page eject).
    FormFeed,

    /// Open cash drawer.
    OpenCashDrawer,
}

fn default_divider_char() -> String {
    "-".to_owned()
}
fn default_true() -> bool {
    true
}
fn default_qr_size() -> u8 {
    4
}
fn default_feed() -> u8 {
    3
}

/// Error type for template rendering.
#[derive(Debug, thiserror::Error)]
pub enum TemplateError {
    /// JSON parsing failed.
    #[error("Invalid template JSON: {0}")]
    JsonError(#[from] serde_json::Error),

    /// A decimal amount string could not be parsed.
    #[error("Invalid decimal amount '{value}': {reason}")]
    InvalidDecimal {
        /// The invalid value.
        value: String,
        /// Description of the error.
        reason: String,
    },

    /// An unknown width string was provided.
    #[error("Unknown paper width '{0}'. Use '58mm', '80mm', or 'a4'.")]
    UnknownWidth(String),

    /// An unknown language code was provided.
    #[error("Unknown language '{0}'. Use 'fr', 'en', 'es', 'pt', 'ar', or 'wo'.")]
    UnknownLanguage(String),

    /// An unknown alignment value was provided.
    #[error("Unknown alignment '{0}'. Use 'left', 'center', or 'right'.")]
    UnknownAlign(String),
}

impl ReceiptTemplate {
    /// Parse a JSON string into a receipt template.
    pub fn from_json(json: &str) -> Result<Self, TemplateError> {
        Ok(serde_json::from_str(json)?)
    }

    /// Render this template to ESC/POS bytes.
    pub fn render(&self) -> Result<Vec<u8>, TemplateError> {
        let width = parse_width(&self.width)?;
        let lang = parse_language(&self.language)?;

        let mut builder = ReceiptBuilder::new(width)
            .currency(&self.currency)
            .language(lang);

        for element in &self.elements {
            builder = apply_element(builder, element)?;
        }

        Ok(builder.build())
    }
}

/// Parse a JSON string and render directly to ESC/POS bytes.
///
/// This is the simplest entry point for the template engine.
///
/// ```rust
/// use thermoprint::template::render_json;
///
/// let json = r#"{
///   "width": "80mm",
///   "elements": [
///     { "type": "init" },
///     { "type": "text_line", "text": "Hello, World!" },
///     { "type": "cut" }
///   ]
/// }"#;
///
/// let bytes = render_json(json).unwrap();
/// assert!(!bytes.is_empty());
/// ```
pub fn render_json(json: &str) -> Result<Vec<u8>, TemplateError> {
    let template = ReceiptTemplate::from_json(json)?;
    template.render()
}

// ── Internal helpers ─────────────────────────────────────────────────────────

fn parse_decimal(s: &str) -> Result<Decimal, TemplateError> {
    Decimal::from_str(s).map_err(|e| TemplateError::InvalidDecimal {
        value: s.to_owned(),
        reason: e.to_string(),
    })
}

fn parse_width(s: &str) -> Result<PrintWidth, TemplateError> {
    match s.to_lowercase().as_str() {
        "58mm" | "58" => Ok(PrintWidth::Mm58),
        "80mm" | "80" => Ok(PrintWidth::Mm80),
        "a4" => Ok(PrintWidth::A4),
        _ => Err(TemplateError::UnknownWidth(s.to_owned())),
    }
}

fn parse_language(s: &str) -> Result<Language, TemplateError> {
    match s.to_lowercase().as_str() {
        "fr" | "french" => Ok(Language::Fr),
        "en" | "english" => Ok(Language::En),
        "es" | "spanish" => Ok(Language::Es),
        "pt" | "portuguese" => Ok(Language::Pt),
        "ar" | "arabic" => Ok(Language::Ar),
        "wo" | "wolof" => Ok(Language::Wo),
        _ => Err(TemplateError::UnknownLanguage(s.to_owned())),
    }
}

fn parse_align(s: &str) -> Result<crate::types::Align, TemplateError> {
    match s.to_lowercase().as_str() {
        "left" => Ok(crate::types::Align::Left),
        "center" => Ok(crate::types::Align::Center),
        "right" => Ok(crate::types::Align::Right),
        _ => Err(TemplateError::UnknownAlign(s.to_owned())),
    }
}

fn apply_element(
    builder: ReceiptBuilder,
    element: &Element,
) -> Result<ReceiptBuilder, TemplateError> {
    let b = match element {
        Element::Init => builder.init(),

        Element::ShopHeader {
            name,
            phone,
            address,
        } => builder.shop_header(name, phone, address),

        Element::TextLine { text } => builder.text_line(text),
        Element::Centered { text } => builder.centered(text),
        Element::Right { text } => builder.right(text),
        Element::Row { left, right } => builder.row(left, right),

        Element::Divider { ch } => {
            let c = ch.chars().next().unwrap_or('-');
            builder.divider(c)
        }

        Element::Blank => builder.blank(),
        Element::Bold { on } => builder.bold(*on),
        Element::DoubleSize { on } => builder.double_size(*on),
        Element::DoubleHeight { on } => builder.double_height(*on),
        Element::NormalSize => builder.normal_size(),
        Element::Underline { on } => builder.underline(*on),

        Element::Align { value } => builder.align(parse_align(value)?),

        Element::Item {
            name,
            qty,
            unit_price,
            discount,
        } => {
            let price = parse_decimal(unit_price)?;
            let disc = discount.as_deref().map(parse_decimal).transpose()?;
            builder.item(name, *qty, price, disc)
        }

        Element::Subtotal { amount } => builder.subtotal_ht(parse_decimal(amount)?),

        Element::Tax {
            label,
            amount,
            included,
        } => {
            let entry = TaxEntry::new(label.clone(), parse_decimal(amount)?, *included);
            builder.taxes(&[entry])
        }

        Element::Discount {
            amount,
            coupon_code,
        } => builder.discount(parse_decimal(amount)?, coupon_code.as_deref()),

        Element::Total { amount } => builder.total(parse_decimal(amount)?),
        Element::Received { amount } => builder.received(parse_decimal(amount)?),
        Element::Change { amount } => builder.change(parse_decimal(amount)?),

        Element::ServedBy { name } => builder.served_by(name),
        Element::ThankYou { shop_name } => builder.thank_you(shop_name),

        Element::BarcodeCode128 { value } => builder.barcode_code128(value),
        Element::BarcodeEan13 { value } => builder.barcode_ean13(value),
        Element::QrCode { data, size } => builder.qr_code(data, *size),

        Element::Feed { lines } => builder.feed(*lines),
        Element::Cut => builder.cut(),
        Element::CutFull => builder.cut_full(),
        Element::FormFeed => builder.form_feed(),
        Element::OpenCashDrawer => builder.open_cash_drawer(),
    };

    Ok(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimal_template() {
        let json = r#"{
            "width": "80mm",
            "elements": [
                { "type": "init" },
                { "type": "text_line", "text": "Hello" },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn full_receipt_template() {
        let json = r#"{
            "width": "80mm",
            "currency": "FCFA",
            "language": "fr",
            "elements": [
                { "type": "init" },
                { "type": "shop_header", "name": "MA BOUTIQUE", "phone": "+221 77 000", "address": "Dakar" },
                { "type": "divider", "char": "=" },
                { "type": "item", "name": "Polo shirt", "qty": 2, "unit_price": "15000" },
                { "type": "item", "name": "Jean Levis", "qty": 1, "unit_price": "25000", "discount": "2000" },
                { "type": "divider", "char": "-" },
                { "type": "subtotal", "amount": "53000" },
                { "type": "tax", "label": "TVA 18%", "amount": "9540", "included": true },
                { "type": "total", "amount": "62540" },
                { "type": "received", "amount": "70000" },
                { "type": "change", "amount": "7460" },
                { "type": "divider", "char": "=" },
                { "type": "barcode_code128", "value": "ORD-2024-001" },
                { "type": "served_by", "name": "Mamadou" },
                { "type": "thank_you", "shop_name": "MA BOUTIQUE" },
                { "type": "feed", "lines": 3 },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        let output = String::from_utf8_lossy(&bytes);
        assert!(output.contains("MA BOUTIQUE"));
        assert!(output.contains("TOTAL"));
    }

    #[test]
    fn english_language_template() {
        let json = r#"{
            "width": "80mm",
            "language": "en",
            "elements": [
                { "type": "init" },
                { "type": "total", "amount": "100" },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        let output = String::from_utf8_lossy(&bytes);
        assert!(output.contains("TOTAL"));
    }

    #[test]
    fn defaults_applied() {
        let json = r#"{ "elements": [{ "type": "init" }, { "type": "cut" }] }"#;
        let bytes = render_json(json).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn invalid_json_returns_error() {
        let result = render_json("not json");
        assert!(result.is_err());
    }

    #[test]
    fn invalid_decimal_returns_error() {
        let json = r#"{ "elements": [{ "type": "total", "amount": "abc" }] }"#;
        let result = render_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn unknown_width_returns_error() {
        let json = r#"{ "width": "999mm", "elements": [{ "type": "init" }] }"#;
        let result = render_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn alignment_element() {
        let json = r#"{
            "elements": [
                { "type": "init" },
                { "type": "align", "value": "center" },
                { "type": "text_line", "text": "Centered" },
                { "type": "align", "value": "left" },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn qr_code_element() {
        let json = r#"{
            "elements": [
                { "type": "init" },
                { "type": "qr_code", "data": "https://example.com" },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn style_elements() {
        let json = r#"{
            "elements": [
                { "type": "init" },
                { "type": "bold" },
                { "type": "double_size" },
                { "type": "text_line", "text": "BIG BOLD" },
                { "type": "normal_size" },
                { "type": "bold", "on": false },
                { "type": "underline" },
                { "type": "text_line", "text": "underlined" },
                { "type": "underline", "on": false },
                { "type": "cut" }
            ]
        }"#;
        let bytes = render_json(json).unwrap();
        assert!(!bytes.is_empty());
    }
}
