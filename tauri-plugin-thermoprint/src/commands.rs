use serde::Deserialize;
use std::io::Write;
use std::time::Duration;

use crate::PortInfo;

/// List available serial ports on the system.
#[tauri::command]
pub async fn list_ports() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;

    Ok(ports
        .into_iter()
        .map(|p| {
            let port_type = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    format!(
                        "USB (VID:{:04X} PID:{:04X}{})",
                        info.vid,
                        info.pid,
                        info.product
                            .as_deref()
                            .map(|s| format!(" - {}", s))
                            .unwrap_or_default()
                    )
                }
                serialport::SerialPortType::BluetoothPort => "Bluetooth".to_owned(),
                serialport::SerialPortType::PciPort => "PCI".to_owned(),
                serialport::SerialPortType::Unknown => "Unknown".to_owned(),
            };
            PortInfo {
                name: p.port_name,
                port_type,
            }
        })
        .collect())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSerialArgs {
    /// Serial port path (e.g. `/dev/ttyUSB0`, `COM3`).
    pub port: String,
    /// Baud rate (default: 9600).
    #[serde(default = "default_baud")]
    pub baud_rate: u32,
    /// ESC/POS bytes to send. Passed as a JSON array of numbers.
    pub data: Vec<u8>,
}

fn default_baud() -> u32 {
    9600
}

/// Send raw ESC/POS bytes to a serial port.
#[tauri::command]
pub async fn print_serial(args: PrintSerialArgs) -> Result<(), String> {
    let mut port = serialport::new(&args.port, args.baud_rate)
        .timeout(Duration::from_secs(10))
        .open()
        .map_err(|e| format!("Failed to open port '{}': {}", args.port, e))?;

    // Write in chunks to avoid overwhelming the printer buffer
    let chunk_size = 4096;
    for chunk in args.data.chunks(chunk_size) {
        port.write_all(chunk)
            .map_err(|e| format!("Write error on '{}': {}", args.port, e))?;
        port.flush()
            .map_err(|e| format!("Flush error on '{}': {}", args.port, e))?;
    }

    log::info!(
        "thermoprint: sent {} bytes to {}",
        args.data.len(),
        args.port
    );

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintTemplateArgs {
    /// Serial port path.
    pub port: String,
    /// Baud rate (default: 9600).
    #[serde(default = "default_baud")]
    pub baud_rate: u32,
    /// JSON template string (same format as the template engine).
    pub template: String,
}

/// Render a JSON receipt template and send the bytes to a serial port.
///
/// This combines the template engine with serial printing in a single call.
#[tauri::command]
pub async fn print_template(args: PrintTemplateArgs) -> Result<(), String> {
    let bytes = thermoprint::render_json(&args.template).map_err(|e| e.to_string())?;

    let print_args = PrintSerialArgs {
        port: args.port,
        baud_rate: args.baud_rate,
        data: bytes,
    };

    print_serial(print_args).await
}
