/**
 * Replaces the catalogue with a quick-commerce one.
 *
 * The app started as food delivery, so the live catalogue is restaurant dishes
 * under categories like Kebabs and Shawarma. This seeds what a dark store
 * actually sells: packaged groceries and fresh produce, each carrying the tax
 * and label fields a packaged good is legally required to show.
 *
 * Every product is created twice over: once as a master product, and once as a
 * listing per store pointing at it. That is the whole point of the master
 * catalogue -- the same butter in three cities is one product with one name and
 * one tax class, not three rows that drifted apart.
 *
 *   node scripts/seed-quick-commerce.js                 report what it would do
 *   node scripts/seed-quick-commerce.js --apply         seed (keeps existing catalogue)
 *   node scripts/seed-quick-commerce.js --apply --wipe  delete every product and
 *                                                       category first, then seed
 *
 * --wipe is unrecoverable and takes the whole catalogue with it, including
 * products belonging to sellers this script never touches. It refuses to run
 * without --apply.
 *
 * The wipe runs LAST, after the new catalogue is safely written, and removes
 * everything the seed did not just create. Deleting first is what turns a
 * dropped connection halfway through into an empty shop with no way back --
 * which is exactly what happened the first time this was tested.
 */
import './_env.js';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodMasterProduct } from '../src/modules/food/admin/models/masterProduct.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';

const SEED_TAG = 'seed:quick-commerce';

/**
 * Zones to stock, most important first. Named rather than created: these are the
 * live zones the sellers already sit in, and inventing a new one would put the
 * catalogue somewhere no customer is.
 */
const TARGET_ZONE_NAMES = ['Khammam-1', 'Guntur', 'indore'];

/** parent -> children. Two levels is what the model allows. */
const CATEGORIES = {
    'Fruits & Vegetables': ['Fresh Fruits', 'Fresh Vegetables', 'Herbs & Seasonings'],
    'Dairy, Bread & Eggs': ['Milk', 'Curd & Paneer', 'Butter & Cheese', 'Bread & Eggs'],
    'Atta, Rice & Dal': ['Atta & Flour', 'Rice', 'Dal & Pulses', 'Sugar & Salt'],
    'Oil & Masala': ['Edible Oils', 'Spices'],
    'Snacks & Biscuits': ['Biscuits', 'Chips & Namkeen'],
    Beverages: ['Tea & Coffee', 'Cold Drinks', 'Water & Juices'],
    'Personal Care': ['Bath & Body', 'Oral Care'],
    'Home & Cleaning': ['Detergents', 'Cleaners'],
    'Baby Care': ['Diapers & Wipes'],
};

/**
 * The catalogue.
 *
 * GST is per product because it genuinely differs: loose produce and fresh milk
 * are exempt, staples are 5%, packaged fats 12%, most processed food and all
 * household chemicals 18%, and aerated drinks 28%. One basket rate would be
 * wrong for nearly every real cart, and the master product is what stops each
 * store guessing its own.
 *
 * [ subcategory, name, brand, pack, netQty, unit, price, mrp, gst, hsn, stock, foodType ]
 */
const PRODUCTS = [
    // --- Fruits & Vegetables (exempt, loose produce) ---
    ['Fresh Fruits', 'Banana Robusta', '', '1 kg', 1, 'kg', 54, 60, 0, '0803', 45, 'Veg'],
    ['Fresh Fruits', 'Royal Gala Apple', '', '4 pcs', 4, 'piece', 189, 210, 0, '0808', 30, 'Veg'],
    ['Fresh Fruits', 'Pomegranate', '', '500 g', 500, 'g', 96, 110, 0, '0810', 22, 'Veg'],
    ['Fresh Vegetables', 'Tomato Local', '', '1 kg', 1, 'kg', 32, 40, 0, '0702', 70, 'Veg'],
    ['Fresh Vegetables', 'Onion', '', '1 kg', 1, 'kg', 38, 45, 0, '0703', 65, 'Veg'],
    ['Fresh Vegetables', 'Potato', '', '1 kg', 1, 'kg', 34, 40, 0, '0701', 80, 'Veg'],
    ['Fresh Vegetables', 'Baby Spinach', '', '250 g', 250, 'g', 29, 35, 0, '0709', 20, 'Veg'],
    ['Herbs & Seasonings', 'Coriander Bunch', '', '100 g', 100, 'g', 15, 20, 0, '0709', 40, 'Veg'],
    ['Herbs & Seasonings', 'Ginger', '', '250 g', 250, 'g', 42, 50, 0, '0910', 26, 'Veg'],

    // --- Dairy, Bread & Eggs ---
    ['Milk', 'Toned Milk Pouch', 'Amul', '500 ml', 500, 'ml', 27, 28, 0, '0401', 120, 'Veg'],
    ['Milk', 'Full Cream Milk', 'Amul', '1 l', 1, 'l', 73, 76, 0, '0401', 80, 'Veg'],
    ['Curd & Paneer', 'Fresh Curd Cup', 'Amul', '400 g', 400, 'g', 40, 45, 5, '0403', 60, 'Veg'],
    ['Curd & Paneer', 'Malai Paneer', 'Amul', '200 g', 200, 'g', 95, 99, 5, '0406', 34, 'Veg'],
    ['Butter & Cheese', 'Salted Butter', 'Amul', '500 g', 500, 'g', 285, 295, 12, '0405', 24, 'Veg'],
    ['Butter & Cheese', 'Cheese Slices', 'Go', '200 g', 200, 'g', 145, 155, 12, '0406', 18, 'Veg'],
    ['Bread & Eggs', 'Whole Wheat Bread', 'Britannia', '400 g', 400, 'g', 55, 60, 5, '1905', 36, 'Veg'],
    ['Bread & Eggs', 'Farm Eggs', '', '6 pcs', 6, 'piece', 66, 72, 0, '0407', 50, 'Non-Veg'],

    // --- Atta, Rice & Dal (staples, 5%) ---
    ['Atta & Flour', 'Whole Wheat Atta', 'Aashirvaad', '5 kg', 5, 'kg', 285, 310, 5, '1101', 40, 'Veg'],
    ['Atta & Flour', 'Besan', 'Rajdhani', '500 g', 500, 'g', 78, 85, 5, '1106', 30, 'Veg'],
    ['Rice', 'Basmati Rice', 'India Gate', '1 kg', 1, 'kg', 132, 145, 5, '1006', 50, 'Veg'],
    ['Rice', 'Sona Masoori Rice', '', '5 kg', 5, 'kg', 345, 380, 5, '1006', 28, 'Veg'],
    ['Dal & Pulses', 'Toor Dal', 'Tata Sampann', '1 kg', 1, 'kg', 178, 195, 5, '0713', 38, 'Veg'],
    ['Dal & Pulses', 'Chana Dal', 'Tata Sampann', '500 g', 500, 'g', 82, 90, 5, '0713', 32, 'Veg'],
    ['Sugar & Salt', 'Refined Sugar', '', '1 kg', 1, 'kg', 52, 58, 5, '1701', 55, 'Veg'],
    ['Sugar & Salt', 'Iodised Salt', 'Tata', '1 kg', 1, 'kg', 28, 30, 0, '2501', 70, 'Veg'],

    // --- Oil & Masala ---
    ['Edible Oils', 'Sunflower Oil', 'Fortune', '1 l', 1, 'l', 148, 165, 5, '1512', 42, 'Veg'],
    ['Edible Oils', 'Mustard Oil', 'Fortune', '1 l', 1, 'l', 168, 185, 5, '1514', 26, 'Veg'],
    ['Spices', 'Turmeric Powder', 'Everest', '200 g', 200, 'g', 68, 75, 5, '0910', 44, 'Veg'],
    ['Spices', 'Red Chilli Powder', 'Everest', '200 g', 200, 'g', 92, 100, 5, '0904', 38, 'Veg'],

    // --- Snacks & Biscuits ---
    ['Biscuits', 'Marie Gold', 'Britannia', '250 g', 250, 'g', 35, 40, 18, '1905', 90, 'Veg'],
    ['Biscuits', 'Good Day Cashew', 'Britannia', '200 g', 200, 'g', 45, 50, 18, '1905', 64, 'Veg'],
    ['Biscuits', 'Dark Fantasy Choco Fills', 'Sunfeast', '300 g', 300, 'g', 145, 160, 18, '1905', 25, 'Veg'],
    ['Chips & Namkeen', 'Classic Salted Chips', 'Lays', '52 g', 52, 'g', 20, 20, 12, '2005', 110, 'Veg'],
    ['Chips & Namkeen', 'Aloo Bhujia', 'Haldiram', '400 g', 400, 'g', 105, 115, 12, '2106', 33, 'Veg'],

    // --- Beverages ---
    ['Tea & Coffee', 'Red Label Tea', 'Brooke Bond', '500 g', 500, 'g', 265, 285, 5, '0902', 28, 'Veg'],
    ['Tea & Coffee', 'Instant Coffee', 'Nescafe', '50 g', 50, 'g', 190, 205, 18, '2101', 22, 'Veg'],
    ['Cold Drinks', 'Cola Bottle', 'Coca-Cola', '750 ml', 750, 'ml', 40, 45, 28, '2202', 75, 'Veg'],
    // Deliberately zero, so the out-of-stock path has something real to render.
    ['Cold Drinks', 'Orange Drink', 'Mirinda', '600 ml', 600, 'ml', 40, 40, 28, '2202', 0, 'Veg'],
    ['Water & Juices', 'Packaged Water', 'Bisleri', '1 l', 1, 'l', 20, 22, 18, '2201', 140, 'Veg'],
    ['Water & Juices', 'Mixed Fruit Juice', 'Real', '1 l', 1, 'l', 125, 135, 12, '2009', 30, 'Veg'],

    // --- Personal Care (non-food, so foodType None) ---
    ['Bath & Body', 'Bathing Soap', 'Dove', '100 g', 100, 'g', 62, 70, 18, '3401', 58, 'None'],
    ['Bath & Body', 'Anti-Dandruff Shampoo', 'Head & Shoulders', '340 ml', 340, 'ml', 285, 320, 18, '3305', 20, 'None'],
    ['Oral Care', 'Toothpaste', 'Colgate', '200 g', 200, 'g', 105, 115, 18, '3306', 46, 'None'],

    // --- Home & Cleaning ---
    ['Detergents', 'Detergent Powder', 'Surf Excel', '1 kg', 1, 'kg', 145, 160, 18, '3402', 40, 'None'],
    ['Detergents', 'Dishwash Bar', 'Vim', '300 g', 300, 'g', 30, 35, 18, '3401', 72, 'None'],
    ['Cleaners', 'Floor Cleaner', 'Lizol', '975 ml', 975, 'ml', 199, 215, 18, '3402', 24, 'None'],

    // --- Baby Care ---
    ['Diapers & Wipes', 'Baby Diapers Medium', 'Pampers', '46 pcs', 46, 'piece', 699, 799, 12, '9619', 16, 'None'],
    ['Diapers & Wipes', 'Baby Wipes', 'Himalaya', '72 pcs', 72, 'piece', 199, 220, 18, '3307', 26, 'None'],
];

/** Stable synthetic barcode. Real EANs would be wrong to invent, but the link
 *  between a listing and its master is resolved from this, so it has to exist
 *  and stay the same across runs. */
const barcodeFor = (index) => `299${String(index + 1).padStart(10, '0')}`;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Fresh produce and bread spoil, so they cannot be sent back. */
const isReturnableFor = (parent) => !['Fruits & Vegetables', 'Dairy, Bread & Eggs'].includes(parent);

const parentOf = (sub) =>
    Object.entries(CATEGORIES).find(([, subs]) => subs.includes(sub))?.[0] ?? '';

/** Centre of a zone's ring, so a store lands inside the area it serves. */
const centreOf = (zone) => {
    const lats = (zone.coordinates || []).map((c) => c.latitude);
    const lngs = (zone.coordinates || []).map((c) => c.longitude);
    if (!lats.length) return null;
    return {
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
};

async function main() {
    const apply = process.argv.includes('--apply');
    const wipe = process.argv.includes('--wipe');

    if (wipe && !apply) {
        console.error('--wipe deletes every product and category and cannot be undone.');
        console.error('Re-run with --apply as well if that is really what you want.');
        process.exit(2);
    }

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set.');
        process.exit(2);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}`);

    const zones = await FoodZone.find({ name: { $in: TARGET_ZONE_NAMES } }).lean();
    if (!zones.length) {
        console.error(`None of these zones exist: ${TARGET_ZONE_NAMES.join(', ')}`);
        process.exit(1);
    }

    const itemsNow = await FoodItem.countDocuments();
    const catsNow = await FoodCategory.countDocuments();

    console.log('');
    console.log(`zones targeted : ${zones.map((z) => z.name).join(', ')}`);
    console.log(`catalogue now  : ${itemsNow} products, ${catsNow} categories`);
    console.log(`would seed     : ${PRODUCTS.length} master products`);
    console.log(`                 ${PRODUCTS.length * zones.length} listings (${PRODUCTS.length} x ${zones.length} stores)`);
    console.log(`                 ${Object.keys(CATEGORIES).length} parent + ${Object.values(CATEGORIES).flat().length} sub categories`);
    console.log(`                 ${zones.length} dark stores`);

    if (!apply) {
        console.log('\nreport only. Re-run with --apply to write, and --wipe to clear first.');
        await mongoose.disconnect();
        return;
    }

    // --- categories -------------------------------------------------------
    const catId = {};
    const seededCatIds = [];
    let sort = 0;
    for (const [parent, subs] of Object.entries(CATEGORIES)) {
        const p = await FoodCategory.findOneAndUpdate(
            { name: parent, parentId: { $exists: false } },
            {
                $set: {
                    name: parent,
                    type: SEED_TAG,
                    isActive: true,
                    approvalStatus: 'approved',
                    isApproved: true,
                    foodTypeScope: 'Both',
                    sortOrder: sort++,
                },
                $unset: { parentId: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        catId[parent] = p._id;
        seededCatIds.push(p._id);

        for (const sub of subs) {
            const c = await FoodCategory.findOneAndUpdate(
                { name: sub, parentId: p._id },
                {
                    $set: {
                        name: sub,
                        parentId: p._id,
                        type: SEED_TAG,
                        isActive: true,
                        approvalStatus: 'approved',
                        isApproved: true,
                        foodTypeScope: 'Both',
                        sortOrder: sort++,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            catId[sub] = c._id;
            seededCatIds.push(c._id);
        }
    }
    console.log(`categories     : ${Object.keys(catId).length} upserted`);

    // --- master products --------------------------------------------------
    const masterId = {};
    for (const [i, p] of PRODUCTS.entries()) {
        const [sub, name, brand, pack, netQty, unit, , mrp, gst, hsn, , foodType] = p;
        const doc = await FoodMasterProduct.findOneAndUpdate(
            { barcode: barcodeFor(i) },
            {
                $set: {
                    name,
                    brand,
                    barcode: barcodeFor(i),
                    packSize: pack,
                    netQuantity: netQty,
                    netQuantityUnit: unit,
                    hsnCode: hsn,
                    gstRate: gst,
                    mrp,
                    foodType,
                    countryOfOrigin: 'India',
                    categoryId: catId[sub],
                    categoryName: sub,
                    isActive: true,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        masterId[name] = doc._id;
    }
    console.log(`master products: ${Object.keys(masterId).length} upserted`);

    // --- one dark store per zone, then its listings ------------------------
    let listings = 0;
    const seededItemIds = [];
    for (const zone of zones) {
        const centre = centreOf(zone);
        if (!centre) {
            console.log(`  ${zone.name}: no ring coordinates, skipped`);
            continue;
        }

        const phone = `90000${String(1000 + TARGET_ZONE_NAMES.indexOf(zone.name)).slice(-5)}`;
        const store = await FoodRestaurant.findOneAndUpdate(
            { ownerPhone: phone },
            {
                $set: {
                    restaurantName: `VersaPack Dark Store — ${zone.name}`,
                    ownerName: 'VersaPack Operations',
                    ownerEmail: `darkstore.${slug(zone.name)}@versapack.in`,
                    ownerPhone: phone,
                    website: SEED_TAG,
                    status: 'approved',
                    storeType: 'dark_store',
                    serviceRadiusKm: 5,
                    isAcceptingOrders: true,
                    zoneId: zone._id,
                    location: { type: 'Point', coordinates: [centre.lng, centre.lat] },
                    estimatedDeliveryTime: '10-15 mins',
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // One bulkWrite per store rather than 48 sequential upserts. The first
        // test of this script died mid-seed on a dropped connection, and every
        // extra round trip is another chance for exactly that.
        const ops = PRODUCTS.map((p, i) => {
            const [sub, name, brand, pack, netQty, unit, price, mrp, gst, hsn, stock, foodType] = p;
            const parent = parentOf(sub);
            return {
                updateOne: {
                    filter: { restaurantId: store._id, barcode: barcodeFor(i) },
                    update: {
                        $set: {
                            restaurantId: store._id,
                            masterProductId: masterId[name],
                            barcode: barcodeFor(i),
                            name,
                            description: `${name}${brand ? ` by ${brand}` : ''}, ${pack}.`,
                            brand,
                            packSize: pack,
                            netQuantity: netQty,
                            netQuantityUnit: unit,
                            price,
                            mrp,
                            gstRate: gst,
                            hsnCode: hsn,
                            countryOfOrigin: 'India',
                            foodType,
                            categoryId: catId[sub],
                            categoryName: sub,
                            stockQty: stock,
                            lowStockThreshold: 10,
                            isAvailable: stock > 0,
                            isReturnable: isReturnableFor(parent),
                            returnWindowHours: isReturnableFor(parent) ? 24 : null,
                            approvalStatus: 'approved',
                            sku: `${slug(brand || 'generic')}-${slug(name)}`,
                        },
                    },
                    upsert: true,
                },
            };
        });
        await FoodItem.bulkWrite(ops, { ordered: false });
        listings += ops.length;

        const ids = await FoodItem.find({ restaurantId: store._id }).select('_id').lean();
        seededItemIds.push(...ids.map((d) => d._id));

        console.log(`  ${store.restaurantName}: ${PRODUCTS.length} listings`);
    }

    if (wipe) {
        // Last, and by exclusion. Deleting first meant a connection dropped
        // mid-seed left the catalogue empty with nothing to restore from -- which
        // is what happened the first time this was tested. Doing it here makes the
        // worst case the old catalogue surviving next to the new one, which is
        // fixed by running this again.
        console.log('');
        console.log(`wiping the ${itemsNow} products and ${catsNow} categories that were here before...`);
        const [items, cats] = await Promise.all([
            FoodItem.deleteMany({ _id: { $nin: seededItemIds } }),
            FoodCategory.deleteMany({ _id: { $nin: seededCatIds } }),
        ]);
        console.log(`  removed ${items.deletedCount} products, ${cats.deletedCount} categories`);
    }

    console.log('');
    console.log(`done: ${listings} listings across ${zones.length} stores`);
    console.log(`final: ${await FoodItem.countDocuments()} products, ${await FoodCategory.countDocuments()} categories`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
