import test from 'node:test';
import assert from 'node:assert/strict';

import { repriceForFulfilledItems } from '../src/modules/food/orders/services/order-pricing.service.js';

/**
 * Repricing a partially picked order.
 *
 * This is money the customer gets back, computed from a receipt they already have, so
 * the properties that matter are: it never bills more for receiving less, it never
 * refunds more than was charged, and it uses the order's own prices rather than
 * whatever the catalogue says today.
 */

/** Two lines, ₹100 x2 at 5% and ₹200 x1 at 18%, on ₹40 of fees. */
const buildOrder = (overrides = {}) => ({
    items: [
        { name: 'Atta 5 kg', price: 100, quantity: 2, gstRate: 5 },
        { name: 'Biscuits', price: 200, quantity: 1, gstRate: 18 }
    ],
    pricing: {
        subtotal: 400,
        tax: 46,             // 200*0.05 + 200*0.18
        packagingFee: 0,
        deliveryFee: 30,
        deliveryFeeGst: 5,
        platformFee: 5,
        discount: 0,
        total: 486,
        currency: 'INR',
        ...(overrides.pricing || {})
    },
    ...overrides
});

test('repriceForFulfilledItems', async (t) => {
    await t.test('everything picked leaves the order exactly as it was', async () => {
        const order = buildOrder();
        const out = repriceForFulfilledItems(order, [2, 1]);

        assert.equal(out.pricing.subtotal, 400);
        assert.equal(out.pricing.total, 486);
        assert.equal(out.refundAmount, 0, 'a complete order refunds nothing');
        assert.equal(out.nothingFulfilled, false);
    });

    await t.test('a missing line is removed from the subtotal and refunded', async () => {
        const order = buildOrder();
        // Biscuits unavailable.
        const out = repriceForFulfilledItems(order, [2, 0]);

        assert.equal(out.pricing.subtotal, 200);
        assert.equal(out.removedValue, 200);
        // Tax drops to the remaining line only: 200 * 5% = 10.
        assert.equal(out.pricing.tax, 10);
        // 200 + 30 + 5 + 5 + 10 = 250
        assert.equal(out.pricing.total, 250);
        assert.equal(out.refundAmount, 236);
    });

    await t.test('a short line refunds only the units that were missing', async () => {
        const order = buildOrder();
        // One of two Atta picked.
        const out = repriceForFulfilledItems(order, [1, 1]);

        assert.equal(out.pricing.subtotal, 300);
        assert.equal(out.removedValue, 100);
        // 100*0.05 + 200*0.18 = 5 + 36 = 41
        assert.equal(out.pricing.tax, 41);
    });

    await t.test('fees never move, so a smaller basket is never billed more', async () => {
        const order = buildOrder();
        const out = repriceForFulfilledItems(order, [1, 0]);

        assert.equal(out.pricing.deliveryFee, 30, 'delivery is not recomputed');
        assert.equal(out.pricing.deliveryFeeGst, 5);
        assert.equal(out.pricing.platformFee, 5);
        assert.ok(out.pricing.total < order.pricing.total, 'total can only go down');
    });

    await t.test('a coupon is scaled with the basket, not clawed back', async () => {
        // ₹100 off a ₹400 basket. Half the basket survives, so half the discount does.
        const order = buildOrder({ pricing: { discount: 100, total: 386 } });
        const out = repriceForFulfilledItems(order, [2, 0]); // ₹200 left

        assert.equal(out.pricing.discount, 50, 'the effective discount rate is held constant');
        // The customer keeps a discount whose minimum spend they no longer meet,
        // because the shortfall was the seller's, not theirs.
        assert.ok(out.pricing.discount > 0);
    });

    await t.test('the discount can never exceed what was originally given', async () => {
        const order = buildOrder({ pricing: { discount: 100, total: 386 } });
        const out = repriceForFulfilledItems(order, [2, 1]);
        assert.equal(out.pricing.discount, 100);
    });

    await t.test('nothing picked is flagged as a cancellation, not a partial', async () => {
        const order = buildOrder();
        const out = repriceForFulfilledItems(order, [0, 0]);

        assert.equal(out.nothingFulfilled, true);
        assert.equal(out.pricing.subtotal, 0);
        assert.equal(out.pricing.tax, 0);
    });

    await t.test('a line left unreported is treated as fully picked', async () => {
        const order = buildOrder();
        // The seller reports only the short line; the other must not be zeroed.
        const out = repriceForFulfilledItems(order, [undefined, 0]);
        assert.equal(out.pricing.subtotal, 200, 'the unreported line survives in full');
    });

    await t.test('a seller cannot claim to have picked more than was ordered', async () => {
        const order = buildOrder();
        const out = repriceForFulfilledItems(order, [99, 99]);

        assert.equal(out.pricing.subtotal, 400, 'clamped to the ordered quantity');
        assert.equal(out.refundAmount, 0, 'and cannot manufacture a negative refund');
    });

    await t.test('negative and fractional quantities are rejected safely', async () => {
        const order = buildOrder();
        assert.equal(repriceForFulfilledItems(order, [-5, 0]).pricing.subtotal, 0);
        // 1.9 picked units is not a thing; it floors rather than billing a part unit.
        assert.equal(repriceForFulfilledItems(order, [1.9, 0]).pricing.subtotal, 100);
    });

    await t.test('the refund never exceeds what was charged', async () => {
        const order = buildOrder({ pricing: { total: 50 } });
        const out = repriceForFulfilledItems(order, [0, 0]);
        assert.ok(out.refundAmount <= 50, `${out.refundAmount} must not exceed 50`);
    });

    await t.test('prices come from the order, not from the live catalogue', async () => {
        // Same order, but callers may hand in whatever they like as fallbackRate;
        // the line values must still be the ones stored on the order.
        const order = buildOrder();
        const out = repriceForFulfilledItems(order, [2, 1], 28);
        assert.equal(out.pricing.subtotal, 400);
        // Both lines carry their own slab, so the fallback must not be applied.
        assert.equal(out.pricing.tax, 46);
    });

    await t.test('an untagged line falls back to the order-wide rate', async () => {
        const order = {
            items: [{ name: 'Rice', price: 100, quantity: 2 }],
            pricing: { subtotal: 200, tax: 10, deliveryFee: 0, deliveryFeeGst: 0, platformFee: 0, packagingFee: 0, discount: 0, total: 210 }
        };
        const out = repriceForFulfilledItems(order, [1], 5);
        assert.equal(out.pricing.tax, 5, '100 at the 5% fallback');
    });

    await t.test('survives an order with no items or no pricing', async () => {
        assert.equal(repriceForFulfilledItems({}, []).nothingFulfilled, true);
        assert.equal(repriceForFulfilledItems({ items: [] }, []).refundAmount, 0);
    });
});
