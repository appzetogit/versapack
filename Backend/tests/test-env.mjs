/**
 * Preloaded before every test file (see the `--import` in package.json's test
 * scripts).
 *
 * Tests must not inherit the developer's .env queue flags. With Redis and BullMQ
 * enabled there, any code path that enqueues a job opens a real ioredis connection
 * that nothing closes, so the test process never exits and the file hangs until the
 * runner kills it -- and BullMQ's async connection logging writes to the same stdout
 * that node:test streams its serialized protocol over, corrupting it.
 *
 * dotenv does not overwrite variables that are already set, so assigning them here,
 * before any config module loads, is what decides it. The queue suite deliberately
 * turns them back on before it imports the config.
 */
process.env.REDIS_ENABLED = 'false';
process.env.BULLMQ_ENABLED = 'false';
