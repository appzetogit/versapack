import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodDeliveryWithdrawal } from '../models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from '../models/deliveryWallet.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const partner = await FoodDeliveryPartner.findById(partnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const [cashLimitSettings, earningsAgg, cashCollectedAgg, cashDepositsAgg, bonusAgg, withdrawalAgg, withdrawalsList, depositList, walletDoc] = await Promise.all([
        getDeliveryCashLimitSettings(),
        // 1. Total Earnings from Delivered Orders
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } } } }
        ]),
        // 2. Gross cash collected (COD orders)
        FoodOrder.aggregate([
            { 
                $match: { 
                    'dispatch.deliveryPartnerId': partnerId, 
                    orderStatus: 'delivered', 
                    'payment.method': 'cash'
                } 
            },
            { $group: { _id: null, cashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } } } }
        ]),
        // 3. Cash deposits (deduct from cash-in-hand)
        FoodDeliveryCashDeposit.aggregate([
            {
                $match: {
                    deliveryPartnerId: partnerId,
                    status: 'Completed'
                }
            },
            { $group: { _id: null, depositedCash: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 4. Admin Bonuses
        DeliveryBonusTransaction.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 5. Withdrawal Aggregates (Approved vs Pending)
        FoodDeliveryWithdrawal.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { 
                $group: { 
                    _id: null, 
                    totalWithdrawn: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
                    pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                } 
            }
        ]),
        // 6. Recent Withdrawals for History
        FoodDeliveryWithdrawal.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        FoodDeliveryCashDeposit.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        FoodDeliveryWallet.findOne({ deliveryPartnerId: partnerId }).lean()
    ]);

    const aggTotalEarned = Number(earningsAgg?.[0]?.totalEarned) || 0;
    const grossCashCollected = Number(cashCollectedAgg?.[0]?.cashCollected) || 0;
    const totalDepositedCash = Number(cashDepositsAgg?.[0]?.depositedCash) || 0;
    const computedCashInHand = Math.max(0, grossCashCollected - totalDepositedCash);
    const aggTotalBonus = Number(bonusAgg?.[0]?.total) || 0;
    const aggTotalWithdrawn = Number(withdrawalAgg?.[0]?.totalWithdrawn) || 0;
    const pendingWithdrawals = Number(withdrawalAgg?.[0]?.pendingWithdrawals) || 0;

    // Merge computed metrics with wallet ledger values to avoid stale pocket totals across admin bonus/manual wallet updates.
    const walletBalance = Number(walletDoc?.balance) || 0;
    const walletLockedAmount = Number(walletDoc?.lockedAmount) || 0;
    const walletCashInHand = Number(walletDoc?.cashInHand) || 0;
    const walletTotalEarnings = Number(walletDoc?.totalEarnings) || 0;
    const walletTotalBonus = Number(walletDoc?.totalBonus) || 0;
    const walletTotalSettled = Number(walletDoc?.totalSettled) || 0;

    const totalEarned = Math.max(aggTotalEarned, walletTotalEarnings);
    const totalBonus = Math.max(aggTotalBonus, walletTotalBonus);
    const totalWithdrawn = Math.max(aggTotalWithdrawn, walletTotalSettled);
    const cashInHand = Math.max(computedCashInHand, walletCashInHand);

    const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
    const deliveryWithdrawalLimit = Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

    // Pocket Balance = (Earnings + Bonus) - Total Withdrawn (approved) - Pending Withdrawals.
    // Keep max with wallet ledger balance to honor admin/manual wallet adjustments.
    const computedPocketBalance = Math.max(0, (totalEarned + totalBonus) - (totalWithdrawn + pendingWithdrawals));
    const effectiveLockedAmount = Math.max(walletLockedAmount, pendingWithdrawals);
    const availableWalletBalance = Math.max(0, walletBalance - effectiveLockedAmount);
    const pocketBalance = Math.max(computedPocketBalance, availableWalletBalance);

    // Fetch transactions for UI (Orders, Bonuses, Withdrawals)
    const [ordersTx] = await Promise.all([
        FoodOrder.find({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' })
            .sort({ createdAt: -1 })
            .select('orderId riderEarning payment orderStatus createdAt')
            .limit(20)
            .lean(),
    ]);

    const transactions = [
        ...(ordersTx || []).map(o => ({
            id: o._id,
            type: 'payment',
            amount: o.riderEarning || 0,
            status: 'Completed',
            date: o.createdAt,
            description: o.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning',
            orderId: o.orderId
        })),
        ...(withdrawalsList || []).map(w => ({
            id: w._id,
            type: 'withdrawal',
            amount: w.amount,
            status: w.status === 'pending' ? 'Pending' : (w.status === 'approved' ? 'Completed' : 'Rejected'),
            date: w.createdAt,
            description: `Withdrawal Request - ${w.paymentMethod}`,
            payoutMethod: w.paymentMethod
        })),
        ...(depositList || []).map(d => ({
            id: d._id,
            type: 'deposit',
            amount: d.amount,
            status: d.status || 'Pending',
            date: d.createdAt,
            description: 'Cash limit settlement',
            paymentMethod: d.paymentMethod || 'cash',
            razorpayPaymentId: d.razorpayPaymentId || '',
            razorpayOrderId: d.razorpayOrderId || ''
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
        totalBalance: totalEarned + totalBonus, // Gross lifetime earnings
        pocketBalance, // Available to withdraw
        cashInHand, // COD to be deposited/deducted
        totalWithdrawn, // Actually paid out
        pendingWithdrawals, // In process
        lockedAmount: effectiveLockedAmount,
        totalEarned,
        totalBonus,
        totalCashLimit,
        availableCashLimit: Math.max(0, totalCashLimit - cashInHand),
        deliveryWithdrawalLimit,
        transactions: transactions.slice(0, 50)
    };
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const amount = Number(payload?.amount);
    const { bankDetails, paymentMethod = 'bank_transfer' } = payload;

    if (!Number.isFinite(amount) || amount < 1) throw new ValidationError('Invalid amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount < wallet.deliveryWithdrawalLimit) {
        throw new ValidationError(`Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`);
    }
    if (amount > wallet.pocketBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const [partner, walletDoc, pendingAgg] = await Promise.all([
        FoodDeliveryPartner.findById(deliveryPartnerId).lean(),
        FoodDeliveryWallet.findOne({ deliveryPartnerId: partnerId }),
        FoodDeliveryWithdrawal.aggregate([
            {
                $match: {
                    deliveryPartnerId: partnerId,
                    status: 'pending'
                }
            },
            {
                $group: {
                    _id: null,
                    totalPending: { $sum: { $ifNull: ['$amount', 0] } }
                }
            }
        ])
    ]);

    if (!partner) throw new ValidationError('Delivery partner not found');

    const pendingBefore = Number(pendingAgg?.[0]?.totalPending) || 0;
    const currentBalance = Number(walletDoc?.balance) || 0;
    const currentLocked = Number(walletDoc?.lockedAmount) || 0;
    const effectiveLockedBefore = Math.max(currentLocked, pendingBefore);
    const computedAvailableBalance = Number(wallet.pocketBalance) || 0;
    const targetLedgerBalance = Math.max(currentBalance, effectiveLockedBefore + computedAvailableBalance);
    const availableBalance = Math.max(0, targetLedgerBalance - effectiveLockedBefore);

    if (amount > availableBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const withdrawal = await FoodDeliveryWithdrawal.create({
        deliveryPartnerId: partnerId,
        amount,
        paymentMethod,
        bankDetails: bankDetails || {
            accountNumber: partner.bankAccountNumber,
            ifscCode: partner.bankIfscCode,
            bankName: partner.bankName,
            accountHolderName: partner.bankAccountHolderName
        },
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
        status: 'pending'
    });

    await FoodDeliveryWallet.findOneAndUpdate(
        { deliveryPartnerId: partnerId },
        {
            $set: {
                balance: targetLedgerBalance,
                lockedAmount: effectiveLockedBefore + amount
            }
        },
        { upsert: true, new: true }
    );

    return withdrawal.toObject();
};

export const createDeliveryCashDepositOrder = async (deliveryPartnerId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Amount must be at least ₹1');
    }
    if (amount > 500000) {
        throw new ValidationError('Maximum deposit is ₹5,00,000');
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const amountPaise = Math.round(amount * 100);
    const receipt = `cash_deposit_${String(deliveryPartnerId).slice(-8)}_${Date.now()}`;

    if (!isRazorpayConfigured()) {
        return {
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                orderId: `order_dev_${Date.now()}`,
                amount: amountPaise,
                currency: 'INR'
            }
        };
    }

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

export const verifyDeliveryCashDepositPayment = async (deliveryPartnerId, payload = {}) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    const amount = Number(payload?.amount);

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');
    if (!Number.isFinite(amount) || amount < 1) throw new ValidationError('amount is required');

    const existing = await FoodDeliveryCashDeposit.findOne({
        deliveryPartnerId,
        $or: [
            { razorpayPaymentId: paymentId },
            { razorpayOrderId: orderId }
        ]
    }).lean();

    if (existing?.status === 'Completed') {
        return { deposit: existing, wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId) };
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const isValid = isRazorpayConfigured()
        ? verifyPaymentSignature(orderId, paymentId, signature)
        : true;

    if (!isValid) {
        throw new ValidationError('Payment verification failed');
    }

    const deposit = existing
        ? await FoodDeliveryCashDeposit.findByIdAndUpdate(
            existing._id,
            {
                $set: {
                    amount,
                    paymentMethod: isRazorpayConfigured() ? 'razorpay' : 'cash',
                    status: 'Completed',
                    razorpayOrderId: orderId,
                    razorpayPaymentId: paymentId
                }
            },
            { new: true }
        )
        : await FoodDeliveryCashDeposit.create({
            deliveryPartnerId,
            amount,
            paymentMethod: isRazorpayConfigured() ? 'razorpay' : 'cash',
            status: 'Completed',
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId
        });

    return {
        deposit,
        wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId)
    };
};
