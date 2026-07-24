
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const test = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const Restaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false, collection: 'foodrestaurants' }));
    const r = await Restaurant.findOne({ restaurantName: /prince restro/i });
    if (r) {
      console.log('Found restaurant:', r._id, r.restaurantName, 'Due:', r.subscriptionDueAmount);
    } else {
      console.log('Restaurant not found');
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

test();
