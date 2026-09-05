import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeItemsTax,
    estimateDeliveryPromiseMinutes,
    resolveUserDeliveryFee
} from '../src/modules/food/orders/services/order-pricing.service.js';

/**
 * Per-line GST is the arithmetic the quick-commerce conversion turned on, and it is
 * the one place where a silent bug is billed to a customer on every single order.
 * These cover the cases the implementation comments claim to handle.
 */
test('computeItemsTax', async (t) => {
    await t.test('taxes each line at its own slab', () => {
        const items = [
            { price: 100, quantity: 1, gstRate: 5 },   // 5
            { price: 200, quantity: 1, gstRate: 18 }   // 36
        ];
        assert.equal(computeItemsTax(items, { subtotal: 300, fallbackRate: 12 }), 41);
    });

    await t.test('a line with no slab of its own falls back to the order-wide rate', () => {
        const items = [
            { price: 100, quantity: 1, gstRate: null },
            { price: 100, quantity: 1 } // undefined
        ];
        // Both fall back to 12% -> 12 + 12
        assert.equal(computeItemsTax(items, { subtotal: 200, fallbackRate: 12 }), 24);
    });

    await t.test('gstRate 0 is a real slab, not a missing one', () => {
        // The guard is `!== null && !== undefined`, so an explicit 0 must NOT reach
        // the fallback. Flour is genuinely zero-rated and must not be taxed at 12%.
        const items = [{ price: 100, quantity: 1, gstRate: 0 }];
        assert.equal(computeItemsTax(items, { subtotal: 100, fallbackRate: 12 }), 0);
    });

    await t.test('matches the old single-rate arithmetic when no line is tagged', () => {
        // The conversion promised this is not a repricing of pre-existing baskets.
        const items = [
            { price: 250, quantity: 2 },
            { price: 100, quantity: 1 }
        ];
        const subtotal = 600;
        assert.equal(
            computeItemsTax(items, { subtotal, fallbackRate: 5 }),
            Math.round(subtotal * 0.05)
        );
    });

    await t.test('a basket coupon reduces every line in proportion to its share', () => {
        const items = [
            { price: 100, quantity: 1, gstRate: 5 },
            { price: 100, quantity: 1, gstRate: 18 }
        ];
        // 50 off 200 -> every line is taxed on 75% of its value.
        // 100*0.75*0.05 = 3.75 ; 100*0.75*0.18 = 13.5 ; total 17.25 -> 17
        assert.equal(computeItemsTax(items, { subtotal: 200, discount: 50, fallbackRate: 0 }), 17);
    });

    await t.test('quantity multiplies the line', () => {
        const items = [{ price: 50, quantity: 4, gstRate: 10 }];
        assert.equal(computeItemsTax(items, { subtotal: 200, fallbackRate: 0 }), 20);
    });

    await t.test('a discount at or above subtotal yields no tax, never negative', () => {
        const items = [{ price: 100, quantity: 1, gstRate: 18 }];
        assert.equal(computeItemsTax(items, { subtotal: 100, discount: 100, fallbackRate: 18 }), 0);
        assert.equal(computeItemsTax(items, { subtotal: 100, discount: 500, fallbackRate: 18 }), 0);
    });

    await t.test('an empty or zero-value basket is free', () => {
        assert.equal(computeItemsTax([], { subtotal: 0 }), 0);
        assert.equal(computeItemsTax([{ price: 10, quantity: 1, gstRate: 5 }], { subtotal: 0 }), 0);
    });
});

test('estimateDeliveryPromiseMinutes', async (t) => {
    await t.test('refuses to quote a promise for an unmeasured distance', () => {
        // Number(null) is 0, which would otherwise quote the packing time alone and
        // present it as a confident promise.
        for (const bad of [null, undefined, '', 'abc', -1]) {
            assert.equal(estimateDeliveryPromiseMinutes(bad), null, `for ${JSON.stringify(bad)}`);
        }
    });

    await t.test('grows with distance and is always a whole number', () => {
        const near = estimateDeliveryPromiseMinutes(1);
        const far = estimateDeliveryPromiseMinutes(10);
        assert.ok(Number.isInteger(near) && Number.isInteger(far));
        assert.ok(far > near, `${far} should exceed ${near}`);
    });

    await t.test('a zero-distance order still costs packing time', () => {
        assert.ok(estimateDeliveryPromiseMinutes(0) > 0);
    });
});

test('resolveUserDeliveryFee', async (t) => {
    const settings = {
        deliveryFee: 40,
        deliveryFeeRanges: [
            { min: 0, max: 3, fee: 20 },
            { min: 3, max: 8, fee: 35 }
        ]
    };

    await t.test('charges the band the distance falls in', () => {
        assert.equal(resolveUserDeliveryFee(settings, { subtotal: 500, distanceKm: 2 }).deliveryFee, 20);
        assert.equal(resolveUserDeliveryFee(settings, { subtotal: 500, distanceKm: 5 }).deliveryFee, 35);
    });

    await t.test('falls back to the flat fee when distance is unknown', () => {
        const out = resolveUserDeliveryFee(settings, { subtotal: 500, distanceKm: null });
        assert.equal(out.deliveryFee, 40);
        assert.equal(out.source, 'default');
        assert.equal(out.distanceKm, null);
    });

    await t.test('falls back when the distance matches no band', () => {
        const out = resolveUserDeliveryFee(settings, { subtotal: 500, distanceKm: 99 });
        assert.equal(out.deliveryFee, 40);
        assert.equal(out.source, 'default_unmatched_range');
    });
});
