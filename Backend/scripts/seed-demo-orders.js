/**
 * Seeds delivered orders for the seeded demo sellers, so the analytics screen
 * has something to show.
 *
 *   node scripts/seed-demo-orders.js          (report only)
 *   node scripts/seed-demo-orders.js --apply  (write)
 *   node scripts/seed-demo-orders.js --wipe   (remove only what this created)
 *
 * Scoped hard to the sellers created by seed-quick-commerce.js. A seller who
 * signed up for real must never find invented revenue in their reports, so the
 * seller list comes from the seed tag and nowhere else -- there is deliberately
 * no way to point this at an arbitrary store.
 *
 * Reports by default, like the other scripts here: one that writes to a live
 * database the moment it is run is one nobody can safely inspect first.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { FoodUser } from '../src/core/users/user.model.js';

const APPLY = process.argv.includes('--apply');
const WIPE = process.argv.includes('--wipe');

/** Tag written onto every order this creates; also how --wipe finds them. */
const SEED_NOTE = 'seed:demo-orders';

/**
 * The demo sellers, identified by the phone numbers seed-quick-commerce.js
 * upserts them on.
 *
 * Not the `website: 'seed:quick-commerce'` tag that script appears to set --
 * `website` is not on the restaurant schema, so Mongoose strips it on save and
 * the field is undefined on every seeded seller. (That also means that script's
 * own --wipe matches nothing, which is worth fixing separately.)
 *
 * A hardcoded list is the safer key regardless: it cannot be widened by a
 * stray document, so this can only ever touch these two stores.
 */
const SEED_SELLER_PHONES = ['9000000101', '9000000102'];

const DAYS = 30;
const ORDERS_PER_DAY = [2, 5, 3, 7, 4, 9, 6];

const CUSTOMERS = [
    { phone: '9000009001', name: 'Demo Customer One' },
    { phone: '9000009002', name: 'Demo Customer Two' },
    { phone: '9000009003', name: 'Demo Customer Three' },
    { phone: '9000009004', name: 'Demo Customer Four' },
];

const ADDRESS = {
    label: 'Home',
    name: 'Demo Customer',
    fullName: 'Demo Customer',
    street: '12, 4th Cross, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    phone: '9000009001',
    // Required, not decorative: deliveryAddress.location carries a 2dsphere
    // index, and a Point without coordinates is rejected outright at save.
    // Inside the seeded Bengaluru zone and a few km from both demo sellers, so
    // distance and serviceability come out plausible rather than absurd.
    location: { type: 'Point', coordinates: [77.6408, 12.9784], latitude: 12.9784, longitude: 77.6408 },
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Deterministic pseudo-random, seeded by index.
 *
 * Not Math.random: re-running has to produce the same orders, or every run
 * layers a fresh set of invented revenue on top of the last.
 */
const pick = (arr, n) => arr[n % arr.length];

async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    if (mongoose.connection.name !== 'quickcommerce') {
        console.error(`refusing to touch '${mongoose.connection.name}'`);
        process.exit(1);
    }
    console.log(`connected -> ${mongoose.connection.name}${APPLY || WIPE ? '' : '  (dry run)'}\n`);

    if (WIPE) {
        const res = await FoodOrder.deleteMany({ note: SEED_NOTE });
        console.log(`removed ${res.deletedCount} demo order(s)`);
        await mongoose.disconnect();
        return;
    }

    const sellers = await FoodRestaurant.find({ ownerPhone: { $in: SEED_SELLER_PHONES } })
        .select('_id restaurantName zoneId')
        .lean();

    if (!sellers.length) {
        console.error('no seeded sellers found -- run seed-quick-commerce.js first');
        process.exit(1);
    }
    console.log(`sellers: ${sellers.map((s) => s.restaurantName).join(', ')}`);

    const existing = await FoodOrder.countDocuments({ note: SEED_NOTE });
    if (existing > 0) {
        console.log(`${existing} demo order(s) already present -- nothing to do.`);
        console.log('re-run with --wipe first if you want them regenerated.');
        await mongoose.disconnect();
        return;
    }

    const users = [];
    for (const seed of CUSTOMERS) {
        let user = await FoodUser.findOne({ phone: seed.phone }).select('_id').lean();
        if (!user) {
            if (!APPLY) {
                console.log(`  +  would create customer ${seed.phone}`);
                users.push({ _id: new mongoose.Types.ObjectId(), ...seed });
                continue;
            }
            user = (await FoodUser.create({ ...seed, isVerified: true })).toObject();
            console.log(`  +  created customer ${seed.phone}`);
        }
        users.push({ ...user, ...seed });
    }

    const now = new Date();
    let created = 0;
    let totalValue = 0;

    for (const seller of sellers) {
        const products = await FoodItem.find({
            restaurantId: seller._id,
            approvalStatus: 'approved',
        })
            .select('_id name price gstRate brand packSize image categoryId categoryName foodType')
            .lean();

        if (!products.length) {
            console.log(`  !  ${seller.restaurantName} has no approved products, skipped`);
            continue;
        }

        for (let day = 0; day < DAYS; day += 1) {
            // parseInt, not Number: Number ignores its second argument, so any
            // non-decimal hex digit would come back NaN and collapse every
            // seller onto an identical daily pattern.
            const offset = parseInt(String(seller._id).slice(-1), 16) || 0;
            const count = pick(ORDERS_PER_DAY, day + offset);

            for (let n = 0; n < count; n += 1) {
                const seq = day * 10 + n;
                const placedAt = new Date(now.getTime() - day * 86400000);
                // Spread across trading hours rather than all at one instant, so
                // an hourly breakdown is not a single spike.
                placedAt.setHours(9 + (seq % 12), (seq * 7) % 60, 0, 0);

                const lineCount = 1 + (seq % 3);
                const items = [];
                for (let i = 0; i < lineCount; i += 1) {
                    const p = pick(products, seq + i * 3);
                    const quantity = 1 + ((seq + i) % 3);
                    items.push({
                        itemId: p._id,
                        name: p.name,
                        price: Number(p.price) || 0,
                        quantity,
                        gstRate: p.gstRate ?? null,
                        brand: p.brand || '',
                        packSize: p.packSize || '',
                        categoryId: p.categoryId || null,
                        categoryName: p.categoryName || '',
                        image: p.image || '',
                        isVeg: String(p.foodType || '').toLowerCase() === 'veg',
                    });
                }

                const subtotal = round2(
                    items.reduce((sum, it) => sum + it.price * it.quantity, 0),
                );
                const deliveryFee = 25;
                const platformFee = 5;
                const tax = round2(subtotal * 0.05);
                const total = round2(subtotal + deliveryFee + platformFee + tax);

                const customer = pick(users, seq);
                totalValue += total;
                created += 1;

                if (!APPLY) continue;

                const order = new FoodOrder({
                    userId: customer._id,
                    restaurantId: seller._id,
                    zoneId: seller.zoneId,
                    items,
                    deliveryAddress: { ...ADDRESS, name: customer.name, fullName: customer.name, phone: customer.phone },
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    pricing: { subtotal, deliveryFee, platformFee, tax, total },
                    // 'cash', not 'cod' -- the schema enum spells it the first way.
                    payment: { method: 'cash', status: 'paid' },
                    orderStatus: 'delivered',
                    // The tag lives here because it is the only free-text field
                    // on the order, and --wipe has to be able to find these
                    // again without a guess.
                    note: SEED_NOTE,
                    createdAt: placedAt,
                    updatedAt: placedAt,
                });

                // `timestamps: false` or the schema stamps every one of these
                // with now, putting the whole month's trade on today and making
                // the daily chart a single bar. save(), not insertOne(), so the
                // pre-save hook still allocates the unique order_id.
                await order.save({ timestamps: false });
            }
        }
    }

    console.log(`\n${APPLY ? 'created' : 'would create'} ${created} delivered order(s), value ~₹${round2(totalValue)}`);
    if (!APPLY) console.log('re-run with --apply to write these.');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('seed failed:', err.message);
    process.exit(1);
});
