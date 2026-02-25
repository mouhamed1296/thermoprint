use image::{DynamicImage, GenericImageView};
use crate::commands;
use crate::error::ThermoprintError;

/// Load an image file and convert it to ESC/POS raster bytes.
///
/// The image is converted to 1-bit monochrome and packed into
/// a `GS v 0` raster command ready to push into a builder.
///
/// `max_width_px` should come from [`PrintWidth::max_image_px`].
pub fn load_and_rasterise(path: &str, max_width_px: u32) -> Result<Vec<u8>, ThermoprintError> {
    let img = image::open(path).map_err(|e| ThermoprintError::LogoLoad {
        path: path.to_owned(),
        reason: e.to_string(),
    })?;
    Ok(rasterise(&img, max_width_px))
}

/// Convert an already-loaded [`DynamicImage`] to ESC/POS raster bytes.
pub fn rasterise(img: &DynamicImage, max_width_px: u32) -> Vec<u8> {
    let (orig_w, orig_h) = img.dimensions();

    // Resize if wider than the printable area
    let img = if orig_w > max_width_px {
        let new_h = (orig_h as u64 * max_width_px as u64 / orig_w as u64) as u32;
        img.resize(max_width_px, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img.clone()
    };

    let (width, height) = img.dimensions();
    let gray = img.to_luma8();

    // Width must be padded to a multiple of 8 for ESC/POS raster
    let bytes_per_line = ((width + 7) / 8) as usize;
    let mut raster = Vec::with_capacity(bytes_per_line * height as usize);

    for y in 0..height {
        let mut row = vec![0u8; bytes_per_line];
        for x in 0..width {
            // Pixels darker than mid-grey are printed (bit = 1)
            if gray.get_pixel(x, y)[0] < 128 {
                let byte_idx = (x / 8) as usize;
                let bit_idx  = 7 - (x % 8); // MSB first
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
    use image::{GrayImage, Luma};

    #[test]
    fn rasterise_solid_black_1x8() {
        // 8-pixel-wide, 1-pixel-tall solid black image
        let mut img = GrayImage::new(8, 1);
        for x in 0..8 {
            img.put_pixel(x, 0, Luma([0u8])); // black
        }
        let dyn_img = DynamicImage::ImageLuma8(img);
        let result = rasterise(&dyn_img, 384);

        // Header: GS v 0 m xL xH yL yH  = 8 bytes
        // Data:   1 byte (8 pixels → 0xFF)
        assert_eq!(result.len(), 9);
        assert_eq!(result[8], 0xFF);
    }

    #[test]
    fn rasterise_solid_white_1x8() {
        let mut img = GrayImage::new(8, 1);
        for x in 0..8 {
            img.put_pixel(x, 0, Luma([255u8])); // white
        }
        let dyn_img = DynamicImage::ImageLuma8(img);
        let result = rasterise(&dyn_img, 384);
        assert_eq!(result[8], 0x00); // nothing printed
    }
}
