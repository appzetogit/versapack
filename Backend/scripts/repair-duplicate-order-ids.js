/**
 * One-time repair: finds orders sharing the same display id (order_id / orderId)
 * and re-labels the newer duplicates with a guaranteed-unique id derived from
 * their own Mongo _id. The OLDEST order in each duplicate group keeps its id.
 *
 * Why: the old generator (`FOD-` + 4 timestamp digits + 3 random digits) collides
 * after a few thousand orders. Duplicate display ids made display-id lookups
 * (e.g. delivery-partner accept) match the WRONG order.
 *
 * Also verifies/creates the unique sparse indexes on order_id and orderId
 * (in --live mode) so future duplicates are rejected at write time.
 *
 * Usage:
 *   node scripts/repair-duplicate-order-ids.js          (dry run — reports only)
 *   node scripts/repair-duplicate-order-ids.js --live   (re-labels duplicates + ensures indexes)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';

const isLive = process.argv.includes('--live');

const uniqueIdFromDoc = async (doc) => {
    const hex = doc._id.toString();
    let candidate = `FOD-${hex.slice(-10).toUpperCase()}`;
    const clash = await FoodOrder.exists({
        _id: { $ne: doc._id },
        $or: [{ order_id: candidate }, { orderId: candidate }],
    });
    if (clash) candidate = `FOD-${hex.toUpperCase()}`; // full ObjectId — cannot clash
    return candidate;
};

const findDuplicateGroups = async (field) =>
    FoodOrder.aggregate([
        { $match: { [field]: { $type: 'string', $ne: '' } } },
        { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
    ]);

const ensureUniqueIndex = async (field) => {
    try {
        await FoodOrder.collection.createIndex(
            { [field]: 1 },
            { unique: true, sparse: true, name: `${field}_unique_sparse` },
        );
        console.log(`  index on ${field}: OK (unique, sparse)`);
    } catch (err) {
        console.error(`  index on ${field}: FAILED — ${err.message}`);
    }
};

const main = async () => {
    await connectDB();
    try {
        console.log(`[repair-duplicate-order-ids] ${isLive ? 'LIVE' : 'DRY RUN'}`);

        const indexes = await FoodOrder.collection.indexes();
        const hasUnique = (field) =>
            indexes.some((ix) => ix.key?.[field] === 1 && ix.unique === true);
        console.log(`  existing unique index — order_id: ${hasUnique('order_id')}, orderId: ${hasUnique('orderId')}`);

        let relabelled = 0;
        const seen = new Set();

        for (const field of ['order_id', 'orderId']) {
            const groups = await findDuplicateGroups(field);
            console.log(`  duplicate groups by ${field}: ${groups.length}`);

            for (const group of groups) {
                const docs = await FoodOrder.find({ _id: { $in: group.ids } })
                    .select('_id order_id orderId orderStatus createdAt')
                    .sort({ createdAt: 1 })
                    .lean();

                const [keeper, ...dupes] = docs;
                console.log(`    "${group._id}" x${docs.length} — keeping ${keeper._id} (${keeper.createdAt?.toISOString?.() || keeper.createdAt})`);

                for (const dupe of dupes) {
                    if (seen.has(String(dupe._id))) continue;
                    seen.add(String(dupe._id));

                    const newId = await uniqueIdFromDoc(dupe);
                    console.log(`      ${dupe._id} (${dupe.orderStatus}) → ${newId}`);
                    if (!isLive) continue;

                    await FoodOrder.collection.updateOne(
                        { _id: dupe._id },
                        { $set: { order_id: newId, orderId: newId } },
                    );
                    relabelled += 1;
                }
            }
        }

        if (isLive) {
            console.log('  ensuring unique indexes...');
            await ensureUniqueIndex('order_id');
            await ensureUniqueIndex('orderId');
        }

        console.log(`[repair-duplicate-order-ids] done: relabelled=${relabelled}${isLive ? '' : ' (dry run — nothing written; re-run with --live)'}`);
    } finally {
        await disconnectDB().catch(() => mongoose.disconnect());
    }
};

main().catch((err) => {
    console.error('[repair-duplicate-order-ids] failed:', err);
    process.exit(1);
});
