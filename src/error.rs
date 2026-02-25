use thiserror::Error;

/// Every error `thermoprint` can produce.
#[derive(Debug, Error)]
pub enum ThermoprintError {
    /// The barcode value is empty or too long for the chosen symbology.
    #[error("Invalid barcode value '{value}': {reason}")]
    InvalidBarcode {
        /// The invalid barcode value.
        value: String,
        /// Why the value was rejected.
        reason: String,
    },

    /// A money string passed through the WASM boundary couldn't be parsed.
    #[error("Invalid decimal amount '{0}': must be a numeric string e.g. \"15000\" or \"149.99\"")]
    InvalidDecimal(String),

    /// Logo image could not be loaded (native feature only).
    #[cfg(feature = "native")]
    #[error("Failed to load logo from '{path}': {reason}")]
    LogoLoad {
        /// Path to the image that failed to load.
        path: String,
        /// Underlying error description.
        reason: String,
    },

    /// The requested operation is not supported for the current print width.
    #[error("Operation not supported for width {0:?}")]
    UnsupportedWidth(crate::types::PrintWidth),
}
