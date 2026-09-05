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
 * Starts its own redis-server through redis-memory-server, the same way the other
 * integration suites start their own mongod, so this needs no setup to run. Set
 * TEST_REDIS_URL to point at one you are already running instead. Skipped rather
 * than failed if neither can be had, so the suite stays green on a machine that
 * cannot start Redis at all.
 */

let serverProcess = null;

/**
 * Starts a redis-server and returns its url, or null if one cannot be had.
 *
 * The binary comes from redis-memory-server, but the spawn is ours: its own spawn
 * lets the server inherit stdio, and redis writing to this process's stdout
 * corrupts the test runner's IPC stream ("Unable to deserialize cloned data"),
 * which fails the file at random with every subtest passing. stdio must be ignored.
 */
const startRedis = async () => {
    if (process.env.TEST_REDIS_URL) return process.env.TEST_REDIS_URL;
    try {
        const { RedisBinary } = await import('redis-memory-server');
        const { spawn } = await import('node:child_process');
        const { default: IORedis } = await import('ioredis');

        const binary = await RedisBinary.getPath({});
        // A per-process port, so parallel test files never collide.
        const port = 6400 + (process.pid % 1000);
        const url = `redis://127.0.0.1:${port}`;

        serverProcess = spawn(binary, ['--port', String(port), '--save', '', '--appendonly', 'no'], {
            stdio: 'ignore',
            windowsHide: true,
        });
        serverProcess.unref();

        // Poll until it answers, rather than sleeping a guessed interval.
        for (let i = 0; i < 50; i += 1) {
            const probe = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
            try {
                await probe.connect();
                await probe.ping();
                return url;
            } catch {
                await new Promise((r) => setTimeout(r, 100));
            } finally {
                probe.disconnect();
            }
        }
        return null;
    } catch {
        return null;
    }
};

test('BullMQ against a real Redis', async (t) => {
    const REDIS_URL = await startRedis();
    if (!REDIS_URL) {
        t.skip('could not start a redis-server');
        return;
    }

    // Set before the config module is first imported: it reads process.env at load.
    process.env.REDIS_ENABLED = 'true';
    process.env.BULLMQ_ENABLED = 'true';
    process.env.REDIS_URL = REDIS_URL;

    // The app logger writes to stdout, and BullMQ logs connection lifecycle events
    // asynchronously -- including after a subtest has returned. node:test streams a
    // V8-serialized protocol over that same stdout, so an interleaved log corrupts it
    // and fails the file with "Unable to deserialize cloned data" while every subtest
    // passes. Capture the lines instead of printing them; they are assertable anyway.
    const logged = [];
    const { logger } = await import('../../src/utils/logger.js');
    const realLogger = { info: logger.info, warn: logger.warn, error: logger.error };
    logger.info = (m) => { logged.push(String(m)); };
    logger.warn = (m) => { logged.push(String(m)); };
    logger.error = (m) => { logged.push(String(m)); };
    t.after(() => { Object.assign(logger, realLogger); });

    const { Queue, Worker } = await import('bullmq');
    const { default: IORedis } = await import('ioredis');
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const created = [];

    t.after(async () => {
        const { closeBullMQConnection } = await import('../../src/queues/index.js');
        await closeBullMQConnection().catch(() => {});
        await Promise.all(created.map((c) => c.close().catch(() => {})));
        await connection.flushdb().catch(() => {});
        connection.disconnect();
        if (serverProcess) serverProcess.kill();
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

        const from = logged.length;
        for (const action of ['DISPATCH_TIMEOUT_CHECK', 'ORDER_ACCEPTANCE_TIMEOUT_CHECK']) {
            const result = await processOrderJob({
                id: 'j1',
                data: { action, orderMongoId: '64b7f1c2a1b2c3d4e5f60001' },
            });
            assert.equal(result.processed, true);
        }

        const unresolved = logged.slice(from)
            .filter((m) => /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(m));
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
        const { getOrderQueue } = await import('../../src/queues/index.js');
        const q = getOrderQueue();
        assert.ok(q, 'order queue must exist when BullMQ is enabled');
        assert.equal(typeof q.add, 'function');
    });
});
