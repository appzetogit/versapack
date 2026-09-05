import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    await ensureWallet(userId);
    await FoodUserWallet.updateOne(
        { userId: new mongoose.Types.ObjectId(String(userId)) },
        {
            $inc: { balance: amount, referralEarnings: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: 'Referral reward',
                        metadata: { source: 'referral_reward', ...(metadata || {}) },
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }],
                    $position: 0
                }
            }
        }
    );
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    const amountPaise = Math.round(amount * 100);

    if (!isRazorpayConfigured()) {
        // Dev fallback: return a compatible shape without writing to DB.
        const orderId = `order_dev_${Date.now()}`;
        return {
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                orderId,
                amount: amountPaise,
                currency: 'INR'
            }
        };
    }

    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;
    const order = await createRazorpayOrder(amountPaise, 'INR', receipt);

    return {
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: String(order.id),
            amount: Number(order.amount) || amountPaise,
            currency: order.currency || 'INR'
        }
    };
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    const amount = Number(payload?.amount);

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount is required');

    await ensureWallet(userId);

    // If razorpay not configured (dev), accept and credit wallet.
    const ok = isRazorpayConfigured()
        ? verifyPaymentSignature(orderId, paymentId, signature)
        : true;
    if (!ok) {
        throw new ValidationError('Payment verification failed');
    }

    // Credit ONLY after payment is verified, and only once per Razorpay order.
    //
    // The duplicate check used to be a `find` over the loaded array followed by a
    // save, so two verifies of the same payment arriving together — a double tap, or
    // the client retrying after a slow response — both saw no existing row and both
    // credited. Folding the check into the filter as `$ne` makes the second one match
    // nothing, so it credits nothing.
    const updated = await FoodUserWallet.findOneAndUpdate(
        {
            userId: new mongoose.Types.ObjectId(String(userId)),
            'transactions.razorpayOrderId': { $ne: orderId }
        },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: isRazorpayConfigured() ? 'Wallet top-up' : 'Wallet top-up (dev)',
                        metadata: { source: 'wallet_topup', mode: isRazorpayConfigured() ? 'razorpay' : 'dev' },
                        razorpayOrderId: orderId,
                        razorpayPaymentId: paymentId,
                        razorpaySignature: signature,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );

    // No match means this Razorpay order was already credited. That is the expected
    // outcome of a retry, not a failure, so it answers exactly as the first call did.
    if (!updated) {
        return { wallet: await getUserWallet(userId) };
    }

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    // Create the row if it does not exist yet, so the conditional update below has
    // something to match. Nothing is debited here.
    await ensureWallet(userId);

    // The balance check and the debit are ONE operation.
    //
    // This used to read the balance, compare it in JavaScript, subtract, and save.
    // Two orders placed at the same moment both read the same balance, both passed
    // the check, and both saved — the second `save()` wrote a balance computed from
    // a value that was already stale, so a wallet holding enough for one order paid
    // for two. Tapping "Place order" twice was enough to trigger it.
    //
    // `balance: { $gte: amount }` moves the check into the filter, so Mongo either
    // matches a document that genuinely has the money and debits it, or matches
    // nothing at all. A concurrent debit makes the second filter fail rather than
    // overwrite the first.
    const updated = await FoodUserWallet.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(String(userId)), balance: { $gte: amount } },
        {
            $inc: { balance: -amount },
            $push: {
                transactions: {
                    // $position keeps the newest first, which is what unshift did.
                    $each: [{
                        type: 'deduction',
                        amount,
                        status: 'Completed',
                        description,
                        metadata: { source: 'order_payment', ...(metadata || {}) },
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );

    if (!updated) {
        // Only reachable when the filter did not match, and the only condition in it
        // is the balance. Reporting it as "insufficient" is therefore accurate even
        // when the cause was a race rather than a genuinely empty wallet.
        throw new ValidationError('Insufficient wallet balance');
    }

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    await ensureWallet(userId);

    // $inc rather than read-add-save for the same reason as the debit: a credit that
    // recomputes the balance from a stale read silently erases whatever was debited
    // in between. A refund landing at the same moment as an order payment used to be
    // able to give the customer their money back AND their order for free.
    await FoodUserWallet.updateOne(
        { userId: new mongoose.Types.ObjectId(String(userId)) },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'refund',
                        amount,
                        status: 'Completed',
                        description,
                        metadata: { source: 'order_refund', ...(metadata || {}) },
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }],
                    $position: 0
                }
            }
        }
    );

    return { wallet: await getUserWallet(userId) };
};

