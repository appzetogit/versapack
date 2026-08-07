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
  ['Toned Milk Pouch', 'Amul', '500 ml', 27, 28, 0, 120, 'Milk', 'amul toned milk'],
  ['Full Cream Milk', 'Nandini', '1 L', 66, 70, 0, 80, 'Milk', 'nandini full cream milk'],
  ['Fresh Curd Cup', 'Amul', '400 g', 40, 45, 0, 60, 'Curd & Yogurt', 'amul curd dahi'],
  ['Greek Yogurt Blueberry', 'Epigamia', '90 g', 55, 60, 12, 35, 'Curd & Yogurt', 'epigamia greek yogurt blueberry'],
  ['Salted Butter', 'Amul', '500 g', 285, 295, 12, 24, 'Butter & Cheese', 'amul butter'],
  ['Cheese Slices', 'Go', '200 g', 145, 155, 12, 18, 'Butter & Cheese', 'go cheese slices'],
  ['Paneer Block', 'Mother Dairy', '200 g', 95, 100, 5, 30, 'Butter & Cheese', 'mother dairy paneer'],

  // Fruits & vegetables
  ['Banana Robusta', '', '1 kg', 54, 60, 0, 45, 'Fresh Fruits', 'banana bunch fruit'],
  ['Royal Gala Apple', '', '4 pcs', 189, 210, 0, 30, 'Fresh Fruits', 'gala apple fruit'],
  ['Alphonso Mango', '', '1 kg', 320, 360, 0, 25, 'Fresh Fruits', 'alphonso mango fruit'],
  ['Pomegranate', '', '500 g', 128, 140, 0, 28, 'Fresh Fruits', 'pomegranate fruit whole'],
  ['Tomato Local', '', '1 kg', 32, 40, 0, 70, 'Fresh Vegetables', 'tomato fruit red'],
  ['Onion', '', '1 kg', 38, 45, 0, 65, 'Fresh Vegetables', 'onion bulb'],
  ['Potato', '', '1 kg', 30, 36, 0, 90, 'Fresh Vegetables', 'potato tuber'],
  ['Baby Spinach', '', '250 g', 29, 35, 0, 20, 'Fresh Vegetables', 'spinach leaves'],
  ['Carrot', '', '500 g', 34, 40, 0, 40, 'Fresh Vegetables', 'carrot root vegetable'],

  // Staples
  ['Whole Wheat Atta', 'Aashirvaad', '5 kg', 285, 310, 5, 40, 'Atta & Flour', 'aashirvaad atta whole wheat'],
  ['Basmati Rice', 'India Gate', '1 kg', 132, 145, 5, 50, 'Rice & Pulses', 'india gate basmati rice'],
  ['Toor Dal', 'Tata Sampann', '1 kg', 178, 195, 5, 38, 'Rice & Pulses', 'tata sampann toor dal'],
  ['Chana Dal', 'Tata Sampann', '500 g', 88, 95, 5, 42, 'Rice & Pulses', 'tata sampann chana dal'],
  ['Sunflower Oil', 'Fortune', '1 L', 148, 165, 5, 42, 'Oils', 'fortune sunflower oil'],
  ['Mustard Oil', 'Dhara', '1 L', 168, 180, 5, 30, 'Oils', 'dhara mustard oil'],

  // Snacks
  ['Marie Gold', 'Britannia', '250 g', 35, 40, 18, 90, 'Biscuits', 'britannia marie gold'],
  ['Dark Fantasy Choco Fills', 'Sunfeast', '300 g', 145, 160, 18, 25, 'Biscuits', 'sunfeast dark fantasy choco fills'],
  ['Classic Salted Chips', 'Lays', '52 g', 20, 20, 18, 110, 'Chips & Namkeen', 'lays classic salted'],
  ['Aloo Bhujia', 'Haldiram', '400 g', 105, 115, 12, 33, 'Chips & Namkeen', 'haldiram aloo bhujia'],
  ['Salted Peanuts', '', '200 g', 60, 70, 12, 48, 'Chips & Namkeen', 'roasted salted peanuts'],

  // Beverages
  ['Red Label Tea', 'Brooke Bond', '500 g', 265, 285, 5, 28, 'Tea & Coffee', 'brooke bond red label tea'],
  ['Instant Coffee', 'Nescafe', '50 g', 190, 205, 18, 22, 'Tea & Coffee', 'nescafe classic coffee'],
  ['Cola Bottle', 'Coca-Cola', '750 ml', 40, 45, 28, 75, 'Soft Drinks', 'coca cola'],
  ['Orange Drink', 'Mirinda', '600 ml', 40, 40, 28, 0, 'Soft Drinks', 'mirinda orange'],
];

const FORCE = process.argv.includes('--force');

// Wikimedia asks for a User-Agent that identifies the caller and how to reach
// them. It is also what keeps a scripted burst on the polite side of their
// rate limiter.
const UA = {
  'User-Agent':
    'SuvioQuickCommerce/1.0 (https://quick.appzeto.com; catalogue seeding)',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Paces requests to Commons.
 *
 * Without this the seeder fired a few hundred searches back to back, got
 * throttled part way through, and -- because a non-OK response was read as "no
 * results" -- silently produced thirty-one products with no photograph and no
 * error. Slower and honest beats fast and empty.
 */
let lastCall = 0;
async function politeFetch(url) {
  const wait = 400 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  return fetch(url, { headers: UA });
}

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

  const res = await politeFetch(api);
  if (!res.ok) {
    // Surfaced rather than swallowed: a throttled run that reports nothing is
    // indistinguishable from a catalogue with no photographs available.
    console.warn(`  commons ${res.status} for "${query}"`);
    if (res.status === 429) await sleep(5000);
    return [];
  }
  try {
    return Object.values((await res.json())?.query?.pages || {});
  } catch {
    console.warn(`  commons returned non-JSON for "${query}"`);
    return [];
  }
}

/**
 * A packshot from Open Food Facts: a free grocery database whose images are
 * photographs of the product on its packaging.
 *
 * This is the right source and Commons was the wrong one. Commons is an
 * encyclopedia: searching it for "Amul butter" returns a photograph of a dairy,
 * a map of Gujarat, or a butter sculpture -- all correctly matching the words
 * and none of them a thing on a shelf.
 */
async function fetchPackshot(term) {
  const api =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1' +
    '&action=process&json=1&page_size=8' +
    '&fields=product_name,brands,image_front_url&search_terms=' +
    encodeURIComponent(term);

  let res = await politeFetch(api);
  for (let attempt = 1; attempt <= 3 && (res.status === 503 || res.status === 429); attempt++) {
    await sleep(2000 * attempt);
    res = await politeFetch(api);
  }
  if (!res.ok) {
    console.warn(`  openfoodfacts ${res.status} for "${term}"`);
    return null;
  }

  let products;
  try {
    products = (await res.json())?.products || [];
  } catch {
    console.warn(`  openfoodfacts returned non-JSON for "${term}"`);
    return null;
  }

  for (const product of products) {
    const url = product?.image_front_url;
    if (!url) continue;

    const img = await politeFetch(url);
    if (!img.ok) continue;
    const buffer = Buffer.from(await img.arrayBuffer());
    // Under 5KB is a placeholder rather than a photograph.
    if (buffer.length > 5000) {
      return { buffer, source: product.product_name || term };
    }
  }
  return null;
}

/** Commons fallback, for loose produce that no packaged-food database carries. */
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

      const img = await politeFetch(url);
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
          const photo = brand
            ? ((await fetchPackshot(term)) ?? (await fetchPhoto(term)))
            : await fetchPhoto(term);
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
