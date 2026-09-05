import test from 'node:test';
import assert from 'node:assert/strict';

import { startTestDb, stopTestDb, clearDb, ensureIndexes, oid, near } from './harness.js';
import { FoodRestaurant } from '../../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodItem } from '../../src/modules/food/admin/models/food.model.js';
import { FoodOrder } from '../../src/modules/food/orders/models/order.model.js';
import { FoodOrderReturn } from '../../src/modules/food/orders/models/orderReturn.model.js';
import { FoodUserWallet } from '../../src/modules/food/user/models/userWallet.model.js';
import {
    requestReturn,
    decideReturn,
    markReturnCollected,
} from '../../src/modules/food/orders/services/returns.service.js';

/**
 * Returns end to end.
 *
 * This is the one path where money leaves the business after an order has already
 * completed successfully, so what matters is everything the unit tests cannot see:
 * that the refund is actually written, that it is written once, and that a rejected
 * request frees the units it was holding.
 */

test('returns against a real database', async (t) => {
    await startTestDb();
    await ensureIndexes(FoodRestaurant, FoodItem, FoodOrder, FoodOrderReturn, FoodUserWallet);
    t.after(async () => { await stopTestDb(); });

    const setup = async ({ isReturnable = true, deliveredHoursAgo = 1, paymentMethod = 'cash' } = {}) => {
        await clearDb();
        const userId = oid();
        const store = await FoodRestaurant.create({
            restaurantName: 'Hub', ownerName: 'A', ownerEmail: 'a@b.co', ownerPhone: '9000000004',
            status: 'approved', storeType: 'dark_store', location: near(0, 0),
        });
        const product = await FoodItem.create({
            restaurantId: store._id, name: 'Amul Butter', price: 100,
            approvalStatus: 'approved', isReturnable, returnWindowHours: null,
        });
        const order = await FoodOrder.create({
            userId, restaurantId: store._id,
            items: [{ itemId: String(product._id), name: 'Amul Butter', price: 100, quantity: 3 }],
            pricing: { subtotal: 300, tax: 0, discount: 0, total: 330, deliveryFee: 30, currency: 'INR' },
            deliveryAddress: { street: '1 Main', city: 'Indore', state: 'MP', location: near(1) },
            payment: { method: paymentMethod, status: paymentMethod === 'cash' ? 'cod_pending' : 'paid', amountDue: 330 },
            orderStatus: 'delivered',
            deliveryState: { deliveredAt: new Date(Date.now() - deliveredHoursAgo * 3600_000) },
        });
        return { userId, store, product, order };
    };

    await t.test('a request records the refund computed from the receipt', async () => {
        const { userId, order } = await setup();
        const ret = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 2, reason: 'damaged' },
        ]);

        assert.equal(ret.status, 'requested');
        assert.equal(ret.refundAmount, 200, 'two units at the price actually charged');
        assert.equal(await FoodOrderReturn.countDocuments({}), 1);
    });

    await t.test('the refund is scaled by the discount the basket got', async () => {
        // Refunding list price on a couponed order hands back more than was paid.
        const { userId, order } = await setup();
        await FoodOrder.updateOne({ _id: order._id }, { $set: { 'pricing.discount': 75 } });

        const ret = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 1, reason: 'quality' },
        ]);
        assert.equal(ret.refundAmount, 75, '75% of the basket was actually paid for');
    });

    await t.test('cannot return more than was delivered', async () => {
        const { userId, order } = await setup();
        await assert.rejects(
            () => requestReturn(String(userId), String(order._id), [
                { itemIndex: 0, quantity: 9, reason: 'quality' },
            ]),
            /at most 3/,
        );
    });

    await t.test('cannot return the same units twice', async () => {
        const { userId, order } = await setup();
        await requestReturn(String(userId), String(order._id), [{ itemIndex: 0, quantity: 3, reason: 'quality' }]);
        await assert.rejects(
            () => requestReturn(String(userId), String(order._id), [{ itemIndex: 0, quantity: 1, reason: 'quality' }]),
            /already been returned/,
        );
    });

    await t.test('a rejected return frees the units it was holding', async () => {
        const { userId, order } = await setup();
        const first = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 3, reason: 'quality' },
        ]);
        await decideReturn(String(first._id), String(oid()), { approve: false, rejectionReason: 'no fault found' });

        // Rejected, so the units are available to request again.
        const second = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 3, reason: 'damaged' },
        ]);
        assert.equal(second.status, 'requested');
    });

    await t.test('a non-returnable product is refused for a change of mind', async () => {
        const { userId, order } = await setup({ isReturnable: false });
        await assert.rejects(
            () => requestReturn(String(userId), String(order._id), [
                { itemIndex: 0, quantity: 1, reason: 'not_needed' },
            ]),
            /cannot be returned/,
        );
    });

    await t.test('but accepted when it arrived damaged, and refunded without collection', async () => {
        // Nobody carries a leaking bottle back, so approval refunds immediately.
        const { userId, order } = await setup({ isReturnable: false, paymentMethod: 'wallet' });
        const ret = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 1, reason: 'damaged' },
        ]);
        const decided = await decideReturn(String(ret._id), String(oid()), { approve: true });

        assert.equal(decided.status, 'refunded');
        assert.ok(decided.refundedAt);

        const wallet = await FoodUserWallet.findOne({ userId }).lean();
        assert.equal(wallet.balance, 100, 'the money actually moved');
    });

    await t.test('a returnable product waits for collection before refunding', async () => {
        const { userId, order } = await setup({ paymentMethod: 'wallet' });
        const ret = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 1, reason: 'not_needed' },
        ]);
        const decided = await decideReturn(String(ret._id), String(oid()), { approve: true });
        assert.equal(decided.status, 'approved', 'approved, not yet paid');
        assert.equal(await FoodUserWallet.countDocuments({ userId }), 0, 'nothing refunded on trust');

        const collected = await markReturnCollected(String(ret._id));
        assert.equal(collected.status, 'refunded');
        const wallet = await FoodUserWallet.findOne({ userId }).lean();
        assert.equal(wallet.balance, 100);
    });

    await t.test('two admins approving at once refund only once', async () => {
        const { userId, order } = await setup({ isReturnable: false, paymentMethod: 'wallet' });
        const ret = await requestReturn(String(userId), String(order._id), [
            { itemIndex: 0, quantity: 2, reason: 'expired' },
        ]);

        const results = await Promise.allSettled([
            decideReturn(String(ret._id), String(oid()), { approve: true }),
            decideReturn(String(ret._id), String(oid()), { approve: true }),
            decideReturn(String(ret._id), String(oid()), { approve: true }),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'one decision');

        const wallet = await FoodUserWallet.findOne({ userId }).lean();
        assert.equal(wallet.balance, 200, 'and the customer is paid exactly once');
    });

    await t.test('an order that was never delivered cannot be returned', async () => {
        const { userId, order } = await setup();
        await FoodOrder.updateOne({ _id: order._id }, { $set: { orderStatus: 'picked_up' } });
        await assert.rejects(
            () => requestReturn(String(userId), String(order._id), [
                { itemIndex: 0, quantity: 1, reason: 'quality' },
            ]),
            /Only delivered orders/,
        );
    });

    await t.test('a customer cannot return somebody else\'s order', async () => {
        const { order } = await setup();
        await assert.rejects(
            () => requestReturn(String(oid()), String(order._id), [
                { itemIndex: 0, quantity: 1, reason: 'quality' },
            ]),
            /Not your order/,
        );
    });
});
