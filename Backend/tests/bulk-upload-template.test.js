import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { generateBulkMenuTemplate } from '../src/modules/food/restaurant/services/bulkUpload.service.js';
import {
    normalizeFoodTypeForCategory,
    categoryAllowsFoodType
} from '../src/modules/food/shared/categoryWorkflow.js';

/**
 * The bulk sheet is how a grocery catalogue of any size actually gets entered, and
 * its parser addresses cells by fixed index. These pin the column layout, because a
 * column inserted anywhere before position 15 would silently reparse every seller's
 * existing sheet into the wrong fields.
 */

const ORIGINAL_HEADERS = [
    'Category*',
    'Item Name*',
    'Description',
    'Base Price*',
    'Food Type (Veg/Non-Veg)*',
    'Recommended (Yes/No)',
    'Preparation Time*',
    'Image URL',
    'Variant 1 Name',
    'Variant 1 Price',
    'Variant 2 Name',
    'Variant 2 Price',
    'Variant 3 Name',
    'Variant 3 Price'
];

const GROCERY_HEADERS = [
    'MRP',
    'GST Rate (%)',
    'Stock Qty',
    'Brand',
    'Pack Size',
    'HSN Code',
    'Net Quantity',
    'Net Quantity Unit',
    'SKU',
    'Barcode'
];

const headerRowOf = async () => {
    const workbook = await generateBulkMenuTemplate();
    const sheet = workbook.getWorksheet(1);
    return (sheet.getRow(1).values || []).slice(1).map((v) => String(v ?? ''));
};

test('bulk upload template', async (t) => {
    await t.test('keeps the original fourteen columns in their original positions', async () => {
        const headers = await headerRowOf();
        ORIGINAL_HEADERS.forEach((expected, idx) => {
            assert.equal(
                headers[idx],
                expected,
                `column ${idx + 1} must stay "${expected}" or old sheets misparse`
            );
        });
    });

    await t.test('appends the grocery columns after them, in parser order', async () => {
        const headers = await headerRowOf();
        GROCERY_HEADERS.forEach((expected, idx) => {
            // Columns 15..24, which is what the row parser reads by index.
            assert.equal(headers[ORIGINAL_HEADERS.length + idx], expected, `column ${15 + idx}`);
        });
    });

    await t.test('Net Quantity Unit sits at column 22, where its dropdown is bound', async () => {
        // The dropdown is written to cell V, and V is the 22nd column. If the layout
        // shifts, the validation lands on the wrong column and silently misleads.
        const headers = await headerRowOf();
        assert.equal(headers[21], 'Net Quantity Unit');
    });

    await t.test('offers None as a food type for non-food stock', async () => {
        const workbook = await generateBulkMenuTemplate();
        const sheet = workbook.getWorksheet(1);
        const validation = sheet.getCell('E2').dataValidation;
        assert.ok(validation.formulae[0].includes('None'), validation.formulae[0]);
    });

    await t.test('constrains the net quantity unit to what the unit maths understands', async () => {
        const workbook = await generateBulkMenuTemplate();
        const sheet = workbook.getWorksheet(1);
        const validation = sheet.getCell('V2').dataValidation;
        for (const unit of ['g', 'kg', 'ml', 'l', 'piece']) {
            assert.ok(validation.formulae[0].includes(unit), `${unit} missing`);
        }
    });

    await t.test('a sheet saved from the template survives a round trip through ExcelJS', async () => {
        const workbook = await generateBulkMenuTemplate();
        const buffer = await workbook.xlsx.writeBuffer();

        const reloaded = new ExcelJS.Workbook();
        await reloaded.xlsx.load(buffer);
        const headers = (reloaded.getWorksheet(1).getRow(1).values || [])
            .slice(1)
            .map((v) => String(v ?? ''));

        assert.deepEqual(headers, [...ORIGINAL_HEADERS, ...GROCERY_HEADERS]);
    });
});

test('food type in category placement', async (t) => {
    await t.test("'None' survives normalisation instead of becoming Non-Veg", () => {
        assert.equal(normalizeFoodTypeForCategory('None'), 'None');
        assert.equal(normalizeFoodTypeForCategory('Veg'), 'Veg');
        assert.equal(normalizeFoodTypeForCategory('Non-Veg'), 'Non-Veg');
        // Anything unrecognised must still land on Non-Veg: calling an unknown
        // food vegetarian is the one answer that actually harms someone.
        assert.equal(normalizeFoodTypeForCategory('anything else'), 'Non-Veg');
        assert.equal(normalizeFoodTypeForCategory(''), 'Non-Veg');
    });

    await t.test('non-food goes in a general category, not a Veg or Non-Veg one', () => {
        assert.equal(categoryAllowsFoodType('Both', 'None'), true);
        assert.equal(categoryAllowsFoodType('Veg', 'None'), false);
        assert.equal(categoryAllowsFoodType('Non-Veg', 'None'), false);
    });

    await t.test('existing food placement rules are unchanged', () => {
        assert.equal(categoryAllowsFoodType('Veg', 'Veg'), true);
        assert.equal(categoryAllowsFoodType('Veg', 'Non-Veg'), false);
        assert.equal(categoryAllowsFoodType('Non-Veg', 'Non-Veg'), true);
        assert.equal(categoryAllowsFoodType('Both', 'Veg'), true);
        assert.equal(categoryAllowsFoodType('Both', 'Non-Veg'), true);
    });
});
