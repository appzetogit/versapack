/**
 * Price per standard unit, so two pack sizes can be compared.
 *
 * "Which of these is actually cheaper" is the question a grocery shopper asks and a
 * restaurant customer never did, and it cannot be answered from `packSize` — that is
 * free text off the label ("pack of 6", "500 g + 20% extra") and there is nothing to
 * divide by. It is answered from `netQuantity` + `netQuantityUnit`.
 *
 * Everything is normalised to one base unit per dimension — grams for weight,
 * millilitres for volume, pieces for count — because comparing a 900 g pack against a
 * 1 kg pack otherwise reads as 900 vs 1.
 */

/** Base unit per dimension, and how many base units one of each unit is worth. */
const UNIT_TO_BASE = {
    g: { base: 'g', factor: 1 },
    kg: { base: 'g', factor: 1000 },
    ml: { base: 'ml', factor: 1 },
    l: { base: 'ml', factor: 1000 },
    piece: { base: 'piece', factor: 1 }
};

/**
 * How much of a base unit to quote the price against.
 *
 * Per-gram and per-millilitre prices come out as unreadable fractions (₹0.0043/g), so
 * weight and volume are quoted per 100, which is the convention on a shelf label.
 */
const DISPLAY_STEP = { g: 100, ml: 100, piece: 1 };
const DISPLAY_LABEL = { g: '100 g', ml: '100 ml', piece: 'piece' };

/**
 * @param {number} price      Selling price for one pack.
 * @param {number|null} netQuantity
 * @param {string|null} netQuantityUnit
 * @returns {{ amount: number, unitLabel: string, baseUnit: string } | null}
 *          null whenever the comparison cannot honestly be made — an unpriced
 *          product, or one whose net quantity nobody recorded. Callers must render
 *          nothing in that case rather than substituting a zero, which would read as
 *          "free" on the very screen the number exists to inform.
 */
export function computeUnitPrice(price, netQuantity, netQuantityUnit) {
    // Number(null) and Number('') are both 0, so coercing first would turn "this
    // product has no price recorded" into a confident ₹0.00 per 100 g — which reads
    // as free on the one screen whose whole job is to inform the comparison. A
    // genuinely free product still has to come through, so absence is rejected here
    // rather than by testing the coerced value.
    if (price === null || price === undefined || price === '') return null;

    const amountPaid = Number(price);
    const qty = Number(netQuantity);
    const unit = String(netQuantityUnit || '').toLowerCase();

    if (!Number.isFinite(amountPaid) || amountPaid < 0) return null;
    if (!Number.isFinite(qty) || qty <= 0) return null;

    const mapping = UNIT_TO_BASE[unit];
    if (!mapping) return null;

    const quantityInBase = qty * mapping.factor;
    if (!(quantityInBase > 0)) return null;

    const step = DISPLAY_STEP[mapping.base];
    const perStep = (amountPaid / quantityInBase) * step;

    return {
        // Two decimals: a per-100g price is compared, not summed, so more precision
        // is noise and less makes cheap staples collapse to the same number.
        amount: Math.round(perStep * 100) / 100,
        unitLabel: DISPLAY_LABEL[mapping.base],
        baseUnit: mapping.base
    };
}

/** Convenience wrapper for a catalogue document. Returns null on anything incomparable. */
export function unitPriceForProduct(product = {}) {
    return computeUnitPrice(product.price, product.netQuantity, product.netQuantityUnit);
}
