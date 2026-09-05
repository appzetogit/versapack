import mongoose from 'mongoose';
import { FoodOrderReturn } from '../models/orderReturn.model.js';
import { FoodOrder } from '../models/order.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import {
    checkReturnLine,
    computeReturnRefund,
    NO_COLLECTION_REASONS,
} from './returns.util.js';
import { buildOrderIdentityFilter } from './order.helpers.js';

/**
 * Returning part of a delivered order.
 *
 * The rules live in returns.util.js and are pure; this is the part that reads the
 * order, records the request, and moves the money.
 *
 * Stock is deliberately NOT restored when a return is approved. Something sent back
 * because it was damaged, expired or simply not wanted is not automatically fit to
 * sell to the next customer, and putting it straight back on the shelf is how a
 * spoiled carton reaches a second person. Returned goods re-enter inventory through
 * the seller's own stock-take, which is a decision a human makes while holding them.
 */

/**
 * Raises a return request against a delivered order.
 *
 * @param {string} userId  From the token, never the body.
 * @param {string} orderId
 * @param {Array<{itemIndex:number, quantity:number, reason:string, note?:string}>} lines
 */
export async function requestReturn(userId, orderId, lines = [], images = []) {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');

    const order = await FoodOrder.findOne(identity).lean();
    if (!order) throw new NotFoundError('Order not found');
    if (String(order.userId) !== String(userId)) {
        throw new ForbiddenError('Not your order');
    }
    if (order.orderStatus !== 'delivered') {
        throw new ValidationError('Only delivered orders can be returned');
    }
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new ValidationError('Select at least one item to return');
    }

    const deliveredAt = order.deliveryState?.deliveredAt || order.updatedAt;
    const orderItems = Array.isArray(order.items) ? order.items : [];

    // How much of each line has already gone back. A rejected return frees its units
    // again; anything else still holds them.
    const priorReturns = await FoodOrderReturn.find({
        orderId: order._id,
        status: { $ne: 'rejected' },
    })
        .select('lines')
        .lean();

    const alreadyReturned = new Map();
    for (const prior of priorReturns) {
        for (const priorLine of prior.lines || []) {
            const key = Number(priorLine.itemIndex);
            alreadyReturned.set(key, (alreadyReturned.get(key) || 0) + Number(priorLine.quantity || 0));
        }
    }

    // Return policy lives on the product, so the catalogue rows are needed to judge.
    const itemIds = [...new Set(
        lines
            .map((l) => String(orderItems[Number(l?.itemIndex)]?.itemId || ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    )];
    const products = itemIds.length
        ? await FoodItem.find({ _id: { $in: itemIds } })
            .select('_id isReturnable returnWindowHours name')
            .lean()
        : [];
    const productById = new Map(products.map((p) => [String(p._id), p]));

    const accepted = [];
    for (const raw of lines) {
        const itemIndex = Number(raw?.itemIndex);
        const orderLine = orderItems[itemIndex];
        const product = productById.get(String(orderLine?.itemId || ''));

        const verdict = checkReturnLine({
            orderLine,
            // A product deleted from the catalogue since the order still has to be
            // returnable -- the customer bought it, and our record-keeping is not
            // their problem. Defaults to returnable with the platform window.
            product: product || { isReturnable: true, returnWindowHours: null },
            quantity: raw?.quantity,
            reason: raw?.reason,
            deliveredAt,
            alreadyReturned: alreadyReturned.get(itemIndex) || 0,
        });

        if (!verdict.ok) {
            throw new ValidationError(
                describeRejection(verdict, orderLine?.name || product?.name || 'This item'),
            );
        }

        accepted.push({
            itemIndex,
            itemId: String(orderLine.itemId),
            name: String(orderLine.name || ''),
            quantity: verdict.quantity,
            unitPrice: Number(orderLine.price) || 0,
            reason: String(raw.reason),
            note: String(raw?.note || '').trim(),
        });
    }

    const refundAmount = computeReturnRefund(accepted, {
        subtotal: Number(order.pricing?.subtotal) || 0,
        discount: Number(order.pricing?.discount) || 0,
    });

    const doc = await FoodOrderReturn.create({
        orderId: order._id,
        userId: order.userId,
        storeId: order.restaurantId,
        lines: accepted,
        refundAmount,
        images: Array.isArray(images) ? images.map((i) => String(i)).filter(Boolean).slice(0, 5) : [],
        status: 'requested',
    });

    logger.info(`Return ${doc._id} requested on order ${order._id} for ${refundAmount}`);
    return doc.toObject();
}

/** Turns a rule verdict into something a customer can act on. */
function describeRejection(verdict, itemName) {
    switch (verdict.reason) {
        case 'window_closed':
            return `The return window for ${itemName} has closed.`;
        case 'not_returnable':
            return `${itemName} cannot be returned unless it arrived damaged or expired.`;
        case 'quantity_exceeds_delivered':
            return `You can return at most ${verdict.available} of ${itemName}.`;
        case 'nothing_left_to_return':
            return `${itemName} has already been returned.`;
        case 'not_delivered':
            return 'This order has not been delivered yet.';
        case 'invalid_quantity':
            return `Choose how many of ${itemName} to return.`;
        case 'invalid_reason':
            return 'Choose a reason for the return.';
        default:
            return `${itemName} cannot be returned.`;
    }
}

/**
 * An admin approves or rejects a request.
 *
 * Approval of a reason where nothing comes back goes straight to refunded; anything
 * else waits for collection, because refunding before the goods are back is refunding
 * on trust.
 */
export async function decideReturn(returnId, adminId, { approve, rejectionReason = '' } = {}) {
    if (!returnId || !mongoose.Types.ObjectId.isValid(returnId)) {
        throw new ValidationError('Invalid return id');
    }

    // Conditional on it still being undecided, so two admins clicking at once cannot
    // both decide it -- and, worse, cannot both trigger a refund.
    const claimed = await FoodOrderReturn.findOneAndUpdate(
        { _id: returnId, status: 'requested' },
        {
            $set: {
                status: approve ? 'approved' : 'rejected',
                decidedAt: new Date(),
                decidedByAdminId: adminId ? new mongoose.Types.ObjectId(String(adminId)) : null,
                rejectionReason: approve ? '' : String(rejectionReason || ''),
            },
        },
        { new: true },
    );

    if (!claimed) {
        const existing = await FoodOrderReturn.findById(returnId).lean();
        if (!existing) throw new NotFoundError('Return not found');
        throw new ValidationError(`This return was already ${existing.status}`);
    }

    if (!approve) return claimed.toObject();

    const everyLineStaysWithCustomer = (claimed.lines || []).every((l) =>
        NO_COLLECTION_REASONS.has(String(l.reason)),
    );
    if (everyLineStaysWithCustomer) {
        return refundReturn(claimed._id);
    }

    return claimed.toObject();
}

/** A rider has brought the goods back. */
export async function markReturnCollected(returnId) {
    const updated = await FoodOrderReturn.findOneAndUpdate(
        { _id: returnId, status: 'approved' },
        { $set: { status: 'collected', collectedAt: new Date() } },
        { new: true },
    );
    if (!updated) throw new ValidationError('This return is not awaiting collection');
    return refundReturn(updated._id);
}

/**
 * Pays the customer back.
 *
 * `refundedAt: null` in the filter is the claim that makes this safe to call from
 * both the approval path and the collection path, and to retry: whichever gets there
 * first moves the money, and the second finds nothing to do.
 */
export async function refundReturn(returnId) {
    const claimed = await FoodOrderReturn.findOneAndUpdate(
        { _id: returnId, refundedAt: null, status: { $in: ['approved', 'collected'] } },
        { $set: { refundedAt: new Date(), status: 'refunded' } },
        { new: true },
    );
    if (!claimed) {
        const existing = await FoodOrderReturn.findById(returnId).lean();
        return existing || null;
    }

    if (claimed.refundAmount > 0) {
        try {
            const order = await FoodOrder.findById(claimed.orderId);
            const { applyReturnRefund } = await import('./order.service.js');
            await applyReturnRefund(order, claimed.refundAmount, claimed._id);
        } catch (err) {
            // The customer is owed money and did not get it. Loud, and left as
            // refunded=false so it can be found, rather than silently swallowed.
            await FoodOrderReturn.updateOne(
                { _id: claimed._id },
                { $set: { refundedAt: null, status: 'collected' } },
            );
            logger.error(
                `[CRITICAL] return refund of ${claimed.refundAmount} failed for ${claimed._id}: ${err?.message || err}`,
            );
            throw err;
        }
    }

    return claimed.toObject();
}

/** A customer's returns, newest first. */
export async function listReturnsForUser(userId, query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
    const filter = { userId: new mongoose.Types.ObjectId(String(userId)) };

    const [items, total] = await Promise.all([
        FoodOrderReturn.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        FoodOrderReturn.countDocuments(filter),
    ]);
    return { items, total, page, limit };
}

/** The admin queue: oldest undecided first, because those have waited longest. */
export async function listReturnsForAdmin(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);

    const filter = {};
    if (query.status) filter.status = String(query.status);

    const [items, total] = await Promise.all([
        FoodOrderReturn.find(filter)
            .sort({ status: 1, requestedAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'name phone')
            .populate('storeId', 'restaurantName')
            .lean(),
        FoodOrderReturn.countDocuments(filter),
    ]);
    return { items, total, page, limit };
}
