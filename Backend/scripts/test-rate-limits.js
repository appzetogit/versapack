#!/usr/bin/env node
/**
 * Quick manual check for HTTP rate limiters.
 * Usage: node scripts/test-rate-limits.js [baseUrl]
 * Example: node scripts/test-rate-limits.js http://localhost:5000
 */
const baseUrl = process.argv[2] || 'http://localhost:5000';

const hit = async (path) => {
    const url = `${baseUrl}${path}`;
    const started = Date.now();
    const response = await fetch(url, { method: 'GET' });
    const elapsed = Date.now() - started;
  return {
        status: response.status,
        remaining: response.headers.get('ratelimit-remaining'),
        limit: response.headers.get('ratelimit-limit'),
        reset: response.headers.get('ratelimit-reset'),
        retryAfter: response.headers.get('retry-after'),
        elapsed,
    };
};

const run = async () => {
    console.log(`Testing global API rate limit against ${baseUrl}`);
    console.log('GET /api/v1/health/rate-limit in a loop until 429...\n');

    for (let i = 1; i <= 120; i += 1) {
        const result = await hit('/api/v1/health/rate-limit');
        console.log(
            `#${i} status=${result.status} remaining=${result.remaining ?? 'n/a'} limit=${result.limit ?? 'n/a'} ${result.elapsed}ms`,
        );
        if (result.status === 429) {
            console.log('\n429 received — rate limiting is active.');
            console.log(`Retry-After: ${result.retryAfter || 'n/a'} seconds`);
            process.exit(0);
        }
    }

    console.log('\nNo 429 after 120 requests. Limits may be disabled or very high (dev mode).');
    console.log('Set RATE_LIMIT_ENABLED=true and lower RATE_LIMIT_MAX=5 to test faster.');
};

run().catch((error) => {
    console.error('Test failed:', error.message);
    process.exit(1);
});
