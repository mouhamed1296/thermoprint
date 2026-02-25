use rust_decimal::Decimal;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

/// Supported paper widths.
///
/// Each variant carries the printable character width used for layout math.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrintWidth {
    /// 58 mm thermal roll — 32 characters at standard font
    Mm58,
    /// 80 mm thermal roll — 48 characters at standard font
    Mm80,
    /// A4 / generic wide-carriage — 90 characters
    A4,
}

impl PrintWidth {
    /// Printable character column count for this width.
    pub fn cols(self) -> usize {
        match self {
            PrintWidth::Mm58 => 32,
            PrintWidth::Mm80 => 48,
            PrintWidth::A4 => 90,
        }
    }

    /// Whether this is a thermal (ESC/POS) target.
    pub fn is_thermal(self) -> bool {
        matches!(self, PrintWidth::Mm58 | PrintWidth::Mm80)
    }

    /// Maximum raster image width in pixels for logo printing.
    #[cfg(feature = "native")]
    pub fn max_image_px(self) -> u32 {
        match self {
            PrintWidth::Mm58 => 256,
            PrintWidth::Mm80 => 384,
            PrintWidth::A4 => 576,
        }
    }
}

/// Text alignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    /// Left-align (default)
    Left,
    /// Centre-align
    Center,
    /// Right-align
    Right,
}

/// A single tax line attached to a receipt.
#[derive(Debug, Clone)]
pub struct TaxEntry {
    /// Display label, e.g. `"TVA 18%"` or `"Taxe Municipale 2%"`
    pub label: String,
    /// Tax amount in the local currency unit
    pub amount: Decimal,
    /// `true`  → tax is already included in the item prices (shown for info only)
    /// `false` → tax is added on top of the subtotal
    pub included: bool,
}

impl TaxEntry {
    /// Convenience constructor.
    pub fn new(label: impl Into<String>, amount: Decimal, included: bool) -> Self {
        Self {
            label: label.into(),
            amount,
            included,
        }
    }
}
