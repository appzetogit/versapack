import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import {
    totalQuantityByItem,
    reserveStockForItems,
    restoreOrderStock,
    releaseUnfulfilledStock,
    stockKeyFor,
    parseStockKey
} from '../src/modules/food/orders/services/inventory.service.js';

/**
 * Stock reservation without a database.
 *
 * ESM gives every importer the same model object, so replacing a method here is
 * seen by inventory.service.js. That buys coverage of the branch that actually
 * matters — what happens to units already claimed when a later line comes up
 * short — which is where a bug silently invents or destroys inventory. It does
 * NOT cover the atomicity of the conditional update itself; that is Mongo's
 * guarantee and needs a real server to test.
 */

const oid = () => new mongoose.Types.ObjectId().toString();

/** Minimal stand-in for `findById(id).select(...).lean()`. */
const thenable = (value) => ({
    select() { return this; },
    lean: async () => value
});

function withStubbedItem({ stock }, run) {
    const realUpdateOne = FoodItem.updateOne;
    const realFindById = FoodItem.findById;

    // Every $inc the service issues is applied to this map, so assertions can read
    // the net effect rather than replaying a call log.
    const calls = [];

    FoodItem.updateOne = async (filter, update) => {
        const id = String(filter._id);
        calls.push({ filter, update });

        if (update?.$inc?.stockQty !== undefined) {
            const delta = update.$inc.stockQty;
            const current = stock[id];

            if (filter.stockQty?.$gte !== undefined) {
                // The reserve path: only matches when there is enough on hand, and
                // never matches null, exactly as `$gte` behaves in Mongo.
                if (current === null || current === undefined || current < filter.stockQty.$gte) {
                    return { modifiedCount: 0, matchedCount: 0 };
                }
            }
            if (filter.stockQty?.$ne === null) {
                // The restock path: untracked items are skipped.
                if (current === null || current === undefined) {
                    return { modifiedCount: 0, matchedCount: 0 };
                }
            }
            stock[id] = current + delta;
            return { modifiedCount: 1, matchedCount: 1 };
        }
        return { modifiedCount: 0, matchedCount: 0 };
    };

    FoodItem.findById = (id) => {
        const key = String(id);
        if (!(key in stock)) return thenable(null);
        return thenable({ _id: key, name: `item-${key.slice(-4)}`, stockQty: stock[key] });
    };

    return Promise.resolve(run({ calls }))
        .finally(() => {
            FoodItem.updateOne = realUpdateOne;
            FoodItem.findById = realFindById;
        });
}

test('totalQuantityByItem', async (t) => {
    await t.test('sums the same product across separate lines', () => {
        const a = oid();
        const totals = totalQuantityByItem([
            { itemId: a, quantity: 2 },
            { itemId: a, quantity: 3 }
        ]);
        // Two variants of one product draw down one shelf.
        assert.equal(totals.get(a), 5);
    });

    await t.test('ignores lines with no usable id', () => {
        const totals = totalQuantityByItem([
            { itemId: '', quantity: 2 },
            { itemId: 'not-an-objectid', quantity: 2 },
            { quantity: 2 }
        ]);
        assert.equal(totals.size, 0);
    });

    await t.test('treats a missing or bad quantity as one unit, never zero', () => {
        const a = oid();
        assert.equal(totalQuantityByItem([{ itemId: a }]).get(a), 1);
        assert.equal(totalQuantityByItem([{ itemId: a, quantity: 0 }]).get(a), 1);
        assert.equal(totalQuantityByItem([{ itemId: a, quantity: -5 }]).get(a), 1);
    });
});

test('reserveStockForItems', async (t) => {
    await t.test('claims units for a tracked product', async () => {
        const a = oid();
        const stock = { [a]: 10 };
        await withStubbedItem({ stock }, async () => {
            const taken = await reserveStockForItems([{ itemId: a, quantity: 3 }]);
            assert.deepEqual(taken, [{ itemId: a, qty: 3 }]);
            assert.equal(stock[a], 7);
        });
    });

    await t.test('lets an untracked product through without decrementing', async () => {
        const a = oid();
        const stock = { [a]: null };
        await withStubbedItem({ stock }, async () => {
            const taken = await reserveStockForItems([{ itemId: a, quantity: 3 }]);
            assert.deepEqual(taken, [], 'nothing was claimed');
            assert.equal(stock[a], null, 'null must never be decremented into a number');
        });
    });

    await t.test('puts back everything already claimed when a later line is short', async () => {
        // The whole point of the rollback: a rejected order must leave the shelf
        // exactly as it found it, not half-consumed by the lines that succeeded.
        const a = oid();
        const b = oid();
        const stock = { [a]: 10, [b]: 1 };

        await withStubbedItem({ stock }, async () => {
            await assert.rejects(
                () => reserveStockForItems([
                    { itemId: a, quantity: 4 },
                    { itemId: b, quantity: 5 }
                ]),
                /Only 1 left of/
            );
            assert.equal(stock[a], 10, 'the first line was restored');
            assert.equal(stock[b], 1, 'the short line was never touched');
        });
    });

    await t.test('names the product that ran out, so the cart can highlight it', async () => {
        const a = oid();
        const stock = { [a]: 0 };
        await withStubbedItem({ stock }, async () => {
            await assert.rejects(
                () => reserveStockForItems([{ itemId: a, quantity: 1 }]),
                /just went out of stock/
            );
        });
    });

    await t.test('rejects a product that no longer exists', async () => {
        const a = oid();
        await withStubbedItem({ stock: {} }, async () => {
            await assert.rejects(
                () => reserveStockForItems([{ itemId: a, quantity: 1 }]),
                /no longer available/
            );
        });
    });

    await t.test('claims the summed quantity when one product spans two lines', async () => {
        const a = oid();
        const stock = { [a]: 4 };
        await withStubbedItem({ stock }, async () => {
            // 3 + 2 = 5 against 4 on hand must fail as one claim, not succeed twice.
            await assert.rejects(
                () => reserveStockForItems([
                    { itemId: a, quantity: 3 },
                    { itemId: a, quantity: 2 }
                ]),
                /Only 4 left of/
            );
            assert.equal(stock[a], 4);
        });
    });

    await t.test('an empty basket claims nothing', async () => {
        await withStubbedItem({ stock: {} }, async () => {
            assert.deepEqual(await reserveStockForItems([]), []);
        });
    });
});

test('restoreOrderStock', async (t) => {
    const withStubbedOrder = (claimResult, run) => {
        const real = FoodOrder.findOneAndUpdate;
        let filterSeen = null;
        FoodOrder.findOneAndUpdate = (filter) => {
            filterSeen = filter;
            return thenable(claimResult);
        };
        return Promise.resolve(run(() => filterSeen)).finally(() => {
            FoodOrder.findOneAndUpdate = real;
        });
    };

    await t.test('does nothing for an order that never reserved', async () => {
        assert.equal(await restoreOrderStock({ _id: oid() }), false);
        assert.equal(await restoreOrderStock(null), false);
    });

    await t.test('returns units to the shelf exactly once', async () => {
        const a = oid();
        const orderId = oid();
        const stock = { [a]: 2 };

        await withStubbedItem({ stock }, async () => {
            // First call wins the claim on stockRestoredAt.
            await withStubbedOrder({ items: [{ itemId: a, quantity: 3 }] }, async (getFilter) => {
                assert.equal(
                    await restoreOrderStock({ _id: orderId, stockReservedAt: new Date() }),
                    true
                );
                assert.equal(stock[a], 5);
                // The guard that makes a double restock impossible.
                assert.equal(getFilter().stockRestoredAt, null);
            });

            // Second call loses the claim and must not restock again.
            await withStubbedOrder(null, async () => {
                assert.equal(
                    await restoreOrderStock({ _id: orderId, stockReservedAt: new Date() }),
                    false
                );
                assert.equal(stock[a], 5, 'a second restore must not invent inventory');
            });
        });
    });
});

test('partial fulfilment stock', async (t) => {
    await t.test('returns only the units the seller could not find', async () => {
        const a = oid();
        const b = oid();
        const stock = { [a]: 0, [b]: 5 };

        await withStubbedItem({ stock }, async () => {
            // Ordered 3 and 2; picked 1 and 2. Only the two missing 'a' come back.
            await releaseUnfulfilledStock(
                [{ itemId: a, quantity: 3 }, { itemId: b, quantity: 2 }],
                [1, 2]
            );
            assert.equal(stock[a], 2, 'the shortfall went back on the shelf');
            assert.equal(stock[b], 5, 'a fully picked line is untouched');
        });
    });

    await t.test('a line picked to zero returns the whole quantity', async () => {
        const a = oid();
        const stock = { [a]: 0 };
        await withStubbedItem({ stock }, async () => {
            await releaseUnfulfilledStock([{ itemId: a, quantity: 4 }], [0]);
            assert.equal(stock[a], 4);
        });
    });

    await t.test('an unreported line is treated as fully picked and returns nothing', async () => {
        const a = oid();
        const stock = { [a]: 7 };
        await withStubbedItem({ stock }, async () => {
            await releaseUnfulfilledStock([{ itemId: a, quantity: 2 }], []);
            assert.equal(stock[a], 7);
        });
    });

    await t.test('a seller cannot restock more than was ordered', async () => {
        const a = oid();
        const stock = { [a]: 1 };
        await withStubbedItem({ stock }, async () => {
            // Claiming -5 picked would otherwise return more units than existed.
            await releaseUnfulfilledStock([{ itemId: a, quantity: 2 }], [-5]);
            assert.equal(stock[a], 3, 'clamped to the ordered quantity');
        });
    });

    await t.test('untracked products are never incremented into a number', async () => {
        const a = oid();
        const stock = { [a]: null };
        await withStubbedItem({ stock }, async () => {
            await releaseUnfulfilledStock([{ itemId: a, quantity: 3 }], [0]);
            assert.equal(stock[a], null);
        });
    });

    await t.test('a later cancellation restocks what was picked, not what was ordered', () => {
        // This is the trap partial fulfilment introduces: the shortfall is already
        // back on the shelf, so cancelling afterwards must return only the units the
        // order still holds, or the difference is invented out of nothing.
        const a = oid();
        const totals = totalQuantityByItem([{ itemId: a, quantity: 5, fulfilledQty: 2 }]);
        assert.equal(totals.get(a), 2);
    });

    await t.test('a line picked to zero holds nothing to give back', () => {
        const a = oid();
        const totals = totalQuantityByItem([{ itemId: a, quantity: 5, fulfilledQty: 0 }]);
        assert.equal(totals.size, 0, 'and must not be floored up to one unit');
    });

    await t.test('an order still being picked falls back to the ordered quantity', () => {
        // null means "not reported yet", which is every order placed before this
        // feature existed. Those must behave exactly as they always did.
        const a = oid();
        assert.equal(totalQuantityByItem([{ itemId: a, quantity: 5, fulfilledQty: null }]).get(a), 5);
        assert.equal(totalQuantityByItem([{ itemId: a, quantity: 5 }]).get(a), 5);
    });
});

test('per-variant stock keys', async (t) => {
    const a = oid();

    await t.test('a variant with its own count gets its own shelf', () => {
        // 500 g and 1 kg are different packs that run out independently. Folding
        // them into one count oversells whichever the customer actually wanted.
        const key = stockKeyFor({ itemId: a, variantId: 'v1' }, true);
        assert.equal(key, `${a}::v1`);
        assert.deepEqual(parseStockKey(key), { itemId: a, variantId: 'v1' });
    });

    await t.test('a variant without its own count folds into the product', () => {
        // Half and full plate come off the same pot -- the old behaviour, and what
        // every product that predates per-variant counts still does.
        assert.equal(stockKeyFor({ itemId: a, variantId: 'v1' }, false), a);
        assert.equal(stockKeyFor({ itemId: a }, true), a, 'no variant on the line');
    });

    await t.test('an unusable item id has no shelf at all', () => {
        assert.equal(stockKeyFor({ itemId: '', variantId: 'v1' }, true), null);
        assert.equal(stockKeyFor({ itemId: 'not-an-id' }, false), null);
    });

    await t.test('two packs of one product are counted separately', () => {
        const totals = totalQuantityByItem([
            { itemId: a, variantId: 'v500', variantTracked: true, quantity: 2 },
            { itemId: a, variantId: 'v1kg', variantTracked: true, quantity: 3 },
        ]);
        assert.equal(totals.size, 2, 'two shelves, not one');
        assert.equal(totals.get(`${a}::v500`), 2);
        assert.equal(totals.get(`${a}::v1kg`), 3);
    });

    await t.test('untracked variants still sum into the product, as before', () => {
        const totals = totalQuantityByItem([
            { itemId: a, variantId: 'half', quantity: 2 },
            { itemId: a, variantId: 'full', quantity: 3 },
        ]);
        assert.equal(totals.size, 1);
        assert.equal(totals.get(a), 5);
    });

    await t.test('a shortfall goes back to the shelf it came off', () => {
        // Returning a short-picked 500 g pack into the 1 kg count would invent
        // inventory on one shelf and lose it on the other.
        const totals = totalQuantityByItem([
            { itemId: a, variantId: 'v500', variantTracked: true, quantity: 5, fulfilledQty: 2 },
        ]);
        assert.equal(totals.get(`${a}::v500`), 2);
        assert.equal(totals.get(a), undefined);
    });
});
