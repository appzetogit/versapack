import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The BullMQ tier, against a real Redis.
 *
 * This has never run. REDIS_ENABLED and BULLMQ_ENABLED are both false, so every
 * producer degrades to a logger.warn no-op and the whole queue path is dead code in
 * practice -- which is exactly how order.processor.js came to have an import that
 * pointed outside the source tree without anyone noticing.
 *
 * Two things matter here and neither can be checked without Redis. First, that a job
 * enqueued is actually a job a worker receives. Second, that the processor's dynamic
 * imports resolve: they are the reason the dispatch retry cascade was silently dead,
 * they resolve at call time rather than at load, and a bundler or a linter will never
 * see them.
 *
 * Requires a redis-server on TEST_REDIS_PORT (default 6399). Skipped, not failed,
 * when there is none: this suite must stay runnable on a machine without Redis.
 */

const PORT = Number(process.env.TEST_REDIS_PORT) || 6399;
const REDIS_URL = `redis://127.0.0.1:${PORT}`;

const redisReachable = async () => {
    const { default: IORedis } = await import('ioredis');
    const probe = new IORedis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    try {
        await probe.connect();
        await probe.ping();
        return true;
    } catch {
        return false;
    } finally {
        probe.disconnect();
    }
};

test('BullMQ against a real Redis', async (t) => {
    if (!(await redisReachable())) {
        t.skip(`no redis on ${REDIS_URL}`);
        return;
    }

    // Set before the config module is first imported: it reads process.env at load.
    process.env.REDIS_ENABLED = 'true';
    process.env.BULLMQ_ENABLED = 'true';
    process.env.REDIS_URL = REDIS_URL;

    const { Queue, Worker } = await import('bullmq');
    const { default: IORedis } = await import('ioredis');
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const created = [];

    t.after(async () => {
        await Promise.all(created.map((c) => c.close().catch(() => {})));
        await connection.flushdb();
        connection.disconnect();
    });

    const makeQueue = (name) => {
        const q = new Queue(name, { connection });
        created.push(q);
        return q;
    };
    const makeWorker = (name, fn) => {
        const w = new Worker(name, fn, { connection });
        created.push(w);
        return w;
    };

    await t.test('config honours the flags, so producers stop no-opping', async () => {
        const { config } = await import('../../src/config/env.js');
        assert.equal(config.redisEnabled, true);
        assert.equal(config.bullmqEnabled, true);
    });

    await t.test('a job enqueued is a job a worker receives', async () => {
        const name = `probe-${Date.now()}`;
        const queue = makeQueue(name);

        const received = new Promise((resolve) => {
            makeWorker(name, async (job) => { resolve(job.data); return true; });
        });

        await queue.add('process-order', { action: 'PROBE', orderId: 'abc' });
        const data = await received;
        assert.equal(data.action, 'PROBE');
        assert.equal(data.orderId, 'abc');
    });

    await t.test('jobId dedupes, so a retried enqueue does not run twice', async () => {
        // The order acceptance timeout relies on this: it is enqueued with a jobId
        // derived from the order, and a re-dispatch must not arm a second timeout.
        const name = `dedupe-${Date.now()}`;
        const queue = makeQueue(name);

        await queue.add('x', { n: 1 }, { jobId: 'same-id' });
        await queue.add('x', { n: 2 }, { jobId: 'same-id' });

        const counts = await queue.getJobCounts();
        assert.equal((counts.waiting || 0) + (counts.delayed || 0) + (counts.active || 0), 1);
    });

    await t.test('the order processor resolves its dynamic imports', async () => {
        // THE reason this file exists. Both handlers reach for order.service.js
        // through a runtime import that used to point outside src/, so every
        // DISPATCH_TIMEOUT_CHECK and ORDER_ACCEPTANCE_TIMEOUT_CHECK threw
        // ERR_MODULE_NOT_FOUND into a catch that logged and reported success. The
        // rider re-offer cascade was dead and nothing said so.
        //
        // Asserting the import resolves, not that dispatch succeeds: there is no
        // database here, so the handler is expected to fail on the lookup. What must
        // not appear is a module-resolution error.
        // The handler will reach for Mongo, which is not running here. Cap the buffer
        // so it fails in a second instead of sitting on the default 10s timeout twice.
        const mongoose = (await import('mongoose')).default;
        mongoose.set('bufferTimeoutMS', 500);

        const { processOrderJob } = await import('../../src/queues/processors/order.processor.js');

        const seen = [];
        const realError = console.error;
        const { logger } = await import('../../src/utils/logger.js');
        const realLoggerError = logger.error;
        logger.error = (msg) => { seen.push(String(msg)); };

        try {
            for (const action of ['DISPATCH_TIMEOUT_CHECK', 'ORDER_ACCEPTANCE_TIMEOUT_CHECK']) {
                const result = await processOrderJob({
                    id: 'j1',
                    data: { action, orderMongoId: '64b7f1c2a1b2c3d4e5f60001' },
                });
                assert.equal(result.processed, true);
            }
        } finally {
            logger.error = realLoggerError;
            console.error = realError;
        }

        const unresolved = seen.filter((m) => /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(m));
        assert.deepEqual(unresolved, [], 'the handlers must not fail to resolve their imports');
    });

    await t.test('the production producer actually enqueues', async () => {
        // enqueueOrderEvent is what every order lifecycle event goes through, and it
        // is fire-and-forget: with the flags off it warns and drops the job, and
        // nothing anywhere notices. This is the path, not a stand-in for it.
        const { getOrderQueue } = await import('../../src/queues/index.js');
        const { enqueueOrderEvent } = await import('../../src/modules/food/orders/services/order.helpers.js');

        const queue = getOrderQueue();
        await queue.drain(true).catch(() => {});
        const before = await queue.getJobCounts();

        enqueueOrderEvent('delivery_completed', { orderId: 'ord-1', orderMongoId: 'ord-1' });
        // Fire-and-forget, so give the enqueue a moment to land.
        await new Promise((r) => setTimeout(r, 400));

        const after = await queue.getJobCounts();
        const total = (c) => (c.waiting || 0) + (c.delayed || 0) + (c.active || 0) + (c.completed || 0);
        assert.ok(total(after) > total(before), 'the job reached Redis');
    });

    await t.test('getQueue returns a real queue once the flags are on', async () => {
        // With them off this returns null and every producer silently drops its job.
        const { getOrderQueue, closeBullMQConnection } = await import('../../src/queues/index.js');
        const q = getOrderQueue();
        assert.ok(q, 'order queue must exist when BullMQ is enabled');
        assert.equal(typeof q.add, 'function');
        await closeBullMQConnection().catch(() => {});
    });
});
