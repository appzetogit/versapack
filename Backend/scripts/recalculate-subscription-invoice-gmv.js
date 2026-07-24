/**
 * One-time sync: recalculate gmv + orderCount on existing subscription invoices
 * using restaurant net share (same formula as wallet payout).
 *
 * Safe by default — only updates the display/audit gmv fields, NOT plan amounts
 * or outstanding balances. Invoice fees stay as originally generated.
 *
 * Usage:
 *   node scripts/recalculate-subscription-invoice-gmv.js                  (dry run)
 *   node scripts/recalculate-subscription-invoice-gmv.js --live           (write)
 *   node scripts/recalculate-subscription-invoice-gmv.js --month=2026-06    (one month)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { FoodSubscriptionInvoice } from '../src/modules/food/restaurant/models/subscriptionInvoice.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import {
    computeMonthlyGmv,
    getMonthWindow,
    billingMonthLabel,
} from '../src/modules/food/restaurant/services/subscriptionBilling.service.js';

const isLive = process.argv.includes('--live');
const monthArg = process.argv.find((arg) => arg.startsWith('--month='));
const filterMonth = monthArg ? monthArg.split('=')[1]?.trim() : null;

const main = async () => {
    await connectDB();

    const query = {
        billingMonth: { $ne: 'legacy' },
        ...(filterMonth ? { billingMonth: filterMonth } : {}),
    };

    const invoices = await FoodSubscriptionInvoice.find(query)
        .select('restaurantId billingMonth gmv orderCount planName totalAmount outstandingAmount status')
        .sort({ billingMonth: 1, restaurantId: 1 })
        .lean();

    console.log(
        `[recalc-gmv] ${isLive ? 'LIVE' : 'DRY RUN'} — ${invoices.length} invoice(s)${filterMonth ? ` for ${filterMonth}` : ''}`,
    );

    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const invoice of invoices) {
        try {
            const { start, end } = getMonthWindow(invoice.billingMonth);
            const { gmv: newGmv, orderCount: newOrderCount } = await computeMonthlyGmv(
                invoice.restaurantId,
                start,
                end,
            );

            const oldGmv = Number(invoice.gmv) || 0;
            const oldCount = Number(invoice.orderCount) || 0;
            const gmvDiff = Math.round((newGmv - oldGmv) * 100) / 100;

            if (Math.abs(gmvDiff) < 0.005 && oldCount === newOrderCount) {
                unchanged += 1;
                continue;
            }

            const restaurant = await FoodRestaurant.findById(invoice.restaurantId)
                .select('restaurantName')
                .lean();

            console.log(
                `  ${restaurant?.restaurantName || invoice.restaurantId} | ${billingMonthLabel(invoice.billingMonth)} | GMV ₹${oldGmv} → ₹${newGmv} (${gmvDiff >= 0 ? '+' : ''}${gmvDiff}) | orders ${oldCount} → ${newOrderCount} | plan ${invoice.planName} | due ₹${invoice.outstandingAmount}`,
            );

            if (isLive) {
                await FoodSubscriptionInvoice.updateOne(
                    { _id: invoice._id },
                    { $set: { gmv: newGmv, orderCount: newOrderCount } },
                );
            }

            updated += 1;
        } catch (err) {
            failed += 1;
            console.error(`  FAILED ${invoice._id} (${invoice.billingMonth}):`, err?.message || err);
        }
    }

    console.log(
        `[recalc-gmv] done: updated=${updated}, unchanged=${unchanged}, failed=${failed}${isLive ? '' : ' (dry run — re-run with --live to write)'}`,
    );

    await disconnectDB();
};

main().catch(async (err) => {
    console.error('[recalc-gmv] failed:', err);
    try {
        await disconnectDB();
    } catch {
        // ignore
    }
    process.exit(1);
});
