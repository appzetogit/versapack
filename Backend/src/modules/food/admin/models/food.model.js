import mongoose from 'mongoose';

const foodVariantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        otherPrice: { type: Number, min: 0, default: 0 }
    },
    { _id: true }
);

const foodSchema = new mongoose.Schema(
    {
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodCategory', index: true },
        categoryName: { type: String, trim: true, default: '' },
        name: { type: String, required: true, trim: true, index: true },
        description: { type: String, trim: true, default: '' },
        price: { type: Number, required: true, min: 0 },
        /** Compare-at / other-platform price for strikethrough UI. Existing items stay 0. */
        otherPrice: { type: Number, min: 0, default: 0 },
        variants: { type: [foodVariantSchema], default: [] },
        /**
         * The dish's primary image, kept as the first entry of [images].
         *
         * Retained as its own field rather than being derived: every existing
         * document has it, and the user app, admin list, share previews and push
         * payloads all read it. Dropping it would have meant a migration plus a
         * change in four consumers to gain nothing.
         */
        image: { type: String, trim: true, default: '' },

        /**
         * All images for the dish, primary first.
         *
         * Empty on existing documents, which is why every read falls back to
         * `image` rather than assuming this is populated.
         */
        images: { type: [String], default: [] },
        foodType: { type: String, enum: ['Veg', 'Non-Veg'], default: 'Non-Veg' },
        /** Manufacturer, for the grocery listing where two sellers stock the same product. */
        brand: { type: String, trim: true, default: '' },
        /** What one unit is: "500 g", "1 L", "pack of 6". Free text, since packs are not standard. */
        packSize: { type: String, trim: true, default: '' },
        /**
         * Printed maximum retail price, shown struck through next to `price`.
         *
         * Kept separate from `otherPrice`, which is a compare-at price against
         * other platforms. Selling above MRP is illegal, so this one is a
         * constraint, not a marketing number, and conflating them would make
         * that check impossible to write.
         */
        mrp: { type: Number, min: 0, default: null },
        /**
         * GST percentage for this product. Groceries span 0/5/12/18, so the
         * single order-wide rate the food flow used is wrong here.
         *
         * `null` falls back to the order-wide rate in fee settings, which is
         * what every item created before this field existed does.
         */
        gstRate: { type: Number, min: 0, max: 100, default: null },
        isAvailable: { type: Boolean, default: true, index: true },
        /**
         * Units on hand. `null` means untracked — the item behaves exactly as it
         * did before inventory existed, which is what every already-created
         * document gets, so nothing needs a migration to keep selling.
         *
         * Tracked at item level, not per variant: a variant is a pack size, and
         * a seller counting "12 left" is counting the item.
         * ponytail: per-variant stock if sellers start listing sizes that
         * genuinely deplete independently.
         */
        stockQty: { type: Number, default: null, min: 0 },
        /** Below this, the item is flagged to the seller. `null` disables the flag. */
        lowStockThreshold: { type: Number, default: null, min: 0 },
        /** Cap per single order, so one buyer cannot clear the shelf. `null` = uncapped. */
        maxQtyPerOrder: { type: Number, default: null, min: 1 },
        /** Running average of per-dish ratings left by customers. */
        rating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0, min: 0 },
        /** When set, item auto-restores to available after this time (server-side). */
        stockResumeAt: { type: Date, index: true },
        stockOffMode: {
            type: String,
            enum: ['manual', 'specific-time', 'next-business-day', 'custom-date-time'],
            default: undefined
        },
        isRecommended: { type: Boolean, default: false, index: true },
        preparationTime: { type: String, trim: true, default: '' },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date }
    },
    {
        collection: 'food_items',
        timestamps: true
    }
);

foodSchema.index({ restaurantId: 1, createdAt: -1 });
foodSchema.index({ approvalStatus: 1, createdAt: -1 });
foodSchema.index({ approvalStatus: 1, requestedAt: -1 });
foodSchema.index({ restaurantId: 1, approvalStatus: 1, createdAt: -1 });

export const FoodItem = mongoose.model('FoodItem', foodSchema);
