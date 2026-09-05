import mongoose from 'mongoose';

/**
 * One row per manufactured product, shared by every seller who stocks it.
 *
 * On a marketplace the same Amul Butter 500 g is listed by a dozen sellers, and until
 * this existed each of those was an unrelated FoodItem with its own spelling, its own
 * photo and its own idea of the GST slab. A search for "amul butter" returned the same
 * thing twelve times, nothing could be price-compared, and a brand page was impossible
 * — which is most of the reason a shopper opens a marketplace at all.
 *
 * The split is deliberate and load bearing:
 *
 *   - What the PRODUCT is lives here: name, brand, pack, barcode, tax class, the
 *     regulatory declarations. These are facts about the manufactured good and are
 *     identical no matter who sells it. A seller getting the HSN code wrong is a
 *     compliance problem; letting them each set their own guarantees it.
 *   - What the SELLER offers stays on FoodItem: price, MRP, stock, availability. Those
 *     are the whole point of a marketplace and must differ between sellers.
 *
 * A listing that references no master is still perfectly valid and behaves exactly as
 * it always did. That is every product created before this, and it is also the correct
 * resting state for genuinely one-off stock, which a general marketplace has plenty of.
 */
const masterProductSchema = new mongoose.Schema(
    {
        /** Canonical display name. What the app shows once a listing is linked. */
        name: { type: String, required: true, trim: true, index: true },
        brand: { type: String, trim: true, default: '', index: true },
        description: { type: String, trim: true, default: '' },

        /**
         * EAN/UPC — the only genuinely reliable identity a product has.
         *
         * Sparse-unique rather than plain unique: most stock in an Indian grocery
         * catalogue is loose or unbranded and carries no barcode at all, and a plain
         * unique index treats every one of those missing values as the same empty
         * string and rejects the second one. Stored normalised (digits only) so a
         * scanner's stray whitespace cannot create a second master for one product.
         */
        barcode: { type: String, trim: true, default: null },

        /** Free text off the label: "500 g", "pack of 6", "1 L + 20% extra". */
        packSize: { type: String, trim: true, default: '' },
        /** The comparable form of packSize. See computeUnitPrice for why both exist. */
        netQuantity: { type: Number, default: null, min: 0 },
        netQuantityUnit: {
            type: String,
            enum: ['g', 'kg', 'ml', 'l', 'piece', null],
            default: null
        },

        /**
         * Tax classification, held centrally on purpose.
         *
         * The GST slab and HSN code of a manufactured product are a property of the
         * product, not of the shop selling it. Two sellers charging different GST on
         * the same tub of butter is not a pricing decision, it is one of them being
         * wrong on an invoice.
         */
        hsnCode: { type: String, trim: true, default: '' },
        gstRate: { type: Number, min: 0, max: 100, default: null },

        /** Legal Metrology declarations — identical for every seller of the good. */
        countryOfOrigin: { type: String, trim: true, default: '' },
        manufacturerName: { type: String, trim: true, default: '' },
        marketedByName: { type: String, trim: true, default: '' },

        foodType: { type: String, enum: ['Veg', 'Non-Veg', 'None'], default: 'None' },

        /** Canonical imagery, primary first. A linked listing falls back to its own. */
        image: { type: String, trim: true, default: '' },
        images: { type: [String], default: [] },

        /** Global category. Master products are never scoped to one seller. */
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodCategory', index: true },
        categoryName: { type: String, trim: true, default: '' },

        /**
         * Retiring a master must not delete it: listings point at it and orders quote
         * it. Inactive simply stops it being offered for new links.
         */
        isActive: { type: Boolean, default: true, index: true },

        /** Which admin created it, for the same reason every other admin write records one. */
        createdByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null }
    },
    {
        collection: 'food_master_products',
        timestamps: true
    }
);

// Partial rather than `sparse`: sparse only skips documents missing the field
// entirely, and these are stored as an explicit null when absent, which sparse would
// happily index and then collide on. `$type: 'string'` indexes only real barcodes.
masterProductSchema.index(
    { barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);
masterProductSchema.index({ brand: 1, name: 1 });
masterProductSchema.index({ isActive: 1, createdAt: -1 });

/** Digits only, or null. A scanner's whitespace must not mint a second master. */
export const normalizeBarcode = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
};

masterProductSchema.pre('save', function (next) {
    this.barcode = normalizeBarcode(this.barcode);
    if (this.image && !this.images?.length) this.images = [this.image];
    if (!this.image && this.images?.length) this.image = this.images[0];
    next();
});

export const FoodMasterProduct = mongoose.model('FoodMasterProduct', masterProductSchema);
