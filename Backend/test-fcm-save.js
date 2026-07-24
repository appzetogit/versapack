import mongoose from 'mongoose';
import { FoodUser } from './src/core/users/user.model.js';
import { upsertFirebaseDeviceToken } from './src/core/notifications/firebase.service.js';
import { connectDB } from './src/config/db.js';

async function run() {
  await connectDB();
  const user = await FoodUser.findOne({});
  if (!user) {
    console.log("No user found.");
    process.exit(0);
  }
  
  console.log("Found user:", user._id);
  const token = 'test_fcm_token_123';
  
  try {
    const res = await upsertFirebaseDeviceToken({
      ownerType: 'USER',
      ownerId: user._id.toString(),
      token,
      platform: 'web'
    });
    console.log("Upsert result:", res);
    
    // Check DB
    const updated = await FoodUser.findById(user._id);
    console.log("Stored fcmTokens in DB:", updated.fcmTokens);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

run();
