import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sequenceDrops,
    estimateBatchTimings,
    canJoinBatch,
    promiseDeadlineFor,
    distanceBetween,
    HANDOVER_MINUTES,
} from '../src/modules/food/orders/services/batching.util.js';

/**
 * Batching, which buys money with time in a product whose whole proposition is time.
 *
 * The property under test is the one that keeps that trade honest: adding an order to
 * a trip must never make an order already on it late. Everything else here — the
 * sequencing, the leg arithmetic — exists to make that judgement correct.
 */

const STORE = { location: { coordinates: [75.8577, 22.7196] } }; // Indore, [lng, lat]

/** ~1 km north per 0.009 degrees of latitude, which keeps the fixtures readable. */
const at = (kmNorth, kmEast = 0) => ({
    location: {
        coordinates: [75.8577 + kmEast * 0.0097, 22.7196 + kmNorth * 0.009],
    },
});

const order = (id, kmNorth, { promiseMinutes = 30, placedMinutesAgo = 0, kmEast = 0 } = {}) => ({
    _id: id,
    deliveryAddress: at(kmNorth, kmEast),
    createdAt: new Date(Date.now() - placedMinutesAgo * 60_000),
    pricing: { deliveryPromiseMinutes: promiseMinutes },
});

test('distanceBetween', async (t) => {
    await t.test('measures between two coordinate-carrying things', () => {
        const km = distanceBetween(STORE, at(1));
        assert.ok(km > 0.9 && km < 1.1, `expected about 1 km, got ${km}`);
    });

    await t.test('is null when either side has no usable coordinates', () => {
        assert.equal(distanceBetween(STORE, {}), null);
        assert.equal(distanceBetween(null, at(1)), null);
        assert.equal(distanceBetween(STORE, { location: { coordinates: ['a', 'b'] } }), null);
    });
});

test('sequenceDrops', async (t) => {
    await t.test('visits the nearest drop first', () => {
        const far = order('far', 4);
        const near = order('near', 1);
        const mid = order('mid', 2);
        const sequence = sequenceDrops(STORE, [far, near, mid]);
        assert.deepEqual(sequence.map((o) => o._id), ['near', 'mid', 'far']);
    });

    await t.test('chains from the previous drop, not from the store', () => {
        // B is further from the store than C, but sits right next to A. A route
        // measured from the store each time would visit C second and backtrack.
        const a = order('a', 3);
        const b = order('b', 3.2);
        const c = order('c', 1, { kmEast: 4 });
        const sequence = sequenceDrops(STORE, [a, b, c]);
        assert.equal(sequence[0]._id, 'a', 'nearest to the store');
        assert.equal(sequence[1]._id, 'b', 'then its neighbour, not back across town');
    });

    await t.test('keeps every order, including ones that cannot be measured', () => {
        // Dropping an unplaceable order would mean a customer whose delivery
        // silently never happens.
        const placeable = order('ok', 1);
        const broken = { _id: 'broken', deliveryAddress: {}, pricing: {} };
        const sequence = sequenceDrops(STORE, [broken, placeable]);
        assert.equal(sequence.length, 2);
        assert.equal(sequence[0]._id, 'ok', 'measurable orders go first');
        assert.equal(sequence[1]._id, 'broken');
    });

    await t.test('handles empty and single-drop trips', () => {
        assert.deepEqual(sequenceDrops(STORE, []), []);
        assert.equal(sequenceDrops(STORE, [order('a', 1)]).length, 1);
    });
});

test('estimateBatchTimings', async (t) => {
    await t.test('each drop is later than the one before it', () => {
        const timings = estimateBatchTimings(STORE, [order('a', 1), order('b', 2), order('c', 3)]);
        assert.ok(timings[0].etaMinutes < timings[1].etaMinutes);
        assert.ok(timings[1].etaMinutes < timings[2].etaMinutes);
    });

    await t.test('the first drop carries no handover delay of its own', () => {
        // Handover happens on arrival, so it pushes the NEXT drop, not this one.
        const single = estimateBatchTimings(STORE, [order('a', 2)]);
        const first = estimateBatchTimings(STORE, [order('a', 2), order('b', 4)])[0];
        assert.equal(single[0].etaMinutes, first.etaMinutes);
    });

    await t.test('a second drop at the same address still costs the handover', () => {
        const timings = estimateBatchTimings(STORE, [order('a', 2), order('b', 2)]);
        const gap = timings[1].etaMinutes - timings[0].etaMinutes;
        assert.ok(gap >= Math.floor(HANDOVER_MINUTES), `expected a handover gap, got ${gap}`);
    });

    await t.test('road distance is assumed longer than the straight line', () => {
        // Understating the trip is the dangerous direction: it makes a batch look
        // feasible, get accepted, and only then run late.
        const [drop] = estimateBatchTimings(STORE, [order('a', 10)]);
        const straightLineMinutes = (10 / 22) * 60;
        assert.ok(
            drop.etaMinutes > straightLineMinutes,
            `${drop.etaMinutes} should exceed the straight-line ${straightLineMinutes.toFixed(1)}`,
        );
    });

    await t.test('an unmeasurable leg does not corrupt the running total', () => {
        const timings = estimateBatchTimings(STORE, [
            { _id: 'broken', deliveryAddress: {} },
            order('b', 2),
        ]);
        assert.ok(Number.isFinite(timings[0].etaMinutes));
        assert.ok(Number.isFinite(timings[1].etaMinutes));
        assert.equal(timings[0].legKm, null, 'and says the leg could not be measured');
    });
});

test('promiseDeadlineFor', async (t) => {
    await t.test('is the promise the customer was actually shown', () => {
        const placed = new Date('2026-01-01T10:00:00Z');
        const deadline = promiseDeadlineFor({
            createdAt: placed,
            pricing: { deliveryPromiseMinutes: 10 },
        });
        assert.equal(deadline.toISOString(), '2026-01-01T10:10:00.000Z');
    });

    await t.test('is null when no promise was recorded', () => {
        // Orders that predate the promise cannot be shown to be late, so they must
        // not be treated as instantly overdue either.
        assert.equal(promiseDeadlineFor({ createdAt: new Date(), pricing: {} }), null);
        assert.equal(promiseDeadlineFor({ pricing: { deliveryPromiseMinutes: 10 } }), null);
        assert.equal(promiseDeadlineFor({}), null);
        assert.equal(promiseDeadlineFor(null), null);
    });
});

test('canJoinBatch', async (t) => {
    await t.test('accepts a nearby order when everyone still makes it', () => {
        const existing = order('a', 1, { promiseMinutes: 30 });
        const candidate = order('b', 1.2, { promiseMinutes: 30 });
        const result = canJoinBatch(STORE, [existing], candidate);
        assert.equal(result.ok, true, result.reason);
        assert.equal(result.sequence.length, 2);
    });

    await t.test('refuses when it would make an EXISTING order late', () => {
        // The whole point. An order already promised in 10 minutes, placed 8 minutes
        // ago, has almost no slack left; a detour must not be allowed to spend it.
        const nearlyDue = order('a', 1, { promiseMinutes: 10, placedMinutesAgo: 8 });
        const detour = order('b', 9, { promiseMinutes: 45 });
        const result = canJoinBatch(STORE, [nearlyDue], detour);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'would_break_promise');
    });

    await t.test('names whose promise blocked it', () => {
        const nearlyDue = order('tight', 1, { promiseMinutes: 10, placedMinutesAgo: 9 });
        const detour = order('far', 12, { promiseMinutes: 60 });
        const result = canJoinBatch(STORE, [nearlyDue], detour);
        assert.equal(result.ok, false);
        // A dispatcher's first question is which order stopped the batch.
        assert.ok(result.blockingOrderId, 'should say which order could not wait');
    });

    await t.test('refuses when the CANDIDATE itself could not be served in time', () => {
        const existing = order('a', 1, { promiseMinutes: 60 });
        const impossible = order('b', 20, { promiseMinutes: 10 });
        const result = canJoinBatch(STORE, [existing], impossible);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'would_break_promise');
    });

    await t.test('respects the maximum batch size', () => {
        const batch = [order('a', 1), order('b', 1.1), order('c', 1.2), order('d', 1.3)];
        const result = canJoinBatch(STORE, batch, order('e', 1.4), { maxBatchSize: 4 });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'batch_full');
    });

    await t.test('accounts for time the batch still has to wait before departing', () => {
        const tight = order('a', 1, { promiseMinutes: 10, placedMinutesAgo: 2 });
        const near = order('b', 1.1, { promiseMinutes: 10, placedMinutesAgo: 0 });

        assert.equal(canJoinBatch(STORE, [tight], near).ok, true, 'fine leaving now');
        // The same batch, but the rider cannot leave for another seven minutes
        // because the second bag is still being picked.
        const delayed = canJoinBatch(STORE, [tight], near, { departureInMinutes: 7 });
        assert.equal(delayed.ok, false, 'not fine once departure slips');
    });

    await t.test('an order with no promise never blocks a batch', () => {
        const legacy = { _id: 'legacy', deliveryAddress: at(9), pricing: {}, createdAt: new Date() };
        const result = canJoinBatch(STORE, [legacy], order('b', 1, { promiseMinutes: 30 }));
        assert.equal(result.ok, true, result.reason);
    });

    await t.test('a first order always forms a valid batch of one', () => {
        const result = canJoinBatch(STORE, [], order('a', 2, { promiseMinutes: 20 }));
        assert.equal(result.ok, true);
        assert.equal(result.sequence.length, 1);
    });

    await t.test('rejects a missing candidate rather than throwing', () => {
        assert.equal(canJoinBatch(STORE, [], null).ok, false);
    });
});
