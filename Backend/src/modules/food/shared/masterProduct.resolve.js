/**
 * Merging a seller's listing with the master product it points at.
 *
 * The rule is one line and everything else follows from it: identity comes from the
 * master, commerce comes from the listing.
 *
 * Identity is what the product IS — its name, brand, pack, tax class, the declarations
 * a packaged good has to carry. Those are facts about the manufactured good, identical
 * for every seller, and letting each seller keep their own copy is how a catalogue ends
 * up with "Amul Butter 500g", "amul butter (500 gm)" and "AMUL Butter-500G" as three
 * unrelated products taxed at three different rates.
 *
 * Commerce is what this seller is OFFERING — price, MRP, stock, whether it is switched
 * on today. Those must differ per seller; that difference is the marketplace.
 *
 * Fields the master leaves blank fall back to the listing rather than blanking it. A
 * half-filled master is common while a catalogue is being built up, and it must never
 * be able to erase information a seller already supplied.
 */

/** Empty string, null and undefined all mean "the master does not say". 0 and false do not. */
const has = (value) => value !== null && value !== undefined && value !== '';

/**
 * Finds the master a listing belongs to, by barcode and barcode only.
 *
 * Name matching is deliberately not attempted. "Amul Butter 500g" and "Amul Butter
 * 500 g" are obviously the same product to a person and not to a string comparison,
 * while "Amul Butter 500g" and "Amul Butter Unsalted 500g" are obviously different and
 * look nearly identical to one. A wrong link is far worse than no link: it shows the
 * customer someone else's product, under someone else's tax code, and the seller has
 * no way to see that it happened. A barcode is the one identifier that is actually an
 * identifier, so it is the only thing trusted to link automatically. Everything else is
 * an admin decision.
 *
 * @returns {Promise<string|null>} The master's id, or null to leave it standalone.
 */
export async function findMasterByBarcode(FoodMasterProduct, barcode) {
    const digits = String(barcode ?? '').replace(/\D/g, '');
    if (!digits) return null;

    const master = await FoodMasterProduct.findOne({ barcode: digits, isActive: true })
        .select('_id')
        .lean();
    return master?._id ? String(master._id) : null;
}

/**
 * @param {object} listing A FoodItem (lean object or document).
 * @param {object|null} master The FoodMasterProduct it references, if any.
 * @returns {object} The listing as the apps should see it.
 */
export function resolveListingWithMaster(listing, master) {
    const item = listing?.toObject ? listing.toObject() : { ...(listing || {}) };
    if (!master) return item;

    const m = master?.toObject ? master.toObject() : master;

    const preferMaster = (field) => (has(m[field]) ? m[field] : item[field]);

    const images = Array.isArray(m.images) && m.images.length ? m.images : item.images;

    return {
        ...item,
        // ── Identity: the master is authoritative ──────────────────────────────
        name: preferMaster('name'),
        brand: preferMaster('brand'),
        description: preferMaster('description'),
        packSize: preferMaster('packSize'),
        netQuantity: preferMaster('netQuantity'),
        netQuantityUnit: preferMaster('netQuantityUnit'),
        barcode: preferMaster('barcode'),
        hsnCode: preferMaster('hsnCode'),
        gstRate: preferMaster('gstRate'),
        countryOfOrigin: preferMaster('countryOfOrigin'),
        manufacturerName: preferMaster('manufacturerName'),
        marketedByName: preferMaster('marketedByName'),
        foodType: preferMaster('foodType'),
        categoryId: preferMaster('categoryId'),
        categoryName: preferMaster('categoryName'),
        image: has(m.image) ? m.image : item.image,
        images,

        // ── Commerce: untouched, deliberately ─────────────────────────────────
        // price, otherPrice, mrp, variants, stockQty, lowStockThreshold,
        // maxQtyPerOrder, isAvailable, sku, restaurantId all come through the spread
        // above unchanged. Listing them here would only create a second place to
        // forget one.

        masterProductId: m._id ?? item.masterProductId,
        /** Lets a caller tell a merged listing from a standalone one without a join. */
        isMasterLinked: true
    };
}

/**
 * The tax fields an order line must snapshot, resolved the same way.
 *
 * Pulled out separately because checkout needs exactly these two and loading a master
 * per line to merge everything else would be wasted work on the hottest path there is.
 */
export function resolveTaxFields(listing, master) {
    return {
        gstRate: has(master?.gstRate) ? master.gstRate : (listing?.gstRate ?? null),
        hsnCode: has(master?.hsnCode) ? master.hsnCode : String(listing?.hsnCode || '')
    };
}
