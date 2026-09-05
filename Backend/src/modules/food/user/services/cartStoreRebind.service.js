import mongoose from 'mongoose';
import { FoodItem } from '../../admin/models/food.model.js';
import { assignStoreForCustomer } from '../../restaurant/services/storeAssignment.service.js';

/**
 * Moving a basket to whichever dark store now serves the customer.
 *
 * Changing the delivery address is the single most common way a quick-commerce cart
 * breaks. The customer built it against the store near their office, then chose their
 * home address at checkout — and the items in the basket belong to a store that cannot
 * reach the new address. A marketplace can shrug at this because the customer picked
 * the shop deliberately; here they never picked it at all, so throwing the basket away
 * would be punishing them for a choice the system made on their behalf.
 *
 * Instead the basket follows them. Every dark store stocks the same catalogue of
 * master products, so a line can be re-pointed at the equivalent row in the new store
 * — same product, that store's own price and stock. What genuinely is not carried
 * there is reported rather than silently dropped, because a basket that quietly loses
 * items is worse than one that says what it lost.
 *
 * Only lines linked to a master product can move. An unlinked listing is specific to
 * one store and has no equivalent anywhere else, which is exactly what unlinked means.
 */

/**
 * @param {Array} cartItems Lines as the client holds them, each with itemId.
 * @param {{lat:number, lng:number}} destination The address being delivered to.
 * @returns {Promise<{
 *   store: object|null, serviceable: boolean, items: Array,
 *   moved: Array, unavailable: Array, unchanged: boolean
 * }>}
 */
export async function rebindCartToServingStore(cartItems = [], destination = {}) {
    const items = Array.isArray(cartItems) ? cartItems : [];
    const assignment = await assignStoreForCustomer(destination.lat, destination.lng, {
        lineCount: items.length,
    });

    if (!assignment) {
        // Nothing serves this address. The basket is left exactly as it is: the
        // customer may well pick a different address next, and having silently
        // emptied their cart in the meantime would be indefensible.
        return { store: null, serviceable: false, items, moved: [], unavailable: [], unchanged: true };
    }

    const targetStoreId = String(assignment.store._id);
    const currentStoreIds = new Set(
        items.map((item) => String(item?.restaurantId || '')).filter(Boolean),
    );

    // Already shopping from the right store, which is the common case on every
    // address change that stays in the same neighbourhood.
    if (currentStoreIds.size === 1 && currentStoreIds.has(targetStoreId)) {
        return {
            store: assignment.store,
            serviceable: true,
            items,
            moved: [],
            unavailable: [],
            unchanged: true,
        };
    }

    const sourceIds = items
        .map((item) => String(item?.itemId || ''))
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

    // What the current lines actually are, as master products.
    const sourceRows = sourceIds.length
        ? await FoodItem.find({ _id: { $in: sourceIds.map((id) => new mongoose.Types.ObjectId(id)) } })
            .select('_id masterProductId name')
            .lean()
        : [];
    const masterByItemId = new Map(
        sourceRows.map((row) => [String(row._id), row.masterProductId ? String(row.masterProductId) : null]),
    );

    const wantedMasterIds = [...new Set([...masterByItemId.values()].filter(Boolean))];

    // The new store's rows for those same products, sellable right now.
    const targetRows = wantedMasterIds.length
        ? await FoodItem.find({
            restaurantId: new mongoose.Types.ObjectId(targetStoreId),
            masterProductId: { $in: wantedMasterIds.map((id) => new mongoose.Types.ObjectId(id)) },
            approvalStatus: 'approved',
            isAvailable: { $ne: false },
        })
            .select('_id masterProductId name price mrp stockQty maxQtyPerOrder image')
            .lean()
        : [];
    const targetByMaster = new Map(targetRows.map((row) => [String(row.masterProductId), row]));

    const rebound = [];
    const moved = [];
    const unavailable = [];

    for (const item of items) {
        const masterId = masterByItemId.get(String(item?.itemId || ''));
        const replacement = masterId ? targetByMaster.get(masterId) : null;

        if (!replacement) {
            unavailable.push({
                itemId: String(item?.itemId || ''),
                name: String(item?.name || ''),
                // Tells the app which sentence to show: a line with no master could
                // never move, whereas one whose master is simply not carried here is
                // a stock gap the customer may want to know about.
                reason: masterId ? 'not_stocked_here' : 'store_specific_item',
            });
            continue;
        }

        const requested = Math.max(1, Number(item?.quantity) || 1);
        const cap = Number(replacement.maxQtyPerOrder);
        const onHand = replacement.stockQty;
        let quantity = requested;
        if (Number.isFinite(cap) && cap > 0) quantity = Math.min(quantity, cap);
        if (onHand !== null && onHand !== undefined) quantity = Math.min(quantity, Number(onHand) || 0);

        if (quantity < 1) {
            unavailable.push({
                itemId: String(item?.itemId || ''),
                name: String(item?.name || replacement.name || ''),
                reason: 'out_of_stock_here',
            });
            continue;
        }

        rebound.push({
            ...item,
            // The line now IS the new store's row: its id, its price, its image.
            // Carrying the old price over would show the customer one number and
            // charge another, since checkout reprices from the listing anyway.
            itemId: String(replacement._id),
            restaurantId: targetStoreId,
            name: replacement.name || item.name,
            price: Number(replacement.price) || 0,
            mrp: replacement.mrp ?? null,
            image: replacement.image || item.image || '',
            quantity,
        });

        if (quantity !== requested || String(replacement._id) !== String(item?.itemId)) {
            moved.push({
                from: String(item?.itemId || ''),
                to: String(replacement._id),
                name: replacement.name || item.name,
                requestedQty: requested,
                quantity,
            });
        }
    }

    return {
        store: assignment.store,
        serviceable: true,
        promiseMinutes: assignment.promiseMinutes,
        distanceKm: assignment.distanceKm,
        items: rebound,
        moved,
        unavailable,
        unchanged: false,
    };
}
