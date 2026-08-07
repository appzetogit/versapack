/**
 * Seeds a browsable grocery catalogue with real product photography.
 *
 * Images are searched on Wikimedia Commons, downloaded, and then stored on this
 * server — not hot-linked. A catalogue that points at someone else's CDN breaks
 * the day they rotate a URL, and every shopper's device would be fetching from
 * a third party. Each photo lands in /uploads like any seller upload.
 *
 *   node scripts/seed-product-images.js
 *   node scripts/seed-product-images.js --force   (re-fetch images already set)
 *
 * Safe to re-run: products are matched by name per seller and updated in place.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { uploadRestaurantAttachment } from '../src/modules/food/restaurant/services/restaurant.service.js';

/**
 * name, brand, packSize, price, mrp, gstRate, stock, category, image search
 *
 * The search terms are deliberately concrete — "toned milk pouch packet" rather
 * than "milk" — because Commons ranks loosely and a vague term returns a dairy
 * farm rather than something a shopper would recognise on a shelf.
 */
const CATALOGUE = [
  // Dairy
  ['Toned Milk Pouch', 'Amul', '500 ml', 27, 28, 0, 120, 'Milk', 'milk packet pouch'],
  ['Full Cream Milk', 'Nandini', '1 L', 66, 70, 0, 80, 'Milk', 'milk bottle glass'],
  ['Fresh Curd Cup', 'Amul', '400 g', 40, 45, 0, 60, 'Curd & Yogurt', 'yogurt cup dairy'],
  ['Greek Yogurt Blueberry', 'Epigamia', '90 g', 55, 60, 12, 35, 'Curd & Yogurt', 'greek yogurt blueberry'],
  ['Salted Butter', 'Amul', '500 g', 285, 295, 12, 24, 'Butter & Cheese', 'butter block dairy'],
  ['Cheese Slices', 'Go', '200 g', 145, 155, 12, 18, 'Butter & Cheese', 'cheese slices'],
  ['Paneer Block', 'Mother Dairy', '200 g', 95, 100, 5, 30, 'Butter & Cheese', 'paneer cottage cheese'],

  // Fruits & vegetables
  ['Banana Robusta', '', '1 kg', 54, 60, 0, 45, 'Fresh Fruits', 'banana fruit bunch'],
  ['Royal Gala Apple', '', '4 pcs', 189, 210, 0, 30, 'Fresh Fruits', 'red apple fruit'],
  ['Alphonso Mango', '', '1 kg', 320, 360, 0, 25, 'Fresh Fruits', 'mango fruit alphonso'],
  ['Pomegranate', '', '500 g', 128, 140, 0, 28, 'Fresh Fruits', 'pomegranate fruit'],
  ['Tomato Local', '', '1 kg', 32, 40, 0, 70, 'Fresh Vegetables', 'tomato vegetable'],
  ['Onion', '', '1 kg', 38, 45, 0, 65, 'Fresh Vegetables', 'onion bulb vegetable'],
  ['Potato', '', '1 kg', 30, 36, 0, 90, 'Fresh Vegetables', 'potato vegetable'],
  ['Baby Spinach', '', '250 g', 29, 35, 0, 20, 'Fresh Vegetables', 'spinach leaves green'],
  ['Carrot', '', '500 g', 34, 40, 0, 40, 'Fresh Vegetables', 'carrot vegetable'],

  // Staples
  ['Whole Wheat Atta', 'Aashirvaad', '5 kg', 285, 310, 5, 40, 'Atta & Flour', 'wheat flour atta'],
  ['Basmati Rice', 'India Gate', '1 kg', 132, 145, 5, 50, 'Rice & Pulses', 'basmati rice grain'],
  ['Toor Dal', 'Tata Sampann', '1 kg', 178, 195, 5, 38, 'Rice & Pulses', 'toor dal lentils'],
  ['Chana Dal', 'Tata Sampann', '500 g', 88, 95, 5, 42, 'Rice & Pulses', 'chana dal lentils'],
  ['Sunflower Oil', 'Fortune', '1 L', 148, 165, 5, 42, 'Oils', 'sunflower cooking oil bottle'],
  ['Mustard Oil', 'Dhara', '1 L', 168, 180, 5, 30, 'Oils', 'mustard oil bottle'],

  // Snacks
  ['Marie Gold', 'Britannia', '250 g', 35, 40, 18, 90, 'Biscuits', 'marie biscuits'],
  ['Dark Fantasy Choco Fills', 'Sunfeast', '300 g', 145, 160, 18, 25, 'Biscuits', 'chocolate cookies'],
  ['Classic Salted Chips', 'Lays', '52 g', 20, 20, 18, 110, 'Chips & Namkeen', 'potato chips crisps'],
  ['Aloo Bhujia', 'Haldiram', '400 g', 105, 115, 12, 33, 'Chips & Namkeen', 'bhujia namkeen snack'],
  ['Salted Peanuts', '', '200 g', 60, 70, 12, 48, 'Chips & Namkeen', 'roasted peanuts'],

  // Beverages
  ['Red Label Tea', 'Brooke Bond', '500 g', 265, 285, 5, 28, 'Tea & Coffee', 'tea leaves black'],
  ['Instant Coffee', 'Nescafe', '50 g', 190, 205, 18, 22, 'Tea & Coffee', 'instant coffee jar'],
  ['Cola Bottle', 'Coca-Cola', '750 ml', 40, 45, 28, 75, 'Soft Drinks', 'cola soft drink bottle'],
  ['Orange Drink', 'Mirinda', '600 ml', 40, 40, 28, 0, 'Soft Drinks', 'orange soda bottle'],
];

const FORCE = process.argv.includes('--force');

const UA = { 'User-Agent': 'quick-commerce-seed/1.0 (catalogue seeding)' };

/** One Commons search, returning candidate thumbnails. */
async function searchCommons(query) {
  // No `filetype:` filter. It looks like a sensible narrowing and is in fact
  // fatal: combined with several words it matches nothing at all, which is why
  // an earlier run created thirty-one products and not one photo. Non-bitmap
  // results are filtered by extension below instead.
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=6&prop=imageinfo' +
    '&iiprop=url|mime&iiurlwidth=800&gsrsearch=' +
    encodeURIComponent(query);

  const res = await fetch(api, { headers: UA });
  if (!res.ok) return [];
  return Object.values((await res.json())?.query?.pages || {});
}

/** Finds a usable photo and returns its bytes, widening the search if needed. */
async function fetchPhoto(term) {
  // Most specific first. A three-word term gives the most recognisable photo
  // when it hits; the shorter forms are there so a product is never left blank
  // just because the phrasing was unlucky.
  const attempts = [term, term.split(' ').slice(0, 2).join(' '), term.split(' ')[0]];

  for (const query of [...new Set(attempts)]) {
    for (const page of await searchCommons(query)) {
      const url = page?.imageinfo?.[0]?.thumburl;
      // SVG and TIFF come back from Commons too; the image pipeline rejects
      // them and they are not what a product tile wants anyway.
      if (!url || !/\.(jpe?g|png|webp)$/i.test(url)) continue;

      const img = await fetch(url, { headers: UA });
      if (!img.ok) continue;
      const buffer = Buffer.from(await img.arrayBuffer());
      // Anything tiny is an icon or a placeholder, not a photograph.
      if (buffer.length > 5000) return { buffer, source: page.title, query };
    }
  }
  return null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  if (mongoose.connection.name !== 'quickcommerce') {
    console.error(`refusing to seed '${mongoose.connection.name}'`);
    process.exit(1);
  }
  console.log(`connected -> ${mongoose.connection.name}\n`);

  const sellers = await FoodRestaurant.find({ status: 'approved' })
    .select('_id restaurantName')
    .lean();
  if (!sellers.length) {
    console.error('no approved seller; run seed-quick-commerce.js first');
    process.exit(1);
  }

  const categories = await FoodCategory.find({}).select('_id name').lean();
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  let created = 0;
  let withImage = 0;
  let noImage = 0;

  for (const [name, brand, packSize, price, mrp, gstRate, stockQty, categoryName, term] of CATALOGUE) {
    const category = categoryByName.get(categoryName);

    for (const [index, seller] of sellers.entries()) {
      // The second seller carries a subset at a slightly higher price, so the
      // same product genuinely appears from two sellers.
      if (index > 0 && created % 3 === 0) continue;
      const sellerPrice = index > 0 ? Math.min(Math.round(price * 1.05), mrp || price) : price;

      const existing = await FoodItem.findOne({ restaurantId: seller._id, name })
        .select('_id image')
        .lean();

      let image = existing?.image || '';
      if (!image || FORCE) {
        // Only the first seller fetches; the rest reuse the same photo rather
        // than hitting Commons once per seller for an identical product.
        const shared = await FoodItem.findOne({ name, image: { $nin: ['', null] } })
          .select('image')
          .lean();

        if (shared?.image && !FORCE) {
          image = shared.image;
        } else {
          const photo = await fetchPhoto(term);
          if (photo) {
            const stored = await uploadRestaurantAttachment(
              { buffer: photo.buffer, originalname: `${name}.jpg`, mimetype: 'image/jpeg' },
              'products',
            );
            image = stored?.url || '';
            if (image) console.log(`  photo  ${name.padEnd(28)} <- ${photo.source}`);
          }
        }
      }

      await FoodItem.findOneAndUpdate(
        { restaurantId: seller._id, name },
        {
          $set: {
            restaurantId: seller._id,
            ...(category ? { categoryId: category._id, categoryName: category.name } : {}),
            name,
            brand,
            packSize,
            description: `${brand ? `${brand} ` : ''}${name}${packSize ? ` - ${packSize}` : ''}`,
            price: sellerPrice,
            mrp: mrp || null,
            otherPrice: 0,
            gstRate,
            stockQty: index > 0 ? Math.ceil(stockQty / 2) : stockQty,
            lowStockThreshold: 10,
            maxQtyPerOrder: 10,
            isAvailable: stockQty > 0,
            foodType: 'Veg',
            image,
            images: image ? [image] : [],
            approvalStatus: 'approved',
            approvedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      created++;
      image ? withImage++ : noImage++;
    }
  }

  console.log(`\nlistings: ${created} across ${sellers.length} sellers`);
  console.log(`  with image: ${withImage} | without: ${noImage}`);
  console.log(`  distinct products: ${CATALOGUE.length}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});
