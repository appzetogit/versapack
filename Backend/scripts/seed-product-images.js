/**
 * Puts a photograph on every product in the catalogue.
 *
 * Images are searched, downloaded, and stored on this server rather than
 * hot-linked. A catalogue pointing at someone else's CDN breaks the day they
 * rotate a URL, and every shopper's device would be fetching from a third party.
 *
 * Because uploads are written to this machine's disk, THIS MUST RUN ON THE
 * SERVER THAT SERVES /uploads. Run it anywhere else and the database ends up
 * holding paths to files that exist only on a laptop.
 *
 * The catalogue comes from the database, not from a list in here. This file used
 * to carry a second hardcoded product list, which meant two catalogues to keep in
 * step and one of them silently wrong the moment the other changed.
 * seed-quick-commerce.js owns what the products are; this owns what they look
 * like.
 *
 * Photos go on the master product and the listings pointing at it inherit them,
 * so a three-store catalogue costs 48 downloads rather than 144.
 *
 *   node scripts/seed-product-images.js           fill in what is missing
 *   node scripts/seed-product-images.js --force   re-fetch everything
 */
import './_env.js';
import mongoose from 'mongoose';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodMasterProduct } from '../src/modules/food/admin/models/masterProduct.model.js';
import { uploadImageBuffer } from '../src/services/cloudinary.service.js';

const FORCE = process.argv.includes('--force');

// Wikimedia asks for a User-Agent that identifies the caller and how to reach
// them. It is also what keeps a scripted burst on the polite side of their
// rate limiter.
const UA = {
  'User-Agent':
    'VersaPack/1.0 (https://versapack.in; catalogue seeding)',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Words too common to prove a match: every grocery result contains them. */
const STOPWORDS = new Set(['powder', 'fresh', 'pouch', 'cup', 'bottle', 'pack', 'local',
    'classic', 'salted', 'whole', 'refined', 'premium', 'the', 'and', 'with', 'oil', 'drink',
    // Descriptors general enough to match almost anything: "bathing" let a
    // photograph of a bathing dove through as Dove Bathing Soap, and "baby" let
    // a picture of someone carrying a baby through as baby wipes.
    'baby', 'bathing', 'medium', 'block', 'good', 'dark', 'full', 'cream', 'mixed']);

/**
 * Whether a search result plausibly is the thing that was asked for.
 *
 * Token overlap on words that carry meaning: "turmeric" against "fanta coca
 * cola" shares nothing and is rejected, while "Aashirvaad Atta" against
 * "Aashirvaad Superior MP Atta" shares two and is kept.
 */
function looksRelated(query, candidate) {
    const wanted = tokens(query).filter((w) => !STOPWORDS.has(w));
    if (!wanted.length) return true;
    return wanted.some((w) => matchesAny(w, tokens(candidate)));
}

const tokens = (t) => [...new Set(String(t).toLowerCase().match(/[a-z]{4,}/g) || [])];

/** Loose enough that "onion" matches "onions", tight enough to mean something. */
const matchesAny = (word, candidates) =>
    candidates.some((c) => c === word || c.startsWith(word) || word.startsWith(c));

/**
 * Whether a result is the product itself rather than something sharing its name.
 *
 * Word overlap alone is not enough once a brand is an ordinary word. Commons
 * answered "Dove Bathing Soap" with a photograph of a spotted dove having a
 * bath, and "Vim Dishwash Bar" with a screenshot of the Vim text editor -- both
 * genuinely contain the brand. Requiring a word from the product name as well,
 * not just the brand, is what separates "Head & Shoulders shampoo bottle" from
 * "Spotted Dove bathing".
 */
function isTheProduct(nameWords, candidate) {
    if (!nameWords.length) return true;
    return nameWords.some((w) => matchesAny(w, tokens(candidate)));
}

/**
 * Queries for products a bare name cannot find.
 *
 * Loose produce has no packaging and no brand, so a packshot database has
 * nothing and an encyclopedia needs telling what kind of thing this is --
 * searching Commons for "Ginger" alone returns a botanical illustration or a
 * person named Ginger, not something you would recognise in a crate.
 */
const SEARCH_OVERRIDES = {
    'Banana Robusta': 'banana bunch fruit',
    'Royal Gala Apple': 'gala apple fruit red',
    Pomegranate: 'pomegranate fruit whole',
    'Tomato Local': 'tomato red ripe vegetable',
    Onion: 'onion bulb vegetable',
    Potato: 'potato tuber vegetable',
    'Baby Spinach': 'spinach leaves green',
    'Coriander Bunch': 'coriander leaves cilantro bunch',
    Ginger: 'ginger rhizome root',
    'Farm Eggs': 'chicken eggs carton',
    'Refined Sugar': 'white sugar crystals',
    'Sona Masoori Rice': 'white rice grains bowl',
    'Salted Butter': 'butter block dairy',
};

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
async function fetchPackshot(term, nameWords = []) {
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

    // Open Food Facts ranks loosely and will happily return a Fanta bottle for
    // "Everest Turmeric Powder" -- it did exactly that. A photograph of the
    // wrong product is worse than none at all, because nothing downstream can
    // tell it is wrong. Require the result to share a real word with the query.
    // The brand is allowed to satisfy the loose check but not the product one.
    // Open Food Facts is user-contributed and its brand tags are noisy: a record
    // named "fanta coca cola" carrying a turmeric brand tag passed as turmeric,
    // and the photograph was of a cola bottle. The name has to carry it.
    const label = `${product.product_name || ''} ${product.brands || ''}`;
    if (!looksRelated(term, label)) continue;
    if (!isTheProduct(nameWords, product.product_name || '')) continue;

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
async function fetchPhoto(term, nameWords = []) {
  // Most specific first. A three-word term gives the most recognisable photo
  // when it hits; the shorter forms are there so a product is never left blank
  // just because the phrasing was unlucky.
  const attempts = [term, term.split(' ').slice(0, 2).join(' '), term.split(' ')[0]];

  for (const query of [...new Set(attempts)]) {
    for (const page of await searchCommons(query)) {
      const url = page?.imageinfo?.[0]?.thumburl;
      // SVG and TIFF come back from Commons too; the image pipeline rejects
      // them and they are not what a product tile wants anyway.
      //
      // Tested against the path, not the whole URL: Commons now appends utm_*
      // tracking parameters to every thumburl, so an end-anchored match on the
      // full string rejected all six results for every query. Nothing errored --
      // fresh produce and household goods simply came out with no photograph,
      // which reads exactly like "Commons has no picture of an onion".
      if (!url || !/\.(jpe?g|png|webp)$/i.test(url.split('?')[0])) continue;

      // The same relevance test the packshot search uses. Without it Commons
      // answered "Himalaya Baby Wipes" with a scan of a book about rabbits and
      // "Bisleri Packaged Water" with a 1910 court notice -- both real results
      // for the words, neither a product. A blank tile is better than that.
      const title = String(page.title || '').replace(/^File:/, '');
      if (!looksRelated(query, title) || !isTheProduct(nameWords, title)) continue;

      // Digitised books and documents match grocery words constantly and are
      // never a packshot. The Internet Archive marker and .djvu are what they
      // arrive as.
      if (/\.djvu|\(IA |notices of judgment|annual report|catalogue of/i.test(title)) continue;

      const img = await politeFetch(url);
      if (!img.ok) continue;
      const buffer = Buffer.from(await img.arrayBuffer());
      // Anything tiny is an icon or a placeholder, not a photograph.
      if (buffer.length > 5000) return { buffer, source: page.title, query };
    }
  }
  return null;
}

/**
 * What to search for.
 *
 * Brand first, because a packshot database indexes by what is printed on the
 * label. Pack size is deliberately left out: "Amul butter 500 g" matches fewer
 * real listings than "Amul butter", and the photograph is the same either way.
 */
const searchTermFor = (product) =>
    SEARCH_OVERRIDES[product.name] ??
    [product.brand, product.name].filter(Boolean).join(' ').trim();

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI is not set.');
        process.exit(2);
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}
`);

    const missing = { $or: [{ image: '' }, { image: null }, { image: { $exists: false } }] };
    const products = await FoodMasterProduct.find(FORCE ? {} : missing).lean();

    if (!products.length) {
        console.log('every master product already has a photo. Use --force to re-fetch.');
        await mongoose.disconnect();
        return;
    }
    console.log(`${products.length} products need a photo
`);

    let done = 0;
    const misses = [];

    for (const product of products) {
        const term = searchTermFor(product);

        // A brand means a packaged good, which a packshot database will carry.
        // Loose produce -- an onion, a bunch of coriander -- has no packaging and
        // no barcode, so it only exists in an encyclopedia.
        // A dropped connection on one product is not a reason to abandon the
        // other forty-seven. The first run of this died on a single `fetch
        // failed` two thirds of the way through and reported nothing about the
        // products it never reached.
        // The nouns that make this product what it is, brand excluded -- these
        // are what a candidate has to match, not merely the brand.
        const nameWords = tokens(product.name).filter((w) => !STOPWORDS.has(w));

        let photo = null;
        try {
            photo = product.brand
                ? ((await fetchPackshot(term, nameWords)) ?? (await fetchPhoto(term, nameWords)))
                : await fetchPhoto(term, nameWords);
        } catch (err) {
            console.log(`  ----   ${product.name.padEnd(30)} fetch failed: ${err.message}`);
        }

        if (!photo) {
            console.log(`  ----   ${product.name.padEnd(30)} no photo found`);
            misses.push(product.name);
            continue;
        }

        let url = '';
        try {
            url = await uploadImageBuffer(photo.buffer, 'food/products');
        } catch (err) {
            console.log(`  ----   ${product.name.padEnd(30)} upload failed: ${err.message}`);
        }
        if (!url) {
            console.log(`  ----   ${product.name.padEnd(30)} upload returned nothing`);
            misses.push(product.name);
            continue;
        }

        await FoodMasterProduct.updateOne({ _id: product._id }, { $set: { image: url, images: [url] } });

        // The listing keeps its own copy as well. Resolution prefers the master,
        // so this is only a fallback -- but the seller's inventory screen reads
        // the listing directly and would otherwise show a blank tile.
        const listings = await FoodItem.updateMany(
            { masterProductId: product._id },
            { $set: { image: url, images: [url] } },
        );

        console.log(`  photo  ${product.name.padEnd(30)} <- ${String(photo.source).slice(0, 38)}  (+${listings.modifiedCount} listings)`);
        done += 1;
    }

    console.log(`
photographed ${done}, without a photo ${misses.length}`);
    if (misses.length) console.log(`  missing: ${misses.join(', ')}`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('seed failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
