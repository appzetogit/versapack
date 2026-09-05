import mongoose from 'mongoose';

/**
 * A customer sending part of a delivered order back.
 *
 * Food had no equivalent: a meal cannot be returned, so the only refund path in this
 * codebase was cancellation, which kills the whole order before it is delivered.
 * Groceries need the opposite shape — the order completed, the customer kept most of
 * it, and something specific is going back: a leaking pack, a short-dated carton, the
 * wrong flavour.
 *
 * Its own collection rather than fields on the order, because a return has a life
 * after the order is finished. It is requested, approved or refused, collected, and
 * refunded, each with its own timestamp, and an order can accumulate more than one
 * over its return window.
 */
const returnLineSchema = new mongoose.Schema(
    {
        /** Index into the order's items array. Order lines carry no id of their own. */
        itemIndex: { type: Number, required: true, min: 0 },
        itemId: { type: String, required: true, trim: true },
        name: { type: String, trim: true, default: '' },
        quantity: { type: Number, required: true, min: 1 },
        /** Unit price as charged, so the refund is computed from the receipt. */
        unitPrice: { type: Number, required: true, min: 0 },
        reason: {
            type: String,
            enum: ['damaged', 'expired', 'wrong_item', 'quality', 'not_needed'],
            required: true,
        },
        note: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const orderReturnSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodOrder',
            required: true,
            index: true,
        },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        lines: { type: [returnLineSchema], default: [] },

        /**
         * requested → approved → collected → refunded, or requested → rejected.
         *
         * Collection is a distinct state from approval on purpose. Approving says the
         * platform accepts the return; the goods are still with the customer until a
         * rider brings them back, and refunding before that is refunding on trust.
         * For a reason where nothing comes back -- a leaking pack nobody wants
         * returned -- approval can go straight to refunded, which is why the two are
         * separate rather than one flag.
         */
        status: {
            type: String,
            enum: ['requested', 'approved', 'rejected', 'collected', 'refunded'],
            default: 'requested',
            index: true,
        },

        /** What the customer gets back, computed server-side from the order's prices. */
        refundAmount: { type: Number, default: 0, min: 0 },
        /** Set once the money has actually moved, so a retry cannot pay twice. */
        refundedAt: { type: Date, default: null },

        requestedAt: { type: Date, default: Date.now },
        decidedAt: { type: Date, default: null },
        decidedByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
        rejectionReason: { type: String, trim: true, default: '' },
        collectedAt: { type: Date, default: null },
        /** Photos the customer attached. A damage claim without one is hard to judge. */
        images: { type: [String], default: [] },
    },
    { collection: 'food_order_returns', timestamps: true },
);

// The admin queue: what is waiting for a decision, oldest first.
orderReturnSchema.index({ status: 1, requestedAt: 1 });
// "What has already been sent back on this order", which the request path reads to
// stop a customer returning the same units twice.
orderReturnSchema.index({ orderId: 1, status: 1 });

export const FoodOrderReturn = mongoose.model('FoodOrderReturn', orderReturnSchema);
