/**
 * Guards the incoming-order FCM data map against the two ways it fails quietly.
 *
 * FCM rejects a data map over 4 KB, and the alert is the rider's only view of
 * an offer -- a rejected push is an order nobody is shown. The `items` field is
 * the only part that grows with the order, so it is what gets tested here.
 *
 * The second failure is subtler: trimming JSON by character count produces a
 * string the app cannot parse, which renders nothing at all rather than
 * degrading to no thumbnails.
 *
 *   node scripts/push-payload.selfcheck.mjs
 */
import assert from 'node:assert/strict';

const FCM_LIMIT = 4096;

// Mirrors buildPushItems in order-dispatch.service.js.
function buildPushItems(items) {
    const list = Array.isArray(items) ? items.slice(0, 4) : [];
    if (list.length === 0) return '[]';

    const withImages = list.map((i) => ({
        name: String(i?.name || ''),
        quantity: Number(i?.quantity || 1),
        image: String(i?.image || ''),
    }));

    const encoded = JSON.stringify(withImages);
    if (Buffer.byteLength(encoded, 'utf8') <= 1024) return encoded;

    return JSON.stringify(withImages.map(({ image, ...rest }) => rest));
}

const item = (n, extra = {}) => ({
    name: `Product number ${n}`,
    quantity: n,
    image: `https://cdn.example.com/products/image-${n}.jpg`,
    price: 199,
    ...extra,
});

// Never more than 4 entries, however big the order.
const many = buildPushItems(Array.from({ length: 40 }, (_, i) => item(i)));
assert.equal(JSON.parse(many).length, 4);

// Only the three rendered fields survive -- no price, no ids, no addons.
assert.deepEqual(Object.keys(JSON.parse(many)[0]).sort(), ['image', 'name', 'quantity']);

// Empty and missing both give parseable JSON, not '' or 'undefined'.
assert.equal(buildPushItems([]), '[]');
assert.equal(buildPushItems(undefined), '[]');
assert.deepEqual(JSON.parse(buildPushItems(null)), []);

// Absurdly long image URLs drop the images rather than truncating the string.
const longImage = 'https://cdn.example.com/' + 'x'.repeat(400) + '.jpg';
const huge = buildPushItems(Array.from({ length: 4 }, (_, i) => item(i, { image: longImage })));
const parsedHuge = JSON.parse(huge); // must not throw -- this is the whole point
assert.equal(parsedHuge.length, 4);
assert.ok(!('image' in parsedHuge[0]), 'images should be dropped when oversized');
assert.ok(Buffer.byteLength(huge, 'utf8') <= 1024);

// Whatever happens, the result is always parseable.
for (const n of [0, 1, 3, 4, 5, 50]) {
    JSON.parse(buildPushItems(Array.from({ length: n }, (_, i) => item(i))));
}

// The full map, with every field at a realistic worst case, must clear 4 KB.
const worstCase = {
    type: 'new_order',
    title: 'New order available!',
    body: 'Pickup: A Fairly Long Restaurant Name Here\nDrop: 42, Some Long Street Name, An Area, A City, A State, 560038\n12.4 km\nEarning: Rs.180',
    orderId: '6a7d7dbfb41e6920f88dc1ff',
    orderMongoId: '6a7d7dbfb41e6920f88dc1ff',
    orderDisplayId: 'FOD-0877545184',
    restaurantName: 'A Fairly Long Restaurant Name Here',
    restaurantAddress: '590, New Palasia, Indore, Madhya Pradesh, 452001',
    customerAddress: '42, Some Long Street Name, An Area, A City, A State, 560038',
    tripDistanceKm: '12.4',
    tripDurationMins: '31',
    riderEarning: '180',
    earnings: '180',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    total: '1249.5',
    acceptanceDeadlineAt: '2026-08-14T10:30:00.000Z',
    acceptTimeoutSeconds: '45',
    pickupAddress: '590, New Palasia, Indore, Madhya Pradesh, 452001',
    dropAddress: '42, Some Long Street Name, An Area, A City, A State, 560038',
    price: '180',
    distance: '12.4',
    orderNumber: 'FOD-0877545184',
    restaurantImage: 'https://res.cloudinary.com/demo/image/upload/v1234567890/restaurants/covers/a-fairly-long-cover-name.jpg',
    pickupLat: '22.728236',
    pickupLng: '75.8843431',
    dropLat: '12.9784',
    dropLng: '77.6408',
    customerName: 'Some Customer With A Long Name',
    customerPhone: '9000009001',
    itemsCount: '40',
    pickupDistanceKm: '2.7',
    items: buildPushItems(Array.from({ length: 40 }, (_, i) => item(i))),
};

const size = Buffer.byteLength(JSON.stringify(worstCase), 'utf8');
console.log(`worst-case data map: ${size} bytes of ${FCM_LIMIT}`);
assert.ok(size <= FCM_LIMIT, `data map ${size} bytes exceeds FCM's ${FCM_LIMIT}`);

// Every value must be a string -- FCM rejects the whole message otherwise, and
// a number slipped in by a later edit would not be caught until a live order.
for (const [k, v] of Object.entries(worstCase)) {
    assert.equal(typeof v, 'string', `data.${k} must be a string, got ${typeof v}`);
}

console.log('push payload selfcheck: PASS');
