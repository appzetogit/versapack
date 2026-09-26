/**
 * Seeds a handful of realistic dummy notifications for a test account, across
 * every role it holds.
 *
 * Uses createInboxNotifications rather than a raw insert, so it goes through
 * the same validation and upsert path a real broadcast or order event does --
 * including the broadcastId-less filter that keeps a re-run from duplicating
 * rows (matched on ownerType + ownerId + title + message + source).
 *
 *   node scripts/seed-notifications.js --phone 7566850362           report
 *   node scripts/seed-notifications.js --phone 7566850362 --apply   write
 *
 * Looks the phone up against USER, RESTAURANT and DELIVERY_PARTNER and seeds
 * whichever of those it actually exists as -- a phone shared across roles
 * (a developer's own test number, typically) gets one set per role.
 */
import './_env.js';
import mongoose from 'mongoose';
import { FoodUser } from '../src/core/users/user.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { createInboxNotifications } from '../src/core/notifications/notification.service.js';

const SAMPLES = {
    USER: [
        { title: 'Order Confirmed!', message: 'Your order #FOD-1042 has been confirmed by the store.', category: 'order', link: '/orders/1042' },
        { title: 'Out for delivery', message: 'Your rider is on the way — arriving in about 8 minutes.', category: 'order', link: '/orders/1042' },
        { title: 'Order delivered', message: 'Your order #FOD-1042 has been delivered. Enjoy!', category: 'order', link: '/orders/1042' },
        { title: 'Weekend offer', message: 'Flat 20% off on your next order this weekend.', category: 'broadcast', link: '' },
    ],
    RESTAURANT: [
        { title: 'New order received', message: 'Order #FOD-1042 just came in — 3 items, ₹486.', category: 'order', link: '/seller/orders/1042' },
        { title: 'Payout processed', message: 'Your weekly payout of ₹4,250 has been credited.', category: 'payout', link: '/seller/hub-finance' },
        { title: 'Product approval needed', message: '2 new products are waiting for admin approval.', category: 'catalogue', link: '/seller/inventory' },
    ],
    DELIVERY_PARTNER: [
        { title: 'New delivery offer', message: 'A new order is available 1.2 km away — ₹35 for this trip.', category: 'order', link: '' },
        { title: 'Earnings updated', message: "Today's earnings: ₹340 across 6 deliveries.", category: 'earnings', link: '/pocket' },
    ],
};

const modelFor = { USER: FoodUser, RESTAURANT: FoodRestaurant, DELIVERY_PARTNER: FoodDeliveryPartner };
const phoneFieldFor = { USER: 'phone', RESTAURANT: 'ownerPhone', DELIVERY_PARTNER: 'phone' };

async function main() {
    const apply = process.argv.includes('--apply');
    const phoneArgIndex = process.argv.indexOf('--phone');
    const phone = phoneArgIndex !== -1 ? process.argv[phoneArgIndex + 1] : null;

    if (!phone) {
        console.error('Usage: node scripts/seed-notifications.js --phone <number> [--apply]');
        process.exit(2);
    }

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set.');
        process.exit(2);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}\n`);

    const targets = [];
    for (const [ownerType, Model] of Object.entries(modelFor)) {
        const doc = await Model.findOne({ [phoneFieldFor[ownerType]]: { $regex: phone } })
            .select('_id').lean();
        if (doc) targets.push({ ownerType, ownerId: String(doc._id) });
    }

    if (!targets.length) {
        console.error(`No account found for phone ${phone} under any role.`);
        process.exit(1);
    }

    console.log(`phone ${phone} resolves to:`);
    targets.forEach((t) => console.log(`  ${t.ownerType}  ${t.ownerId}`));
    console.log('');

    const notifications = targets.flatMap((t) =>
        SAMPLES[t.ownerType].map((s) => ({ ownerType: t.ownerType, ownerId: t.ownerId, ...s })),
    );
    console.log(`would seed ${notifications.length} notifications (${notifications.map((n) => n.title).join(', ')})`);

    if (!apply) {
        console.log('\nreport only. Re-run with --apply to write.');
        await mongoose.disconnect();
        return;
    }

    // createInboxNotifications only returns rows it can look up by broadcastId,
    // which none of these have -- it always returns [] here regardless of how
    // many were actually written. Count them back out directly instead.
    await createInboxNotifications({ notifications });
    const notifCol = mongoose.connection.db.collection('food_notifications');
    let written = 0;
    for (const t of targets) {
        written += await notifCol.countDocuments({
            ownerType: t.ownerType,
            ownerId: new mongoose.Types.ObjectId(t.ownerId),
            title: { $in: SAMPLES[t.ownerType].map((s) => s.title) },
        });
    }
    console.log(`
confirmed ${written} of ${notifications.length} rows present (re-running this is safe -- matching title+message rows are updated, not duplicated)`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
