import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodAdmin } from '../src/core/admin/admin.model.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URI;

if (!MONGO_URI) {
    throw new Error('Mongo connection string not found in env');
}

const run = async () => {
    await mongoose.connect(MONGO_URI);

    const result = await FoodAdmin.updateMany(
        {},
        {
            $set: {
                adminType: 'super_admin',
                isDeleted: false,
            },
        }
    );

    console.log(`Updated admins: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Failed to mark existing admins as super admin', error);
    try { await mongoose.disconnect(); } catch (_e) {}
    process.exit(1);
});
