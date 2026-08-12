/**
 * Asserts that no public endpoint hands out a seller's private data.
 *
 * Written after `GET /food/restaurant/restaurants/:id` was found returning the
 * entire seller document to anonymous callers — bank account number, IFSC, PAN
 * number and a URL to the PAN scan among them. The fix is an allowlist
 * projection; this is the check that stops it regressing, because the failure
 * mode is silent: nothing errors, the response simply contains too much.
 *
 *   node scripts/public-exposure-check.js [baseUrl]
 *
 * Runs against a live host with no credentials, which is the only way to test
 * what an anonymous caller actually receives.
 */
const BASE = process.argv[2] || 'https://quick.appzeto.com/api/v1';

/** Nothing here may ever appear in a response served without authentication. */
const FORBIDDEN = [
  'accountNumber', 'accountHolderName', 'accountType', 'ifscCode',
  'nameOnPan', 'panNumber', 'panImage',
  'gstImage', 'gstRegistered', 'gstNumber', 'gstLegalName', 'gstAddress',
  'fssaiNumber', 'fssaiImage', 'fssaiExpiry',
  'ownerName', 'ownerEmail', 'ownerPhone', 'ownerPhoneDigits',
  'ownerPhoneLast10', 'primaryContactNumber',
  'fcmTokens', 'fcmTokenMobile', 'tokenVersion',
  'subscriptionAmount', 'subscriptionDueAmount', 'subscriptionPaidAmount',
  'subscriptionAutoDeductedAmount', 'subscriptionStatus', 'subscriptionPlan',
  'onboardingFeeAmount', 'onboardingFeePaid', 'onboardingFeePaymentId',
];

let failures = 0;

/** Walks the whole payload: a leak nested one level down is still a leak. */
function scan(node, path, label) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => scan(v, `${path}[${i}]`, label));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const key of Object.keys(node)) {
    if (FORBIDDEN.includes(key)) {
      console.log(`  LEAK  ${label} -> ${path}.${key} = ${JSON.stringify(node[key]).slice(0, 40)}`);
      failures++;
    }
    scan(node[key], `${path}.${key}`, label);
  }
}

async function check(label, url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  skip  ${label} (HTTP ${res.status})`);
    return;
  }
  const before = failures;
  scan((await res.json())?.data, 'data', label);
  if (failures === before) console.log(`  ok    ${label}`);
}

async function main() {
  console.log(`checking ${BASE} with no credentials\n`);

  const products = await (await fetch(`${BASE}/food/search/products?limit=1`)).json();
  const sellerId = products?.data?.products?.[0]?.restaurantId;
  if (!sellerId) {
    console.error('no seller id available to test with');
    process.exit(1);
  }

  await check('search/products', `${BASE}/food/search/products?limit=5`);
  await check('restaurant/restaurants', `${BASE}/food/restaurant/restaurants`);
  await check('restaurant/restaurants/:id', `${BASE}/food/restaurant/restaurants/${sellerId}`);
  await check('restaurants/:id/menu', `${BASE}/food/restaurant/restaurants/${sellerId}/menu`);
  await check('search/unified', `${BASE}/food/search/unified?q=milk`);
  await check('public/foods', `${BASE}/food/restaurant/public/foods?limit=5`);

  console.log(`\n${failures === 0 ? 'PASS — no private field exposed' : `FAIL — ${failures} leaked field(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('check failed to run:', err.message);
  process.exit(1);
});
