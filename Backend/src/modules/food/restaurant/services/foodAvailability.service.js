import { FoodItem } from '../../admin/models/food.model.js';

/**
 * Re-enable foods whose scheduled out-of-stock window has expired.
 * Manual off (no stockResumeAt) is left unchanged until the restaurant turns it back on.
 */
export async function restoreExpiredFoodAvailability(filter = {}) {
    const now = new Date();
    const result = await FoodItem.updateMany(
        {
            ...filter,
            isAvailable: false,
            stockResumeAt: { $ne: null, $lte: now }
        },
        {
            $set: { isAvailable: true },
            $unset: { stockResumeAt: 1, stockOffMode: 1 }
        }
    );

    return result.modifiedCount || 0;
}
