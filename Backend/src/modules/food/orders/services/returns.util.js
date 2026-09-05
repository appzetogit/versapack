/**
 * What a customer is allowed to send back, and what it is worth.
 *
 * Kept pure and separate from the service because these are the rules that decide
 * whether money leaves the business, and they need to be exercised without a database.
 *
 * The shape of the problem is different from cancellation in a way that matters. A
 * cancellation kills an order before it exists physically; a return happens after the
 * customer has the goods, keeps most of them, and sends specific units back. So every
 * rule here is per line and per unit, never per order.
 */

/** How long after delivery a return can be raised when nothing else says otherwise. */
export const DEFAULT_RETURN_WINDOW_HOURS = 24;

/**
 * Reasons that do not require the goods to come back.
 *
 * Asking a customer to keep a leaking bottle for a rider is worse service than
 * writing it off, and asking a rider to carry spoiled food back is worse than that.
 * These skip the collection step and refund on approval.
 */
export const NO_COLLECTION_REASONS = new Set(['damaged', 'expired']);

export const RETURN_REASONS = ['damaged', 'expired', 'wrong_item', 'quality', 'not_needed'];

/**
 * When the window on a given line closes.
 *
 * Per product, not per order: a carton of milk and a bag of rice do not deserve the
 * same window, and the product is what knows. Falls back to the platform default when
 * the product has no window of its own, which is every product until someone sets one.
 */
export function returnDeadlineFor(deliveredAt, product) {
    const delivered = deliveredAt ? new Date(deliveredAt) : null;
    if (!delivered || Number.isNaN(delivered.getTime())) return null;

    const hours = Number(product?.returnWindowHours);
    const window = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RETURN_WINDOW_HOURS;
    return new Date(delivered.getTime() + window * 60 * 60 * 1000);
}

/**
 * How many units of a line are still returnable.
 *
 * Two things reduce it, and both must, or a customer could be refunded for goods they
 * never received or has already sent back:
 *
 *  - what the seller actually picked, not what was ordered. A short-picked line was
 *    already refunded at fulfilment, and refunding the missing units again as a
 *    return pays for them twice.
 *  - units on an earlier return for the same line that has not been rejected.
 */
export function returnableQuantity(orderLine, alreadyReturned = 0) {
    const picked = orderLine?.fulfilledQty;
    const delivered =
        picked !== null && picked !== undefined && Number.isFinite(Number(picked))
            ? Number(picked)
            : Number(orderLine?.quantity) || 0;

    return Math.max(0, delivered - Math.max(0, Number(alreadyReturned) || 0));
}

/**
 * Whether one requested line can be returned, and why not when it cannot.
 *
 * @param {object} params
 * @param {object} params.orderLine     The line as stored on the order.
 * @param {object} params.product       The catalogue product, for its return policy.
 * @param {number} params.quantity      Units the customer wants to send back.
 * @param {string} params.reason
 * @param {Date}   params.deliveredAt
 * @param {number} params.alreadyReturned
 * @param {Date}   params.now
 */
export function checkReturnLine({
    orderLine,
    product,
    quantity,
    reason,
    deliveredAt,
    alreadyReturned = 0,
    now = new Date(),
} = {}) {
    if (!orderLine) return { ok: false, reason: 'no_such_line' };
    if (!RETURN_REASONS.includes(String(reason))) return { ok: false, reason: 'invalid_reason' };

    const wanted = Math.floor(Number(quantity));
    if (!Number.isFinite(wanted) || wanted < 1) return { ok: false, reason: 'invalid_quantity' };

    // A product marked non-returnable is refused for reasons of preference, and
    // accepted anyway when it arrived damaged or expired. Refusing those would mean
    // telling a customer that the fresh milk we delivered sour is their problem,
    // which no returns policy survives.
    const returnable = product?.isReturnable === true;
    if (!returnable && !NO_COLLECTION_REASONS.has(String(reason))) {
        return { ok: false, reason: 'not_returnable' };
    }

    const deadline = returnDeadlineFor(deliveredAt, product);
    if (!deadline) return { ok: false, reason: 'not_delivered' };
    if (now > deadline) return { ok: false, reason: 'window_closed' };

    const available = returnableQuantity(orderLine, alreadyReturned);
    if (available <= 0) return { ok: false, reason: 'nothing_left_to_return' };
    if (wanted > available) return { ok: false, reason: 'quantity_exceeds_delivered', available };

    return { ok: true, quantity: wanted, requiresCollection: !NO_COLLECTION_REASONS.has(String(reason)) };
}

/**
 * What a set of approved return lines is worth.
 *
 * Computed from the unit price actually charged, reduced by the same proportion the
 * order-level discount reduced the basket. Refunding the list price on a discounted
 * order hands back more than the customer paid -- on a heavily couponed basket that
 * is a straightforward way to lose money on every return.
 *
 * Fees are deliberately not refunded. The delivery happened, the rider was paid for
 * it, and a return does not undo the trip.
 */
export function computeReturnRefund(lines = [], { subtotal = 0, discount = 0 } = {}) {
    const gross = (Array.isArray(lines) ? lines : []).reduce(
        (sum, line) => sum + (Number(line?.unitPrice) || 0) * (Number(line?.quantity) || 0),
        0,
    );
    if (gross <= 0) return 0;

    const base = Number(subtotal) || 0;
    const off = Math.max(0, Number(discount) || 0);
    // No subtotal to apportion against means nothing to scale by; refund at face value.
    const share = base > 0 ? Math.max(0, base - off) / base : 1;

    return Math.round(gross * share * 100) / 100;
}
