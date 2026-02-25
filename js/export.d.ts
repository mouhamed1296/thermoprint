export interface ExportOptions {
  /** Pixel scale factor (default: 2 for retina). */
  scale?: number;
  /** Monospace font family (default: 'Courier New, monospace'). */
  fontFamily?: string;
  /** Base font size in pixels (default: 14). */
  fontSize?: number;
  /** Line height multiplier (default: 1.4). */
  lineHeight?: number;
  /** Horizontal padding in pixels (default: 16). */
  paddingX?: number;
  /** Vertical padding in pixels (default: 16). */
  paddingY?: number;
  /** Background colour (default: '#fff'). */
  bgColor?: string;
  /** Text colour (default: '#000'). */
  fgColor?: string;
}

export declare class ReceiptExporter {
  constructor(template: object, opts?: ExportOptions);

  /** Render the receipt and return a PNG data URL. */
  toPNG(): string;
  /** Render the receipt and return a PNG Blob. */
  toPNGBlob(): Promise<Blob>;
  /** Render and trigger a PNG file download. */
  downloadPNG(filename?: string): void;
  /** Render and trigger a PDF download. */
  downloadPDF(filename?: string): void;
  /** Get the rendered canvas element directly. */
  getCanvas(): HTMLCanvasElement | OffscreenCanvas;
}

export default ReceiptExporter;
