import test from 'node:test';
import assert from 'node:assert/strict';

import { startTestDb, stopTestDb, clearDb, ensureIndexes, oid, near } from './harness.js';
import { FoodRestaurant } from '../../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodItem } from '../../src/modules/food/admin/models/food.model.js';
import { FoodMasterProduct } from '../../src/modules/food/admin/models/masterProduct.model.js';
import {
    findNearbyDarkStores,
    assignStoreForCustomer,
} from '../../src/modules/food/restaurant/services/storeAssignment.service.js';
import { searchProducts } from '../../src/modules/food/search/services/search.service.js';

/**
 * The two aggregation pipelines, against a real MongoDB.
 *
 * Both are things a stub cannot answer. $geoNear does not merely rank differently
 * without its index -- it errors outright, and it silently returns nothing if the
 * coordinates are the wrong way round. The search grouping's correctness is entirely
 * in whether $group, $replaceRoot and the second $sort compose the way they read.
 */

const CUSTOMER = { lat: 22.7196, lng: 75.8577 };

test('store assignment and product search against a real database', async (t) => {
    await startTestDb();
    await ensureIndexes(FoodRestaurant, FoodItem, FoodMasterProduct);
    t.after(async () => { await stopTestDb(); });

    const zoneId = oid();

    const makeStore = (over = {}) =>
        FoodRestaurant.create({
            restaurantName: 'Hub',
            ownerName: 'A', ownerEmail: 'a@b.co', ownerPhone: '9000000001',
            status: 'approved',
            storeType: 'dark_store',
            serviceRadiusKm: 3,
            isAcceptingOrders: true,
            zoneId,
            location: near(0, 0),
            ...over,
        });

    await t.test('finds only dark stores inside their own radius, nearest first', async () => {
        await clearDb();
        await makeStore({ restaurantName: 'Near', location: near(1) });
        await makeStore({ restaurantName: 'Mid', location: near(2) });
        await makeStore({ restaurantName: 'Far', location: near(9) });
        // A marketplace seller next door must never be assigned by distance.
        await makeStore({ restaurantName: 'Marketplace', location: near(0.2), storeType: 'marketplace_seller' });

        const found = await findNearbyDarkStores(CUSTOMER.lat, CUSTOMER.lng);
        assert.deepEqual(found.map((s) => s.restaurantName), ['Near', 'Mid']);
        assert.ok(found[0].distanceKm < found[1].distanceKm, 'nearest first');
    });

    await t.test('a store with a wider radius of its own is still reachable', async () => {
        await clearDb();
        await makeStore({ restaurantName: 'Wide', location: near(6), serviceRadiusKm: 8 });
        const found = await findNearbyDarkStores(CUSTOMER.lat, CUSTOMER.lng);
        assert.deepEqual(found.map((s) => s.restaurantName), ['Wide']);
    });

    await t.test('an address nothing reaches is assigned no store', async () => {
        await clearDb();
        await makeStore({ location: near(40) });
        assert.equal(await assignStoreForCustomer(CUSTOMER.lat, CUSTOMER.lng), null);
    });

    await t.test('a closed store is not assigned, even when it is the only one', async () => {
        // Assigning it would hand the customer a catalogue they cannot buy from.
        await clearDb();
        await makeStore({ location: near(1), isAcceptingOrders: false });
        assert.equal(await assignStoreForCustomer(CUSTOMER.lat, CUSTOMER.lng), null);
    });

    await t.test('skips a nearer store that cannot fill the basket', async () => {
        await clearDb();
        const masterId = oid();
        const nearStore = await makeStore({ restaurantName: 'Near', location: near(0.5) });
        const stocked = await makeStore({ restaurantName: 'Stocked', location: near(2) });

        // Only the further store carries the product.
        await FoodItem.create({
            restaurantId: stocked._id, masterProductId: masterId,
            name: 'Amul Butter', price: 60, approvalStatus: 'approved', stockQty: 5,
        });
        await FoodItem.create({
            restaurantId: nearStore._id, name: 'Something else',
            price: 20, approvalStatus: 'approved', stockQty: 5,
        });

        const assigned = await assignStoreForCustomer(CUSTOMER.lat, CUSTOMER.lng, {
            itemIds: [String(masterId)],
        });
        assert.equal(assigned.store.restaurantName, 'Stocked',
            'the nearest store that can actually serve the basket wins');
        assert.ok(assigned.promiseMinutes > 0);
    });

    await t.test('groups one product across stores instead of repeating it', async () => {
        await clearDb();
        const master = await FoodMasterProduct.create({
            name: 'Amul Butter', brand: 'Amul', barcode: '8901234567890', gstRate: 12, hsnCode: '0405',
        });
        const stores = await Promise.all([
            makeStore({ restaurantName: 'A', location: near(0.4) }),
            makeStore({ restaurantName: 'B', location: near(0.6) }),
            makeStore({ restaurantName: 'C', location: near(0.8) }),
        ]);
        for (const [i, s] of stores.entries()) {
            await FoodItem.create({
                restaurantId: s._id, masterProductId: master._id,
                // Three spellings, exactly as three sellers would enter them.
                name: ['amul butter (500 gm)', 'Amul Butter 500g', 'AMUL BUTTER-500G'][i],
                price: 268 + i * 7, approvalStatus: 'approved', stockQty: 4,
            });
        }

        const res = await searchProducts({ q: 'amul', zoneId: String(zoneId), limit: 20 });
        assert.equal(res.products.length, 1, 'one product, not three listings');
        assert.equal(res.total, 1, 'and total counts products, or the last page is empty');
        assert.equal(res.products[0].inStockNearby, true);
        // Identity comes from the master, so the seller's spelling is replaced.
        assert.equal(res.products[0].name, 'Amul Butter');
        assert.equal(res.products[0].gstRate, 12, 'and the tax class is the master\'s');
    });

    await t.test('unlinked listings are not collapsed into each other', async () => {
        await clearDb();
        const s = await makeStore({ location: near(0.5) });
        for (const name of ['Loose Atta', 'Loose Rice']) {
            await FoodItem.create({
                restaurantId: s._id, name, price: 40, approvalStatus: 'approved', stockQty: 3,
            });
        }
        const res = await searchProducts({ q: 'loose', zoneId: String(zoneId) });
        assert.equal(res.products.length, 2, 'each stands alone without a master');
    });

    await t.test('reports a product nobody nearby has in stock', async () => {
        await clearDb();
        const master = await FoodMasterProduct.create({ name: 'Paneer', barcode: '8909999999999' });
        const s = await makeStore({ location: near(0.5) });
        await FoodItem.create({
            restaurantId: s._id, masterProductId: master._id, name: 'Paneer',
            price: 90, approvalStatus: 'approved', stockQty: 0, isAvailable: false,
        });

        const res = await searchProducts({ q: 'paneer', zoneId: String(zoneId) });
        assert.equal(res.products.length, 1, 'still shown, so the shopper knows we carry it');
        assert.equal(res.products[0].inStockNearby, false, 'but marked unavailable');
    });

    await t.test('scoping to one store hides what other stores carry', async () => {
        await clearDb();
        const mine = await makeStore({ restaurantName: 'Mine', location: near(0.4) });
        const other = await makeStore({ restaurantName: 'Other', location: near(0.6) });
        await FoodItem.create({ restaurantId: mine._id, name: 'Mine Only', price: 10, approvalStatus: 'approved', stockQty: 1 });
        await FoodItem.create({ restaurantId: other._id, name: 'Other Only', price: 10, approvalStatus: 'approved', stockQty: 1 });

        const res = await searchProducts({ zoneId: String(zoneId), storeId: String(mine._id) });
        assert.deepEqual(res.products.map((p) => p.name), ['Mine Only']);
    });

    await t.test('a storeId from outside the zone is ignored, not obeyed', async () => {
        // The id comes from the client. Honouring one that skipped the zone and
        // status filters would expose an unapproved store's catalogue.
        await clearDb();
        const inZone = await makeStore({ restaurantName: 'InZone', location: near(0.4) });
        const outside = await makeStore({ restaurantName: 'Outside', location: near(0.5), zoneId: oid() });
        await FoodItem.create({ restaurantId: inZone._id, name: 'Visible', price: 10, approvalStatus: 'approved', stockQty: 1 });
        await FoodItem.create({ restaurantId: outside._id, name: 'Hidden', price: 10, approvalStatus: 'approved', stockQty: 1 });

        const res = await searchProducts({ zoneId: String(zoneId), storeId: String(outside._id) });
        assert.ok(!res.products.some((p) => p.name === 'Hidden'), 'never leaks the other zone');
    });
});
