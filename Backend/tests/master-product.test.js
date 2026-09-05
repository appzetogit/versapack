import test from 'node:test';
import assert from 'node:assert/strict';

import { FoodMasterProduct, normalizeBarcode } from '../src/modules/food/admin/models/masterProduct.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import {
    resolveListingWithMaster,
    resolveTaxFields,
    findMasterByBarcode
} from '../src/modules/food/shared/masterProduct.resolve.js';

/**
 * The master catalogue's whole job is to make one product look like one product.
 *
 * Two properties matter and pull against each other: identity must come from the
 * master so twelve sellers stop producing twelve spellings and twelve GST rates, and
 * commerce must come from the listing so the sellers can still compete on price. Every
 * case below is one or the other.
 */

const listing = () => ({
    _id: 'listing-1',
    restaurantId: 'seller-1',
    name: 'amul butter (500 gm)',
    brand: 'amul',
    packSize: '500 gm',
    gstRate: 18,
    hsnCode: '',
    price: 275,
    mrp: 290,
    stockQty: 12,
    isAvailable: true,
    sku: 'SELLER-SKU-1',
    image: 'seller-photo.jpg'
});

const master = () => ({
    _id: 'master-1',
    name: 'Amul Butter',
    brand: 'Amul',
    packSize: '500 g',
    netQuantity: 500,
    netQuantityUnit: 'g',
    gstRate: 12,
    hsnCode: '0405',
    countryOfOrigin: 'India',
    image: 'canonical.jpg',
    images: ['canonical.jpg', 'back.jpg']
});

test('resolveListingWithMaster', async (t) => {
    await t.test('identity comes from the master', () => {
        const out = resolveListingWithMaster(listing(), master());
        assert.equal(out.name, 'Amul Butter', 'the seller spelling is replaced');
        assert.equal(out.brand, 'Amul');
        assert.equal(out.packSize, '500 g');
        assert.equal(out.countryOfOrigin, 'India');
        assert.equal(out.image, 'canonical.jpg');
        assert.deepEqual(out.images, ['canonical.jpg', 'back.jpg']);
    });

    await t.test('the tax class comes from the master, not the seller', () => {
        // Two sellers charging different GST on the same tub of butter is not a
        // pricing decision, it is one of them being wrong on an invoice.
        const out = resolveListingWithMaster(listing(), master());
        assert.equal(out.gstRate, 12);
        assert.equal(out.hsnCode, '0405');
    });

    await t.test('commerce stays with the seller', () => {
        const out = resolveListingWithMaster(listing(), master());
        assert.equal(out.price, 275, 'price is the whole point of a marketplace');
        assert.equal(out.mrp, 290);
        assert.equal(out.stockQty, 12);
        assert.equal(out.isAvailable, true);
        assert.equal(out.sku, 'SELLER-SKU-1');
        assert.equal(out.restaurantId, 'seller-1');
        assert.equal(out._id, 'listing-1', 'it is still this seller\'s listing');
    });

    await t.test('a blank field on the master never erases the seller\'s', () => {
        // Masters get filled in over time. A half-built one must not blank a
        // catalogue that already has the information.
        const sparse = { _id: 'master-1', name: 'Amul Butter', brand: '', packSize: '' };
        const out = resolveListingWithMaster(listing(), sparse);
        assert.equal(out.name, 'Amul Butter', 'what it does say wins');
        assert.equal(out.brand, 'amul', 'what it does not say falls back');
        assert.equal(out.packSize, '500 gm');
    });

    await t.test('a real zero on the master is a value, not a blank', () => {
        // 0% GST is a genuine slab. Treating it as "unset" would silently tax a
        // zero-rated staple at the seller's rate.
        const zeroRated = { _id: 'm', name: 'Atta', gstRate: 0 };
        const out = resolveListingWithMaster({ ...listing(), gstRate: 18 }, zeroRated);
        assert.equal(out.gstRate, 0);
    });

    await t.test('an unlinked listing is returned untouched', () => {
        const original = listing();
        const out = resolveListingWithMaster(original, null);
        assert.deepEqual(out, original);
        assert.equal(out.isMasterLinked, undefined);
    });

    await t.test('a linked listing is flagged so callers need no second query', () => {
        assert.equal(resolveListingWithMaster(listing(), master()).isMasterLinked, true);
        assert.equal(resolveListingWithMaster(listing(), master()).masterProductId, 'master-1');
    });

    await t.test('survives null and undefined input', () => {
        assert.deepEqual(resolveListingWithMaster(null, null), {});
        assert.deepEqual(resolveListingWithMaster(undefined, undefined), {});
    });
});

test('resolveTaxFields', async (t) => {
    await t.test('prefers the master and falls back to the listing', () => {
        assert.deepEqual(resolveTaxFields(listing(), master()), { gstRate: 12, hsnCode: '0405' });
        assert.deepEqual(resolveTaxFields(listing(), null), { gstRate: 18, hsnCode: '' });
    });

    await t.test('a listing with no slab of its own stays null for the order-wide rate', () => {
        // null has to survive: computeItemsTax reads it to mean "use the fallback".
        assert.equal(resolveTaxFields({ gstRate: null }, null).gstRate, null);
        assert.equal(resolveTaxFields({}, null).gstRate, null);
    });
});

test('normalizeBarcode', async (t) => {
    await t.test('keeps digits only, so a scanner\'s whitespace cannot mint a second master', () => {
        assert.equal(normalizeBarcode(' 890 1234 567890 '), '8901234567890');
        assert.equal(normalizeBarcode('8901234567890'), '8901234567890');
        assert.equal(normalizeBarcode('890-1234-567890'), '8901234567890');
    });

    await t.test('anything with no digits is null, not an empty string', () => {
        // Empty strings would all collide on the unique index; null is excluded
        // from it by the partial filter.
        for (const blank of ['', '   ', null, undefined, 'N/A']) {
            assert.equal(normalizeBarcode(blank), null, `for ${JSON.stringify(blank)}`);
        }
    });
});

test('findMasterByBarcode', async (t) => {
    const stub = (result) => ({
        findOne(filter) {
            stub.lastFilter = filter;
            return { select: () => ({ lean: async () => result }) };
        }
    });

    await t.test('matches on the normalised barcode and only when active', async () => {
        const model = stub({ _id: 'master-9' });
        const id = await findMasterByBarcode(model, ' 890-1234 ');
        assert.equal(id, 'master-9');
    });

    await t.test('a listing with no barcode is never linked', async () => {
        let called = false;
        const model = { findOne: () => { called = true; return { select: () => ({ lean: async () => null }) }; } };
        for (const blank of ['', null, undefined, 'no-code']) {
            assert.equal(await findMasterByBarcode(model, blank), null);
        }
        assert.equal(called, false, 'and does not even query');
    });

    await t.test('no matching master leaves the listing standalone', async () => {
        const model = stub(null);
        assert.equal(await findMasterByBarcode(model, '8901234567890'), null);
    });
});

test('schema wiring', async (t) => {
    await t.test('a listing links to a master and defaults to standalone', () => {
        const path = FoodItem.schema.path('masterProductId');
        assert.ok(path, 'FoodItem must carry the link');
        assert.equal(path.defaultValue, null, 'every existing product stays standalone');
        assert.equal(path.options.ref, 'FoodMasterProduct');
    });

    await t.test('the barcode index is unique only over real barcodes', () => {
        // A plain unique index would treat every null as the same value and reject
        // the second unbarcoded product in the catalogue.
        const indexes = FoodMasterProduct.schema.indexes();
        const barcodeIndex = indexes.find(([fields]) => fields.barcode === 1);
        assert.ok(barcodeIndex, 'barcode must be indexed');
        assert.equal(barcodeIndex[1].unique, true);
        assert.deepEqual(barcodeIndex[1].partialFilterExpression, { barcode: { $type: 'string' } });
    });

    await t.test('tax fields live on the master', () => {
        assert.ok(FoodMasterProduct.schema.path('gstRate'));
        assert.ok(FoodMasterProduct.schema.path('hsnCode'));
    });

    await t.test('retiring a master is a flag, never a delete', () => {
        // Listings point at it and orders quote it; deleting would orphan both.
        assert.equal(FoodMasterProduct.schema.path('isActive').defaultValue, true);
    });
});
