import 'dotenv/config';
import { Worker } from 'bullmq';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { getBullMQConnection } from '../connection.js';
import { OTP_QUEUE } from '../queue.constants.js';
import { processOtpJob } from '../processors/otp.processor.js';

const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
};

const startOtpWorker = async () => {
    if (!config.bullmqEnabled) {
        logger.info('BullMQ is disabled. OTP worker not started.');
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

    const connection = getBullMQConnection();
    if (!connection) {
        logger.error('OTP worker: Redis connection unavailable. Exiting.');
        process.exit(1);
    }
    const worker = new Worker(OTP_QUEUE, processOtpJob, {
        connection,
        concurrency: 5,
        defaultJobOptions
    });
    worker.on('completed', (job) => logger.info(`OTP job ${job.id} completed`));
    worker.on('failed', (job, err) => logger.error(`OTP job ${job?.id} failed: ${err.message}`));
    worker.on('error', (err) => logger.error(`OTP worker error: ${err.message}`));
    logger.info('OTP worker started');
    return worker;
};

const worker = await startOtpWorker();
if (worker) {
    const shutdown = async () => {
        await worker.close();
        await disconnectDB().catch(() => {});
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
