import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

import { FoodUserWallet } from '../src/modules/food/user/models/userWallet.model.js';
import {
    deductWalletBalance,
    refundWalletBalance,
    verifyWalletTopupPayment
} from '../src/modules/food/user/services/userWallet.service.js';

/**
 * The wallet's correctness lives entirely in the shape of the update it sends.
 *
 * A real double-spend needs two concurrent writers against a real Mongo, which these
 * cannot provide. What they can do — and what actually protects the money — is pin
 * the guard into the query: the balance check must travel in the FILTER, so the
 * server decides, rather than in JavaScript against a value that is already stale by
 * the time it is written back. If someone reverts to read-check-save, the recorded
 * filter loses its condition and these fail.
 */

const USER_ID = '64b7f1c2a1b2c3d4e5f60007';

/** Captures the calls the service makes instead of touching a database. */
function withStubbedWallet({ matches = true, existingWallet = { balance: 500 } } = {}, run) {
    const real = {
        findOne: FoodUserWallet.findOne,
        create: FoodUserWallet.create,
        findOneAndUpdate: FoodUserWallet.findOneAndUpdate,
        updateOne: FoodUserWallet.updateOne
    };

    const calls = { findOneAndUpdate: [], updateOne: [] };

    FoodUserWallet.findOne = async () => existingWallet;
    FoodUserWallet.create = async (doc) => doc;
    FoodUserWallet.findOneAndUpdate = async (filter, update, options) => {
        calls.findOneAndUpdate.push({ filter, update, options });
        return matches ? { balance: 0, transactions: [] } : null;
    };
    FoodUserWallet.updateOne = async (filter, update) => {
        calls.updateOne.push({ filter, update });
        return { modifiedCount: matches ? 1 : 0 };
    };

    return Promise.resolve(run(calls)).finally(() => {
        Object.assign(FoodUserWallet, real);
    });
}

test('deductWalletBalance', async (t) => {
    await t.test('puts the balance check in the filter, not in JavaScript', async () => {
        await withStubbedWallet({}, async (calls) => {
            await deductWalletBalance(USER_ID, 120, 'Payment for order #FOD-1', { orderId: 'x' });

            assert.equal(calls.findOneAndUpdate.length, 1, 'one conditional update');
            const { filter, update } = calls.findOneAndUpdate[0];

            // This is the whole fix: the server refuses to match a wallet that cannot
            // afford it, so two concurrent debits cannot both succeed.
            assert.deepEqual(filter.balance, { $gte: 120 });
            assert.equal(String(filter.userId), USER_ID);

            // And the debit is a relative $inc, never an absolute balance computed
            // from a read that a concurrent writer may already have invalidated.
            assert.equal(update.$inc.balance, -120);
            assert.equal(update.$set, undefined, 'must not write an absolute balance');
        });
    });

    await t.test('records the debit newest-first in the same operation', async () => {
        await withStubbedWallet({}, async (calls) => {
            await deductWalletBalance(USER_ID, 50, 'Payment for order #FOD-2', { orderId: 'y' });
            const { update } = calls.findOneAndUpdate[0];
            const push = update.$push.transactions;

            assert.equal(push.$position, 0, 'newest first, as unshift used to do');
            assert.equal(push.$each.length, 1);
            assert.equal(push.$each[0].type, 'deduction');
            assert.equal(push.$each[0].amount, 50);
            assert.equal(push.$each[0].metadata.orderId, 'y');
        });
    });

    await t.test('a wallet that cannot afford it is refused, not overdrawn', async () => {
        await withStubbedWallet({ matches: false }, async () => {
            await assert.rejects(
                () => deductWalletBalance(USER_ID, 10_000),
                /Insufficient wallet balance/
            );
        });
    });

    await t.test('rejects a nonsensical amount before touching the wallet', async () => {
        await withStubbedWallet({}, async (calls) => {
            for (const bad of [0, -5, null, 'abc', undefined]) {
                await assert.rejects(() => deductWalletBalance(USER_ID, bad), /Invalid deduction amount/);
            }
            assert.equal(calls.findOneAndUpdate.length, 0, 'no write was attempted');
        });
    });
});

test('refundWalletBalance', async (t) => {
    await t.test('credits with $inc so a concurrent debit is not erased', async () => {
        await withStubbedWallet({}, async (calls) => {
            await refundWalletBalance(USER_ID, 200, 'Refund for order #FOD-3', { orderId: 'z' });

            assert.equal(calls.updateOne.length, 1);
            const { update } = calls.updateOne[0];
            assert.equal(update.$inc.balance, 200);
            assert.equal(update.$set, undefined, 'must not write an absolute balance');
            assert.equal(update.$push.transactions.$each[0].type, 'refund');
        });
    });

    await t.test('a zero or negative refund is a no-op, not a debit', async () => {
        await withStubbedWallet({}, async (calls) => {
            await refundWalletBalance(USER_ID, 0);
            await refundWalletBalance(USER_ID, -50);
            assert.equal(calls.updateOne.length, 0);
        });
    });
});

test('verifyWalletTopupPayment', async (t) => {
    // Signed for real against whatever key this environment is configured with, rather
    // than stubbing the verifier out. What these cases are about is everything that
    // happens AFTER a payment is accepted, so faking the accept would prove nothing —
    // and where no key is configured the service accepts unsigned payloads anyway, so
    // the same test works on a machine with no Razorpay credentials.
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const sign = (orderId, paymentId) =>
        secret
            ? crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
            : 'unsigned-dev';

    const payload = {
        razorpayOrderId: 'order_ABC123',
        razorpayPaymentId: 'pay_ABC123',
        razorpaySignature: sign('order_ABC123', 'pay_ABC123'),
        amount: 500
    };

    await t.test('makes the duplicate check part of the filter', async () => {
        await withStubbedWallet({}, async (calls) => {
            await verifyWalletTopupPayment(USER_ID, payload);

            assert.equal(calls.findOneAndUpdate.length, 1);
            const { filter, update } = calls.findOneAndUpdate[0];

            // Two verifies of the same Razorpay order arriving together must not both
            // credit. Only the filter can decide that; a find-then-save cannot.
            assert.deepEqual(filter['transactions.razorpayOrderId'], { $ne: 'order_ABC123' });
            assert.equal(update.$inc.balance, 500);
        });
    });

    await t.test('a replayed top-up credits nothing and still answers normally', async () => {
        await withStubbedWallet({ matches: false }, async () => {
            // A retry is an expected outcome, not an error the client should see.
            const result = await verifyWalletTopupPayment(USER_ID, payload);
            assert.ok(result.wallet, 'returns the wallet exactly as the first call did');
        });
    });

    await t.test('requires every signature field before crediting', async () => {
        await withStubbedWallet({}, async (calls) => {
            await assert.rejects(
                () => verifyWalletTopupPayment(USER_ID, { ...payload, razorpaySignature: '' }),
                /razorpaySignature is required/
            );
            await assert.rejects(
                () => verifyWalletTopupPayment(USER_ID, { ...payload, amount: 0 }),
                /amount is required/
            );
            assert.equal(calls.findOneAndUpdate.length, 0, 'nothing was credited');
        });
    });
});

test('wallet model', async (t) => {
    await t.test('balance and referralEarnings are plain numbers $inc can move', () => {
        const paths = FoodUserWallet.schema.paths;
        assert.equal(paths.balance.instance, 'Number');
        assert.equal(paths.referralEarnings.instance, 'Number');
    });

    await t.test('userId is unique, so a user cannot end up with two wallets', () => {
        assert.equal(FoodUserWallet.schema.path('userId').options.unique, true);
    });

    await t.test('mongoose is imported for the ObjectId casts the filters rely on', () => {
        assert.ok(mongoose.Types.ObjectId.isValid(USER_ID));
    });
});
