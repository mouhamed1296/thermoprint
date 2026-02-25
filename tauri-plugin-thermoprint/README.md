# tauri-plugin-thermoprint

Tauri v2 plugin for thermal receipt printing with [thermoprint](https://github.com/mouhamed1296/thermoprint).

## Features

- **List serial ports** — discover connected printers
- **Print raw ESC/POS bytes** — send bytes directly to a serial port
- **Print from JSON template** — render a template and print in one call
- **Chunked writes** — avoids overflowing printer buffers

## Setup

### Rust side

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-thermoprint = { git = "https://github.com/mouhamed1296/thermoprint" }
```

Register the plugin in `src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_thermoprint::init())
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

### JavaScript side

```js
import { invoke } from '@tauri-apps/api/core';

// List available serial ports
const ports = await invoke('plugin:thermoprint|list_ports');
// → [{ name: "/dev/ttyUSB0", port_type: "USB (VID:0416 PID:5011 - POS Printer)" }]

// Build receipt bytes (using thermoprint WASM or template)
const bytes = [0x1B, 0x40, ...]; // ESC/POS bytes

// Print to a serial port
await invoke('plugin:thermoprint|print_serial', {
  port: '/dev/ttyUSB0',
  baudRate: 9600,
  data: bytes,
});

// Or render a template and print in one shot
await invoke('plugin:thermoprint|print_template', {
  port: '/dev/ttyUSB0',
  baudRate: 9600,
  template: JSON.stringify({
    width: "80mm",
    currency: "FCFA",
    language: "fr",
    elements: [
      { type: "init" },
      { type: "shop_header", name: "MA BOUTIQUE", phone: "+221 77 000", address: "Dakar" },
      { type: "divider", char: "=" },
      { type: "item", name: "Polo shirt", qty: 2, unit_price: "15000" },
      { type: "total", amount: "30000" },
      { type: "feed", lines: 3 },
      { type: "cut" }
    ]
  }),
});
```

## Commands

| Command | Description |
|---|---|
| `list_ports` | Returns `PortInfo[]` of available serial ports |
| `print_serial` | Send raw ESC/POS bytes to a serial port |
| `print_template` | Render a JSON template and print to a serial port |

## License

MIT © Mamadou Sarr
