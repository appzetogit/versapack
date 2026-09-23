import test from 'node:test';
import assert from 'node:assert/strict';

import { startTestDb, stopTestDb, clearDb, oid } from './harness.js';
import {
    listSellerZones,
    createSellerZone,
    updateSellerZone,
    activateSellerZone,
    deleteSellerZone
} from '../../src/modules/food/restaurant/services/sellerZone.service.js';
import { SellerZone } from '../../src/modules/food/restaurant/models/sellerZone.model.js';

test('Seller Zone Management API Services', async (t) => {
    await startTestDb();
    t.after(async () => {
        await stopTestDb();
    });

    const sellerId = oid();
    const otherSellerId = oid();

    await t.test('creates first zone and auto-activates it', async () => {
        await clearDb();

        const res = await createSellerZone(sellerId, {
            name: 'Zone 1 (Default)',
            center_lat: 19.076,
            center_lng: 72.8777,
            radius_m: 5000
        });

        assert.equal(res.error, undefined);
        assert.ok(res.data.id);
        assert.equal(res.data.name, 'Zone 1 (Default)');
        assert.equal(res.data.center_lat, 19.076);
        assert.equal(res.data.center_lng, 72.8777);
        assert.equal(res.data.radius_m, 5000);
        assert.equal(res.data.is_active, true);
    });

    await t.test('creates second zone as inactive', async () => {
        const res = await createSellerZone(sellerId, {
            name: 'Zone 2',
            center_lat: 19.0821,
            center_lng: 72.8416,
            radius_m: 3000
        });

        assert.equal(res.error, undefined);
        assert.equal(res.data.name, 'Zone 2');
        assert.equal(res.data.is_active, false);

        const list = await listSellerZones(sellerId);
        assert.equal(list.length, 2);
    });

    await t.test('validates latitude, longitude and radius boundaries', async () => {
        const invalidLat = await createSellerZone(sellerId, {
            name: 'Bad Lat',
            center_lat: 100,
            center_lng: 72.84,
            radius_m: 2000
        });
        assert.equal(invalidLat.code, 400);

        const invalidLng = await createSellerZone(sellerId, {
            name: 'Bad Lng',
            center_lat: 19.08,
            center_lng: -200,
            radius_m: 2000
        });
        assert.equal(invalidLng.code, 400);

        const invalidRadiusSmall = await createSellerZone(sellerId, {
            name: 'Tiny Radius',
            center_lat: 19.08,
            center_lng: 72.84,
            radius_m: 100
        });
        assert.equal(invalidRadiusSmall.code, 400);

        const invalidRadiusLarge = await createSellerZone(sellerId, {
            name: 'Huge Radius',
            center_lat: 19.08,
            center_lng: 72.84,
            radius_m: 100000
        });
        assert.equal(invalidRadiusLarge.code, 400);
    });

    await t.test('activates selected zone and deactivates others', async () => {
        const listBefore = await listSellerZones(sellerId);
        const zone2 = listBefore.find((z) => z.name === 'Zone 2');
        assert.ok(zone2);

        const actRes = await activateSellerZone(sellerId, zone2.id);
        assert.equal(actRes.data.id, zone2.id);
        assert.equal(actRes.data.is_active, true);

        const listAfter = await listSellerZones(sellerId);
        const zone1After = listAfter.find((z) => z.name === 'Zone 1 (Default)');
        const zone2After = listAfter.find((z) => z.name === 'Zone 2');

        assert.equal(zone2After.is_active, true);
        assert.equal(zone1After.is_active, false);
    });

    await t.test('updates zone details', async () => {
        const list = await listSellerZones(sellerId);
        const zone1 = list.find((z) => z.name === 'Zone 1 (Default)');

        const updateRes = await updateSellerZone(sellerId, zone1.id, {
            name: 'Zone 1 - Updated',
            radius_m: 6000
        });

        assert.equal(updateRes.data.name, 'Zone 1 - Updated');
        assert.equal(updateRes.data.radius_m, 6000);
        assert.equal(updateRes.data.center_lat, 19.076);
    });

    await t.test('prevents updating another seller zone', async () => {
        const list = await listSellerZones(sellerId);
        const zone1 = list[0];

        const updateRes = await updateSellerZone(otherSellerId, zone1.id, {
            name: 'Hacked Name'
        });
        assert.equal(updateRes.code, 404);
    });

    await t.test('deletes active zone and fallback-activates remaining zone', async () => {
        const listBefore = await listSellerZones(sellerId);
        const activeZone = listBefore.find((z) => z.is_active);

        const delRes = await deleteSellerZone(sellerId, activeZone.id);
        assert.equal(delRes.success, true);

        const listAfter = await listSellerZones(sellerId);
        assert.equal(listAfter.length, 1);
        assert.equal(listAfter[0].is_active, true);
    });
});
