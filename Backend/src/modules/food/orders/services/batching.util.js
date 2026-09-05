import { haversineKm } from '../../shared/geo.utils.js';
import { AVG_SPEED_KMPH } from './order.helpers.js';

/**
 * Deciding which orders can share a rider trip.
 *
 * Batching is what makes ten-minute delivery affordable rather than merely possible:
 * a rider carrying three drops from one dark store costs a third per order of one
 * carrying a single drop. It only became worth building once the stores are ours —
 * on a marketplace the pickups are at different shops and there is no trip to share.
 *
 * The whole difficulty is that batching buys money with time, and time is the product.
 * Every order added to a trip pushes the later drops back, so a batch that ignores the
 * promise simply converts a ten-minute service into a cheaper twenty-minute one. The
 * rule this module enforces is therefore absolute and deliberately conservative:
 *
 *   an order may join a batch only if, after resequencing, EVERY order on that trip
 *   still lands inside the promise it was already given.
 *
 * Nobody's existing promise is ever traded away for a new order's convenience. When
 * the guard says no, the answer is a second rider, not a later delivery.
 */

/** Minutes a rider spends stopped at each drop: park, find the door, hand over. */
export const HANDOVER_MINUTES = 1.5;

/**
 * Roads are not straight lines.
 *
 * Straight-line distance understates a real trip by roughly a third in a laid-out
 * city, and understating it here is the dangerous direction: it would make a batch
 * look feasible, get it accepted, and only then run late. The same factor the pricing
 * path uses, so the two agree about how long a given leg takes.
 */
export const ROAD_FACTOR = 1.3;

const travelMinutes = (km) => (Number(km) || 0) * ROAD_FACTOR * (60 / AVG_SPEED_KMPH);

const pointOf = (entity) => {
    if (!entity) return null;
    const coords = entity.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const lat = Number(entity.latitude ?? entity.lat);
    const lng = Number(entity.longitude ?? entity.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
};

/** Straight-line km between two things that have coordinates, or null. */
export function distanceBetween(a, b) {
    const p1 = pointOf(a);
    const p2 = pointOf(b);
    if (!p1 || !p2) return null;
    return haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
}

/**
 * Orders the drops for one trip, nearest-neighbour from the store.
 *
 * Not the optimal route. Optimal is the travelling salesman problem, and for the three
 * or four drops a quick-commerce batch actually holds, nearest-neighbour lands within
 * a few percent of it while being instant and, more importantly, predictable — a
 * dispatcher looking at a batch can see why the order is what it is.
 *
 * @param {object} store The dark store the trip starts from.
 * @param {Array} orders Orders with a deliveryAddress carrying coordinates.
 * @returns {Array} The same orders, in the sequence they should be dropped.
 */
export function sequenceDrops(store, orders = []) {
    const remaining = [...(Array.isArray(orders) ? orders : [])];
    const sequence = [];
    let current = store;

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestDistance = Infinity;

        for (let i = 0; i < remaining.length; i += 1) {
            const distance = distanceBetween(current, remaining[i]?.deliveryAddress);
            // An order with no usable coordinates cannot be measured. It sorts last
            // rather than being dropped from the trip, because losing an order here
            // would mean a customer whose delivery quietly never happens.
            const usable = distance === null ? Infinity : distance;
            if (usable < bestDistance) {
                bestDistance = usable;
                bestIndex = i;
            }
        }

        const [next] = remaining.splice(bestIndex, 1);
        sequence.push(next);
        current = next?.deliveryAddress || current;
    }

    return sequence;
}

/**
 * When each drop on a sequenced trip is reached, in minutes from departure.
 *
 * Departure is when the LAST order in the batch is packed — the rider cannot leave
 * with a bag that is not ready — which is why adding an order to a batch delays the
 * ones already on it even before any extra riding.
 *
 * @returns {Array<{order: object, etaMinutes: number, legKm: number}>}
 */
export function estimateBatchTimings(store, sequencedOrders = []) {
    const timings = [];
    let cursor = store;
    let elapsed = 0;

    for (const order of sequencedOrders) {
        const legKm = distanceBetween(cursor, order?.deliveryAddress);
        elapsed += travelMinutes(legKm ?? 0);
        timings.push({
            order,
            etaMinutes: Math.ceil(elapsed),
            legKm: legKm === null ? null : Number(legKm.toFixed(2)),
        });
        // The handover happens after arriving, so it delays the NEXT drop, not this one.
        elapsed += HANDOVER_MINUTES;
        cursor = order?.deliveryAddress || cursor;
    }

    return timings;
}

/**
 * Whether `candidate` can join `batchOrders` without breaking anyone's promise.
 *
 * @param {object} store
 * @param {Array} batchOrders Orders already on the trip.
 * @param {object} candidate The order being considered.
 * @param {object} options
 * @param {Date} options.now
 * @param {number} options.maxBatchSize
 * @returns {{ ok: boolean, reason?: string, sequence?: Array, timings?: Array }}
 */
export function canJoinBatch(store, batchOrders = [], candidate, options = {}) {
    const { now = new Date(), maxBatchSize = 4, departureInMinutes = 0 } = options;

    if (!candidate) return { ok: false, reason: 'no_candidate' };
    if (batchOrders.length + 1 > maxBatchSize) {
        return { ok: false, reason: 'batch_full' };
    }

    const all = [...batchOrders, candidate];
    const sequence = sequenceDrops(store, all);
    const timings = estimateBatchTimings(store, sequence);

    for (const { order, etaMinutes } of timings) {
        const deadline = promiseDeadlineFor(order);
        // An order with no recorded promise cannot be shown to be late, so it does
        // not block the batch. Pre-batching orders and anything created before the
        // promise was stored land here.
        if (!deadline) continue;

        const arrivesAt = new Date(now.getTime() + (departureInMinutes + etaMinutes) * 60_000);
        if (arrivesAt > deadline) {
            return {
                ok: false,
                reason: 'would_break_promise',
                // Named so a dispatcher can see WHOSE promise stopped the batch,
                // which is the first thing anyone asks.
                blockingOrderId: String(order?._id || ''),
                sequence,
                timings,
            };
        }
    }

    return { ok: true, sequence, timings };
}

/**
 * The moment an order was promised for.
 *
 * Read from what the order actually recorded at checkout rather than recomputed:
 * the customer was shown a number and that number is the commitment, whatever the
 * distance or the constants say later.
 */
export function promiseDeadlineFor(order) {
    const minutes = Number(order?.pricing?.deliveryPromiseMinutes);
    const placedAt = order?.createdAt ? new Date(order.createdAt) : null;
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (!placedAt || Number.isNaN(placedAt.getTime())) return null;
    return new Date(placedAt.getTime() + minutes * 60_000);
}
