import mongoose from 'mongoose';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodOrder } from '../models/order.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Stock reservation for quick commerce.
 *
 * Food delivery never tracked quantities: a dish was a boolean, and a kitchen
 * that runs out just toggles it off. Groceries are countable, so an order has
 * to claim units at creation or two customers can both buy the last one and the
 * second finds out only after paying.
 *
 * Items with `stockQty === null` are untracked and pass straight through, which
 * is every document that existed before this file.
 */

/** Same item can appear on several lines (different variants); the shelf sees the sum. */
export function totalQuantityByItem(items = []) {
  const totals = new Map();
  for (const item of items) {
    const id = String(item?.itemId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) continue;
    const qty = Math.max(1, Number(item?.quantity) || 1);
    totals.set(id, (totals.get(id) || 0) + qty);
  }
  return totals;
}

/**
 * Decrements stock for every tracked item on the order.
 *
 * Each decrement is a conditional update, so the check and the write are one
 * atomic operation and concurrent orders cannot both pass a "do we have enough"
 * read. If any item comes up short, the ones already taken are put back before
 * throwing — a rejected order must leave the shelf exactly as it found it.
 */
export async function reserveStockForItems(items = []) {
  const totals = totalQuantityByItem(items);
  if (totals.size === 0) return [];

  const taken = [];

  for (const [itemId, qty] of totals) {
    const id = new mongoose.Types.ObjectId(itemId);

    // `$gte` never matches null, so untracked items fall through to the check
    // below rather than being silently decremented into negatives.
    const res = await FoodItem.updateOne(
      { _id: id, stockQty: { $gte: qty } },
      { $inc: { stockQty: -qty } },
    );

    if (res.modifiedCount === 1) {
      taken.push({ itemId, qty });
      // Hide it once empty so the existing listing/search filters, which all key
      // off isAvailable, keep working without knowing inventory exists.
      await FoodItem.updateOne(
        { _id: id, stockQty: 0 },
        { $set: { isAvailable: false } },
      );
      continue;
    }

    const doc = await FoodItem.findById(id).select('name stockQty').lean();
    if (!doc) {
      await releaseReservations(taken);
      throw new ValidationError('One or more items are no longer available');
    }
    if (doc.stockQty === null || doc.stockQty === undefined) continue; // untracked

    await releaseReservations(taken);
    const left = Number(doc.stockQty) || 0;
    throw new ValidationError(
      left > 0
        ? `Only ${left} left of ${doc.name}. Please reduce the quantity.`
        : `${doc.name} just went out of stock`,
    );
  }

  return taken;
}

/** Puts back a partial reservation after a failed line. Never throws. */
export async function releaseReservations(taken = []) {
  for (const entry of taken) {
    try {
      await incrementStock(entry.itemId, entry.qty);
    } catch (err) {
      logger.error(
        `[CRITICAL] stock rollback failed for item ${entry.itemId} (+${entry.qty}): ${err?.message || err}`,
      );
    }
  }
}

async function incrementStock(itemId, qty) {
  const id = new mongoose.Types.ObjectId(String(itemId));
  await FoodItem.updateOne({ _id: id, stockQty: { $ne: null } }, { $inc: { stockQty: qty } });
  // Bring it back only if it went dark by running out. A seller who switched the
  // item off by hand set stockOffMode, and that decision outranks a restock.
  await FoodItem.updateOne(
    { _id: id, stockQty: { $gt: 0 }, isAvailable: false, stockOffMode: { $in: [null, undefined] } },
    { $set: { isAvailable: true } },
  );
}

/**
 * Returns an order's reserved stock to the shelf.
 *
 * Safe to call from anywhere an order dies — cancellation by user, seller,
 * admin or the acceptance timeout, and the two delete paths. The claim on
 * `stockRestoredAt` is what makes that safe: several of those paths can fire
 * for the same order (the timeout sweep runs from both a queue job and four
 * read paths), and a double restock would quietly invent inventory.
 */
export async function restoreOrderStock(orderLike) {
  const orderId = orderLike?._id;
  if (!orderId) return false;
  if (!orderLike?.stockReservedAt) return false; // pre-inventory or never reserved

  const claimed = await FoodOrder.findOneAndUpdate(
    { _id: orderId, stockReservedAt: { $ne: null }, stockRestoredAt: null },
    { $set: { stockRestoredAt: new Date() } },
    { new: true, projection: { items: 1 } },
  ).lean();

  if (!claimed) return false; // already restored, or nothing to restore

  for (const [itemId, qty] of totalQuantityByItem(claimed.items)) {
    try {
      await incrementStock(itemId, qty);
    } catch (err) {
      logger.error(
        `[CRITICAL] restock failed for order ${orderId} item ${itemId} (+${qty}): ${err?.message || err}`,
      );
    }
  }

  return true;
}
