import test from 'node:test';
import assert from 'node:assert/strict';

import { startTestDb, stopTestDb, clearDb, ensureIndexes, oid, near } from './harness.js';
import { FoodRestaurant } from '../../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodItem } from '../../src/modules/food/admin/models/food.model.js';
import { FoodOrder } from '../../src/modules/food/orders/models/order.model.js';
import { FoodDeliveryBatch } from '../../src/modules/food/orders/models/deliveryBatch.model.js';
import { reportPickShortfall } from '../../src/modules/food/orders/services/order.service.js';
import {
    placeOrderInBatch,
    listBatchesReadyToDispatch,
    assignBatchToPartner,
    markBatchDropDelivered,
} from '../../src/modules/food/orders/services/batching.service.js';

/**
 * Partial fulfilment and batching, end to end against a real database.
 *
 * Both are multi-document flows whose correctness lives in what the database ends up
 * holding -- a refund written, stock returned to the right shelf, a batch claimed by
 * exactly one writer. None of that is observable from a stubbed model.
 */

const money = (over = {}) => ({
    subtotal: 400, tax: 46, packagingFee: 0, deliveryFee: 30, deliveryFeeGst: 5,
    platformFee: 5, discount: 0, total: 486, currency: 'INR', ...over,
});

test('order flows against a real database', async (t) => {
    await startTestDb();
    await ensureIndexes(FoodRestaurant, FoodItem, FoodOrder, FoodDeliveryBatch);
    t.after(async () => { await stopTestDb(); });

    const makeStore = (over = {}) =>
        FoodRestaurant.create({
            restaurantName: 'Hub North',
            ownerName: 'A', ownerEmail: 'a@b.co', ownerPhone: '9000000002',
            status: 'approved', storeType: 'dark_store', serviceRadiusKm: 3,
            isAcceptingOrders: true, location: near(0, 0), ...over,
        });

    const makeOrder = (storeId, over = {}) =>
        FoodOrder.create({
            userId: oid(),
            restaurantId: storeId,
            items: [
                { itemId: String(oid()), name: 'Atta 5 kg', price: 100, quantity: 2, gstRate: 5 },
                { itemId: String(oid()), name: 'Biscuits', price: 200, quantity: 1, gstRate: 18 },
            ],
            pricing: money(),
            deliveryAddress: {
                street: '1 Main Rd', city: 'Indore', state: 'MP', location: near(1),
            },
            payment: { method: 'cash', status: 'cod_pending', amountDue: 486 },
            orderStatus: 'confirmed',
            ...over,
        });

    // ── Partial fulfilment ───────────────────────────────────────────────────

    await t.test('short-picking reprices the order and returns the units', async () => {
        await clearDb();
        const store = await makeStore();
        const item = await FoodItem.create({
            restaurantId: store._id, name: 'Biscuits', price: 200,
            approvalStatus: 'approved', stockQty: 3,
        });
        const order = await makeOrder(store._id, { stockReservedAt: new Date() });
        order.items[1].itemId = String(item._id);
        await order.save();

        // The seller finds no biscuits.
        await reportPickShortfall(String(order._id), String(store._id), [
            { index: 1, fulfilledQty: 0 },
        ]);

        const after = await FoodOrder.findById(order._id).lean();
        assert.equal(after.items[0].fulfilledQty, 2, 'the picked line is untouched');
        assert.equal(after.items[1].fulfilledQty, 0);
        assert.equal(after.items[1].pickStatus, 'unavailable');
        assert.equal(after.pricing.subtotal, 200, 'repriced to what was picked');
        assert.ok(after.pricing.total < 486);
        assert.equal(after.fulfilment.refundAmount, 236);
        assert.equal(after.pricing.deliveryFee, 30, 'fees never move');
        assert.equal(after.payment.amountDue, after.pricing.total, 'cash collects less');

        const restocked = await FoodItem.findById(item._id).lean();
        assert.equal(restocked.stockQty, 4, 'the unpicked unit went back on the shelf');
    });

    await t.test('a second report on the same order is refused', async () => {
        // fulfilment.reportedAt is the claim that stops a double refund.
        await clearDb();
        const store = await makeStore();
        const order = await makeOrder(store._id);
        await reportPickShortfall(String(order._id), String(store._id), [{ index: 1, fulfilledQty: 0 }]);

        await assert.rejects(
            () => reportPickShortfall(String(order._id), String(store._id), [{ index: 0, fulfilledQty: 0 }]),
            /already reported/,
        );
        const after = await FoodOrder.findById(order._id).lean();
        assert.equal(after.items[0].fulfilledQty, 2, 'the second report changed nothing');
    });

    await t.test('picking nothing cancels the order rather than billing for a trip', async () => {
        await clearDb();
        const store = await makeStore();
        const order = await makeOrder(store._id);

        await reportPickShortfall(String(order._id), String(store._id), [
            { index: 0, fulfilledQty: 0 }, { index: 1, fulfilledQty: 0 },
        ]);

        const after = await FoodOrder.findById(order._id).lean();
        assert.equal(after.orderStatus, 'cancelled_by_restaurant');
    });

    await t.test('a seller cannot report on an order that is not theirs', async () => {
        await clearDb();
        const mine = await makeStore();
        const theirs = await makeStore({ restaurantName: 'Other', ownerPhone: '9000000003' });
        const order = await makeOrder(mine._id);

        await assert.rejects(
            () => reportPickShortfall(String(order._id), String(theirs._id), [{ index: 0, fulfilledQty: 1 }]),
            /not found/i,
        );
    });

    await t.test('a delivered order can no longer be re-picked', async () => {
        await clearDb();
        const store = await makeStore();
        const order = await makeOrder(store._id, { orderStatus: 'picked_up' });
        await assert.rejects(
            () => reportPickShortfall(String(order._id), String(store._id), [{ index: 0, fulfilledQty: 1 }]),
            /no longer be re-picked/,
        );
    });

    // ── Batching ─────────────────────────────────────────────────────────────

    await t.test('a nearby order joins an open batch instead of starting its own', async () => {
        await clearDb();
        const store = await makeStore();
        const a = await makeOrder(store._id, { pricing: money({ deliveryPromiseMinutes: 30 }) });
        const b = await makeOrder(store._id, { pricing: money({ deliveryPromiseMinutes: 30 }) });

        const first = await placeOrderInBatch(a._id);
        assert.equal(first.joined, false, 'the first order opens a batch');

        const second = await placeOrderInBatch(b._id);
        assert.equal(second.joined, true, 'the second joins it');
        assert.equal(second.batch.orders.length, 2);

        assert.equal(await FoodDeliveryBatch.countDocuments({}), 1, 'one trip, not two');
    });

    await t.test('a marketplace seller is never batched', async () => {
        // Their pickups are at different shops; there is no shared trip.
        await clearDb();
        const store = await makeStore({ storeType: 'marketplace_seller' });
        const order = await makeOrder(store._id);
        assert.equal(await placeOrderInBatch(order._id), null);
        assert.equal(await FoodDeliveryBatch.countDocuments({}), 0);
    });

    await t.test('an order whose promise cannot survive the detour starts its own batch', async () => {
        await clearDb();
        const store = await makeStore();
        // Placed nine minutes ago on a ten-minute promise: no slack at all.
        const tight = await makeOrder(store._id, {
            createdAt: new Date(Date.now() - 9 * 60_000),
            pricing: money({ deliveryPromiseMinutes: 10 }),
            deliveryAddress: { street: 'a', city: 'Indore', state: 'MP', location: near(0.5) },
        });
        const faraway = await makeOrder(store._id, {
            pricing: money({ deliveryPromiseMinutes: 45 }),
            deliveryAddress: { street: 'b', city: 'Indore', state: 'MP', location: near(12) },
        });

        await placeOrderInBatch(tight._id);
        const second = await placeOrderInBatch(faraway._id);

        assert.equal(second.joined, false, 'refused rather than making the first order late');
        assert.equal(await FoodDeliveryBatch.countDocuments({}), 2, 'two trips');
    });

    await t.test('concurrent orders cannot both overfill one batch', async () => {
        await clearDb();
        const store = await makeStore();
        const orders = await Promise.all(
            Array.from({ length: 6 }, () =>
                makeOrder(store._id, { pricing: money({ deliveryPromiseMinutes: 60 }) })),
        );

        await Promise.all(orders.map((o) => placeOrderInBatch(o._id)));

        const batches = await FoodDeliveryBatch.find({}).lean();
        const maxSize = Number(process.env.MAX_BATCH_SIZE) || 3;
        for (const b of batches) {
            assert.ok(b.orders.length <= maxSize, `batch of ${b.orders.length} exceeds ${maxSize}`);
        }
        const placed = batches.reduce((n, b) => n + b.orders.length, 0);
        assert.equal(placed, 6, 'and every order landed on exactly one trip');
    });

    await t.test('a batch dispatches once, and completes when the last drop lands', async () => {
        await clearDb();
        const store = await makeStore();
        const orders = await Promise.all([
            makeOrder(store._id, { pricing: money({ deliveryPromiseMinutes: 60 }) }),
            makeOrder(store._id, { pricing: money({ deliveryPromiseMinutes: 60 }) }),
        ]);
        for (const o of orders) await placeOrderInBatch(o._id);

        // Close the window so the sweep can pick it up.
        await FoodDeliveryBatch.updateMany({}, { $set: { closesAt: new Date(Date.now() - 1000) } });
        const ready = await listBatchesReadyToDispatch();
        assert.equal(ready.length, 1);

        const riderId = oid();
        const assigned = await assignBatchToPartner(ready[0]._id, riderId);
        assert.equal(assigned.status, 'dispatched');

        // Every order carries the rider, so existing screens keep working.
        for (const o of orders) {
            const row = await FoodOrder.findById(o._id).lean();
            assert.equal(String(row.dispatch.deliveryPartnerId), String(riderId));
            assert.equal(row.dispatch.status, 'assigned');
        }

        // A second sweep must not hand the same trip to another rider.
        assert.equal(await assignBatchToPartner(ready[0]._id, oid()), null);

        await markBatchDropDelivered(orders[0]._id);
        let batch = await FoodDeliveryBatch.findById(ready[0]._id).lean();
        assert.equal(batch.status, 'dispatched', 'still out with one drop left');

        await markBatchDropDelivered(orders[1]._id);
        batch = await FoodDeliveryBatch.findById(ready[0]._id).lean();
        assert.equal(batch.status, 'completed');
        assert.ok(batch.completedAt);
    });
});
