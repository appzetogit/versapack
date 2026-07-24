import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodRestaurantOutletTimings } from '../src/modules/food/restaurant/models/outletTimings.model.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeRestaurantTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!hhmm) return '';
  const h = Number(hhmm[1]);
  const m = Number(hhmm[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const main = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI / MONGODB_URI missing in Backend/.env');

  await mongoose.connect(mongoUri);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const cursor = FoodRestaurant.find({})
      .select('_id openingTime closingTime')
      .lean()
      .cursor();

    for await (const r of cursor) {
      scanned += 1;
      const openingTime = normalizeRestaurantTime(r?.openingTime);
      const closingTime = normalizeRestaurantTime(r?.closingTime);

      if (!openingTime || !closingTime) {
        skipped += 1;
        continue;
      }

      const timings = DAY_NAMES.map((day) => ({
        day,
        isOpen: true,
        openingTime,
        closingTime,
      }));

      try {
        await FoodRestaurantOutletTimings.updateOne(
          { restaurantId: r._id },
          { $set: { timings } },
          { upsert: true }
        );
        updated += 1;
      } catch (err) {
        failed += 1;
        console.error(`Failed restaurant ${String(r?._id)}:`, err?.message || err);
      }
    }

    console.log('Outlet timings sync completed');
    console.log({ scanned, updated, skipped, failed });
  } finally {
    await mongoose.connection.close();
  }
};

main().catch((err) => {
  console.error('Script failed:', err?.message || err);
  process.exitCode = 1;
});

