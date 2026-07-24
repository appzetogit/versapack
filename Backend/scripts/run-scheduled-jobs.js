import { validateConfig } from '../src/config/validateEnv.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { connectRedis, closeRedis } from '../src/config/redis.js';
import { config } from '../src/config/env.js';
import { expireExpiredOffers } from '../src/modules/food/admin/services/admin.service.js';
import { syncExpiredFssaiNotifications } from '../src/modules/food/restaurant/services/fssaiExpiry.service.js';
import { runBillingCatchUp } from '../src/modules/food/restaurant/services/subscriptionBilling.service.js';
import { logger } from '../src/utils/logger.js';

let expireOffersInterval = null;
let fssaiExpiryInterval = null;
let subscriptionBillingInterval = null;

const shutdown = async (signal) => {
    logger.info(`${signal} received, stopping scheduled jobs`);
    if (expireOffersInterval) clearInterval(expireOffersInterval);
    if (fssaiExpiryInterval) clearInterval(fssaiExpiryInterval);
    if (subscriptionBillingInterval) clearInterval(subscriptionBillingInterval);

    try {
        await disconnectDB();
        await closeRedis();
        logger.info('Scheduled jobs stopped cleanly');
        process.exit(0);
    } catch (err) {
        logger.error(`Scheduled jobs shutdown error: ${err.message}`);
        process.exit(1);
    }
};

const start = async () => {
    try {
        validateConfig();
        await connectDB();
        if (config.redisEnabled) {
            await connectRedis();
        }

        try {
            const { recoverStuckOrders } = await import('../src/modules/food/orders/services/order.service.js');
            await recoverStuckOrders();
        } catch (err) {
            logger.error(`Scheduled jobs watchdog error: ${err.message}`);
        }

        const runExpire = async () => {
            try {
                await expireExpiredOffers();
            } catch (err) {
                logger.error(`Expire offers error: ${err.message}`);
            }
        };

        const runFssaiExpirySync = async () => {
            try {
                await syncExpiredFssaiNotifications();
            } catch (err) {
                logger.error(`FSSAI expiry sync error: ${err.message}`);
            }
        };

        const runSubscriptionBilling = async () => {
            try {
                // Idempotent: bills only closed, not-yet-invoiced calendar months.
                await runBillingCatchUp();
            } catch (err) {
                logger.error(`Monthly subscription billing error: ${err.message}`);
            }
        };

        await runExpire();
        await runFssaiExpirySync();
        await runSubscriptionBilling();

        expireOffersInterval = setInterval(runExpire, 5 * 60 * 1000);
        fssaiExpiryInterval = setInterval(runFssaiExpirySync, 60 * 60 * 1000);
        subscriptionBillingInterval = setInterval(runSubscriptionBilling, 6 * 60 * 60 * 1000);

        logger.info('Scheduled jobs runner started');
    } catch (err) {
        logger.error(`Failed to start scheduled jobs runner: ${err.message}`);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await start();
