/**
 * Test helper: runs the monthly subscription billing for a given closed month.
 *
 * Usage:
 *   node scripts/simulate-monthly-billing.js --month 2026-06            (dry summary + live run prompt-free)
 *   node scripts/simulate-monthly-billing.js                            (catch-up: all unbilled closed months)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import {
    runMonthlyBilling,
    runBillingCatchUp,
} from '../src/modules/food/restaurant/services/subscriptionBilling.service.js';

const getArg = (name) => {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx === -1) return null;
    return process.argv[idx + 1] || null;
};

const main = async () => {
    await connectDB();
    try {
        const month = getArg('month');
        if (month) {
            const result = await runMonthlyBilling(month, { generatedBy: 'admin' });
            console.log('[simulate-monthly-billing] result:', JSON.stringify(result, null, 2));
        } else {
            const result = await runBillingCatchUp();
            console.log('[simulate-monthly-billing] catch-up result:', JSON.stringify(result, null, 2));
        }
    } finally {
        await disconnectDB().catch(() => mongoose.disconnect());
    }
};

main().catch((err) => {
    console.error('[simulate-monthly-billing] failed:', err);
    process.exit(1);
});
