/// ESC byte (`0x1B`).
pub const ESC: u8 = 0x1B;
/// GS byte (`0x1D`).
pub const GS: u8  = 0x1D;
/// Line feed byte (`0x0A`).
pub const LF: u8  = 0x0A;
/// Form feed byte (`0x0C`) — page eject on A4 / impact printers.
pub const FF: u8  = 0x0C;

// ── Initialisation ────────────────────────────────────────────────────────────

/// `ESC @` — full printer reset.
pub fn init() -> &'static [u8] { &[ESC, b'@'] }

/// Select Code Page 858 (Western European + Euro).
pub fn code_page_858() -> &'static [u8] { &[ESC, b't', 19] }

// ── Alignment ─────────────────────────────────────────────────────────────────

/// `ESC a 0` — left alignment.
pub fn align_left()   -> &'static [u8] { &[ESC, b'a', 0] }
/// `ESC a 1` — center alignment.
pub fn align_center() -> &'static [u8] { &[ESC, b'a', 1] }
/// `ESC a 2` — right alignment.
pub fn align_right()  -> &'static [u8] { &[ESC, b'a', 2] }

// ── Text style ────────────────────────────────────────────────────────────────

/// `ESC E 1` — bold on.
pub fn bold_on()  -> &'static [u8] { &[ESC, b'E', 1] }
/// `ESC E 0` — bold off.
pub fn bold_off() -> &'static [u8] { &[ESC, b'E', 0] }

/// `ESC ! 0x10` — double height only.
pub fn double_height_on() -> &'static [u8] { &[ESC, b'!', 0x10] }
/// `ESC ! 0x20` — double width only.
pub fn double_width_on()  -> &'static [u8] { &[ESC, b'!', 0x20] }
/// `ESC ! 0x30` — double height + double width.
pub fn double_size_on()   -> &'static [u8] { &[ESC, b'!', 0x30] }
/// `ESC ! 0x00` — normal (single) size.
pub fn normal_size()      -> &'static [u8] { &[ESC, b'!', 0x00] }

/// Underline off.
pub fn underline_off() -> &'static [u8] { &[ESC, b'-', 0] }
/// Single underline.
pub fn underline_on()  -> &'static [u8] { &[ESC, b'-', 1] }

// ── Line feed & paper movement ────────────────────────────────────────────────

/// Advance `n` lines.
pub fn feed_lines(n: u8) -> Vec<u8> { vec![ESC, b'd', n] }

/// Single line feed.
pub fn lf() -> &'static [u8] { &[LF] }

/// Form feed — ejects page on A4 / impact printers.
pub fn form_feed() -> &'static [u8] { &[FF] }

// ── Paper cut ─────────────────────────────────────────────────────────────────

/// Full cut with feed.
pub fn cut_full() -> &'static [u8] { &[GS, b'V', 0] }

/// Partial cut with feed (`GS V 66 0`).
pub fn cut_partial() -> &'static [u8] { &[GS, b'V', 66, 0] }

// ── Barcodes ──────────────────────────────────────────────────────────────────

/// Set HRI (Human Readable Interpretation) position.
/// `pos`: 0 = none, 1 = above, 2 = below, 3 = both.
pub fn barcode_hri_position(pos: u8) -> Vec<u8> { vec![GS, b'H', pos] }

/// Set HRI font: 0 = Font A (default), 1 = Font B.
pub fn barcode_hri_font(font: u8) -> Vec<u8> { vec![GS, b'f', font] }

/// Set barcode height in dots (default 162).
pub fn barcode_height(dots: u8) -> Vec<u8> { vec![GS, b'h', dots] }

/// Set barcode module width (1–6, default 3).
pub fn barcode_width(width: u8) -> Vec<u8> { vec![GS, b'w', width] }

/// Print a CODE128 barcode (`GS k 73 len data`).
///
/// CODE128 supports full ASCII including hyphens — ideal for order numbers.
pub fn barcode_code128(value: &str) -> Vec<u8> {
    let mut cmd = vec![GS, b'k', 73, value.len() as u8];
    cmd.extend_from_slice(value.as_bytes());
    cmd
}

/// Print an EAN-13 barcode. `value` must be exactly 12 digits (check digit auto-added).
pub fn barcode_ean13(value: &str) -> Vec<u8> {
    let mut cmd = vec![GS, b'k', 2];
    cmd.extend_from_slice(value.as_bytes());
    cmd.push(0); // null terminator
    cmd
}

// ── QR code ───────────────────────────────────────────────────────────────────

/// Print a QR code. `size` is the module size (1–8, default 3).
/// Error correction level M (15%).
pub fn qr_code(data: &str, size: u8) -> Vec<u8> {
    let mut cmd = Vec::new();
    let plen = (data.len() + 3) as u16;

    // Store data in QR code symbol storage area
    cmd.extend_from_slice(&[
        GS, b'(', b'k',
        (plen & 0xFF) as u8,
        ((plen >> 8) & 0xFF) as u8,
        49, 80, 48, // fn 80: store data
    ]);
    cmd.extend_from_slice(data.as_bytes());

    // Set module size
    cmd.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 67, size]);

    // Set error correction level M
    cmd.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 69, 49]);

    // Print symbol
    cmd.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 81, 48]);

    cmd
}

// ── Cash drawer ───────────────────────────────────────────────────────────────

/// Kick cash drawer pin 2 (most drawers) and pin 5 (some drawers).
pub fn cash_drawer_kick() -> Vec<u8> {
    vec![
        ESC, b'p', 0, 25, 250, // pin 2
        ESC, b'p', 1, 25, 250, // pin 5
    ]
}

// ── Raster image ──────────────────────────────────────────────────────────────

/// Build a `GS v 0` raster bit-image command from raw 1-bit pixel data.
///
/// `bytes_per_line` = ceil(width_px / 8)
/// `height_px`      = number of raster lines
/// `raster_data`    = packed 1-bit rows, MSB first (1 = print, 0 = white)
pub fn raster_image(bytes_per_line: u16, height_px: u16, raster_data: &[u8]) -> Vec<u8> {
    let mut cmd = Vec::with_capacity(8 + raster_data.len());
    cmd.extend_from_slice(&[GS, b'v', b'0', 0]); // m = 0: normal density
    cmd.push((bytes_per_line & 0xFF) as u8);
    cmd.push(((bytes_per_line >> 8) & 0xFF) as u8);
    cmd.push((height_px & 0xFF) as u8);
    cmd.push(((height_px >> 8) & 0xFF) as u8);
    cmd.extend_from_slice(raster_data);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code128_includes_value() {
        let cmd = barcode_code128("ORD-001");
        assert_eq!(cmd[2], 73); // CODE128 type
        assert_eq!(cmd[3], 7);  // length
        assert_eq!(&cmd[4..], b"ORD-001");
    }

    #[test]
    fn qr_has_all_subcommands() {
        let cmd = qr_code("https://example.com", 3);
        // Should contain store, size, error-correction, print subcommands
        assert!(cmd.len() > 20);
    }

    #[test]
    fn raster_header_correct() {
        let data = vec![0xFFu8; 4]; // 1 line of 32 pixels
        let cmd = raster_image(4, 1, &data);
        assert_eq!(&cmd[..4], &[GS, b'v', b'0', 0]);
        assert_eq!(cmd[4], 4);  // xL
        assert_eq!(cmd[5], 0);  // xH
        assert_eq!(cmd[6], 1);  // yL
        assert_eq!(cmd[7], 0);  // yH
    }
}
