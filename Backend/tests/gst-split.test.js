import test from 'node:test';
import assert from 'node:assert/strict';

import {
    splitGst,
    isIntraStateSupply,
    buildTaxBreakdown,
} from '../src/modules/food/orders/services/gstSplit.util.js';

/**
 * Splitting GST into invoice components.
 *
 * The customer pays the same total either way, so nothing here can overcharge. What it
 * can do is print a legally wrong invoice, and the two ways to do that are calling an
 * intra-state supply inter-state, and producing components that do not add back to the
 * total the customer was charged.
 */

test('splitGst', async (t) => {
    await t.test('within one state, halves it into CGST and SGST', () => {
        assert.deepEqual(splitGst(100, true), { cgst: 50, sgst: 50, igst: 0 });
    });

    await t.test('across a state line, it is all IGST', () => {
        assert.deepEqual(splitGst(100, false), { cgst: 0, sgst: 0, igst: 100 });
    });

    await t.test('the components always add back to the total', () => {
        // Halving an odd amount and rounding each side independently loses a paisa,
        // and an invoice whose parts do not sum to its total is what an audit finds.
        for (const total of [0.01, 0.05, 1.01, 7.77, 13.13, 46, 99.99, 1234.57]) {
            const { cgst, sgst, igst } = splitGst(total, true);
            const sum = Math.round((cgst + sgst + igst) * 100) / 100;
            assert.equal(sum, Math.round(total * 100) / 100, `intra ${total}`);
        }
        for (const total of [0.01, 7.77, 99.99]) {
            const { cgst, sgst, igst } = splitGst(total, false);
            assert.equal(Math.round((cgst + sgst + igst) * 100) / 100, total, `inter ${total}`);
        }
    });

    await t.test('a zero or missing tax splits into nothing', () => {
        for (const bad of [0, null, undefined, -5, 'abc', NaN]) {
            assert.deepEqual(splitGst(bad, true), { cgst: 0, sgst: 0, igst: 0 });
        }
    });
});

test('isIntraStateSupply', async (t) => {
    await t.test('compares states regardless of spacing and case', () => {
        // A free-text field collects all of these for one state, and treating them as
        // different would put an intra-state supply on an inter-state invoice.
        assert.equal(isIntraStateSupply('Madhya Pradesh', 'madhya pradesh'), true);
        assert.equal(isIntraStateSupply('  MADHYA  PRADESH ', 'Madhya Pradesh'), true);
    });

    await t.test('recognises a genuine crossing', () => {
        assert.equal(isIntraStateSupply('Madhya Pradesh', 'Maharashtra'), false);
    });

    await t.test('falls back to intra-state when a state is unknown', () => {
        // A dark store delivers within about 2.5 km and cannot plausibly cross a
        // state line, so where the data is missing this is almost always right.
        assert.equal(isIntraStateSupply('', 'Madhya Pradesh'), true);
        assert.equal(isIntraStateSupply('Madhya Pradesh', null), true);
        assert.equal(isIntraStateSupply(undefined, undefined), true);
    });
});

test('buildTaxBreakdown', async (t) => {
    await t.test('records the split and the place of supply', () => {
        const out = buildTaxBreakdown(
            46,
            { state: 'Madhya Pradesh' },
            { state: 'Madhya Pradesh' },
        );
        assert.equal(out.cgst, 23);
        assert.equal(out.sgst, 23);
        assert.equal(out.igst, 0);
        assert.equal(out.isIntraState, true);
        // Recorded rather than inferred later: a store re-registered elsewhere must
        // not change what an already-issued invoice says.
        assert.equal(out.placeOfSupply, 'Madhya Pradesh');
    });

    await t.test('uses IGST for a delivery across a state line', () => {
        const out = buildTaxBreakdown(46, { state: 'Madhya Pradesh' }, { state: 'Gujarat' });
        assert.equal(out.igst, 46);
        assert.equal(out.cgst + out.sgst, 0);
        assert.equal(out.isIntraState, false);
    });

    await t.test('finds the state wherever the document keeps it', () => {
        const nested = buildTaxBreakdown(
            10,
            { location: { state: 'Karnataka' } },
            { location: { state: 'Karnataka' } },
        );
        assert.equal(nested.isIntraState, true);
        assert.equal(nested.cgst, 5);
    });

    await t.test('survives an order with no state recorded at all', () => {
        const out = buildTaxBreakdown(10, {}, {});
        assert.equal(out.cgst, 5);
        assert.equal(out.placeOfSupply, '');
    });
});
