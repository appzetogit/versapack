/**
 * Clears the food-delivery era out of the database, leaving the quick-commerce
 * catalogue behind.
 *
 * The app was a restaurant marketplace before it was a dark-store one, and the
 * leftovers are not just old products: 139 restaurant accounts, their
 * subscriptions and payouts, two abandoned verticals (dining, gourmet), and the
 * order and customer history built on top of all of it.
 *
 * Every collection in this database is named food_*, so "delete the food data"
 * read literally would take the whole application with it. What survives is
 * therefore listed explicitly rather than inferred, and the script refuses to
 * run if that list would come out empty.
 *
 *   node scripts/reset-food-delivery-data.js           report what would go
 *   node scripts/reset-food-delivery-data.js --apply   delete it
 *
 * There is no undo. Orders and transactions are GST invoice records, which in
 * India carry a statutory retention period -- deleting them is a decision to
 * make deliberately, not a cleanup.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Collections this script must never touch.
 *
 * The catalogue is what the whole migration was for. food_admins is how anyone
 * logs in afterwards -- dropping it locks everybody out of their own admin
 * panel, which is a mistake you only notice once it is too late.
 */
const KEEP = [
    'food_items',
    'food_categories',
    'food_master_products',
    'food_admins',
    'food_zones',
    'food_business_settings',
    'foodbusinesssettings',
    'food_fee_settings',
    'food_feature_settings',
    'food_landing_settings',
    'food_referral_settings',
    'food_restaurant_subscription_settings',
    'food_earning_addons',
    'food_hero_banners',
    'topbanners',
    'food_page_contents',
    'food_explore_icons',
    'food_home_promotion_banners',
    'food_under250_banners',
];

/** Emptied entirely. */
const DROP_ALL = {
    'legacy verticals': [
        'food_dining_restaurants',
        'food_dining_categories',
        'food_gourmet_restaurants',
        'food_addons',
    ],
    'seller history': [
        'food_restaurant_subscription_history',
        'food_restaurant_withdrawals',
        'food_restaurant_support_tickets',
        'food_unregistered_restaurants',
        'food_subscription_transactions',
        'food_subscription_invoices',
        'food_subscription_billing_runs',
        'food_restaurant_wallets',
        'food_offers',
        'food_offer_usages',
    ],
    'orders and payments': [
        'food_orders',
        'food_transactions',
        'payment_intents',
        'food_user_carts',
    ],
    'customers and riders': [
        'food_users',
        'food_refresh_tokens',
        'food_user_wallets',
        'food_delivery_partners',
        'food_delivery_wallets',
        'food_delivery_withdrawals',
        'food_delivery_bonus_transactions',
        'food_delivery_cash_deposits',
        'food_delivery_cash_limits',
        'food_delivery_support_tickets',
        'food_delivery_order_emergency_requests',
        'food_delivery_emergency_help',
        'food_support_tickets',
        'food_notifications',
        'food_referral_logs',
        'food_feedback_experiences',
        'food_safety_emergency_reports',
        'food_earning_addon_history',
    ],
};

async function main() {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set.');
        process.exit(2);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    const db = mongoose.connection.db;
    console.log(`connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}\n`);

    // The dark stores are the only sellers that survive, and they are identified
    // by what they are rather than by name, so a store added later is kept too.
    const keepStores = await db.collection('food_restaurants')
        .find({ storeType: 'dark_store' }).project({ _id: 1, restaurantName: 1 }).toArray();
    const keepIds = keepStores.map((s) => s._id);

    if (keepIds.length === 0) {
        console.error('No dark stores found. That would delete every seller and leave');
        console.error('the catalogue orphaned, so this refuses to run. Seed first.');
        process.exit(1);
    }

    const items = await db.collection('food_items').countDocuments();
    if (items === 0) {
        console.error('food_items is empty -- the catalogue this is meant to preserve');
        console.error('is not there. Refusing to run.');
        process.exit(1);
    }

    console.log(`keeping ${keepIds.length} dark stores:`);
    keepStores.forEach((s) => console.log(`   ${s.restaurantName}`));
    console.log(`keeping the catalogue: ${items} products\n`);

    const oldStores = await db.collection('food_restaurants')
        .countDocuments({ _id: { $nin: keepIds } });
    const oldTimings = await db.collection('food_restaurant_outlet_timings')
        .countDocuments({ restaurantId: { $nin: keepIds } });

    let total = 0;
    console.log('would delete:');
    console.log(`  restaurants (not dark stores) ${String(oldStores).padStart(7)}`);
    console.log(`  outlet timings (theirs)       ${String(oldTimings).padStart(7)}`);
    total += oldStores + oldTimings;

    const plan = [];
    for (const [group, names] of Object.entries(DROP_ALL)) {
        console.log(`  -- ${group}`);
        for (const name of names) {
            if (KEEP.includes(name)) throw new Error(`${name} is in both KEEP and DROP_ALL`);
            const n = await db.collection(name).countDocuments().catch(() => 0);
            if (n > 0) {
                console.log(`     ${name.padEnd(42)} ${String(n).padStart(7)}`);
                plan.push(name);
                total += n;
            }
        }
    }
    console.log(`\n  total documents: ${total}`);

    if (!apply) {
        console.log('\nreport only. Re-run with --apply to delete. There is no undo.');
        await mongoose.disconnect();
        return;
    }

    console.log('\ndeleting...');
    const r1 = await db.collection('food_restaurants').deleteMany({ _id: { $nin: keepIds } });
    const r2 = await db.collection('food_restaurant_outlet_timings')
        .deleteMany({ restaurantId: { $nin: keepIds } });
    console.log(`  restaurants    ${r1.deletedCount}`);
    console.log(`  outlet timings ${r2.deletedCount}`);

    let removed = r1.deletedCount + r2.deletedCount;
    for (const name of plan) {
        const r = await db.collection(name).deleteMany({});
        console.log(`  ${name.padEnd(42)} ${r.deletedCount}`);
        removed += r.deletedCount;
    }

    console.log(`\nremoved ${removed} documents`);
    console.log('surviving:');
    for (const name of ['food_items', 'food_categories', 'food_master_products', 'food_restaurants', 'food_admins', 'food_zones']) {
        console.log(`  ${name.padEnd(24)} ${await db.collection(name).countDocuments()}`);
    }
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
