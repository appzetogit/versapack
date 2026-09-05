import test from 'node:test';
import assert from 'node:assert/strict';

import { computeUnitPrice, unitPriceForProduct } from '../src/modules/food/shared/unitPrice.util.js';

test('computeUnitPrice', async (t) => {
    await t.test('quotes weight per 100 g', () => {
        // 500 g for ₹50 -> ₹10 per 100 g
        assert.deepEqual(computeUnitPrice(50, 500, 'g'), {
            amount: 10,
            unitLabel: '100 g',
            baseUnit: 'g'
        });
    });

    await t.test('normalises kg against g so pack sizes are comparable', () => {
        // The whole reason the unit is stored separately: 1 kg for ₹100 and 1000 g
        // for ₹100 are the same shelf price and must produce the same number.
        assert.deepEqual(computeUnitPrice(100, 1, 'kg'), computeUnitPrice(100, 1000, 'g'));
    });

    await t.test('normalises litres against millilitres', () => {
        assert.deepEqual(computeUnitPrice(80, 1, 'l'), computeUnitPrice(80, 1000, 'ml'));
    });

    await t.test('ranks a 900 g pack against a 1 kg pack correctly', () => {
        // Comparing the raw numbers would read 900 vs 1 and rank these backwards.
        const smaller = computeUnitPrice(90, 900, 'g');   // ₹10.00 / 100 g
        const larger = computeUnitPrice(95, 1, 'kg');     // ₹9.50  / 100 g
        assert.ok(larger.amount < smaller.amount, `${larger.amount} should beat ${smaller.amount}`);
    });

    await t.test('quotes count per single piece, not per hundred', () => {
        assert.deepEqual(computeUnitPrice(60, 6, 'piece'), {
            amount: 10,
            unitLabel: 'piece',
            baseUnit: 'piece'
        });
    });

    await t.test('rounds to two decimals', () => {
        // 250 g for ₹33 -> 13.2 per 100 g
        assert.equal(computeUnitPrice(33, 250, 'g').amount, 13.2);
        // A repeating value must not leak float noise into the response.
        assert.equal(computeUnitPrice(10, 300, 'g').amount, 3.33);
    });

    await t.test('returns null rather than zero when it cannot be computed', () => {
        // A zero here would render as "free" on the exact screen meant to inform.
        assert.equal(computeUnitPrice(50, null, 'g'), null, 'no quantity');
        assert.equal(computeUnitPrice(50, 500, null), null, 'no unit');
        assert.equal(computeUnitPrice(50, 500, 'dozen'), null, 'unknown unit');
        assert.equal(computeUnitPrice(50, 0, 'g'), null, 'zero quantity would divide by zero');
        assert.equal(computeUnitPrice(50, -100, 'g'), null, 'negative quantity');
        assert.equal(computeUnitPrice(null, 500, 'g'), null, 'no price');
        assert.equal(computeUnitPrice('abc', 500, 'g'), null, 'unparseable price');
    });

    await t.test('a free product is a real answer, not a missing one', () => {
        assert.equal(computeUnitPrice(0, 500, 'g').amount, 0);
    });

    await t.test('accepts the unit case-insensitively', () => {
        assert.deepEqual(computeUnitPrice(100, 1, 'KG'), computeUnitPrice(100, 1, 'kg'));
    });
});

test('unitPriceForProduct', async (t) => {
    await t.test('reads the fields straight off a catalogue document', () => {
        assert.deepEqual(
            unitPriceForProduct({ price: 50, netQuantity: 500, netQuantityUnit: 'g' }),
            { amount: 10, unitLabel: '100 g', baseUnit: 'g' }
        );
    });

    await t.test('is null for every product that predates these fields', () => {
        // netQuantity defaults to null on the schema, so this is the common case.
        assert.equal(unitPriceForProduct({ price: 50 }), null);
        assert.equal(unitPriceForProduct({}), null);
    });
});
