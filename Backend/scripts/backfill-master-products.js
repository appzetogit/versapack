/**
 * Builds the master catalogue out of the listings that already exist.
 *
 * On a marketplace the same manufactured product is listed by many sellers, each as an
 * unrelated FoodItem. This groups the ones that share a barcode, mints one master per
 * group, and points the listings at it — after which search shows the product once
 * instead of once per seller, and the tax class stops being whatever each seller typed.
 *
 *   node scripts/backfill-master-products.js          (report only)
 *   node scripts/backfill-master-products.js --apply  (write)
 *
 * Reports by default. A script that rewrites a live catalogue the moment it is run is
 * one nobody can safely inspect first.
 *
 * BARCODE ONLY, deliberately. Grouping by name would be far more ambitious and far
 * more damaging: "Amul Butter 500g" and "Amul Butter Unsalted 500g" differ by one word
 * and are different products, and a wrong merge sells a customer the wrong thing under
 * the wrong tax code with nobody able to see it happened. Listings with no barcode are
 * left alone for an admin to link by hand, which is the honest answer for them.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodMasterProduct, normalizeBarcode } from '../src/modules/food/admin/models/masterProduct.model.js';

const APPLY = process.argv.includes('--apply');

/**
 * The most complete listing in a group becomes the master's starting point.
 *
 * "Most complete" rather than "first" or "cheapest": the master's job is to hold the
 * descriptive fields, so the listing that already fills in the most of them produces
 * the best master and the least manual cleanup afterwards.
 */
const completeness = (item) =>
    [
        item.name,
        item.brand,
        item.packSize,
        item.hsnCode,
        item.countryOfOrigin,
        item.manufacturerName,
        item.marketedByName,
        item.image,
        item.netQuantity,
        item.netQuantityUnit,
        item.gstRate,
    ].filter((v) => v !== null && v !== undefined && v !== '').length;

/**
 * The GST rate the group agrees on, or null when it does not.
 *
 * A disagreement here is the exact problem the master catalogue exists to fix, and it
 * cannot be resolved by majority vote — picking the more popular wrong answer is still
 * wrong on an invoice. Left null and reported, so an admin decides.
 */
const agreedValue = (items, field) => {
    const values = new Set(
        items
            .map((i) => i[field])
            .filter((v) => v !== null && v !== undefined && v !== '')
            .map(String),
    );
    if (values.size !== 1) return { value: null, conflict: values.size > 1 };
    const raw = items.find((i) => String(i[field] ?? '') === [...values][0])[field];
    return { value: raw, conflict: false };
};

const run = async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set');
        process.exit(1);
    }
    await mongoose.connect(uri);
    console.log(`Connected. Mode: ${APPLY ? 'APPLY (writes)' : 'REPORT ONLY'}\n`);

    const candidates = await FoodItem.find({
        masterProductId: null,
        barcode: { $nin: [null, ''] },
    })
        .select(
            '_id restaurantId name brand packSize barcode hsnCode gstRate netQuantity netQuantityUnit ' +
            'countryOfOrigin manufacturerName marketedByName foodType categoryId categoryName image images',
        )
        .lean();

    const byBarcode = new Map();
    for (const item of candidates) {
        const code = normalizeBarcode(item.barcode);
        if (!code) continue;
        if (!byBarcode.has(code)) byBarcode.set(code, []);
        byBarcode.get(code).push(item);
    }

    let created = 0;
    let linked = 0;
    let adopted = 0;
    const conflicts = [];

    for (const [barcode, items] of byBarcode) {
        // A master may already exist from an earlier run or an admin creating one.
        const existing = await FoodMasterProduct.findOne({ barcode }).select('_id').lean();

        let masterId = existing?._id || null;

        if (!masterId) {
            const seed = [...items].sort((a, b) => completeness(b) - completeness(a))[0];
            const gst = agreedValue(items, 'gstRate');
            const hsn = agreedValue(items, 'hsnCode');

            if (gst.conflict || hsn.conflict) {
                conflicts.push({
                    barcode,
                    name: seed.name,
                    sellers: items.length,
                    gstRates: [...new Set(items.map((i) => i.gstRate).filter((v) => v != null))],
                    hsnCodes: [...new Set(items.map((i) => i.hsnCode).filter(Boolean))],
                });
            }

            const payload = {
                name: seed.name,
                brand: seed.brand || '',
                packSize: seed.packSize || '',
                barcode,
                netQuantity: seed.netQuantity ?? null,
                netQuantityUnit: seed.netQuantityUnit ?? null,
                // Only carried over when every listing agrees; a disagreement is
                // reported instead, because the majority answer is not the right one.
                gstRate: gst.value ?? null,
                hsnCode: hsn.value ?? '',
                countryOfOrigin: seed.countryOfOrigin || '',
                manufacturerName: seed.manufacturerName || '',
                marketedByName: seed.marketedByName || '',
                foodType: seed.foodType || 'None',
                image: seed.image || '',
                images: Array.isArray(seed.images) && seed.images.length ? seed.images : [],
                categoryId: seed.categoryId || undefined,
                categoryName: seed.categoryName || '',
            };

            if (APPLY) {
                const doc = await FoodMasterProduct.create(payload);
                masterId = doc._id;
            }
            created += 1;
        } else {
            adopted += 1;
        }

        if (APPLY && masterId) {
            const result = await FoodItem.updateMany(
                { _id: { $in: items.map((i) => i._id) } },
                { $set: { masterProductId: masterId } },
            );
            linked += result.modifiedCount;
        } else {
            linked += items.length;
        }
    }

    const grouped = [...byBarcode.values()].filter((g) => g.length > 1);
    const unbarcoded = await FoodItem.countDocuments({
        masterProductId: null,
        $or: [{ barcode: null }, { barcode: '' }],
    });

    console.log(`Listings with a barcode and no master : ${candidates.length}`);
    console.log(`Distinct products (by barcode)        : ${byBarcode.size}`);
    console.log(`  of which stocked by 2+ sellers      : ${grouped.length}`);
    console.log(`Masters ${APPLY ? 'created' : 'that would be created'}          : ${created}`);
    console.log(`Masters already present               : ${adopted}`);
    console.log(`Listings ${APPLY ? 'linked' : 'that would be linked'}           : ${linked}`);
    console.log(`Listings with no barcode (left alone) : ${unbarcoded}`);

    if (conflicts.length > 0) {
        console.log(`\n${conflicts.length} product(s) whose sellers disagree on tax. Left blank for an admin:`);
        for (const c of conflicts.slice(0, 25)) {
            console.log(
                `  ${c.barcode}  ${c.name}  (${c.sellers} sellers)  gst=[${c.gstRates.join(', ')}]  hsn=[${c.hsnCodes.join(', ')}]`,
            );
        }
        if (conflicts.length > 25) console.log(`  ... and ${conflicts.length - 25} more`);
    }

    if (!APPLY) {
        console.log('\nNothing was written. Re-run with --apply to commit.');
    }

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(`Backfill failed: ${err.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
