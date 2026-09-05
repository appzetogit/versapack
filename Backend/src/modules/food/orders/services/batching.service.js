import mongoose from 'mongoose';
import { FoodDeliveryBatch } from '../models/deliveryBatch.model.js';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { canJoinBatch, sequenceDrops, estimateBatchTimings } from './batching.util.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Forming rider trips out of orders leaving the same dark store.
 *
 * The arithmetic that decides whether a batch is safe lives in batching.util.js and is
 * pure. This is the part that touches the database: find an open batch worth joining,
 * add to it, or start a new one.
 *
 * Batching is only attempted for dark stores. A marketplace seller's orders are picked
 * up at different shops, so there is no shared trip to put them on, and quietly
 * batching them would send a rider on a tour of the city.
 */

/** A trip beyond four drops stops being quick for whoever is last. */
const MAX_BATCH_SIZE = Number(process.env.MAX_BATCH_SIZE) || 3;

/**
 * How long a batch stays open before it must leave.
 *
 * Short on purpose. Every second a batch waits for a companion is a second the first
 * customer has already spent, and in a ten-minute product that budget is tiny. Two
 * minutes catches the genuine clusters — a lunchtime burst from one neighbourhood —
 * without ever gambling the first order's promise on a second one arriving.
 */
const BATCH_WINDOW_MS = (Number(process.env.BATCH_WINDOW_SECONDS) || 120) * 1000;

/**
 * Places an order onto a trip: an existing open batch if one can take it, else a new
 * batch of its own.
 *
 * Always returns a batch. An order that cannot share a trip is simply a batch of one,
 * which keeps the dispatch path downstream identical whether or not batching applied.
 *
 * @returns {Promise<{batch: object, joined: boolean, reason?: string} | null>} null
 *   when the order is not batchable at all, so the caller dispatches it the old way.
 */
export async function placeOrderInBatch(orderId) {
    const order = await FoodOrder.findById(orderId)
        .select('_id restaurantId deliveryAddress pricing createdAt orderStatus')
        .lean();
    if (!order) return null;

    const store = await FoodRestaurant.findById(order.restaurantId)
        .select('_id location storeType')
        .lean();

    // Only our own stores. See the module note.
    if (!store || store.storeType !== 'dark_store') return null;

    const now = new Date();

    const openBatches = await FoodDeliveryBatch.find({
        storeId: store._id,
        status: 'open',
        closesAt: { $gt: now },
    })
        .sort({ createdAt: 1 })
        .lean();

    for (const batch of openBatches) {
        if (batch.orders.length >= MAX_BATCH_SIZE) continue;

        const existingOrders = await loadBatchOrders(batch);
        const verdict = canJoinBatch(store, existingOrders, order, {
            now,
            maxBatchSize: MAX_BATCH_SIZE,
            // What is left of this batch's window is time the rider still has to
            // wait before leaving, and it pushes every drop back by that much.
            departureInMinutes: Math.max(
                0,
                (new Date(batch.closesAt).getTime() - now.getTime()) / 60_000,
            ),
        });

        if (!verdict.ok) continue;

        // Claimed conditionally so two orders arriving together cannot both read the
        // same batch as having room and both join past the cap.
        const claimed = await FoodDeliveryBatch.findOneAndUpdate(
            {
                _id: batch._id,
                status: 'open',
                [`orders.${MAX_BATCH_SIZE - 1}`]: { $exists: false },
            },
            { $push: { orders: { orderId: order._id, position: batch.orders.length } } },
            { new: true },
        );

        if (!claimed) continue; // Someone else filled it; try the next one.

        const resequenced = await resequenceBatch(claimed._id);
        logger.info(`Order ${order._id} joined batch ${claimed._id} (${claimed.orders.length} drops)`);
        return { batch: resequenced || claimed.toObject(), joined: true };
    }

    const created = await FoodDeliveryBatch.create({
        storeId: store._id,
        orders: [{ orderId: order._id, position: 0 }],
        status: 'open',
        closesAt: new Date(now.getTime() + BATCH_WINDOW_MS),
    });

    return { batch: created.toObject(), joined: false, reason: 'new_batch' };
}

/** The order documents on a batch, in stored order. */
async function loadBatchOrders(batch) {
    const ids = (batch.orders || []).map((entry) => entry.orderId);
    if (ids.length === 0) return [];
    const docs = await FoodOrder.find({ _id: { $in: ids } })
        .select('_id deliveryAddress pricing createdAt')
        .lean();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/**
 * Recomputes drop order and per-drop ETAs after the batch membership changes.
 *
 * Run on every join, because adding a drop can reorder the whole trip — a new order
 * between the store and an existing one is visited first, not appended.
 */
export async function resequenceBatch(batchId) {
    const batch = await FoodDeliveryBatch.findById(batchId);
    if (!batch) return null;

    const store = await FoodRestaurant.findById(batch.storeId).select('_id location').lean();
    if (!store) return batch.toObject();

    const orders = await loadBatchOrders(batch.toObject());
    if (orders.length === 0) return batch.toObject();

    const sequence = sequenceDrops(store, orders);
    const timings = estimateBatchTimings(store, sequence);

    const positionById = new Map();
    timings.forEach((entry, index) => {
        positionById.set(String(entry.order._id), {
            position: index,
            etaMinutes: entry.etaMinutes,
        });
    });

    batch.orders = batch.orders
        .map((entry) => {
            const resolved = positionById.get(String(entry.orderId));
            return {
                ...entry,
                position: resolved?.position ?? entry.position,
                etaMinutes: resolved?.etaMinutes ?? entry.etaMinutes,
            };
        })
        .sort((a, b) => a.position - b.position);

    await batch.save();
    return batch.toObject();
}

/**
 * Batches whose window has closed and which are ready for a rider.
 *
 * Called by the dispatch sweep. A batch leaves when its window expires rather than
 * when it is full: waiting for a third order that may never come is exactly the
 * failure this window exists to prevent.
 */
export async function listBatchesReadyToDispatch(storeId = null) {
    const filter = {
        status: 'open',
        closesAt: { $lte: new Date() },
        'orders.0': { $exists: true },
    };
    if (storeId && mongoose.Types.ObjectId.isValid(String(storeId))) {
        filter.storeId = new mongoose.Types.ObjectId(String(storeId));
    }
    return FoodDeliveryBatch.find(filter).sort({ closesAt: 1 }).lean();
}

/**
 * Hands a batch to a rider and freezes its sequence.
 *
 * Conditional on the batch still being open, so two dispatch sweeps running at once
 * cannot both assign the same trip to different riders.
 */
export async function assignBatchToPartner(batchId, deliveryPartnerId) {
    const batch = await FoodDeliveryBatch.findOneAndUpdate(
        { _id: batchId, status: 'open' },
        {
            $set: {
                status: 'dispatched',
                deliveryPartnerId: new mongoose.Types.ObjectId(String(deliveryPartnerId)),
                dispatchedAt: new Date(),
            },
        },
        { new: true },
    );
    if (!batch) return null;

    // The order rows carry the assignment too, so every existing screen that reads
    // dispatch.deliveryPartnerId keeps working without knowing batches exist.
    await FoodOrder.updateMany(
        { _id: { $in: batch.orders.map((entry) => entry.orderId) } },
        {
            $set: {
                'dispatch.status': 'assigned',
                'dispatch.deliveryPartnerId': new mongoose.Types.ObjectId(String(deliveryPartnerId)),
                'dispatch.assignedAt': new Date(),
            },
        },
    );

    return batch.toObject();
}

/** Marks one drop done, and closes the batch once the last one is. */
export async function markBatchDropDelivered(orderId) {
    const batch = await FoodDeliveryBatch.findOne({
        'orders.orderId': new mongoose.Types.ObjectId(String(orderId)),
        status: 'dispatched',
    });
    if (!batch) return null;

    const entry = batch.orders.find((row) => String(row.orderId) === String(orderId));
    if (entry && !entry.deliveredAt) entry.deliveredAt = new Date();

    if (batch.orders.every((row) => row.deliveredAt)) {
        batch.status = 'completed';
        batch.completedAt = new Date();
    }

    await batch.save();
    return batch.toObject();
}
