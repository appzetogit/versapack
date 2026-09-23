import mongoose from 'mongoose';

const sellerZoneSchema = new mongoose.Schema(
    {
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'FoodRestaurant',
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        centerLat: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },
        centerLng: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        },
        radiusM: {
            type: Number,
            required: true,
            min: 500,
            max: 50000
        },
        isActive: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    {
        collection: 'food_seller_zones',
        timestamps: true
    }
);

sellerZoneSchema.index({ sellerId: 1, isActive: 1 });
// Backs the bounding-box pre-filter in findInRangeSellerZones (zoneServiceability.js),
// which narrows candidates before running exact Haversine on a much smaller set.
sellerZoneSchema.index({ isActive: 1, centerLat: 1, centerLng: 1 });

/**
 * Format doc to match the exact API specification response structure.
 */
sellerZoneSchema.methods.toResponseJSON = function () {
    return {
        id: this._id.toString(),
        seller_id: this.sellerId ? this.sellerId.toString() : null,
        name: this.name,
        center_lat: this.centerLat,
        center_lng: this.centerLng,
        radius_m: this.radiusM,
        is_active: Boolean(this.isActive),
        created_at: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
        updated_at: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString()
    };
};

export const SellerZone = mongoose.model('SellerZone', sellerZoneSchema);
