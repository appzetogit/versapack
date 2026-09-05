import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { rebindCartToServingStore } from '../src/modules/food/user/services/cartStoreRebind.service.js';

/**
 * Moving a basket between dark stores when the delivery address changes.
 *
 * The customer never chose the store, so the rules that matter are about not
 * punishing them for a decision the system made: the basket survives where it can,
 * nothing disappears silently, and an unserviceable address leaves it untouched
 * rather than emptied.
 */

const oid = () => new mongoose.Types.ObjectId().toString();

const STORE_A = oid();
const STORE_B = oid();
const MASTER_MILK = oid();
const MASTER_BREAD = oid();

/** Stubs the two models the service reads, plus the $geoNear aggregate. */
function withCatalogue({ storeFound = true, targetRows = [], sourceRows = [] }, run) {
    const real = {
        aggregate: FoodRestaurant.aggregate,
        find: FoodItem.find,
        itemAggregate: FoodItem.aggregate,
    };

    FoodRestaurant.aggregate = async () =>
        storeFound
            ? [{
                _id: STORE_B,
                restaurantName: 'Hub North',
                distanceMeters: 1200,
                serviceRadiusKm: 3,
                isAcceptingOrders: true,
            }]
            : [];

    // assignStoreForCustomer counts stock only when itemIds are passed; the rebind
    // path passes none, so this is never consulted there.
    FoodItem.aggregate = async () => [{ value: 0 }];

    FoodItem.find = (filter) => {
        const isTargetLookup = Boolean(filter?.restaurantId);
        const rows = isTargetLookup ? targetRows : sourceRows;
        return { select: () => ({ lean: async () => rows }) };
    };

    return Promise.resolve(run()).finally(() => {
        FoodRestaurant.aggregate = real.aggregate;
        FoodItem.find = real.find;
        FoodItem.aggregate = real.itemAggregate;
    });
}

const line = (itemId, over = {}) => ({
    itemId,
    restaurantId: STORE_A,
    name: 'Milk 500ml',
    price: 30,
    quantity: 2,
    ...over,
});

test('rebindCartToServingStore', async (t) => {
    await t.test('an unserviceable address leaves the basket exactly as it was', async () => {
        const cart = [line(oid())];
        await withCatalogue({ storeFound: false }, async () => {
            const out = await rebindCartToServingStore(cart, { lat: 22.7, lng: 75.8 });
            assert.equal(out.serviceable, false);
            assert.equal(out.unchanged, true);
            // Emptying it here would be indefensible: the customer may well pick a
            // different address next.
            assert.deepEqual(out.items, cart);
        });
    });

    await t.test('a basket already at the serving store is left alone', async () => {
        const cart = [line(oid(), { restaurantId: STORE_B })];
        await withCatalogue({}, async () => {
            const out = await rebindCartToServingStore(cart, { lat: 22.7, lng: 75.8 });
            assert.equal(out.unchanged, true);
            assert.deepEqual(out.items, cart);
            assert.equal(out.moved.length, 0);
        });
    });

    await t.test('lines move to the new store, taking its price and its id', async () => {
        const sourceId = oid();
        const targetId = oid();
        await withCatalogue({
            sourceRows: [{ _id: sourceId, masterProductId: MASTER_MILK, name: 'Milk 500ml' }],
            targetRows: [{ _id: targetId, masterProductId: MASTER_MILK, name: 'Milk 500 ml', price: 34, mrp: 36, stockQty: 20, image: 'b.jpg' }],
        }, async () => {
            const out = await rebindCartToServingStore([line(sourceId)], { lat: 22.7, lng: 75.8 });

            assert.equal(out.items.length, 1);
            assert.equal(String(out.items[0].itemId), targetId, 'now the new store\'s row');
            assert.equal(String(out.items[0].restaurantId), STORE_B);
            // Carrying the old price over would show one number and charge another,
            // since checkout reprices from the listing regardless.
            assert.equal(out.items[0].price, 34);
            assert.equal(out.items[0].quantity, 2);
            assert.equal(out.moved.length, 1);
        });
    });

    await t.test('a product the new store does not carry is reported, not dropped', async () => {
        const milk = oid();
        const bread = oid();
        await withCatalogue({
            sourceRows: [
                { _id: milk, masterProductId: MASTER_MILK, name: 'Milk' },
                { _id: bread, masterProductId: MASTER_BREAD, name: 'Bread' },
            ],
            targetRows: [{ _id: oid(), masterProductId: MASTER_MILK, name: 'Milk', price: 34, stockQty: 5 }],
        }, async () => {
            const out = await rebindCartToServingStore(
                [line(milk, { name: 'Milk' }), line(bread, { name: 'Bread' })],
                { lat: 22.7, lng: 75.8 },
            );

            assert.equal(out.items.length, 1, 'milk survives');
            assert.equal(out.unavailable.length, 1);
            assert.equal(out.unavailable[0].name, 'Bread');
            assert.equal(out.unavailable[0].reason, 'not_stocked_here');
        });
    });

    await t.test('a store-specific line says so, rather than looking out of stock', async () => {
        // An unlinked listing exists only at one store by definition, so it could
        // never move. The app needs a different sentence for that than for a stock gap.
        const oneOff = oid();
        await withCatalogue({
            sourceRows: [{ _id: oneOff, masterProductId: null, name: 'Hub North combo' }],
            targetRows: [],
        }, async () => {
            const out = await rebindCartToServingStore([line(oneOff)], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items.length, 0);
            assert.equal(out.unavailable[0].reason, 'store_specific_item');
        });
    });

    await t.test('quantity is clamped to what the new store actually has', async () => {
        const src = oid();
        await withCatalogue({
            sourceRows: [{ _id: src, masterProductId: MASTER_MILK, name: 'Milk' }],
            targetRows: [{ _id: oid(), masterProductId: MASTER_MILK, name: 'Milk', price: 30, stockQty: 1 }],
        }, async () => {
            const out = await rebindCartToServingStore([line(src, { quantity: 5 })], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items[0].quantity, 1, 'cannot carry over more than exists');
            assert.equal(out.moved[0].requestedQty, 5, 'and says what was asked for');
        });
    });

    await t.test('per-order caps at the new store are respected', async () => {
        const src = oid();
        await withCatalogue({
            sourceRows: [{ _id: src, masterProductId: MASTER_MILK, name: 'Milk' }],
            targetRows: [{ _id: oid(), masterProductId: MASTER_MILK, name: 'Milk', price: 30, stockQty: 100, maxQtyPerOrder: 3 }],
        }, async () => {
            const out = await rebindCartToServingStore([line(src, { quantity: 10 })], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items[0].quantity, 3);
        });
    });

    await t.test('an untracked product carries the full quantity', async () => {
        // stockQty null means the store does not count it, which is not zero.
        const src = oid();
        await withCatalogue({
            sourceRows: [{ _id: src, masterProductId: MASTER_MILK, name: 'Milk' }],
            targetRows: [{ _id: oid(), masterProductId: MASTER_MILK, name: 'Milk', price: 30, stockQty: null }],
        }, async () => {
            const out = await rebindCartToServingStore([line(src, { quantity: 4 })], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items[0].quantity, 4);
        });
    });

    await t.test('something out of stock at the new store is reported as that', async () => {
        const src = oid();
        await withCatalogue({
            sourceRows: [{ _id: src, masterProductId: MASTER_MILK, name: 'Milk' }],
            targetRows: [{ _id: oid(), masterProductId: MASTER_MILK, name: 'Milk', price: 30, stockQty: 0 }],
        }, async () => {
            const out = await rebindCartToServingStore([line(src)], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items.length, 0);
            assert.equal(out.unavailable[0].reason, 'out_of_stock_here');
        });
    });

    await t.test('an empty basket is handled without touching the catalogue', async () => {
        await withCatalogue({}, async () => {
            const out = await rebindCartToServingStore([], { lat: 22.7, lng: 75.8 });
            assert.equal(out.items.length, 0);
            assert.equal(out.serviceable, true);
        });
    });
});
