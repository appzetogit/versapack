import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getRestaurantWalletController,
    getDeliveryWalletController
} from '../src/core/payments/payment.controller.js';

/**
 * Regression cover for the wallet IDOR.
 *
 * These handlers resolved the wallet owner as `req.user?.restaurantId || req.params
 * .restaurantId`. authMiddleware never sets `restaurantId` or `deliveryPartnerId` on
 * req.user, so that expression always fell through to the URL, and any account with
 * any valid token could read any seller's or rider's balance and transaction history
 * by editing the id in the path.
 *
 * Every case below is denied before the wallet service is reached, so none of them
 * needs a database. That is the point: if someone reintroduces the fallback, these
 * stop returning 403 and start trying to hit Mongo.
 */

const fakeRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
};

const callAndExpectDenied = async (handler, req) => {
    const res = fakeRes();
    let nextErr = null;
    await handler(req, res, (err) => { nextErr = err; });
    assert.equal(nextErr, null, 'should be denied outright, not thrown into the error handler');
    assert.equal(res.statusCode, 403);
    return res;
};

test('seller wallet is not readable by other roles', async (t) => {
    const victimStoreId = '64b7f1c2a1b2c3d4e5f60001';

    await t.test('a customer cannot read a store wallet by naming it in the path', async () => {
        await callAndExpectDenied(getRestaurantWalletController, {
            user: { userId: '64b7f1c2a1b2c3d4e5f6aaaa', role: 'USER' },
            params: { restaurantId: victimStoreId },
            query: {}
        });
    });

    await t.test('a rider cannot read a store wallet', async () => {
        await callAndExpectDenied(getRestaurantWalletController, {
            user: { userId: '64b7f1c2a1b2c3d4e5f6bbbb', role: 'DELIVERY_PARTNER' },
            params: { restaurantId: victimStoreId },
            query: {}
        });
    });

    await t.test('an unauthenticated request is denied', async () => {
        await callAndExpectDenied(getRestaurantWalletController, {
            user: undefined,
            params: { restaurantId: victimStoreId },
            query: {}
        });
    });
});

test('rider wallet is not readable by other roles', async (t) => {
    const victimRiderId = '64b7f1c2a1b2c3d4e5f60002';

    await t.test('a customer cannot read a rider wallet', async () => {
        await callAndExpectDenied(getDeliveryWalletController, {
            user: { userId: '64b7f1c2a1b2c3d4e5f6aaaa', role: 'USER' },
            params: { deliveryPartnerId: victimRiderId },
            query: {}
        });
    });

    await t.test('a seller cannot read a rider wallet', async () => {
        await callAndExpectDenied(getDeliveryWalletController, {
            user: { userId: '64b7f1c2a1b2c3d4e5f6cccc', role: 'RESTAURANT' },
            params: { deliveryPartnerId: victimRiderId },
            query: {}
        });
    });
});

test('an admin with no target id is denied rather than defaulted', async (t) => {
    await t.test('store wallet', async () => {
        await callAndExpectDenied(getRestaurantWalletController, {
            user: { userId: '64b7f1c2a1b2c3d4e5f6dddd', role: 'ADMIN' },
            params: {},
            query: {}
        });
    });
});
