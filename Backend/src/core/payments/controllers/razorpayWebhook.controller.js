import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import * as foodTransactionService from '../../../modules/food/orders/services/foodTransaction.service.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * ✅ NEW: Centralized Razorpay Webhook Handler (Core Layer)
 * Manages atomic updates for order payments and refunds across all modules.
 */
export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.razorpayWebhookSecret;

    // 1. Verify Signature using raw body buffer
    if (!signature || !secret || !req.rawBody) {
        logger.warn('Razorpay Webhook: Missing signature or rawBody buffer.');
        return res.status(400).send('Invalid signature');
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

    if (expected !== signature) {
        logger.warn('Razorpay Webhook: Signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { event, payload } = req.body;
    logger.info(`Razorpay Webhook Received: ${event}`);

    try {
        // --- 🟢 Handle Payment Captured (Success) ---
        if (event === 'payment.captured') {
            const paymentObj = payload.payment.entity;
            const rzOrderId = paymentObj.order_id;
            const rzPaymentId = paymentObj.id;

            // Cross-check the captured amount against the order total before marking paid.
            const existingOrder = await FoodOrder.findOne({ "payment.razorpay.orderId": rzOrderId })
                .select('pricing payment orderStatus')
                .lean();
            if (existingOrder) {
                const expectedPaise = Math.round((Number(existingOrder.pricing?.total) || 0) * 100);
                const paidPaise = Number(paymentObj.amount);
                if (!Number.isFinite(paidPaise) || paidPaise !== expectedPaise) {
                    logger.error(
                        `Webhook [payment.captured]: AMOUNT MISMATCH for RZ-Order ${rzOrderId} — paid ${paidPaise} paise, expected ${expectedPaise} paise. Order NOT marked paid.`,
                    );
                    if (String(existingOrder.payment?.status || '').toLowerCase() !== 'paid') {
                        await FoodOrder.updateOne(
                            { _id: existingOrder._id, "payment.status": { $ne: 'paid' } },
                            { $set: { "payment.status": 'failed', "payment.razorpay.paymentId": rzPaymentId } },
                        );
                    }
                    return res.status(200).json({ status: 'ok' });
                }
            }

            // Atomic update to mark as paid if not already
            const order = await FoodOrder.findOneAndUpdate(
                { 
                    "payment.razorpay.orderId": rzOrderId, 
                    "payment.status": { $ne: 'paid' } 
                },
                { 
                    $set: { 
                        "payment.status": 'paid', 
                        "payment.razorpay.paymentId": rzPaymentId 
                    } 
                },
                { new: true }
            );

            if (order) {
                // ✅ UPDATED: Wrapped in try-catch to prevent secondary failures from breaking the webhook response
                try {
                    await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
                        status: 'captured',
                        razorpayPaymentId: rzPaymentId,
                        note: 'Payment status synced via Webhook (payment.captured)'
                    });
                } catch (ledgerErr) {
                    logger.error(`Webhook Ledger Error (Order ${order.orderId}): ${ledgerErr.message}`);
                }
                logger.info(`Webhook [payment.captured]: Synced Order ${order.orderId} (Status=paid)`);
            } else {
                // ✅ ADDED: Log warn if order not found but payment was captured
                logger.warn(`Webhook [payment.captured]: Order not found or already paid for RZ-Order: ${rzOrderId}`);
            }
        }

        // --- 🔴 Handle Refund Processed ---
        if (event === 'refund.processed') {
            const refundObj = payload.refund.entity;
            const rzPaymentId = refundObj.payment_id;
            const rzRefundId = refundObj.id;
            const refundAmount = refundObj.amount / 100; // to major unit

            // Razorpay fires refund.processed for a PARTIAL refund too.
            //
            // This used to set payment.status 'refunded' and refund.status 'processed'
            // unconditionally, which is wrong for an order that is still being
            // delivered with some items refunded: it drops the order out of the paid
            // filters, and — the part that costs real money — 'processed' is what
            // applyCancellationRefund reads to decide an order has already been made
            // whole, so cancelling afterwards would return nothing and silently keep
            // the balance.
            //
            // So the amount decides. Only a refund that covers what was charged closes
            // the order out; anything less is recorded as partial and leaves the
            // payment where it is.
            const existing = await FoodOrder.findOne({
                "payment.razorpay.paymentId": rzPaymentId
            }).select('order_id orderId pricing payment fulfilment');

            if (!existing) {
                logger.warn(`Webhook [refund.processed]: Order not found for RZ-Payment: ${rzPaymentId}`);
            } else if (String(existing.payment?.refund?.refundId || '') === String(rzRefundId)) {
                // Razorpay retries webhooks; this exact refund is already recorded.
                logger.info(`Webhook [refund.processed]: Refund ${rzRefundId} already applied`);
            } else if (String(existing.payment?.refund?.status || '') === 'processed') {
                logger.info(`Webhook [refund.processed]: Order ${existing.orderId} already fully refunded`);
            } else {
                // What the customer was originally charged. After a short-pick,
                // pricing.total has already been reduced to what they are still
                // buying, so the pre-reduction figure is the one to compare against.
                const charged =
                    Number(existing.fulfilment?.originalTotal) ||
                    Number(existing.pricing?.total) ||
                    0;
                const alreadyRefunded = Number(existing.payment?.refund?.amount) || 0;
                const totalRefunded = Math.round((alreadyRefunded + refundAmount) * 100) / 100;
                // A rupee of tolerance: Razorpay works in paise and rounding either
                // side must not leave a fully refunded order looking partial forever.
                const isFullyRefunded = charged <= 0 || totalRefunded >= charged - 1;

                const order = await FoodOrder.findOneAndUpdate(
                    {
                        _id: existing._id,
                        "payment.refund.refundId": { $ne: rzRefundId }
                    },
                    {
                        $set: {
                            ...(isFullyRefunded ? { "payment.status": 'refunded' } : {}),
                            "payment.refund": {
                                status: isFullyRefunded ? 'processed' : 'partial',
                                amount: totalRefunded,
                                refundId: rzRefundId,
                                processedAt: new Date()
                            }
                        }
                    },
                    { new: true }
                );

                if (order) {
                    logger.info(
                        `Webhook [refund.processed]: Synced Order ${order.orderId} (${isFullyRefunded ? 'fully refunded' : `partial, ${totalRefunded} of ${charged}`})`
                    );
                } else {
                    logger.info(`Webhook [refund.processed]: Refund ${rzRefundId} applied concurrently`);
                }
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Razorpay Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
