import test from 'node:test';
import assert from 'node:assert/strict';

import { startTestDb, stopTestDb, clearDb, oid } from './harness.js';
import { FoodItem } from '../../src/modules/food/admin/models/food.model.js';
import {
    reserveStockForItems,
    releaseReservations,
} from '../../src/modules/food/orders/services/inventory.service.js';

/**
 * Stock reservation against a real MongoDB.
 *
 * The unit tests cover the control flow with the model stubbed out. What they cannot
 * cover is the only thing that actually prevents an oversell: whether the conditional
 * update is genuinely atomic on the server. That is a claim about Mongo, and the only
 * way to test a claim about Mongo is to ask Mongo.
 */

test('inventory against a real database', async (t) => {
    await startTestDb();
    t.after(async () => { await stopTestDb(); });

    const storeId = oid();
    const makeItem = async (over = {}) =>
        FoodItem.create({
            restaurantId: storeId,
            name: 'Amul Butter',
            price: 60,
            approvalStatus: 'approved',
            ...over,
        });

    await t.test('claims units and leaves the count correct', async () => {
        await clearDb();
        const item = await makeItem({ stockQty: 10 });

        const taken = await reserveStockForItems([{ itemId: String(item._id), quantity: 3 }]);
        assert.deepEqual(taken, [{ itemId: String(item._id), qty: 3 }]);

        const after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, 7);
    });

    await t.test('two concurrent orders cannot both take the last unit', async () => {
        // THE test. Ten orders race for one unit; exactly one may win. If the check
        // and the write were ever separated -- a read, a compare, then a save -- most
        // of these would pass their check against the same stale 1 and the count
        // would go deeply negative.
        await clearDb();
        const item = await makeItem({ stockQty: 1 });

        const attempts = Array.from({ length: 10 }, () =>
            reserveStockForItems([{ itemId: String(item._id), quantity: 1 }])
                .then(() => 'won')
                .catch(() => 'lost'),
        );
        const results = await Promise.all(attempts);

        assert.equal(results.filter((r) => r === 'won').length, 1, 'exactly one winner');
        assert.equal(results.filter((r) => r === 'lost').length, 9);

        const after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, 0, 'and the shelf is never oversold');
    });

    await t.test('hides a product once it runs out, and brings it back on restock', async () => {
        await clearDb();
        const item = await makeItem({ stockQty: 2, isAvailable: true });

        await reserveStockForItems([{ itemId: String(item._id), quantity: 2 }]);
        let after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, 0);
        assert.equal(after.isAvailable, false, 'an empty shelf stops being listed');

        await releaseReservations([{ itemId: String(item._id), qty: 2 }]);
        after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, 2);
        assert.equal(after.isAvailable, true, 'and comes back when restocked');
    });

    await t.test('a restock does not override a seller who switched it off by hand', async () => {
        await clearDb();
        const item = await makeItem({ stockQty: 0, isAvailable: false, stockOffMode: 'manual' });

        await releaseReservations([{ itemId: String(item._id), qty: 5 }]);
        const after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, 5, 'the units come back');
        assert.equal(after.isAvailable, false, 'but the seller\'s decision stands');
    });

    await t.test('an untracked product is never decremented', async () => {
        await clearDb();
        const item = await makeItem({ stockQty: null });

        const taken = await reserveStockForItems([{ itemId: String(item._id), quantity: 99 }]);
        assert.deepEqual(taken, [], 'nothing was claimed');

        const after = await FoodItem.findById(item._id).lean();
        assert.equal(after.stockQty, null, 'null must never become a number');
    });

    await t.test('a short line puts back everything already taken', async () => {
        await clearDb();
        const plenty = await makeItem({ name: 'Atta', stockQty: 10 });
        const scarce = await makeItem({ name: 'Bread', stockQty: 1 });

        await assert.rejects(
            () => reserveStockForItems([
                { itemId: String(plenty._id), quantity: 4 },
                { itemId: String(scarce._id), quantity: 5 },
            ]),
            /Only 1 left of Bread/,
        );

        assert.equal((await FoodItem.findById(plenty._id).lean()).stockQty, 10, 'restored');
        assert.equal((await FoodItem.findById(scarce._id).lean()).stockQty, 1, 'untouched');
    });

    await t.test('two packs of one product draw down separate shelves', async () => {
        // Per-variant stock. Buying every 500 g must leave the 1 kg untouched and
        // still sellable -- summing them into one count oversells whichever pack the
        // customer actually chose.
        await clearDb();
        const item = await makeItem({
            stockQty: null,
            variants: [
                { name: '500 g', price: 60, stockQty: 2 },
                { name: '1 kg', price: 110, stockQty: 5 },
            ],
        });
        const [small, large] = item.variants;

        await reserveStockForItems([
            { itemId: String(item._id), variantId: String(small._id), variantTracked: true, quantity: 2 },
        ]);

        const after = await FoodItem.findById(item._id).lean();
        assert.equal(after.variants[0].stockQty, 0, '500 g is spent');
        assert.equal(after.variants[1].stockQty, 5, '1 kg is untouched');
        assert.equal(after.isAvailable, true, 'and the product stays listed');

        await assert.rejects(
            () => reserveStockForItems([
                { itemId: String(item._id), variantId: String(small._id), variantTracked: true, quantity: 1 },
            ]),
            /500 g/,
            'and names the pack that ran out, not just the product',
        );

        // The other pack is still buyable.
        const ok = await reserveStockForItems([
            { itemId: String(item._id), variantId: String(large._id), variantTracked: true, quantity: 1 },
        ]);
        assert.equal(ok.length, 1);
        assert.equal((await FoodItem.findById(item._id).lean()).variants[1].stockQty, 4);
    });

    await t.test('concurrent orders for one pack cannot oversell it either', async () => {
        await clearDb();
        const item = await makeItem({
            stockQty: null,
            variants: [{ name: '500 g', price: 60, stockQty: 1 }],
        });
        const variantId = String(item.variants[0]._id);

        const results = await Promise.all(
            Array.from({ length: 8 }, () =>
                reserveStockForItems([
                    { itemId: String(item._id), variantId, variantTracked: true, quantity: 1 },
                ]).then(() => 'won').catch(() => 'lost'),
            ),
        );

        assert.equal(results.filter((r) => r === 'won').length, 1);
        assert.equal((await FoodItem.findById(item._id).lean()).variants[0].stockQty, 0);
    });
});
