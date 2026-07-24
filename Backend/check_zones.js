import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const restaurantSchema = new mongoose.Schema({
    restaurantName: String,
    zoneId: mongoose.Schema.Types.ObjectId,
    status: String
}, { collection: 'food_restaurants' });

const FoodRestaurant = mongoose.model('FoodRestaurant', restaurantSchema);

async function checkRestaurants() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const restaurants = await FoodRestaurant.find({ status: 'approved' }).limit(5).lean();
        console.log('Approved restaurants sample:');
        restaurants.forEach(r => {
            console.log(`Name: ${r.restaurantName}, ZoneId: ${r.zoneId}`);
        });

        const withZone = await FoodRestaurant.countDocuments({ zoneId: { $exists: true, $ne: null } });
        const total = await FoodRestaurant.countDocuments({});
        console.log(`Total restaurants: ${total}`);
        console.log(`Restaurants with zoneId: ${withZone}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkRestaurants();
