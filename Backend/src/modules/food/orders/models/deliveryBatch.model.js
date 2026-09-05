import mongoose from 'mongoose';

/**
 * A single rider trip carrying several orders from one dark store.
 *
 * A separate collection rather than fields on the order, because a batch is a thing in
 * its own right with its own lifecycle: it is open while it can still take orders,
 * dispatched once a rider has it, and closed when the last drop is done. Modelling it
 * as an id scribbled on each order would leave the sequence, the rider and the state
 * with nowhere to live and no way to query "what is this rider carrying".
 *
 * Every batch belongs to exactly one store. Orders are picked up together, so a trip
 * spanning two stores is not a batch, it is two trips.
 */
const batchOrderSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodOrder',
            required: true,
        },
        /** Drop order within the trip, zero-based. Recomputed whenever one joins. */
        position: { type: Number, required: true, min: 0 },
        /** Minutes from departure to reaching this drop, as projected when sequenced. */
        etaMinutes: { type: Number, default: null },
        deliveredAt: { type: Date, default: null },
    },
    { _id: false },
);

const deliveryBatchSchema = new mongoose.Schema(
    {
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true,
        },
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            default: null,
            index: true,
        },
        orders: { type: [batchOrderSchema], default: [] },
        /**
         * open       — still accepting orders that can join without breaking a promise
         * dispatched — a rider has it; the sequence is now fixed
         * completed  — every drop done
         * cancelled  — abandoned, orders returned to individual dispatch
         */
        status: {
            type: String,
            enum: ['open', 'dispatched', 'completed', 'cancelled'],
            default: 'open',
            index: true,
        },
        /**
         * When this batch stops accepting new orders regardless of capacity.
         *
         * Without a deadline a batch would keep absorbing orders while any of them
         * still had slack, and the first customer would sit waiting for a trip that
         * never departs. The window is what turns "we could still fit one more" into
         * "we are leaving now".
         */
        closesAt: { type: Date, default: null, index: true },
        dispatchedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
    },
    { collection: 'food_delivery_batches', timestamps: true },
);

// The dispatch query: open batches at this store that have not closed yet.
deliveryBatchSchema.index({ storeId: 1, status: 1, closesAt: 1 });

export const FoodDeliveryBatch = mongoose.model('FoodDeliveryBatch', deliveryBatchSchema);
