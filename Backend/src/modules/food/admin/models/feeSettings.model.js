import mongoose from 'mongoose';

const deliveryFeeRangeSchema = new mongoose.Schema(
    {
        min: { type: Number, required: true, min: 0 },
        max: { type: Number, required: true, min: 0 },
        fee: { type: Number, required: true, min: 0 },
        deliveryBoyPerKm: { type: Number, min: 0, default: 0 },
        deliveryBoyBasePay: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

const feeSettingsSchema = new mongoose.Schema(
    {
        // No defaults here; admin must explicitly configure values.
        deliveryFee: { type: Number, min: 0 },
        deliveryFeeRanges: { type: [deliveryFeeRangeSchema], default: [] },
        platformFee: { type: Number, min: 0 },
        quickDeliveryFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        /**
         * What the platform charges per order for packing materials.
         *
         * The pricing path had this hardcoded to 0 -- correct for a restaurant, which
         * packs a bag it already owns, and wrong for groceries, where crates, liners
         * and ice packs for anything frozen are a real per-order cost the platform was
         * simply absorbing. Unset stays 0, so nothing changes until an admin sets it.
         */
        packagingFee: { type: Number, min: 0 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_fee_settings', timestamps: true }
);

feeSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const FoodFeeSettings = mongoose.model('FoodFeeSettings', feeSettingsSchema);

