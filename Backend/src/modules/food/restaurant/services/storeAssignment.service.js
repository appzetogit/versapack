import mongoose from 'mongoose';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { haversineKm } from '../../shared/geo.utils.js';
import { AVG_SPEED_KMPH, PACKING_MINUTES } from '../../orders/services/order.helpers.js';

/**
 * Choosing which dark store serves a customer.
 *
 * This is the load-bearing difference between quick commerce and everything the
 * codebase did before. A food marketplace lets the customer pick a restaurant and
 * delivers from wherever it happens to be. Ten-minute delivery cannot: at the 22 km/h
 * a bike averages in city traffic, the whole ride budget buys roughly 2.5 km, so the
 * only orders that can be promised are the ones already inside that radius. The
 * customer therefore never picks a store — the nearest one that can actually serve
 * them is assigned, and what they browse is that store's shelf.
 *
 * Straight-line distance is used for selection on purpose. Road distance is more
 * accurate and needs a Directions call per candidate store, which is a paid round trip
 * on a request that runs before the customer has done anything. The ranking barely
 * changes at 2 km, and the store that wins is re-checked against road distance at
 * checkout, where one call is affordable and the answer actually binds.
 */

/** Bikes in traffic, shared with the delivery promise so quote and reality agree. */
const DEFAULT_RADIUS_KM = 3;

/**
 * Minutes of picking for a basket of this size.
 *
 * The flat three minutes the food flow used describes a bag with two things in it. A
 * grocery basket of thirty lines is a walk around the whole store, and quoting three
 * minutes for it makes the promise a lie on exactly the orders that matter most --
 * the big ones. Roughly fifteen seconds a line on top of a fixed pick-and-pack base,
 * which matches what a picker can actually do at a shelf they know.
 */
export function estimatePackingMinutes(lineCount = 0) {
    const lines = Math.max(0, Number(lineCount) || 0);
    return Math.ceil(PACKING_MINUTES + lines * 0.25);
}

/**
 * The total promise for an order of this size from this distance.
 * Kept here so store selection and the quote cannot drift apart.
 */
export function estimatePromiseMinutes(distanceKm, lineCount = 0) {
    // Number(null) and Number('') are both 0, so coercing first would quote the
    // packing time alone for a distance nobody measured and present it as a
    // confident promise -- the same trap estimateDeliveryPromiseMinutes documents.
    // A store genuinely at zero distance still has to come through, so absence is
    // rejected here rather than by testing the coerced value.
    if (distanceKm === null || distanceKm === undefined || distanceKm === '') return null;

    const km = Number(distanceKm);
    if (!Number.isFinite(km) || km < 0) return null;
    return estimatePackingMinutes(lineCount) + Math.ceil((km / AVG_SPEED_KMPH) * 60);
}

/**
 * Dark stores that could reach this point, nearest first.
 *
 * Uses $geoNear against the 2dsphere index on `location` rather than reading every
 * store and sorting in JavaScript, because this runs on the customer's very first
 * screen and again on every address change.
 */
export async function findNearbyDarkStores(lat, lng, { maxKm = DEFAULT_RADIUS_KM, limit = 10 } = {}) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const stores = await FoodRestaurant.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates: [longitude, latitude] },
                distanceField: 'distanceMeters',
                // Widened past the requested radius so a store whose OWN
                // serviceRadiusKm is larger than the default is still considered;
                // the per-store radius is applied below, where it is known.
                maxDistance: Math.max(maxKm, 15) * 1000,
                spherical: true,
                query: {
                    storeType: 'dark_store',
                    status: 'approved',
                },
            },
        },
        { $limit: 50 },
        {
            $project: {
                restaurantName: 1,
                profileImage: 1,
                location: 1,
                zoneId: 1,
                serviceRadiusKm: 1,
                isAcceptingOrders: 1,
                openingTime: 1,
                closingTime: 1,
                distanceMeters: 1,
            },
        },
    ]);

    return stores
        .map((store) => {
            const distanceKm = Number(store.distanceMeters) / 1000;
            // A store's own radius wins; the caller's is the fallback for one that
            // has never had a radius set.
            const radius = Number.isFinite(Number(store.serviceRadiusKm)) && store.serviceRadiusKm > 0
                ? Number(store.serviceRadiusKm)
                : maxKm;
            return { ...store, distanceKm, effectiveRadiusKm: radius };
        })
        .filter((store) => store.distanceKm <= store.effectiveRadiusKm)
        .slice(0, limit);
}

/**
 * The store that will actually serve this customer.
 *
 * When `itemIds` is supplied the nearest store is not automatically the answer: a
 * store 400 m away that does not stock what is in the basket cannot serve it, and
 * silently assigning it produces a cart that fails at checkout for reasons the
 * customer cannot see. So candidates are walked nearest-first and the first one that
 * can actually fill the basket wins.
 *
 * @returns {Promise<{store: object, distanceKm: number, promiseMinutes: number}|null>}
 */
export async function assignStoreForCustomer(lat, lng, { itemIds = [], lineCount = 0 } = {}) {
    const candidates = await findNearbyDarkStores(lat, lng);
    if (candidates.length === 0) return null;

    const open = candidates.filter((store) => store.isAcceptingOrders !== false);
    // Falling back to a closed store would be worse than none: it hands the customer
    // a catalogue they cannot buy from. An empty result is the honest answer, and the
    // app already knows how to say "we don't deliver here yet".
    if (open.length === 0) return null;

    const wanted = (Array.isArray(itemIds) ? itemIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

    for (const store of open) {
        if (wanted.length > 0) {
            const stocked = await countStockedItems(store._id, wanted);
            if (stocked < wanted.length) continue;
        }
        return {
            store,
            distanceKm: Number(store.distanceKm.toFixed(2)),
            promiseMinutes: estimatePromiseMinutes(store.distanceKm, lineCount || wanted.length),
        };
    }

    return null;
}

/**
 * How many of these master products this store currently has on the shelf.
 *
 * Counts by masterProductId, because with several dark stores the same product is a
 * separate FoodItem row in each one — that per-store row IS the store's stock, which
 * is exactly the shape the master catalogue already gives us.
 */
async function countStockedItems(storeId, masterProductIds) {
    const ids = masterProductIds.map((id) => new mongoose.Types.ObjectId(id));
    const rows = await FoodItem.aggregate([
        {
            $match: {
                restaurantId: new mongoose.Types.ObjectId(String(storeId)),
                masterProductId: { $in: ids },
                approvalStatus: 'approved',
                isAvailable: { $ne: false },
                // null is untracked and always sellable; a tracked item needs stock.
                $or: [{ stockQty: null }, { stockQty: { $gt: 0 } }],
            },
        },
        { $group: { _id: '$masterProductId' } },
        { $count: 'value' },
    ]);
    return rows?.[0]?.value || 0;
}
