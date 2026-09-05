import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkReturnLine,
    returnableQuantity,
    returnDeadlineFor,
    computeReturnRefund,
    DEFAULT_RETURN_WINDOW_HOURS,
} from '../src/modules/food/orders/services/returns.util.js';

/**
 * Returns, which are the one path where money leaves the business after an order has
 * already completed successfully. The rules that matter are the ones that stop the
 * same goods being paid for twice.
 */

const HOUR = 60 * 60 * 1000;
const deliveredAgo = (hours) => new Date(Date.now() - hours * HOUR);

const line = (over = {}) => ({ itemId: 'p1', name: 'Milk', quantity: 3, ...over });
const product = (over = {}) => ({ isReturnable: true, returnWindowHours: null, ...over });

test('returnableQuantity', async (t) => {
    await t.test('is what was delivered, not what was ordered', () => {
        // A short-picked line was already refunded at fulfilment. Counting the missing
        // units as returnable would pay the customer for them a second time.
        assert.equal(returnableQuantity(line({ quantity: 5, fulfilledQty: 2 })), 2);
    });

    await t.test('falls back to the ordered quantity when nothing was reported', () => {
        assert.equal(returnableQuantity(line({ quantity: 3, fulfilledQty: null })), 3);
        assert.equal(returnableQuantity(line({ quantity: 3 })), 3);
    });

    await t.test('subtracts what has already gone back', () => {
        assert.equal(returnableQuantity(line({ quantity: 3 }), 1), 2);
        assert.equal(returnableQuantity(line({ quantity: 3 }), 3), 0);
    });

    await t.test('never goes negative', () => {
        assert.equal(returnableQuantity(line({ quantity: 2 }), 99), 0);
        assert.equal(returnableQuantity(line({ quantity: 0, fulfilledQty: 0 })), 0);
    });
});

test('returnDeadlineFor', async (t) => {
    await t.test('uses the product window when it has one', () => {
        const delivered = new Date('2026-01-01T10:00:00Z');
        const deadline = returnDeadlineFor(delivered, product({ returnWindowHours: 2 }));
        assert.equal(deadline.toISOString(), '2026-01-01T12:00:00.000Z');
    });

    await t.test('falls back to the platform default', () => {
        // Per product, not per order: milk and rice do not deserve the same window,
        // and the product is what knows.
        const delivered = new Date('2026-01-01T10:00:00Z');
        const deadline = returnDeadlineFor(delivered, product());
        assert.equal(deadline.getTime() - delivered.getTime(), DEFAULT_RETURN_WINDOW_HOURS * HOUR);
    });

    await t.test('is null for an order that was never delivered', () => {
        assert.equal(returnDeadlineFor(null, product()), null);
        assert.equal(returnDeadlineFor('nonsense', product()), null);
    });
});

test('checkReturnLine', async (t) => {
    const base = { orderLine: line(), product: product(), deliveredAt: deliveredAgo(1) };

    await t.test('accepts an ordinary in-window request', () => {
        const out = checkReturnLine({ ...base, quantity: 1, reason: 'not_needed' });
        assert.equal(out.ok, true, out.reason);
        assert.equal(out.requiresCollection, true);
    });

    await t.test('refuses once the window has closed', () => {
        const out = checkReturnLine({
            ...base,
            deliveredAt: deliveredAgo(DEFAULT_RETURN_WINDOW_HOURS + 1),
            quantity: 1,
            reason: 'not_needed',
        });
        assert.equal(out.ok, false);
        assert.equal(out.reason, 'window_closed');
    });

    await t.test('refuses a non-returnable product for a change of mind', () => {
        const out = checkReturnLine({
            ...base,
            product: product({ isReturnable: false }),
            quantity: 1,
            reason: 'not_needed',
        });
        assert.equal(out.ok, false);
        assert.equal(out.reason, 'not_returnable');
    });

    await t.test('accepts a non-returnable product that arrived damaged or expired', () => {
        // Refusing these would mean telling a customer the sour milk we delivered is
        // their problem, which no returns policy survives.
        for (const reason of ['damaged', 'expired']) {
            const out = checkReturnLine({
                ...base,
                product: product({ isReturnable: false }),
                quantity: 1,
                reason,
            });
            assert.equal(out.ok, true, `${reason}: ${out.reason}`);
            // And nobody carries a leaking bottle back.
            assert.equal(out.requiresCollection, false);
        }
    });

    await t.test('cannot return more than was delivered', () => {
        const out = checkReturnLine({
            ...base,
            orderLine: line({ quantity: 5, fulfilledQty: 2 }),
            quantity: 3,
            reason: 'quality',
        });
        assert.equal(out.ok, false);
        assert.equal(out.reason, 'quantity_exceeds_delivered');
        assert.equal(out.available, 2, 'and says how many are actually available');
    });

    await t.test('cannot return the same units twice', () => {
        const out = checkReturnLine({
            ...base,
            orderLine: line({ quantity: 2 }),
            alreadyReturned: 2,
            quantity: 1,
            reason: 'quality',
        });
        assert.equal(out.ok, false);
        assert.equal(out.reason, 'nothing_left_to_return');
    });

    await t.test('rejects nonsense quantities and reasons', () => {
        assert.equal(checkReturnLine({ ...base, quantity: 0, reason: 'quality' }).reason, 'invalid_quantity');
        assert.equal(checkReturnLine({ ...base, quantity: -2, reason: 'quality' }).reason, 'invalid_quantity');
        assert.equal(checkReturnLine({ ...base, quantity: 1, reason: 'because' }).reason, 'invalid_reason');
        assert.equal(checkReturnLine({ orderLine: null, quantity: 1, reason: 'quality' }).reason, 'no_such_line');
    });

    await t.test('refuses an order that was never delivered', () => {
        const out = checkReturnLine({ ...base, deliveredAt: null, quantity: 1, reason: 'quality' });
        assert.equal(out.ok, false);
        assert.equal(out.reason, 'not_delivered');
    });
});

test('computeReturnRefund', async (t) => {
    await t.test('refunds the price actually charged', () => {
        const refund = computeReturnRefund(
            [{ unitPrice: 50, quantity: 2 }],
            { subtotal: 400, discount: 0 },
        );
        assert.equal(refund, 100);
    });

    await t.test('scales the refund by the discount the basket got', () => {
        // Refunding list price on a couponed order hands back more than the customer
        // paid, which on a heavily discounted basket loses money on every return.
        const refund = computeReturnRefund(
            [{ unitPrice: 100, quantity: 1 }],
            { subtotal: 400, discount: 100 },
        );
        assert.equal(refund, 75, '75% of the basket was actually paid for');
    });

    await t.test('never refunds more than the line was worth', () => {
        const full = computeReturnRefund([{ unitPrice: 100, quantity: 1 }], { subtotal: 100, discount: 0 });
        const discounted = computeReturnRefund([{ unitPrice: 100, quantity: 1 }], { subtotal: 100, discount: 40 });
        assert.ok(discounted < full);
        assert.ok(discounted >= 0);
    });

    await t.test('a fully discounted basket refunds nothing', () => {
        assert.equal(computeReturnRefund([{ unitPrice: 100, quantity: 1 }], { subtotal: 100, discount: 100 }), 0);
    });

    await t.test('sums several lines', () => {
        const refund = computeReturnRefund(
            [{ unitPrice: 30, quantity: 2 }, { unitPrice: 45, quantity: 1 }],
            { subtotal: 500, discount: 0 },
        );
        assert.equal(refund, 105);
    });

    await t.test('is zero for an empty or valueless request', () => {
        assert.equal(computeReturnRefund([], { subtotal: 100 }), 0);
        assert.equal(computeReturnRefund([{ unitPrice: 0, quantity: 3 }], { subtotal: 100 }), 0);
    });
});
