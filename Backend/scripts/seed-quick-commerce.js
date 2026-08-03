/**
 * Seeds a quick-commerce catalog: a zone, two sellers, grocery categories with
 * subcategories, and products with real stock counts.
 *
 * Idempotent — re-running updates the same documents rather than duplicating
 * them, so it is safe to run against a database that already has this data.
 *
 *   node scripts/seed-quick-commerce.js
 *   node scripts/seed-quick-commerce.js --wipe   (removes only what this seeds)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';

const SEED_TAG = 'seed:quick-commerce';

// Bengaluru-ish box, big enough that any city coordinate used for testing lands
// inside it. Zones are plain lat/lng rings, not GeoJSON.
const ZONE_RING = [
    { latitude: 12.80, longitude: 77.40 },
    { latitude: 13.20, longitude: 77.40 },
    { latitude: 13.20, longitude: 77.80 },
    { latitude: 12.80, longitude: 77.80 },
];

const SELLERS = [
    {
        restaurantName: 'FreshMart Express',
        ownerName: 'Ravi Kumar',
        ownerEmail: 'freshmart@example.com',
        ownerPhone: '9000000101',
        latitude: 12.9716,
        longitude: 77.5946,
        estimatedDeliveryTime: '10-15 mins',
    },
    {
        restaurantName: 'DailyNeeds Store',
        ownerName: 'Anita Sharma',
        ownerEmail: 'dailyneeds@example.com',
        ownerPhone: '9000000102',
        latitude: 12.9352,
        longitude: 77.6245,
        estimatedDeliveryTime: '15-20 mins',
    },
];

// parent -> children. Two levels, which is the ceiling the model enforces.
const CATEGORIES = {
    Dairy: ['Milk', 'Curd & Yogurt', 'Butter & Cheese'],
    'Fruits & Vegetables': ['Fresh Fruits', 'Fresh Vegetables'],
    Staples: ['Atta & Flour', 'Rice & Pulses', 'Oils'],
    Snacks: ['Biscuits', 'Chips & Namkeen'],
    Beverages: ['Tea & Coffee', 'Soft Drinks'],
};

/**
 * GST is per product on purpose: fresh produce and milk are exempt, packaged
 * staples are 5%, biscuits and soft drinks are much higher. A single basket
 * rate would be wrong for almost every real cart.
 */
const PRODUCTS = [
    // sub, name, brand, pack, price, mrp, gst, stock, veg
    ['Milk', 'Toned Milk Pouch', 'Amul', '500 ml', 27, 28, 0, 120, 'Veg'],
    ['Milk', 'Full Cream Milk', 'Nandini', '1 L', 66, 70, 0, 80, 'Veg'],
    ['Curd & Yogurt', 'Fresh Curd Cup', 'Amul', '400 g', 40, 45, 0, 60, 'Veg'],
    ['Curd & Yogurt', 'Greek Yogurt Blueberry', 'Epigamia', '90 g', 55, 60, 12, 35, 'Veg'],
    ['Butter & Cheese', 'Salted Butter', 'Amul', '500 g', 285, 295, 12, 24, 'Veg'],
    ['Butter & Cheese', 'Cheese Slices', 'Go', '200 g', 145, 155, 12, 18, 'Veg'],

    ['Fresh Fruits', 'Banana Robusta', '', '1 kg', 54, 60, 0, 45, 'Veg'],
    ['Fresh Fruits', 'Royal Gala Apple', '', '4 pcs', 189, 210, 0, 30, 'Veg'],
    ['Fresh Vegetables', 'Tomato Local', '', '1 kg', 32, 40, 0, 70, 'Veg'],
    ['Fresh Vegetables', 'Onion', '', '1 kg', 38, 45, 0, 65, 'Veg'],
    ['Fresh Vegetables', 'Baby Spinach', '', '250 g', 29, 35, 0, 20, 'Veg'],

    ['Atta & Flour', 'Whole Wheat Atta', 'Aashirvaad', '5 kg', 285, 310, 5, 40, 'Veg'],
    ['Rice & Pulses', 'Basmati Rice', 'India Gate', '1 kg', 132, 145, 5, 50, 'Veg'],
    ['Rice & Pulses', 'Toor Dal', 'Tata Sampann', '1 kg', 178, 195, 5, 38, 'Veg'],
    ['Oils', 'Sunflower Oil', 'Fortune', '1 L', 148, 165, 5, 42, 'Veg'],

    ['Biscuits', 'Marie Gold', 'Britannia', '250 g', 35, 40, 18, 90, 'Veg'],
    ['Biscuits', 'Dark Fantasy Choco Fills', 'Sunfeast', '300 g', 145, 160, 18, 25, 'Veg'],
    ['Chips & Namkeen', 'Classic Salted Chips', 'Lays', '52 g', 20, 20, 18, 110, 'Veg'],
    ['Chips & Namkeen', 'Aloo Bhujia', 'Haldiram', '400 g', 105, 115, 12, 33, 'Veg'],

    ['Tea & Coffee', 'Red Label Tea', 'Brooke Bond', '500 g', 265, 285, 5, 28, 'Veg'],
    ['Tea & Coffee', 'Instant Coffee', 'Nescafe', '50 g', 190, 205, 18, 22, 'Veg'],
    ['Soft Drinks', 'Cola Bottle', 'Coca-Cola', '750 ml', 40, 45, 28, 75, 'Veg'],
    // Deliberately zero, so the out-of-stock rendering has something to show.
    ['Soft Drinks', 'Orange Drink', 'Mirinda', '600 ml', 40, 40, 28, 0, 'Veg'],
];

async function main() {
    const wipe = process.argv.includes('--wipe');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name}`);

    if (wipe) {
        const sellerIds = (await FoodRestaurant.find({ website: SEED_TAG }).select('_id').lean())
            .map((s) => s._id);
        const removed = await Promise.all([
            FoodItem.deleteMany({ restaurantId: { $in: sellerIds } }),
            FoodRestaurant.deleteMany({ website: SEED_TAG }),
            FoodCategory.deleteMany({ type: SEED_TAG }),
            FoodZone.deleteMany({ serviceLocation: SEED_TAG }),
        ]);
        console.log('wiped:', removed.map((r) => r.deletedCount).join(', '));
        await mongoose.disconnect();
        return;
    }

    // --- zone ---
    const zone = await FoodZone.findOneAndUpdate(
        { name: 'Bengaluru Central' },
        {
            $set: {
                name: 'Bengaluru Central',
                zoneName: 'Bengaluru Central',
                country: 'India',
                serviceLocation: SEED_TAG,
                unit: 'kilometer',
                isActive: true,
                coordinates: ZONE_RING,
            },
        },
        { upsert: true, new: true },
    );
    console.log(`zone: ${zone.name}`);

    // --- sellers ---
    const sellers = [];
    for (const s of SELLERS) {
        const doc = await FoodRestaurant.findOneAndUpdate(
            { ownerPhone: s.ownerPhone },
            {
                $set: {
                    ...s,
                    zoneId: zone._id,
                    status: 'approved',
                    approvedAt: new Date(),
                    isAcceptingOrders: true,
                    // Open around the clock so a test order is never refused for
                    // being outside trading hours.
                    openingTime: '12:00 AM',
                    closingTime: '11:59 PM',
                    openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    addressLine1: 'MG Road',
                    area: 'Central',
                    city: 'Bengaluru',
                    state: 'Karnataka',
                    pincode: '560001',
                    location: { type: 'Point', coordinates: [s.longitude, s.latitude] },
                    rating: 4.4,
                    totalRatings: 120,
                    pureVegRestaurant: false,
                    // Marker for --wipe; sellers have no dedicated tag field.
                    website: SEED_TAG,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        sellers.push(doc);
        console.log(`seller: ${doc.restaurantName}`);
    }

    // --- categories (parent then children) ---
    const subByName = new Map();
    let order = 0;
    for (const [parentName, children] of Object.entries(CATEGORIES)) {
        const parent = await FoodCategory.findOneAndUpdate(
            { name: parentName, restaurantId: { $exists: false } },
            {
                $set: {
                    name: parentName,
                    type: SEED_TAG,
                    foodTypeScope: 'Both',
                    approvalStatus: 'approved',
                    isApproved: true,
                    isActive: true,
                    sortOrder: order++,
                },
                $unset: { parentId: 1 },
            },
            { upsert: true, new: true },
        );

        for (const childName of children) {
            const child = await FoodCategory.findOneAndUpdate(
                { name: childName, restaurantId: { $exists: false } },
                {
                    $set: {
                        name: childName,
                        type: SEED_TAG,
                        parentId: parent._id,
                        foodTypeScope: 'Both',
                        approvalStatus: 'approved',
                        isApproved: true,
                        isActive: true,
                        sortOrder: order++,
                    },
                },
                { upsert: true, new: true },
            );
            subByName.set(childName, child);
        }
    }
    console.log(`categories: ${Object.keys(CATEGORIES).length} parents, ${subByName.size} subcategories`);

    // --- products, spread across both sellers ---
    let created = 0;
    for (const [subName, name, brand, packSize, price, mrp, gstRate, stockQty, foodType] of PRODUCTS) {
        const category = subByName.get(subName);
        if (!category) continue;

        for (const [index, seller] of sellers.entries()) {
            // The second seller stocks a subset and prices slightly higher, so
            // the same product genuinely appears from two sellers at two prices.
            if (index === 1 && created % 3 === 0) continue;
            const sellerPrice = index === 1 ? Math.min(Math.round(price * 1.05), mrp || Infinity) : price;

            await FoodItem.findOneAndUpdate(
                { restaurantId: seller._id, name },
                {
                    $set: {
                        restaurantId: seller._id,
                        categoryId: category._id,
                        categoryName: category.name,
                        name,
                        brand,
                        packSize,
                        description: `${brand ? brand + ' ' : ''}${name}${packSize ? ' - ' + packSize : ''}`,
                        price: sellerPrice,
                        mrp: mrp || null,
                        otherPrice: 0,
                        gstRate,
                        stockQty: index === 1 ? Math.ceil(stockQty / 2) : stockQty,
                        lowStockThreshold: 10,
                        maxQtyPerOrder: 10,
                        // Kept consistent with the count, which is what the
                        // reservation and every listing filter rely on.
                        isAvailable: stockQty > 0,
                        foodType,
                        approvalStatus: 'approved',
                        approvedAt: new Date(),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            created++;
        }
    }
    console.log(`products: ${created} listings across ${sellers.length} sellers`);

    const outOfStock = await FoodItem.countDocuments({
        restaurantId: { $in: sellers.map((s) => s._id) },
        stockQty: 0,
    });
    console.log(`   (${outOfStock} deliberately out of stock)`);

    await mongoose.disconnect();
    console.log('done');
}

main().catch((err) => {
    console.error('seed failed:', err.message);
    process.exit(1);
});
