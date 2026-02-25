/// Localized receipt label strings.
///
/// All high-level receipt methods (`subtotal_ht`, `taxes`, `total`, etc.)
/// use these labels. Switch language with [`ReceiptBuilder::language`].
#[derive(Debug, Clone)]
pub struct ReceiptLabels {
    /// Label for subtotal excluding tax (e.g. "SUBTOTAL EX. TAX")
    pub subtotal_ht: &'static str,
    /// Parenthetical note below subtotal (e.g. "(Excl. VAT)")
    pub excl_tax_note: &'static str,
    /// Discount label (e.g. "DISCOUNT")
    pub discount: &'static str,
    /// Tax detail header (e.g. "TAX DETAILS:")
    pub tax_details: &'static str,
    /// Tax-included note (e.g. "included")
    pub tax_included: &'static str,
    /// Additional taxes summary label
    pub additional_taxes: &'static str,
    /// Grand total label
    pub total: &'static str,
    /// Amount received label
    pub received: &'static str,
    /// Change returned label
    pub change: &'static str,
    /// Served by label prefix (e.g. "Served by:")
    pub served_by: &'static str,
    /// Thank-you line 1 (e.g. "Thank you for your purchase!")
    pub thank_you: &'static str,
    /// Thank-you line 2 prefix (e.g. "See you soon at")
    pub see_you_at: &'static str,
    /// Discount on item prefix (e.g. "Discount:")
    pub item_discount: &'static str,
}

/// Supported receipt languages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    /// French (default) — labels in French
    Fr,
    /// English
    En,
    /// Spanish
    Es,
    /// Portuguese
    Pt,
    /// Arabic (Latin-transliterated for ESC/POS compatibility)
    Ar,
    /// Wolof
    Wo,
}

impl Language {
    /// Get the localized labels for this language.
    pub fn labels(self) -> ReceiptLabels {
        match self {
            Language::Fr => LABELS_FR,
            Language::En => LABELS_EN,
            Language::Es => LABELS_ES,
            Language::Pt => LABELS_PT,
            Language::Ar => LABELS_AR,
            Language::Wo => LABELS_WO,
        }
    }
}

/// French labels (default).
pub const LABELS_FR: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "SOUS-TOTAL HT",
    excl_tax_note:   "(Hors TVA)",
    discount:        "REMISE",
    tax_details:     "DETAIL DES TAXES:",
    tax_included:    "incluse",
    additional_taxes:"Taxes additionnelles",
    total:           "TOTAL",
    received:        "MONTANT RECU",
    change:          "MONNAIE",
    served_by:       "Servi par:",
    thank_you:       "Merci pour votre confiance!",
    see_you_at:      "A bientot chez",
    item_discount:   "Remise:",
};

/// English labels.
pub const LABELS_EN: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "SUBTOTAL",
    excl_tax_note:   "(Excl. Tax)",
    discount:        "DISCOUNT",
    tax_details:     "TAX DETAILS:",
    tax_included:    "included",
    additional_taxes:"Additional taxes",
    total:           "TOTAL",
    received:        "AMOUNT RECEIVED",
    change:          "CHANGE",
    served_by:       "Served by:",
    thank_you:       "Thank you for your purchase!",
    see_you_at:      "See you soon at",
    item_discount:   "Discount:",
};

/// Spanish labels.
pub const LABELS_ES: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "SUBTOTAL",
    excl_tax_note:   "(Sin IVA)",
    discount:        "DESCUENTO",
    tax_details:     "DETALLE DE IMPUESTOS:",
    tax_included:    "incluido",
    additional_taxes:"Impuestos adicionales",
    total:           "TOTAL",
    received:        "MONTO RECIBIDO",
    change:          "CAMBIO",
    served_by:       "Atendido por:",
    thank_you:       "Gracias por su compra!",
    see_you_at:      "Hasta pronto en",
    item_discount:   "Descuento:",
};

/// Portuguese labels.
pub const LABELS_PT: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "SUBTOTAL",
    excl_tax_note:   "(Sem IVA)",
    discount:        "DESCONTO",
    tax_details:     "DETALHES DOS IMPOSTOS:",
    tax_included:    "incluido",
    additional_taxes:"Impostos adicionais",
    total:           "TOTAL",
    received:        "VALOR RECEBIDO",
    change:          "TROCO",
    served_by:       "Atendido por:",
    thank_you:       "Obrigado pela sua compra!",
    see_you_at:      "Ate breve em",
    item_discount:   "Desconto:",
};

/// Arabic (Latin-transliterated for thermal printer compatibility).
pub const LABELS_AR: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "AL-MAJMOU' AL-FER'I",
    excl_tax_note:   "(Bidoun Dariba)",
    discount:        "TAKHFID",
    tax_details:     "TAFASIL AD-DARIBA:",
    tax_included:    "moudamana",
    additional_taxes:"Daraib idafiya",
    total:           "AL-MAJMOU'",
    received:        "AL-MABLAGH AL-MUSTASLAM",
    change:          "AL-BAAQI",
    served_by:       "Khidma min:",
    thank_you:       "Choukran li thiqatikum!",
    see_you_at:      "Ila al-liqa' fi",
    item_discount:   "Takhfid:",
};

/// Wolof labels.
pub const LABELS_WO: ReceiptLabels = ReceiptLabels {
    subtotal_ht:     "TOLLU NJEG",
    excl_tax_note:   "(Bu Amul Cero)",
    discount:        "WANAAGU NJEG",
    tax_details:     "CERON YI:",
    tax_included:    "ci biir",
    additional_taxes:"Cero yu nyul",
    total:           "TOLLU",
    received:        "XAALIS BU JOTNA",
    change:          "CENNGE",
    served_by:       "Liggeykat bi:",
    thank_you:       "Jere jef ci sanu confiance!",
    see_you_at:      "Ba beneen yoon ci",
    item_discount:   "Wanaag:",
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_languages_have_non_empty_labels() {
        for lang in [Language::Fr, Language::En, Language::Es, Language::Pt, Language::Ar, Language::Wo] {
            let l = lang.labels();
            assert!(!l.subtotal_ht.is_empty());
            assert!(!l.total.is_empty());
            assert!(!l.thank_you.is_empty());
        }
    }
}
