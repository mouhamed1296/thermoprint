export type TransportType = 'webserial' | 'webusb';

export interface ThermoPrinterOptions {
  /** Force a specific transport. Auto-detects if omitted. */
  transport?: TransportType;
  /** Baud rate for WebSerial (default: 9600). */
  baudRate?: number;
  /** USB device filters for WebUSB (default: all). */
  usbFilters?: USBDeviceFilter[];
  /** USB endpoint number (default: 1). */
  usbEndpoint?: number;
  /** USB configuration value (default: 1). */
  usbConfig?: number;
  /** USB interface number (default: 0). */
  usbInterface?: number;
}

export interface PrintOptions {
  /** Max bytes per write (default: 4096). */
  chunkSize?: number;
  /** Milliseconds to wait between chunks (default: 20). */
  chunkDelay?: number;
}

export declare class ThermoPrinter {
  constructor(opts?: ThermoPrinterOptions);

  /** Check if WebSerial is available in this browser. */
  static readonly hasWebSerial: boolean;
  /** Check if WebUSB is available in this browser. */
  static readonly hasWebUSB: boolean;

  /** One-liner: connect → print → disconnect. */
  static quickPrint(data: Uint8Array, opts?: ThermoPrinterOptions): Promise<void>;

  /** The active transport after connection. */
  readonly transport: TransportType | null;
  /** Whether the printer is connected. */
  readonly connected: boolean;

  /** Prompt user to select a printer and open the connection. */
  connect(): Promise<void>;
  /** Send ESC/POS bytes to the connected printer. */
  print(data: Uint8Array, opts?: PrintOptions): Promise<void>;
  /** Close the connection and release resources. */
  disconnect(): Promise<void>;
}

export default ThermoPrinter;
