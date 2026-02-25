//! Image dithering for ESC/POS thermal printers.
//!
//! Converts RGBA pixel data to 1-bit monochrome using Floyd-Steinberg
//! error-diffusion dithering, then packs the result into ESC/POS raster
//! commands (`GS v 0`).
//!
//! This module is pure Rust with no external dependencies, so it works
//! in both native and WASM contexts.
//!
//! # Example (native)
//!
//! ```rust
//! use thermoprint::dither::{dither_rgba, DitherMethod};
//!
//! // 4×1 image: 2 black pixels, 2 white pixels (RGBA)
//! let rgba = vec![
//!     0, 0, 0, 255,       // black
//!     0, 0, 0, 255,       // black
//!     255, 255, 255, 255,  // white
//!     255, 255, 255, 255,  // white
//! ];
//! let raster = dither_rgba(&rgba, 4, 1, 384, DitherMethod::FloydSteinberg);
//! assert!(!raster.is_empty());
//! ```

use crate::commands;

/// Dithering algorithm to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DitherMethod {
    /// Simple threshold (pixels darker than 50% → black).
    Threshold,
    /// Floyd-Steinberg error-diffusion dithering.
    /// Produces much better results for photographs and gradients.
    FloydSteinberg,
}

/// Convert RGBA pixel data to ESC/POS raster bytes using the specified
/// dithering method.
///
/// - `rgba`: raw pixel data in RGBA order (4 bytes per pixel).
/// - `width`: image width in pixels.
/// - `height`: image height in pixels.
/// - `max_width_px`: maximum printable width in pixels (e.g. 384 for 80mm).
///   Images wider than this are scaled down proportionally.
/// - `method`: dithering algorithm to use.
///
/// Returns a `Vec<u8>` containing a `GS v 0` raster command ready to push
/// into a `ReceiptBuilder` via `logo_raw()`.
pub fn dither_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    max_width_px: u32,
    method: DitherMethod,
) -> Vec<u8> {
    assert_eq!(
        rgba.len(),
        (width * height * 4) as usize,
        "RGBA data length mismatch"
    );

    // Convert RGBA to grayscale float buffer
    let (gray, w, h) = to_grayscale_resized(rgba, width, height, max_width_px);

    // Apply dithering → 1-bit
    let mono = match method {
        DitherMethod::Threshold => threshold(&gray, w, h),
        DitherMethod::FloydSteinberg => floyd_steinberg(&gray, w, h),
    };

    // Pack into ESC/POS raster
    pack_raster(&mono, w, h)
}

/// Convert RGBA pixel data to ESC/POS raster bytes using simple threshold.
///
/// Convenience wrapper for `dither_rgba` with `DitherMethod::Threshold`.
pub fn threshold_rgba(rgba: &[u8], width: u32, height: u32, max_width_px: u32) -> Vec<u8> {
    dither_rgba(rgba, width, height, max_width_px, DitherMethod::Threshold)
}

/// Convert RGBA pixel data to ESC/POS raster bytes using Floyd-Steinberg.
///
/// Convenience wrapper for `dither_rgba` with `DitherMethod::FloydSteinberg`.
pub fn floyd_steinberg_rgba(rgba: &[u8], width: u32, height: u32, max_width_px: u32) -> Vec<u8> {
    dither_rgba(
        rgba,
        width,
        height,
        max_width_px,
        DitherMethod::FloydSteinberg,
    )
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/// Convert RGBA to grayscale f32 buffer, optionally resizing if too wide.
fn to_grayscale_resized(
    rgba: &[u8],
    width: u32,
    height: u32,
    max_width_px: u32,
) -> (Vec<f32>, u32, u32) {
    // First convert to grayscale at original size
    let mut gray: Vec<f32> = Vec::with_capacity((width * height) as usize);
    for i in 0..(width * height) as usize {
        let r = rgba[i * 4] as f32;
        let g = rgba[i * 4 + 1] as f32;
        let b = rgba[i * 4 + 2] as f32;
        let a = rgba[i * 4 + 3] as f32 / 255.0;
        // Luminance formula (BT.601), premultiply alpha against white background
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255.0 * (1.0 - a);
        gray.push(lum);
    }

    if width <= max_width_px {
        return (gray, width, height);
    }

    // Bilinear downscale
    let new_w = max_width_px;
    let new_h = ((height as u64 * max_width_px as u64) / width as u64) as u32;
    let new_h = new_h.max(1);
    let mut resized = Vec::with_capacity((new_w * new_h) as usize);

    for y in 0..new_h {
        for x in 0..new_w {
            let src_x = (x as f32 * (width - 1) as f32) / (new_w - 1).max(1) as f32;
            let src_y = (y as f32 * (height - 1) as f32) / (new_h - 1).max(1) as f32;

            let x0 = src_x.floor() as u32;
            let y0 = src_y.floor() as u32;
            let x1 = (x0 + 1).min(width - 1);
            let y1 = (y0 + 1).min(height - 1);

            let fx = src_x - x0 as f32;
            let fy = src_y - y0 as f32;

            let p00 = gray[(y0 * width + x0) as usize];
            let p10 = gray[(y0 * width + x1) as usize];
            let p01 = gray[(y1 * width + x0) as usize];
            let p11 = gray[(y1 * width + x1) as usize];

            let val = p00 * (1.0 - fx) * (1.0 - fy)
                + p10 * fx * (1.0 - fy)
                + p01 * (1.0 - fx) * fy
                + p11 * fx * fy;

            resized.push(val);
        }
    }

    (resized, new_w, new_h)
}

/// Simple threshold: < 128 → black (true), >= 128 → white (false).
fn threshold(gray: &[f32], width: u32, height: u32) -> Vec<bool> {
    let mut mono = Vec::with_capacity((width * height) as usize);
    for &v in gray {
        mono.push(v < 128.0);
    }
    mono
}

/// Floyd-Steinberg error-diffusion dithering.
fn floyd_steinberg(gray: &[f32], width: u32, height: u32) -> Vec<bool> {
    let w = width as usize;
    let h = height as usize;
    let mut buf = gray.to_vec();
    let mut mono = vec![false; w * h];

    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let old = buf[idx];
            let new_val = if old < 128.0 { 0.0 } else { 255.0 };
            mono[idx] = new_val == 0.0; // black = print
            let err = old - new_val;

            // Distribute error to neighbours
            if x + 1 < w {
                buf[idx + 1] += err * 7.0 / 16.0;
            }
            if y + 1 < h {
                if x > 0 {
                    buf[(y + 1) * w + (x - 1)] += err * 3.0 / 16.0;
                }
                buf[(y + 1) * w + x] += err * 5.0 / 16.0;
                if x + 1 < w {
                    buf[(y + 1) * w + (x + 1)] += err * 1.0 / 16.0;
                }
            }
        }
    }

    mono
}

/// Pack 1-bit monochrome data into a GS v 0 raster command.
fn pack_raster(mono: &[bool], width: u32, height: u32) -> Vec<u8> {
    let bytes_per_line = width.div_ceil(8) as usize;
    let mut raster = Vec::with_capacity(bytes_per_line * height as usize);

    for y in 0..height {
        let mut row = vec![0u8; bytes_per_line];
        for x in 0..width {
            if mono[(y * width + x) as usize] {
                let byte_idx = (x / 8) as usize;
                let bit_idx = 7 - (x % 8);
                row[byte_idx] |= 1 << bit_idx;
            }
        }
        raster.extend_from_slice(&row);
    }

    commands::raster_image(bytes_per_line as u16, height as u16, &raster)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solid_black_4x1() {
        let rgba = vec![0u8, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255];
        let result = dither_rgba(&rgba, 4, 1, 384, DitherMethod::Threshold);
        // 8-byte header + 1 byte data (4 pixels padded to 8 bits)
        assert_eq!(result.len(), 9);
        // First 4 bits should be set (0xF0)
        assert_eq!(result[8], 0xF0);
    }

    #[test]
    fn solid_white_4x1() {
        let rgba = vec![
            255u8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        ];
        let result = dither_rgba(&rgba, 4, 1, 384, DitherMethod::Threshold);
        assert_eq!(result[8], 0x00);
    }

    #[test]
    fn floyd_steinberg_produces_output() {
        // 8x2 mid-gray image
        let rgba: Vec<u8> = (0..8 * 2)
            .flat_map(|_| vec![128u8, 128, 128, 255])
            .collect();
        let result = dither_rgba(&rgba, 8, 2, 384, DitherMethod::FloydSteinberg);
        assert!(!result.is_empty());
        // Should have header + 2 rows of 1 byte each
        assert_eq!(result.len(), 8 + 2);
    }

    #[test]
    fn transparent_pixels_become_white() {
        // Fully transparent pixel → should become white (not printed)
        let rgba = vec![0u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let result = dither_rgba(&rgba, 4, 1, 384, DitherMethod::Threshold);
        assert_eq!(result[8], 0x00);
    }

    #[test]
    fn resize_wider_than_max() {
        // 16x1 image with max_width=8 → should be scaled down
        let rgba: Vec<u8> = (0..16).flat_map(|_| vec![0u8, 0, 0, 255]).collect();
        let result = dither_rgba(&rgba, 16, 1, 8, DitherMethod::Threshold);
        // Header (8 bytes) + 1 row of 1 byte (8 pixels)
        assert_eq!(result.len(), 9);
        assert_eq!(result[8], 0xFF); // all black
    }

    #[test]
    fn convenience_functions() {
        let rgba = vec![0u8, 0, 0, 255, 255, 255, 255, 255];
        let t = threshold_rgba(&rgba, 2, 1, 384);
        let fs = floyd_steinberg_rgba(&rgba, 2, 1, 384);
        assert!(!t.is_empty());
        assert!(!fs.is_empty());
    }
}
