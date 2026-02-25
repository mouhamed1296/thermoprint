/**
 * ThermoPrinter — one-liner browser printing for ESC/POS thermal printers.
 *
 * Supports WebSerial and WebUSB. Auto-detects which API is available.
 *
 * @example
 * import { ThermoPrinter } from 'thermoprint/printer';
 *
 * const printer = new ThermoPrinter();
 * await printer.connect();        // prompts user to select device
 * await printer.print(bytes);     // send ESC/POS bytes
 * await printer.disconnect();
 *
 * // Or one-liner:
 * await ThermoPrinter.print(bytes);
 */

/**
 * @typedef {'webserial'|'webusb'} TransportType
 */

/**
 * @typedef {Object} ThermoPrinterOptions
 * @property {TransportType} [transport]   - Force a specific transport. Auto-detects if omitted.
 * @property {number}        [baudRate]    - Baud rate for WebSerial (default: 9600).
 * @property {object[]}      [usbFilters]  - USB device filters for WebUSB (default: all).
 * @property {number}        [usbEndpoint] - USB endpoint number (default: 1).
 * @property {number}        [usbConfig]   - USB configuration value (default: 1).
 * @property {number}        [usbInterface]- USB interface number (default: 0).
 */

export class ThermoPrinter {
  /** @param {ThermoPrinterOptions} [opts] */
  constructor(opts = {}) {
    this._transport = opts.transport || null;
    this._baudRate = opts.baudRate || 9600;
    this._usbFilters = opts.usbFilters || [];
    this._usbEndpoint = opts.usbEndpoint || 1;
    this._usbConfig = opts.usbConfig || 1;
    this._usbInterface = opts.usbInterface || 0;
    this._device = null;   // WebUSB device
    this._port = null;     // WebSerial port
    this._writer = null;
    this._connected = false;
    this._activeTransport = null;
  }

  // ── Static helpers ─────────────────────────────────────────────────────

  /** Check if WebSerial is available in this browser. */
  static get hasWebSerial() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /** Check if WebUSB is available in this browser. */
  static get hasWebUSB() {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  /**
   * One-liner: connect → print → disconnect.
   * @param {Uint8Array} data  ESC/POS byte array
   * @param {ThermoPrinterOptions} [opts]
   */
  static async quickPrint(data, opts) {
    const printer = new ThermoPrinter(opts);
    await printer.connect();
    try {
      await printer.print(data);
    } finally {
      await printer.disconnect();
    }
  }

  // ── Connection ─────────────────────────────────────────────────────────

  /** @returns {'webserial'|'webusb'|null} The detected/forced transport. */
  get transport() {
    return this._activeTransport;
  }

  /** @returns {boolean} */
  get connected() {
    return this._connected;
  }

  /**
   * Prompt the user to select a printer and open the connection.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this._connected) return;

    const transport = this._resolveTransport();
    if (!transport) {
      throw new Error(
        'ThermoPrinter: neither WebSerial nor WebUSB is available in this browser. ' +
        'Use Chrome/Edge 89+ with a secure context (HTTPS or localhost).'
      );
    }

    this._activeTransport = transport;

    if (transport === 'webserial') {
      await this._connectSerial();
    } else {
      await this._connectUSB();
    }

    this._connected = true;
  }

  /**
   * Send ESC/POS bytes to the connected printer.
   *
   * For large payloads, data is sent in chunks to avoid overflowing
   * the printer's buffer.
   *
   * @param {Uint8Array} data
   * @param {object} [opts]
   * @param {number} [opts.chunkSize=4096]  Max bytes per write.
   * @param {number} [opts.chunkDelay=20]   Ms to wait between chunks.
   * @returns {Promise<void>}
   */
  async print(data, { chunkSize = 4096, chunkDelay = 20 } = {}) {
    if (!this._connected) {
      throw new Error('ThermoPrinter: not connected. Call connect() first.');
    }

    if (this._activeTransport === 'webserial') {
      await this._writeSerial(data, chunkSize, chunkDelay);
    } else {
      await this._writeUSB(data, chunkSize, chunkDelay);
    }
  }

  /**
   * Close the connection and release resources.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this._connected) return;

    try {
      if (this._activeTransport === 'webserial') {
        await this._disconnectSerial();
      } else {
        await this._disconnectUSB();
      }
    } finally {
      this._connected = false;
      this._activeTransport = null;
    }
  }

  // ── WebSerial internals ────────────────────────────────────────────────

  /** @private */
  async _connectSerial() {
    this._port = await navigator.serial.requestPort();
    await this._port.open({ baudRate: this._baudRate });
    this._writer = this._port.writable.getWriter();
  }

  /** @private */
  async _writeSerial(data, chunkSize, chunkDelay) {
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, offset + chunkSize);
      await this._writer.write(chunk);
      if (offset + chunkSize < data.length && chunkDelay > 0) {
        await this._sleep(chunkDelay);
      }
    }
  }

  /** @private */
  async _disconnectSerial() {
    if (this._writer) {
      await this._writer.releaseLock();
      this._writer = null;
    }
    if (this._port) {
      await this._port.close();
      this._port = null;
    }
  }

  // ── WebUSB internals ───────────────────────────────────────────────────

  /** @private */
  async _connectUSB() {
    this._device = await navigator.usb.requestDevice({
      filters: this._usbFilters,
    });
    await this._device.open();
    await this._device.selectConfiguration(this._usbConfig);
    await this._device.claimInterface(this._usbInterface);
  }

  /** @private */
  async _writeUSB(data, chunkSize, chunkDelay) {
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, offset + chunkSize);
      await this._device.transferOut(this._usbEndpoint, chunk);
      if (offset + chunkSize < data.length && chunkDelay > 0) {
        await this._sleep(chunkDelay);
      }
    }
  }

  /** @private */
  async _disconnectUSB() {
    if (this._device) {
      await this._device.releaseInterface(this._usbInterface);
      await this._device.close();
      this._device = null;
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  /** @private */
  _resolveTransport() {
    if (this._transport) return this._transport;
    if (ThermoPrinter.hasWebSerial) return 'webserial';
    if (ThermoPrinter.hasWebUSB) return 'webusb';
    return null;
  }

  /** @private */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ThermoPrinter;
