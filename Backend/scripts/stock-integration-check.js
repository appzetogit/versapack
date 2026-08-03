/**
 * Exercises the stock paths against a real database.
 *
 * The selfchecks cover the arithmetic; these are the parts that only mean
 * anything against Mongo — the conditional decrement that makes two concurrent
 * orders safe, the partial rollback, and the claim that stops a restock running
 * twice. Simulating them would test a copy of the semantics.
 *
 *   node scripts/stock-integration-check.js
 *
 * Uses its own throwaway products and orders and removes them afterwards, so it
 * never disturbs seeded catalogue or real rows.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import {
    reserveStockForItems,
    restoreOrderStock,
} from '../src/modules/food/orders/services/inventory.service.js';

const TAG = 'stockcheck:temp';
let pass = 0;
let fail = 0;

const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    ok ? pass++ : fail++;
};

const qtyOf = async (id) => (await FoodItem.findById(id).select('stockQty isAvailable').lean());

async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    if (mongoose.connection.name !== 'quickcommerce') {
        console.error(`refusing to run against '${mongoose.connection.name}'`);
        process.exit(1);
    }
    console.log(`connected -> ${mongoose.connection.name}\n`);

    const seller = await FoodRestaurant.findOne({ status: 'approved' }).select('_id').lean();
    if (!seller) { console.error('no seller found; run the seeder first'); process.exit(1); }

    const mk = async (name, stockQty) =>
        FoodItem.create({
            restaurantId: seller._id, name: `${TAG} ${name}`, description: TAG,
            price: 100, stockQty, isAvailable: true, approvalStatus: 'approved', foodType: 'Veg',
        });

    try {
        // ---- 1. concurrent buyers, one unit left -------------------------------
        console.log('1. two orders race for the last unit');
        const a = await mk('race', 1);
        const results = await Promise.allSettled([
            reserveStockForItems([{ itemId: String(a._id), quantity: 1 }]),
            reserveStockForItems([{ itemId: String(a._id), quantity: 1 }]),
        ]);
        const won = results.filter((r) => r.status === 'fulfilled').length;
        const lost = results.filter((r) => r.status === 'rejected').length;
        const afterRace = await qtyOf(a._id);
        check('exactly one buyer wins', won === 1, `${won} won, ${lost} rejected`);
        check('stock never goes negative', afterRace.stockQty === 0, `stockQty=${afterRace.stockQty}`);
        check('sold-out item auto-hides', afterRace.isAvailable === false, `isAvailable=${afterRace.isAvailable}`);
        check('loser got a real message', /out of stock|Only/i.test(results.find(r => r.status === 'rejected')?.reason?.message || ''),
            results.find(r => r.status === 'rejected')?.reason?.message?.slice(0, 60));

        // ---- 2. partial basket rolls back -------------------------------------
        console.log('\n2. a short line rolls back the lines already taken');
        const b1 = await mk('roll-ok', 10);
        const b2 = await mk('roll-short', 1);
        let threw = false;
        try {
            await reserveStockForItems([
                { itemId: String(b1._id), quantity: 3 },
                { itemId: String(b2._id), quantity: 5 },
            ]);
        } catch { threw = true; }
        const b1After = await qtyOf(b1._id);
        const b2After = await qtyOf(b2._id);
        check('order rejected', threw);
        check('earlier line put back', b1After.stockQty === 10, `expected 10, got ${b1After.stockQty}`);
        check('short line untouched', b2After.stockQty === 1, `expected 1, got ${b2After.stockQty}`);

        // ---- 3. same product on two lines -------------------------------------
        console.log('\n3. same product on two cart lines comes off one shelf');
        const c = await mk('dup', 5);
        await reserveStockForItems([
            { itemId: String(c._id), quantity: 2 },
            { itemId: String(c._id), quantity: 3 },
        ]);
        const cAfter = await qtyOf(c._id);
        check('all five units taken', cAfter.stockQty === 0, `stockQty=${cAfter.stockQty}`);

        // ---- 4. restock is idempotent -----------------------------------------
        console.log('\n4. restock runs once however many times it is called');
        const d = await mk('restock', 10);
        await reserveStockForItems([{ itemId: String(d._id), quantity: 4 }]);
        const order = await FoodOrder.create({
            userId: new mongoose.Types.ObjectId(), restaurantId: seller._id,
            items: [{ itemId: String(d._id), name: `${TAG} restock`, price: 100, quantity: 4 }],
            // Required by the schema, and coordinates are required by the 2dsphere
            // index on the address. Irrelevant to stock, but the row will not insert
            // without them.
            deliveryAddress: {
                street: 'test', city: 'test', state: 'test',
                location: { type: 'Point', coordinates: [77.59, 12.97] },
            },
            pricing: { subtotal: 400, total: 400 },
            orderStatus: 'created', stockReservedAt: new Date(), note: TAG,
        });
        const first = await restoreOrderStock(order.toObject());
        const afterFirst = await qtyOf(d._id);
        const reloaded = await FoodOrder.findById(order._id).lean();
        const second = await restoreOrderStock(reloaded);
        const third = await restoreOrderStock(reloaded);
        const afterAll = await qtyOf(d._id);
        check('first restock applied', first === true && afterFirst.stockQty === 10, `stockQty=${afterFirst.stockQty}`);
        check('repeat restocks refused', second === false && third === false);
        check('count did not inflate', afterAll.stockQty === 10, `expected 10, got ${afterAll.stockQty}`);
        check('item came back on sale', afterAll.isAvailable === true);

        // ---- 5. untracked products still sell ---------------------------------
        console.log('\n5. products with no count behave as before');
        const e = await mk('untracked', null);
        await FoodItem.updateOne({ _id: e._id }, { $set: { stockQty: null } });
        const taken = await reserveStockForItems([{ itemId: String(e._id), quantity: 999 }]);
        const eAfter = await qtyOf(e._id);
        check('unlimited quantity allowed', eAfter.stockQty === null, `stockQty=${eAfter.stockQty}`);
        check('nothing reserved for it', taken.length === 0);
    } finally {
        const del = await FoodItem.deleteMany({ description: TAG });
        const delOrders = await FoodOrder.deleteMany({ note: TAG });
        console.log(`\ncleanup: removed ${del.deletedCount} products, ${delOrders.deletedCount} orders`);
        await mongoose.disconnect();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('check crashed:', err); process.exit(1); });
