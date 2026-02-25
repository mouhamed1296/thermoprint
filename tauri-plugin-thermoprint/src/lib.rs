//! # tauri-plugin-thermoprint
//!
//! Tauri v2 plugin for thermal receipt printing via serial ports.
//!
//! ## Setup
//!
//! **Rust side** (`src-tauri/src/main.rs`):
//!
//! ```rust,ignore
//! fn main() {
//!     tauri::Builder::default()
//!         .plugin(tauri_plugin_thermoprint::init())
//!         .run(tauri::generate_context!())
//!         .expect("error running app");
//! }
//! ```
//!
//! **JavaScript side**:
//!
//! ```js
//! import { invoke } from '@tauri-apps/api/core';
//!
//! // List available serial ports
//! const ports = await invoke('plugin:thermoprint|list_ports');
//!
//! // Print ESC/POS bytes to a serial port
//! await invoke('plugin:thermoprint|print_serial', {
//!   port: '/dev/ttyUSB0',
//!   baudRate: 9600,
//!   data: Array.from(receiptBytes),
//! });
//!
//! // Render a JSON template and print in one call
//! await invoke('plugin:thermoprint|print_template', {
//!   port: '/dev/ttyUSB0',
//!   baudRate: 9600,
//!   template: JSON.stringify({ width: "80mm", elements: [...] }),
//! });
//! ```

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod commands;

/// Initialise the thermoprint plugin.
///
/// ```rust,ignore
/// tauri::Builder::default()
///     .plugin(tauri_plugin_thermoprint::init())
/// ```
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("thermoprint")
        .invoke_handler(tauri::generate_handler![
            commands::list_ports,
            commands::print_serial,
            commands::print_template,
        ])
        .build()
}

/// Information about an available serial port.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortInfo {
    /// System port name (e.g. `/dev/ttyUSB0`, `COM3`).
    pub name: String,
    /// Port type description.
    pub port_type: String,
}
