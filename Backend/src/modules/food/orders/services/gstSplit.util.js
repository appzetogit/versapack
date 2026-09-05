/**
 * Splitting GST into the components an invoice has to show.
 *
 * A single `tax` figure is enough to charge the right amount and not enough to issue a
 * lawful invoice. Indian GST is levied as two taxes or one depending on where the
 * supply happens: a supply inside one state is CGST plus SGST, half each; a supply
 * across a state line is IGST at the full rate. The customer pays exactly the same
 * either way, which is why this can be added without repricing a single order — but
 * the invoice must say which, and a restaurant bill never had to.
 *
 * Place of supply for goods delivered to a customer is the delivery address, so the
 * comparison is the store's state against the address's, not the platform's.
 */

/**
 * Normalises a state name enough to compare two of them.
 *
 * Free-text state fields collect "Madhya Pradesh", "madhya pradesh" and "MADHYA
 * PRADESH ", and treating those as three different states would put an intra-state
 * supply on an inter-state invoice.
 */
const normalizeState = (value) =>
    String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

/**
 * Whether this is a supply within one state.
 *
 * Unknown answers deliberately fall to intra-state. It is the overwhelmingly common
 * case for quick commerce — a dark store delivers within about 2.5 km and cannot
 * plausibly cross a state line — so where a state is simply missing from the data,
 * CGST/SGST is the answer that is almost always right.
 */
export function isIntraStateSupply(storeState, deliveryState) {
    const from = normalizeState(storeState);
    const to = normalizeState(deliveryState);
    if (!from || !to) return true;
    return from === to;
}

/**
 * Splits a tax total into its invoice components.
 *
 * Halves are rounded so the two add back to the original to the paisa. Rounding each
 * half independently loses a paisa on odd amounts, and an invoice whose components do
 * not sum to its total is exactly what an audit picks up.
 *
 * @param {number} taxAmount The total GST already computed for the order.
 * @param {boolean} intraState
 * @returns {{ cgst: number, sgst: number, igst: number }}
 */
export function splitGst(taxAmount, intraState = true) {
    const total = Number(taxAmount);
    if (!Number.isFinite(total) || total <= 0) {
        return { cgst: 0, sgst: 0, igst: 0 };
    }

    const round2 = (value) => Math.round(value * 100) / 100;

    if (!intraState) {
        return { cgst: 0, sgst: 0, igst: round2(total) };
    }

    const cgst = round2(total / 2);
    // Derived from the remainder rather than halved again, so the pair always sums
    // back to the total exactly.
    const sgst = round2(round2(total) - cgst);
    return { cgst, sgst, igst: 0 };
}

/**
 * The tax breakdown for an order, ready to store on it.
 *
 * @param {number} taxAmount
 * @param {object} store      Needs a state, wherever it is kept.
 * @param {object} deliveryAddress
 */
export function buildTaxBreakdown(taxAmount, store, deliveryAddress) {
    const storeState = store?.state ?? store?.location?.state ?? store?.address?.state;
    const deliveryStateName = deliveryAddress?.state ?? deliveryAddress?.location?.state;

    const intraState = isIntraStateSupply(storeState, deliveryStateName);
    const { cgst, sgst, igst } = splitGst(taxAmount, intraState);

    return {
        cgst,
        sgst,
        igst,
        // Recorded, not inferred at render time: a store can be re-registered in a
        // different state, and an invoice already issued must not change its mind
        // about which tax it charged.
        placeOfSupply: String(deliveryStateName || '').trim(),
        isIntraState: intraState,
    };
}
