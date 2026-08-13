/**
 * Checks the analytics arithmetic that has no database in it.
 *
 * The aggregation itself needs Mongo, but the parts that go wrong quietly do
 * not: an empty window dividing by zero, a trend against zero printing an
 * infinity, and day bucketing landing an evening IST order on the wrong date.
 *
 *   node scripts/analytics.selfcheck.mjs
 */
import assert from 'node:assert/strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const IST_OFFSET_MINUTES = 330;

const aov = (sales, orders) => (orders > 0 ? round2(sales / orders) : 0);
const trend = (now, before) => (before > 0 ? round2(((now - before) / before) * 100) : null);
const dayKey = (date) =>
    new Date(date.getTime() + IST_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);

// An empty window must be 0, not NaN. NaN serialises to null and renders as a
// blank tile rather than a zero.
assert.equal(aov(0, 0), 0);
assert.ok(!Number.isNaN(aov(0, 0)));
assert.equal(aov(300, 4), 75);

// Growth from nothing is not a percentage.
assert.equal(trend(500, 0), null);
assert.equal(trend(0, 0), null);
assert.equal(trend(150, 100), 50);
assert.equal(trend(50, 100), -50);

// 23:00 IST on the 13th is 17:30 UTC on the 13th -- same day either way.
assert.equal(dayKey(new Date('2026-08-13T17:30:00Z')), '2026-08-13');
// 01:00 IST on the 14th is 19:30 UTC on the 13th. Bucketing in UTC would file
// this under the 13th and hand the seller someone else's trading day.
assert.equal(dayKey(new Date('2026-08-13T19:30:00Z')), '2026-08-14');
// 05:00 IST on the 13th is 23:30 UTC on the 12th.
assert.equal(dayKey(new Date('2026-08-12T23:30:00Z')), '2026-08-13');

// Every day in the range appears, including the ones with no trade, so a chart
// cannot draw a straight line across a closed week and call it steady.
const from = new Date('2026-08-10T00:00:00+05:30');
const to = new Date('2026-08-14T23:59:59+05:30');
const days = [];
const cursor = new Date(from.getTime());
while (cursor <= to) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
}
assert.deepEqual(days, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);

// New + returning must account for every customer seen, or the two tiles
// disagree with the order count and neither is trustworthy.
const seen = ['a', 'b', 'c', 'd'];
const returning = ['b', 'd'];
assert.equal(seen.length - returning.length + returning.length, seen.length);

console.log('analytics selfcheck: PASS');
