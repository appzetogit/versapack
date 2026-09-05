import test from 'node:test';
import assert from 'node:assert/strict';

import {
    estimatePackingMinutes,
    estimatePromiseMinutes,
} from '../src/modules/food/restaurant/services/storeAssignment.service.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';

/**
 * The ten-minute promise, which is arithmetic before it is anything else.
 *
 * Every number here is shown to a customer before they commit, so being wrong is not
 * a rendering bug — it is a promise that will be broken. The property that matters
 * most is that the promise grows with the basket: the old flat three minutes described
 * a bag with two things in it and was quoted unchanged for a thirty-line grocery shop,
 * which made it a lie on exactly the orders worth the most.
 */

test('estimatePackingMinutes', async (t) => {
    await t.test('a big basket takes longer to pick than a small one', () => {
        const small = estimatePackingMinutes(3);
        const large = estimatePackingMinutes(30);
        assert.ok(large > small, `${large} must exceed ${small}`);
        // A thirty-line shop is a walk around the whole store, not a three-minute grab.
        assert.ok(large >= 10, `30 lines should be at least 10 minutes, got ${large}`);
    });

    await t.test('an empty basket still costs the fixed pick-and-pack base', () => {
        assert.ok(estimatePackingMinutes(0) > 0);
    });

    await t.test('always a whole number of minutes', () => {
        for (const lines of [0, 1, 7, 13, 30, 100]) {
            assert.ok(Number.isInteger(estimatePackingMinutes(lines)), `${lines} lines`);
        }
    });

    await t.test('nonsense line counts fall back to the base rather than throwing', () => {
        for (const bad of [null, undefined, -5, 'abc', NaN]) {
            assert.equal(estimatePackingMinutes(bad), estimatePackingMinutes(0));
        }
    });
});

test('estimatePromiseMinutes', async (t) => {
    await t.test('a small nearby basket lands inside ten minutes', () => {
        // 1.5 km is comfortably inside a dark store's radius, and this is the order
        // the whole model exists to serve.
        const promise = estimatePromiseMinutes(1.5, 6);
        assert.ok(promise <= 10, `expected <= 10, got ${promise}`);
    });

    await t.test('distance beyond a dark store radius is honestly slower', () => {
        // If this ever returned ~10 the app would promise something physically
        // impossible: 8 km of city riding does not happen in ten minutes.
        const promise = estimatePromiseMinutes(8, 6);
        assert.ok(promise > 20, `expected a realistic number, got ${promise}`);
    });

    await t.test('grows with both distance and basket size, independently', () => {
        const base = estimatePromiseMinutes(2, 5);
        assert.ok(estimatePromiseMinutes(4, 5) > base, 'further must be slower');
        assert.ok(estimatePromiseMinutes(2, 40) > base, 'bigger must be slower');
    });

    await t.test('refuses to quote for an unmeasured distance', () => {
        // Number(null) is 0, which would otherwise quote packing time alone and
        // present it as a confident promise.
        for (const bad of [null, undefined, '', 'abc', -1]) {
            assert.equal(estimatePromiseMinutes(bad, 5), null, `for ${JSON.stringify(bad)}`);
        }
    });

    await t.test('a store at the door still owes picking time', () => {
        assert.ok(estimatePromiseMinutes(0, 10) >= estimatePackingMinutes(10));
    });
});

test('dark store schema', async (t) => {
    await t.test('every existing store stays a marketplace seller', () => {
        // Defaulting to dark_store would silently make every restaurant on the
        // platform assignable by distance and promise ten minutes for it.
        const path = FoodRestaurant.schema.path('storeType');
        assert.equal(path.defaultValue, 'marketplace_seller');
        assert.deepEqual(path.enumValues, ['dark_store', 'marketplace_seller']);
    });

    await t.test('service radius is per store and unset by default', () => {
        // Null means "no radius of its own", which is what keeps marketplace sellers
        // governed by the zone polygons instead.
        assert.equal(FoodRestaurant.schema.path('serviceRadiusKm').defaultValue, null);
    });

    await t.test('picking capacity exists and is uncapped by default', () => {
        assert.equal(FoodRestaurant.schema.path('pickingCapacityPerHour').defaultValue, null);
    });

    await t.test('storeType is indexed, since assignment filters on it', () => {
        assert.equal(FoodRestaurant.schema.path('storeType').options.index, true);
    });
});
