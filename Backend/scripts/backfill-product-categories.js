/**
 * Gives a category to products that have none.
 *
 * A product with no categoryId still appears in the seller's menu, but under a
 * catch-all "Menu" section rather than where it belongs — milk filed beside
 * biscuits. The seeder caused it: when a category name did not match an
 * existing record it left the field unset instead of failing loudly.
 *
 *   node scripts/backfill-product-categories.js          (report only)
 *   node scripts/backfill-product-categories.js --apply  (write)
 *
 * Reports by default. A script that edits a live catalogue the moment it is run
 * is one nobody can safely inspect first.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';

const APPLY = process.argv.includes('--apply');

/**
 * Where a product belongs when its own record cannot say.
 *
 * Keyed on a distinctive word from the product name. Order matters: the first
 * match wins, so anything ambiguous is listed after the term that disambiguates
 * it.
 */
/**
 * Parent for a subcategory this script has to recreate.
 *
 * Two of the original subcategories were deleted, which is what orphaned most
 * of these products in the first place: the item kept a categoryName pointing
 * at a record that no longer existed.
 */
const PARENT_OF = {
  'Milk': 'Dairy',
  'Curd & Yogurt': 'Dairy',
  'Butter & Cheese': 'Dairy',
  'Fresh Fruits': 'Fruits & Vegetables',
  'Fresh Vegetables': 'Fruits & Vegetables',
  'Atta & Flour': 'Staples',
  'Rice & Pulses': 'Staples',
  'Oils': 'Staples',
  'Biscuits': 'Snacks',
  'Chips & Namkeen': 'Snacks',
  'Tea & Coffee': 'Beverages',
  'Soft Drinks': 'Beverages',
};

const BY_KEYWORD = [
  [/\bmilk\b/i, 'Milk'],
  [/curd|dahi|yogurt/i, 'Curd & Yogurt'],
  [/butter|cheese|paneer/i, 'Butter & Cheese'],
  [/banana|apple|mango|pomegranate|orange fruit/i, 'Fresh Fruits'],
  [/tomato|onion|potato|spinach|carrot|vegetable/i, 'Fresh Vegetables'],
  [/atta|flour/i, 'Atta & Flour'],
  [/rice|dal|pulse/i, 'Rice & Pulses'],
  [/\boil\b/i, 'Oils'],
  [/biscuit|marie|cookie|choco fills/i, 'Biscuits'],
  [/chips|bhujia|namkeen|peanut/i, 'Chips & Namkeen'],
  [/tea|coffee/i, 'Tea & Coffee'],
  [/cola|drink|soda|juice/i, 'Soft Drinks'],
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  if (mongoose.connection.name !== 'quickcommerce') {
    console.error(`refusing to touch '${mongoose.connection.name}'`);
    process.exit(1);
  }
  console.log(`connected -> ${mongoose.connection.name}${APPLY ? '' : '  (dry run)'}\n`);

  const categories = await FoodCategory.find({}).select('_id name').lean();
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const orphans = await FoodItem.find({
    $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
  })
    .select('_id name categoryName restaurantId')
    .lean();

  console.log(`products without a category: ${orphans.length}`);

  let matched = 0;
  let unmatched = 0;

  for (const item of orphans) {
    // The product's own categoryName first — it is what the seeder meant to
    // file it under — then the keyword table.
    let wantedName = item.categoryName || '';
    let category = wantedName ? byName.get(wantedName.toLowerCase()) : null;

    if (!category) {
      const hit = BY_KEYWORD.find(([pattern]) => pattern.test(item.name || ''));
      if (hit) {
        wantedName = hit[1];
        category = byName.get(wantedName.toLowerCase());
      }
    }

    // The name resolved but the record is gone. Recreating it is the repair:
    // leaving it out would file a grocery item under a catch-all forever.
    if (!category && wantedName && PARENT_OF[wantedName]) {
      const parent = byName.get(PARENT_OF[wantedName].toLowerCase());
      if (APPLY) {
        category = await FoodCategory.findOneAndUpdate(
          { name: wantedName, restaurantId: { $exists: false } },
          {
            $set: {
              name: wantedName,
              ...(parent ? { parentId: parent._id } : {}),
              foodTypeScope: 'Both',
              approvalStatus: 'approved',
              isApproved: true,
              isActive: true,
            },
          },
          { upsert: true, new: true },
        ).lean();
        byName.set(wantedName.toLowerCase(), category);
        console.log(`  +  recreated category "${wantedName}"`);
      } else {
        console.log(`  +  would recreate category "${wantedName}"`);
        // Counted as matched so the dry run reports the true outcome.
        matched++;
        continue;
      }
    }

    if (!category) {
      console.log(`  ?  ${item.name}  (no category matched)`);
      unmatched++;
      continue;
    }

    console.log(`  ->  ${(item.name || '').padEnd(26)} ${category.name}`);
    matched++;

    if (APPLY) {
      await FoodItem.updateOne(
        { _id: item._id },
        { $set: { categoryId: category._id, categoryName: category.name } },
      );
    }
  }

  console.log(`\nmatched: ${matched} | unmatched: ${unmatched}`);
  if (!APPLY && matched > 0) console.log('re-run with --apply to write these.');

  if (APPLY) {
    const left = await FoodItem.countDocuments({
      $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
    });
    console.log(`products still without a category: ${left}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('backfill failed:', err.message);
  process.exit(1);
});
