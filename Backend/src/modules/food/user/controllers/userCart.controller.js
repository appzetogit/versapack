import { sendResponse, sendError } from '../../../../utils/response.js';
import { syncUserCart } from '../services/userCart.service.js';
import { rebindCartToServingStore } from '../services/cartStoreRebind.service.js';

export const syncUserCartController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const pricing = req.body?.pricing || null;
        const firstItem = items[0] || {};

        const payload = items.map((item) => ({
            ...item,
            restaurantId: item?.restaurantId || firstItem?.restaurantId || req.body?.restaurantId || '',
            restaurantName: item?.restaurant || item?.restaurantName || firstItem?.restaurant || req.body?.restaurantName || '',
        }));

        const result = await syncUserCart(userId, payload, pricing);
        return sendResponse(res, 200, 'Cart synced successfully', {
            synced: Boolean(result),
            itemCount: result?.itemCount || 0,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Re-points a basket at whichever dark store serves a new address.
 *
 * Called when the customer changes the delivery address, which is the single most
 * common way a quick-commerce cart breaks: they built it near the office and are
 * checking out at home. The customer never chose the store, so emptying their basket
 * would be punishing them for a decision the system made for them — instead the lines
 * move to the equivalent product at the new store, and whatever genuinely is not
 * carried there comes back named so the app can say so.
 */
export const rebindCartController = async (req, res, next) => {
    try {
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return sendError(res, 400, 'lat and lng are required');
        }

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const result = await rebindCartToServingStore(items, { lat, lng });

        return sendResponse(res, 200, 'Cart rebound to serving store', {
            serviceable: result.serviceable,
            unchanged: result.unchanged,
            store: result.store
                ? {
                    _id: result.store._id,
                    name: result.store.restaurantName || '',
                    image: result.store.profileImage || '',
                }
                : null,
            promiseMinutes: result.promiseMinutes ?? null,
            distanceKm: result.distanceKm ?? null,
            items: result.items,
            moved: result.moved,
            unavailable: result.unavailable,
        });
    } catch (error) {
        next(error);
    }
};
