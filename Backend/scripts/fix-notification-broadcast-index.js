/**
 * Replaces the notifications collection's sparse unique index with a partial
 * one.
 *
 * `sparse` on a COMPOUND index only excludes a document when EVERY key in the
 * index is absent. ownerType and ownerId are required on every notification,
 * so the sparse flag on {broadcastId, ownerType, ownerId} never excluded
 * anything: a non-broadcast notification (FSSAI expiry, support response,
 * subscription billing) was indexed as {broadcastId: null, ownerType, ownerId}
 * regardless, and the second such notification for the same owner -- of any
 * kind -- collided with the unique constraint and was silently dropped. Every
 * write site catches the error and only logs it, so nothing surfaced.
 *
 * A partial index filtered on the field actually existing is what "one row per
 * broadcast recipient" was meant to enforce, without touching documents that
 * were never a broadcast in the first place.
 *
 *   node scripts/fix-notification-broadcast-index.js           report
 *   node scripts/fix-notification-broadcast-index.js --apply   write
 */
import './_env.js';
import mongoose from 'mongoose';

const OLD_INDEX_NAME = 'broadcastId_1_ownerType_1_ownerId_1';

async function main() {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set.');
        process.exit(2);
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}\n`);

    const col = mongoose.connection.db.collection('food_notifications');
    const existing = await col.indexes();
    const old = existing.find((i) => i.name === OLD_INDEX_NAME);

    console.log('current index:', old ? JSON.stringify(old) : '(not found)');

    // Anything with an explicit null broadcastId would collide with the new
    // partial index once broadcastId genuinely exists=false is required, so
    // clear those first -- the schema no longer defaults the field, so any
    // remaining nulls are leftovers from before this fix.
    const explicitNulls = await col.countDocuments({ broadcastId: { $type: 10 } }); // BSON type 10 = null
    console.log('documents with an explicit null broadcastId:', explicitNulls);

    if (!apply) {
        console.log('\nreport only. Re-run with --apply to replace the index.');
        await mongoose.disconnect();
        return;
    }

    if (explicitNulls > 0) {
        const r = await col.updateMany({ broadcastId: { $type: 10 } }, { $unset: { broadcastId: '' } });
        console.log(`unset broadcastId on ${r.modifiedCount} document(s)`);
    }

    if (old) {
        await col.dropIndex(OLD_INDEX_NAME);
        console.log('dropped old index');
    }

    await col.createIndex(
        { broadcastId: 1, ownerType: 1, ownerId: 1 },
        { unique: true, partialFilterExpression: { broadcastId: { $exists: true } } },
    );
    console.log('created partial unique index');

    const after = await col.indexes();
    console.log('\nfinal index:', JSON.stringify(after.find((i) => i.name.startsWith('broadcastId_1_ownerType'))));
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
