import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');

const main = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI / MONGODB_URI missing in Backend/.env');
  }

  await mongoose.connect(mongoUri);

  try {
    const filter = { availabilityStatus: 'online' };
    const onlineCount = await FoodDeliveryPartner.countDocuments(filter);

    console.log(`[DeliveryOffline] Online delivery partners found: ${onlineCount}`);

    if (!shouldApply) {
      console.log('[DeliveryOffline] Dry run only. Re-run with --apply to mark them offline.');
      return;
    }

    if (onlineCount === 0) {
      console.log('[DeliveryOffline] Nothing to update.');
      return;
    }

    const result = await FoodDeliveryPartner.updateMany(filter, {
      $set: { availabilityStatus: 'offline' },
    });

    console.log('[DeliveryOffline] Marked delivery partners offline:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } finally {
    await mongoose.connection.close();
  }
};

main().catch((err) => {
  console.error('[DeliveryOffline] Script failed:', err.message);
  process.exitCode = 1;
});
