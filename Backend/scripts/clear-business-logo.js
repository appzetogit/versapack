import './_env.js';
import mongoose from 'mongoose';
import { FoodBusinessSettings } from '../src/modules/food/admin/models/businessSettings.model.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URI;

if (!MONGO_URI) {
    console.error('Mongo connection string not found in Backend/.env');
    process.exit(1);
}

const run = async () => {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    const result = await FoodBusinessSettings.updateMany(
        {},
        {
            $set: {
                'logo.url': '',
                'logo.publicId': '',
                companyName: 'VersaPack'
            }
        }
    );

    console.log(`Updated FoodBusinessSettings: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
    console.log('Successfully cleared logo from database!');
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Failed to clear business logo:', error);
    try { await mongoose.disconnect(); } catch (_e) {}
    process.exit(1);
});
