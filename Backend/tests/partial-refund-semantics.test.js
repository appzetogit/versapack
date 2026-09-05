import test from 'node:test';
import assert from 'node:assert/strict';

import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';

/**
 * A partly refunded order is still a live order.
 *
 * These pin the distinction that stops a customer losing money: a partial refund must
 * NOT look like a completed one. applyCancellationRefund skips an order whose refund
 * status is already 'processed', so if a partial refund wrote that value, cancelling
 * the order afterwards would return nothing and quietly keep the rest.
 */

const refundStatusEnum = () =>
    FoodOrder.schema.path('payment').schema.path('refund.status').enumValues;

test('partial refund status', async (t) => {
    await t.test("'partial' is a distinct value from 'processed'", () => {
        const values = refundStatusEnum();
        assert.ok(values.includes('partial'), `expected 'partial' in ${values.join(', ')}`);
        assert.ok(values.includes('processed'));
        assert.notEqual('partial', 'processed');
    });

    await t.test('the pre-existing values all survive', () => {
        const values = refundStatusEnum();
        for (const legacy of ['none', 'pending', 'processed', 'failed']) {
            assert.ok(values.includes(legacy), `${legacy} must still be accepted`);
        }
    });

    await t.test('a partly refunded order still validates as paid', () => {
        // The status staying 'paid' is what keeps it in the admin's paid filter and in
        // the seller's payable list while it is still being delivered.
        const order = new FoodOrder({
            userId: '64b7f1c2a1b2c3d4e5f60001',
            restaurantId: '64b7f1c2a1b2c3d4e5f60002',
            items: [{ itemId: 'x', name: 'Atta', price: 100, quantity: 2 }],
            payment: {
                method: 'wallet',
                status: 'paid',
                refund: { status: 'partial', amount: 120 }
            }
        });
        const err = order.validateSync();
        assert.equal(err?.errors?.['payment.refund.status'], undefined);
        assert.equal(order.payment.status, 'paid');
    });
});

test('order line fulfilment fields', async (t) => {
    const itemSchema = () => FoodOrder.schema.path('items').schema;

    await t.test('fulfilledQty defaults to null, not zero', () => {
        // null means "not reported yet" and 0 means "the seller found none". Defaulting
        // to 0 would read as every existing order having been short-picked entirely.
        assert.equal(itemSchema().path('fulfilledQty').defaultValue, null);
    });

    await t.test('quantity still records what the customer ordered', () => {
        const path = itemSchema().path('quantity');
        assert.equal(path.isRequired, true);
        assert.equal(path.options.min, 1);
    });

    await t.test('pickStatus starts pending and covers the reportable outcomes', () => {
        const path = itemSchema().path('pickStatus');
        assert.equal(path.defaultValue, 'pending');
        assert.deepEqual(path.enumValues, ['pending', 'picked', 'short', 'unavailable']);
    });
});

test('fulfilment record', async (t) => {
    await t.test('reportedAt defaults to null so the idempotency claim is unset', () => {
        // reportPickShortfall refuses to run twice by checking this field, so it must
        // start empty or no seller could ever report at all.
        assert.equal(FoodOrder.schema.path('fulfilment.reportedAt').defaultValue, null);
    });

    await t.test('keeps the original total for reconciliation', () => {
        assert.ok(FoodOrder.schema.path('fulfilment.originalTotal'));
        assert.ok(FoodOrder.schema.path('fulfilment.refundAmount'));
    });
});
