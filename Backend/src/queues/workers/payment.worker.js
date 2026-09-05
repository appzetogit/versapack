import 'dotenv/config';
import { Worker } from 'bullmq';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { initSocketEmitter } from '../../config/socket.js';
import { getBullMQConnection } from '../connection.js';
import { PAYMENT_QUEUE } from '../queue.constants.js';
import { processPaymentJob } from '../processors/payment.processor.js';

const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
};

const startPaymentWorker = async () => {
    if (!config.bullmqEnabled) {
        logger.info('BullMQ is disabled. Payment worker not started.');
        return null;
    }
    /**
     * A worker is its own process, so it has to open its own database connection --
     * nothing else in it does. Without this every job that reads or writes fails
     * with "Operation `<collection>` buffering timed out after 10000ms", and the
     * processors catch that and report the job completed, so the queue drains
     * cleanly while doing nothing at all. It stayed invisible for as long as
     * BULLMQ_ENABLED was false and no job ever ran.
     */
    await connectDB();
    // Jobs emit to riders and customers; without this those emits vanish.
    await initSocketEmitter();

    const connection = getBullMQConnection();
    if (!connection) {
        logger.error('Payment worker: Redis connection unavailable. Exiting.');
        process.exit(1);
    }
    const worker = new Worker(PAYMENT_QUEUE, processPaymentJob, {
        connection,
        concurrency: 5,
        defaultJobOptions
    });
    worker.on('completed', (job) => logger.info(`Payment job ${job.id} completed`));
    worker.on('failed', (job, err) => logger.error(`Payment job ${job?.id} failed: ${err.message}`));
    worker.on('error', (err) => logger.error(`Payment worker error: ${err.message}`));
    logger.info('Payment worker started');
    return worker;
};

const worker = await startPaymentWorker();
if (worker) {
    const shutdown = async () => {
        await worker.close();
        await disconnectDB().catch(() => {});
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
