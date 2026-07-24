/**
 * One-time migration: carries forward pre-redesign subscription dues
 * (restaurant.subscriptionDueAmount) into the new postpaid billing ledger
 * as a labeled 'legacy' invoice per restaurant.
 *
 * Idempotent: the unique {restaurantId, billingMonth} index prevents duplicates.
 * Legacy restaurant fields are left untouched (frozen for audit).
 *
 * Usage:
 *   node scripts/migrate-legacy-subscription-dues.js             (dry run — reports only)
 *   node scripts/migrate-legacy-subscription-dues.js --live      (writes legacy invoices)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodSubscriptionInvoice } from '../src/modules/food/restaurant/models/subscriptionInvoice.model.js';
import { FoodSubscriptionTransaction } from '../src/modules/food/restaurant/models/subscriptionTransaction.model.js';

const isLive = process.argv.includes('--live');

const main = async () => {
    await connectDB();
    try {
        const restaurants = await FoodRestaurant.find({ subscriptionDueAmount: { $gt: 0 } })
            .select('restaurantName subscriptionPlan subscriptionAmount subscriptionPaidAmount subscriptionDueAmount subscriptionStatus subscriptionValidTill subscriptionAutoDeductedAmount onboardingFeePaid')
            .lean();

        console.log(`[migrate-legacy-dues] ${isLive ? 'LIVE' : 'DRY RUN'} — ${restaurants.length} restaurants with legacy dues`);

        let created = 0;
        let skipped = 0;
        let totalCarried = 0;

        for (const restaurant of restaurants) {
            const due = Math.round((Number(restaurant.subscriptionDueAmount) || 0) * 100) / 100;
            if (due <= 0) continue;

            const existing = await FoodSubscriptionInvoice.findOne({
                restaurantId: restaurant._id,
                billingMonth: 'legacy',
            }).select('_id').lean();

            if (existing) {
                skipped += 1;
                continue;
            }

            console.log(`  ${restaurant.restaurantName || restaurant._id}: ₹${due}`);
            totalCarried += due;

            if (!isLive) continue;

            const invoice = await FoodSubscriptionInvoice.create({
                restaurantId: restaurant._id,
                billingMonth: 'legacy',
                periodStart: null,
                periodEnd: null,
                gmv: 0,
                orderCount: 0,
                planName: 'legacy',
                planAmount: due,
                gstAmount: 0,
                totalAmount: due,
                outstandingAmount: due,
                status: 'pending',
                isLegacyCarryForward: true,
                generatedBy: 'migration',
                notes: 'Outstanding due carried forward from the purchase-based subscription system',
                settingsSnapshot: {},
            });

            await FoodSubscriptionTransaction.create({
                restaurantId: restaurant._id,
                invoiceId: invoice._id,
                billingMonth: 'legacy',
                type: 'legacy_carryforward',
                amount: due,
                outstandingAfter: due,
                invoiceStatusAfter: 'pending',
                processedBy: { role: 'SYSTEM' },
                remarks: 'Pre-migration subscription due carried forward',
                metadata: {
                    legacySnapshot: {
                        subscriptionPlan: restaurant.subscriptionPlan || '',
                        subscriptionAmount: restaurant.subscriptionAmount || 0,
                        subscriptionPaidAmount: restaurant.subscriptionPaidAmount || 0,
                        subscriptionDueAmount: restaurant.subscriptionDueAmount || 0,
                        subscriptionStatus: restaurant.subscriptionStatus || '',
                        subscriptionValidTill: restaurant.subscriptionValidTill || null,
                        subscriptionAutoDeductedAmount: restaurant.subscriptionAutoDeductedAmount || 0,
                        onboardingFeePaid: Boolean(restaurant.onboardingFeePaid),
                    },
                },
            });

            created += 1;
        }

        console.log(`[migrate-legacy-dues] done: created=${created}, alreadyMigrated=${skipped}, totalCarried=₹${totalCarried}${isLive ? '' : ' (dry run — nothing written; re-run with --live)'}`);
    } finally {
        await disconnectDB().catch(() => mongoose.disconnect());
    }
};

main().catch((err) => {
    console.error('[migrate-legacy-dues] failed:', err);
    process.exit(1);
});
