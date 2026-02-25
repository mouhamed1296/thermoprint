/// Encode a UTF-8 string to Code Page 858 bytes.
///
/// CP858 is the standard ESC/POS code page for Western European languages.
/// It supports French, Spanish, Portuguese accented characters and the Euro sign.
/// Characters outside the mapping fall back to their ASCII byte value.
pub fn encode_cp858(text: &str) -> Vec<u8> {
    text.chars().map(cp858_byte).collect()
}

/// Map a single Unicode scalar to its CP858 byte.
#[inline]
fn cp858_byte(c: char) -> u8 {
    match c {
        // Lowercase accented
        'à' => 0x85, 'â' => 0x83, 'ä' => 0x84,
        'é' => 0x82, 'è' => 0x8A, 'ê' => 0x88, 'ë' => 0x89,
        'î' => 0x8C, 'ï' => 0x8B,
        'ô' => 0x93, 'ö' => 0x94,
        'ù' => 0x97, 'û' => 0x96, 'ü' => 0x81,
        'ç' => 0x87,
        'ñ' => 0xA4,
        // Uppercase accented
        'À' => 0xB7, 'Â' => 0xB6,
        'É' => 0x90, 'È' => 0xD4, 'Ê' => 0xD2,
        'Î' => 0xD7,
        'Ô' => 0xE4,
        'Ù' => 0xEB, 'Û' => 0xEA,
        'Ç' => 0x80,
        'Ñ' => 0xA5,
        // Currency
        '€' => 0xD5,
        // Everything else — pass through as-is (ASCII-safe)
        other => other as u8,
    }
}

/// Truncate a string to `max_chars` Unicode scalar values.
/// Appends `"..."` if truncated.
pub fn truncate(text: &str, max_chars: usize) -> String {
    let count = text.chars().count();
    if count <= max_chars {
        text.to_owned()
    } else {
        let cut = max_chars.saturating_sub(3);
        let s: String = text.chars().take(cut).collect();
        format!("{}...", s)
    }
}

/// Centre a string within `width` columns using space padding.
pub fn center(text: &str, width: usize) -> String {
    let len = text.chars().count();
    if len >= width {
        return text.to_owned();
    }
    let pad = (width - len) / 2;
    format!("{}{}", " ".repeat(pad), text)
}

/// Right-align a string within `width` columns.
pub fn right_align(text: &str, width: usize) -> String {
    let len = text.chars().count();
    if len >= width {
        return text.to_owned();
    }
    format!("{}{}", " ".repeat(width - len), text)
}

/// Build a two-column row: label flush-left, value flush-right, total = `width`.
pub fn two_col(left: &str, right: &str, width: usize) -> String {
    let l = left.chars().count();
    let r = right.chars().count();
    let gap = width.saturating_sub(l + r);
    format!("{}{}{}", left, " ".repeat(gap.max(1)), right)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_french() {
        let encoded = encode_cp858("café");
        assert_eq!(encoded, vec![b'c', b'a', b'f', 0x82]);
    }

    #[test]
    fn encode_euro() {
        let encoded = encode_cp858("10€");
        assert_eq!(encoded, vec![b'1', b'0', 0xD5]);
    }

    #[test]
    fn truncate_short() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn truncate_long() {
        let t = truncate("hello world", 8);
        assert_eq!(t, "hello...");
        assert_eq!(t.chars().count(), 8);
    }

    #[test]
    fn two_col_fills_width() {
        let row = two_col("TOTAL", "29500 FCFA", 48);
        assert_eq!(row.chars().count(), 48);
    }
}
