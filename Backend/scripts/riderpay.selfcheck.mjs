/**
 * Pins rider-payout behaviour, especially the difference between "0 km" and
 * "distance unknown".
 *
 * Number(null) is 0, and 0 is finite and non-negative, so the obvious coercion
 * silently prices an unresolvable trip as a delivery to the shop's own door.
 * That has now bitten this codebase three times (GST rate, delivery promise,
 * rider pay), which is why it gets a test rather than a comment.
 *
 *   node scripts/riderpay.selfcheck.mjs
 */
import assert from 'node:assert/strict';
import { calculateRiderEarning, resolveUserDeliveryFee } from '../src/modules/food/orders/services/order-pricing.service.js';

// The live quick-commerce shape: flat base pay close in, per-km beyond.
const fees = {
    deliveryFee: 15,
    deliveryFeeRanges: [
        { min: 0, max: 3, fee: 15, deliveryBoyBasePay: 17, deliveryBoyPerKm: 0 },
        { min: 3, max: 30, fee: 15, deliveryBoyBasePay: 0, deliveryBoyPerKm: 6 },
    ],
};

// A genuine zero-distance trip -- the store delivering to its own address --
// is real and must pay the short-band rate, not nothing.
assert.equal(calculateRiderEarning(fees, 0), 17);
assert.equal(calculateRiderEarning(fees, 2.9), 17);
assert.equal(calculateRiderEarning(fees, 3), 18);
assert.equal(calculateRiderEarning(fees, 10), 60);
assert.equal(calculateRiderEarning(fees, 30), 180);

// Unknown distance must NOT be priced as a 0 km trip. It happens to land on the
// same number here because the short band is flat, so assert the intent
// directly against a config where the two would differ.
for (const unknown of [null, undefined, '']) {
    assert.equal(calculateRiderEarning(fees, unknown), 17, `unknown (${unknown}) should pay the guaranteed minimum`);
}

const perKmOnly = {
    deliveryFeeRanges: [{ min: 0, max: 30, fee: 15, deliveryBoyBasePay: 0, deliveryBoyPerKm: 6 }],
};
// This is the case that used to pay nothing: no base pay to fall back on, and
// a null distance coerced to 0 km.
assert.equal(calculateRiderEarning(perKmOnly, 0), 0, 'a real 0 km trip on a perKm band genuinely earns 0');
assert.equal(calculateRiderEarning(perKmOnly, null), 6, 'unknown distance must not pay 0 for real work');
assert.notEqual(
    calculateRiderEarning(perKmOnly, null),
    calculateRiderEarning(perKmOnly, 0),
    'unknown and zero must be distinguishable',
);

// The customer side already handled null correctly; keep it that way, and keep
// the two sides consistent about what "unknown" means.
assert.equal(resolveUserDeliveryFee(fees, { subtotal: 500, distanceKm: null }).distanceKm, null);
assert.equal(resolveUserDeliveryFee(fees, { subtotal: 500, distanceKm: null }).source, 'default');
assert.equal(resolveUserDeliveryFee(fees, { subtotal: 500, distanceKm: 10 }).deliveryFee, 15);

// No bands configured at all: nothing can be computed, and inventing a payout
// would be worse than reporting zero.
assert.equal(calculateRiderEarning({ deliveryFeeRanges: [] }, 5), 0);
assert.equal(calculateRiderEarning({}, null), 0);

// Negative distance is nonsense, not a discount.
assert.equal(calculateRiderEarning(fees, -5), 0);

console.log('rider pay selfcheck: PASS');
