# User App — API Spec

Verified against `Backend/src/routes/index.js` and every controller, service, validator, and model it reaches.

Companion docs: [DELIVERY_API_SPEC.md](DELIVERY_API_SPEC.md), [RESTAURANT_API_SPEC.md](RESTAURANT_API_SPEC.md).

## Global

- **Base URL:** `{HOST}/api/v1`
- **Static files:** `{HOST}/uploads/...`
- **Auth:** `Authorization: Bearer <accessToken>`, role `USER`
- **Envelope:** `{ "success": true, "message": "…", "data": … }` / errors `{ "success": false, "message": "…" }`
- **Rate limiting** on `/api/*`, stricter on OTP routes — handle 429.
- **Caching:** public GETs are server-cached (30s–30min) with browser cache headers. Don't add a client cache on top initially.

Two pagination shapes exist. Don't assume one:
```json
{ "data": [ … ], "meta": { "total": 240, "page": 1, "limit": 20, "totalPages": 12 } }   // orders
{ "items": [ … ], "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1 } } // notifications
{ "restaurants": [ … ], "total": 42, "page": 1, "limit": 20 }                            // restaurants, search
```

---

## 1. Auth — `/food/auth` (also mounted at `/auth`)

### `POST /food/auth/user/request-otp`
```json
{ "phone": "9876543210" }
```
→ `data: { "phone": "9876543210", …otpResult }`

Phone: digits only, 8–15 characters.

### `POST /food/auth/user/verify-otp`
```json
{
  "phone": "9876543210",
  "otp": "1234",
  "name": "Om",
  "ref": "<referrerUserId>",
  "fcmToken": "…",
  "platform": "mobile"
}
```
`otp` is exactly 4 digits. `name` (2–100 chars) is only applied when the account has none. `ref` credits a referral **only on brand-new accounts** and only if the referrer is under the configured limit — referral failures never block login.

→
```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "isNewUser": true,
  "user": {
    "_id": "…", "phone": "9876543210", "countryCode": "+91",
    "name": "Om", "email": "…", "profileImage": "",
    "dateOfBirth": null, "anniversary": null, "gender": "",
    "referralCode": "…", "referredBy": null, "referralCount": 0,
    "isVerified": true, "isActive": true, "role": "USER",
    "addresses": [ /* embedded, see §6 */ ],
    "fcmTokens": [], "fcmTokenMobile": [],
    "createdAt": "…", "updatedAt": "…"
  }
}
```

`isNewUser: true` means the account has no usable name yet → show the name screen. A deactivated account (`isActive: false`) is rejected at login with *"Your account has been deactivated…"*.

### `POST /food/auth/refresh-token`
`{ "refreshToken": "…" }` → a new token pair.

### `POST /food/auth/logout`
`{ "refreshToken": "…", "fcmToken": "…", "platform": "mobile" }` — invalidates the refresh token and unregisters the push token.

### `GET /food/auth/me` (Bearer)
Current principal for the token.

---

## 2. App bootstrap (no auth)

Call on cold start — these drive feature flags, fee display, and CMS content.

| Method | Path | Returns |
|---|---|---|
| GET | `/food/admin/business-settings/public` | business config |
| GET | `/food/admin/feature-settings/public` | feature flags |
| GET | `/food/admin/fee-settings/public` | GST rate, platform fee, packaging, quick-delivery surcharge |
| GET | `/food/admin/power-scanning/public` | power-scanning config |
| GET | `/food/admin/restaurant-subscription-settings/public` | plan catalog |
| GET | `/food/landing/settings/public?zoneId=` | landing config (below) |
| GET | `/food/referral-settings` | reward + limit per role |
| GET | `/food/pages/:key` | CMS page — `about`, `terms`, `privacy`, … |
| GET | `/v1/health` | health probe (full path `/api/v1/health`) |

`GET /food/landing/settings/public` returns the landing settings spread at the top level, with `recommendedRestaurantIds` replaced by hydrated docs:
```json
{
  "…landing settings fields…",
  "recommendedRestaurants": [
    { "_id": "…", "restaurantName": "…", "area": "…", "city": "…",
      "profileImage": "…", "coverImages": [], "menuImages": [],
      "slug": "…", "rating": 4.3, "cuisines": ["…"],
      "pureVegRestaurant": false, "zoneId": "…" }
  ]
}
```
Passing `zoneId` restricts the recommendations to that zone.

---

## 3. Zones (no auth)

### `GET /food/zones/detect?lat=&lng=`
Point-in-polygon against active zones. 400 if lat/lng missing.
```json
{ "success": true, "message": "Zone detected",
  "data": { "status": "IN_SERVICE", "zoneId": "…", "zone": { /* full zone doc */ } } }
```
Out of coverage — still HTTP 200:
```json
{ "success": true, "message": "Out of service",
  "data": { "status": "OUT_OF_SERVICE", "zoneId": null, "zone": null } }
```
Check `data.status`, not the HTTP code. Cached ~3 min server-side, keyed to 3-decimal-rounded coordinates (~110 m buckets).

### `GET /food/zones/public` · `GET /food/zones/nearby`
```json
{ "zones": [{
  "_id": "…", "name": "…", "zoneName": "…", "serviceLocation": "…",
  "country": "…", "unit": "…", "isActive": true,
  "coordinates": [ [lat, lng], … ], "createdAt": "…"
}] }
```

Zone detection gates the home screen. Run it right after location permission, cache `zoneId`, pass it to every listing and search call.

---

## 4. Home / landing (no auth)

All return active-only, ordered lists.

| Method | Path | `data` key |
|---|---|---|
| GET | `/food/hero-banners/public` | `{ banners }` |
| GET | `/food/top-banners/public` | `{ banners }` |
| GET | `/food/hero-banners/under-250/public` | `{ banners }` |
| GET | `/food/hero-banners/dining/public` | `{ banners }` |
| GET | `/food/hero-banners/home-promotion/public` | `{ banners }` |
| GET | `/food/hero-banners/gourmet/public` | `{ restaurants }` |
| GET | `/food/explore-icons/public` | `{ items }` |
| GET | `/food/dining/categories/public` | dining categories |
| GET | `/food/dining/restaurants/public` | dining restaurants |

---

## 5. Discovery (no auth)

### `GET /food/restaurant/restaurants`
Query: `page` (default 1), `limit` (default 100, max 1000), `city`, `area`, `cuisine`, `hasOffers=true`, `zoneId`, `lat`, `lng`, `radiusKm` (or legacy `maxDistance`), `sortBy` = `nearest` | `rating` / `rating-high` | `rating-low` | `price-low` | `price-high` | `deliveryTime` | `newest`.

```json
{
  "restaurants": [ … ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**The two code paths return different item shapes.** A geo query (`radiusKm` set, or `sortBy=nearest`, with lat/lng) goes through `$geoNear`; everything else takes the plain path.

Non-geo item:
```json
{
  "_id": "…", "id": "…", "restaurantId": "…",
  "restaurantName": "Spice Route",
  "name": "Spice Route",                    // alias — geo path does NOT have this
  "area": "…", "city": "…", "cuisines": ["North Indian"],
  "profileImage": { "url": "…" },           // wrapped object — geo path returns a plain string
  "coverImages": [], "menuImages": [],
  "estimatedDeliveryTime": "30", "estimatedDeliveryTimeMinutes": 30,
  "offer": "…", "featuredDish": "…", "featuredPrice": 260,
  "rating": 4.3, "totalRatings": 88,
  "isAcceptingOrders": true, "status": "approved", "pureVegRestaurant": false,
  "location": { "type": "Point", "coordinates": [lng, lat], "latitude": …, "longitude": … },
  "openingTime": "09:00", "closingTime": "22:00", "openDays": ["Monday", …],
  "outletTimings": { "Monday": { "isOpen": true, "openingTime": "09:00", "closingTime": "22:00" }, … },
  "recommendedItems": [ { "id": "…", "name": "…", "price": 260, "image": "…" } ],  // max 10
  "offers": [ … ],
  "createdAt": "…"
}
```
Geo item: same fields **minus** `name` / `id` / `restaurantId` aliases, `profileImage` is a plain string, and it adds `distanceMeters` + `distanceInKm`.

Write your model to accept `profileImage` as either a string or `{ url }`, and fall back to `restaurantName` when `name` is absent. This bites on the first "near me" screen.

### `GET /food/restaurant/restaurants/:id`
Accepts an ObjectId **or** a name slug. Approved restaurants only; `pendingLocation` is stripped from public output.
→ `data: { restaurant }` — full restaurant doc plus `outletTimings` and normalized geo. `null` → 404 path in the caller.

### `GET /food/restaurant/restaurants/:id/menu`
```json
{
  "menu": {
    "sections": [{
      "id": "…", "categoryId": "…", "name": "Starters", "image": "…",
      "sortOrder": 0, "itemCount": 12, "subsections": [],
      "items": [{
        "id": "…", "name": "Paneer Tikka", "description": "…",
        "price": 260, "otherPrice": 320,
        "variants":   [{ "name": "Full", "price": 260, "otherPrice": 320 }],
        "variations": [ /* duplicate of variants under a legacy key */ ],
        "image": "…", "foodType": "Veg", "isAvailable": true,
        "approvalStatus": "approved", "rejectionReason": "",
        "preparationTime": "20",
        "requestedAt": "…", "approvedAt": "…", "rejectedAt": null,
        "createdAt": "…", "updatedAt": "…"
      }]
    }],
    "categories": [ { "id": "…", "categoryId": "…", "name": "Starters", "image": "…", "sortOrder": 0, "itemCount": 12 } ]
  }
}
```
Only approved, available items reach the public menu. 404 for a non-approved restaurant.

### `GET /food/restaurant/restaurants/:id/addons`
→ `{ addons: [ … ] }` — approved add-ons for that restaurant.

### `GET /food/restaurant/restaurants/:id/outlet-timings`
```json
{ "outletTimings": {
  "Monday": { "isOpen": true, "openingTime": "09:00", "closingTime": "22:00" },
  "…", "Sunday": { "isOpen": false, "openingTime": "", "closingTime": "" }
} }
```
Always all seven days, full names. A closed day has empty time strings. Use this to block cart-building when closed — the order API will reject it anyway with *"Restaurant is currently closed"* / *"Restaurant is currently offline"*.

### `GET /food/restaurant/public/foods`
Cross-restaurant dish feed. Query: `limit` (default 500, max 1000), `zoneId`, `categorySlug` / `category`, `promo` / `promoSlug` (`switch99`, `under-250`, `under250`).
```json
{ "foods": [{
    "id": "…", "_id": "…",
    "restaurantId": "…", "restaurantName": "Spice Route",
    "categoryId": "…", "categoryName": "Starters", "category": "Starters",
    "name": "Paneer Tikka", "description": "…",
    "price": 260, "otherPrice": 320,
    "image": "…", "foodType": "Veg", "isAvailable": true,
    "preparationTime": "20", "approvalStatus": "approved"
  }],
  "total": 128 }
```
`total` is the length of the returned page, **not** the collection count — there is no pagination here.

### `GET /food/restaurant/categories/public`
Zone-aware approved category list.

### `GET /food/restaurant/offers` — optional auth
Query: `restaurantId`, `subtotal`. Send the Bearer token when logged in — the response then excludes coupons the user has exhausted and first-order coupons they no longer qualify for.
```json
{
  "allOffers": [{
    "id": "…", "offerId": "…", "couponCode": "SAVE50",
    "title": "20% OFF",                 // or "Flat ₹100 OFF" — prebuilt, just render it
    "discountType": "percentage", "discountValue": 20,
    "maxDiscount": 100, "perUserLimit": 1, "minOrderValue": 199,
    "customerScope": "all", "isFirstOrderOnly": false,
    "restaurantScope": "selected",
    "restaurantId": "…", "restaurantIds": ["…"],
    "restaurantName": "Spice Route",     // or "All Restaurants" / "Selected Restaurants"
    "restaurantSlug": "…", "restaurantImage": "…",
    "deliveryTime": "30", "restaurantRating": 4.3,
    "endDate": "…", "showInCart": true
  }],
  "groupedByOffer": {}
}
```
`groupedByOffer` is always empty — dead field, ignore it.

### `GET /food/search/unified`
Query: `q`, `lat`, `lng`, `radiusKm` (default 20), `categoryId`, `minRating`, `maxDeliveryTime`, `isVeg`, `zoneId`, `strictZone`, `page` (1), `limit` (20).

```json
{
  "restaurants": [ /* restaurant docs + match metadata */ ],
  "total": 17,
  "page": 1,
  "limit": 20,
  "zoneFiltered": true
}
```
Restaurants matched via a dish carry:
```json
{ "matchType": "food", "matchedDish": "Paneer Tikka", "matchedDishImage": "…", "matchedDishId": "…" }
```
Use those to render the "matched on dish" subtitle. Results are restaurant-shaped even when the query hit a dish — there's no separate dish array. With lat/lng, results are re-sorted by distance and gain `distanceScore`. Unless `strictZone` is true, a zone with no results falls back to a wider search.

### `GET /food/search/categories/admin?zoneId=`
→ `{ categories: [ … ] }` — admin-curated only, excludes restaurant-created categories. Cached 30 min.

---

## 6. Profile, addresses, cart, wallet, referrals — `/food/user` (Bearer)

### `GET /food/user/profile` → `{ user }` (the user document from §1)

### `PATCH /food/user/profile`
```json
{
  "name": "…",                      // ≤200
  "email": "…",                     // valid email, ≤200
  "phone": "…",                     // ≤30
  "profileImage": "…",              // ≤2000
  "dateOfBirth": "1998-04-21",      // strictly YYYY-MM-DD
  "anniversary": "2022-11-30",
  "gender": "male"                  // male | female | other | prefer-not-to-say
}
```
All optional. → `{ user }`

### `POST /food/user/profile/profile-image` — multipart, field `file`
→ `{ profileImage: "<url>", user }`

### `DELETE /food/user/profile` → `{ success: true }`

### Addresses

**The address DTO here is not the order address shape.** Saved addresses take flat `latitude` / `longitude` numbers; the order payload takes a GeoJSON `location`. The server converts.

`POST /food/user/addresses`:
```json
{
  "label": "Home",                  // Home | Office | Other (default Home)
  "street": "required, ≤200",
  "additionalDetails": "≤500",
  "city": "required, ≤100",
  "state": "required, ≤100",
  "zipCode": "≤20",
  "phone": "≤20",
  "latitude": 21.1458,              // required, -90..90
  "longitude": 79.0882              // required, |v| ≤ 180
}
```
→ 201, `{ address }` — normalized, carrying **all** coordinate representations at once:
```json
{
  "_id": "…", "label": "Home", "street": "…", "additionalDetails": "…",
  "city": "…", "state": "…", "zipCode": "…", "phone": "…",
  "isDefault": false,
  "latitude": 21.1458, "longitude": 79.0882,
  "lat": 21.1458, "lng": 79.0882,
  "location": { "type": "Point", "coordinates": [79.0882, 21.1458] },
  "createdAt": "…", "updatedAt": "…"
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/food/user/addresses` | — | `{ addresses: [...] }` |
| POST | `/food/user/addresses` | above | 201 `{ address }` |
| PATCH | `/food/user/addresses/:addressId` | partial (≥1 field, else 400 *"No fields to update"*) | `{ address }` |
| DELETE | `/food/user/addresses/:addressId` | — | `{ success: true }` |
| PATCH | `/food/user/addresses/:addressId/default` | — | `{ address }` |

Legacy label `"Work"` is coerced to `"Office"`; anything unrecognized becomes `"Other"`.

### `PUT /food/user/cart`
```json
{ "items": [ { "itemId": "…", "name": "…", "price": 260, "quantity": 2, "restaurantId": "…", "restaurant": "…" } ],
  "pricing": { … },
  "restaurantId": "…", "restaurantName": "…" }
```
`restaurantId` / `restaurantName` are backfilled per item from the first item or the top-level field, so you can send either.
→ `{ "synced": true, "itemCount": 3 }`

Server-side cart is for cross-device continuity only — checkout reads the cart you send it, not this.

### Wallet

`GET /food/user/wallet` → `{ wallet: … }`:
```json
{
  "balance": 250,
  "referralEarnings": 100,
  "transactions": [{
    "id": "…", "_id": "…",
    "type": "addition",
    "amount": 100, "status": "Completed",
    "description": "Referral reward",
    "date": "…", "createdAt": "…",
    "metadata": { "source": "referral_reward" }
  }]
}
```
Newest first. A user with no wallet row gets `{ balance: 0, referralEarnings: 0, transactions: [] }` — not a 404.

`POST /food/user/wallet/topup/order` — `{ "amount": 500 }` (> 0):
```json
{ "razorpay": { "key": "rzp_live_…", "orderId": "order_…", "amount": 50000, "currency": "INR" } }
```
`amount` is **paise**. Without Razorpay configured, a dev order is returned and top-up verification auto-succeeds.

`POST /food/user/wallet/topup/verify`:
```json
{ "razorpayOrderId": "…", "razorpayPaymentId": "…", "razorpaySignature": "…", "amount": 500 }
```
All four required. Idempotent — re-verifying a completed top-up returns the wallet unchanged instead of double-crediting. → `{ wallet }`

(camelCase here. The delivery app's cash-deposit verify uses snake_case — different endpoint, different convention.)

### Cashback history

`GET /food/user/cashback?page=1&limit=20`
```json
{ "totalEarned": 130,
  "items": [ { "id","amount","description","orderId","orderDisplayId","status","date","createdAt" } ],
  "pagination": { "page":1,"limit":20,"total":3,"totalPages":1 } }
```
Cashback is awarded automatically when an order is **delivered** (not at checkout) and credited to the wallet. The user also gets an FCM push with `data.type: "cashback_credited"` — refresh the wallet and this list on receipt.

Pre-order copy (no auth): `GET /food/admin/cashback-settings/public` → `{ cashbackSettings: { isEnabled, cashbackType, cashbackValue, minOrderValue, maxCashback, firstOrderOnly, perUserLimit } }`. Hide the banner when `isEnabled` is false. Never hardcode these.

### Refund history

`GET /food/user/refunds?page=1&limit=20`
```json
{ "totalRefunded": 546,
  "refunds": [
    { "orderId":"6a64...", "orderDisplayId":"FOD-123", "restaurantName":"Suvio",
      "amount":546, "status":"processed",            // pending | processed | failed
      "method":"razorpay", "refundId":"rfnd_...", "reason":"...",
      "creditedToWallet": true,                       // false = back to card
      "processedAt":"...", "orderStatus":"cancelled_by_restaurant",
      "createdAt":"...", "updatedAt":"..." } ],
  "pagination": { ... } }
```
**`creditedToWallet` drives the copy.** `true` → "Added to your wallet"; `false` → "Refunded to your {method}, 5–7 working days". Saying "added to wallet" for a card refund is the top support-ticket cause — the balance genuinely won't move.

`totalRefunded` counts **processed only**, so the list total can exceed it while a refund is pending. That's correct.

There is **no** endpoint to request a refund — the backend creates them on cancellation. The app only displays them.

### Referrals

`GET /food/user/referrals/stats` → `{ stats: { referralCode, referralLink, referralCount, totalReferralEarnings, rewardAmount, referralLimit } }`

`referralLink` is built server-side from an admin-configured template and may be `""` — when empty, share `referralCode` alone. Never hardcode the invite URL. The code is passed as `ref` in the OTP-verify body on signup.

`GET /food/user/referrals/details`:
```json
{
  "stats": {
    "referralCount": 5, "totalReferralEarnings": 500, "rewardAmount": 100,
    "totalInvited": 7, "creditedCount": 5, "pendingCount": 1, "rejectedCount": 1
  },
  "invitedFriends": [{
    "id": "…", "refereeId": "…",
    "name": "Friend",                 // falls back to "Friend" when unset
    "phone": "98****3210",            // masked
    "profileImage": "",
    "status": "credited",             // credited | pending | rejected
    "reason": "limit_reached",        // reward_disabled | limit_disabled | limit_reached
    "rewardAmount": 100,
    "earnedAmount": 100,              // 0 unless status is credited
    "invitedAt": "…"
  }]
}
```
Share link uses the user's `referralCode` (equal to their `_id` on older accounts) as the `ref` param at OTP verify.

### Support & safety

`POST /food/user/support/ticket`:
```json
{
  "type": "order",              // order | restaurant | other — required
  "issueType": "required",
  "description": "…",
  "orderId": "<ObjectId>",      // required when type = order
  "restaurantId": "<ObjectId>"  // required when type = restaurant
}
```
For `type: "order"` the server also links the restaurant automatically. → 201, `{ ticket }`

`GET /food/user/support/my-tickets` — query `page`, `limit` (default 20, max 50).

`POST /food/user/safety-emergency-reports` — `{ "message": "10–4000 chars" }` → the created report.
`GET /food/user/safety-emergency-reports` — the user's own reports.

---

## 7. Orders — `/food/orders` (Bearer)

### `POST /food/orders/calculate`

Always call before showing the bill. Never compute totals client-side.

```json
{
  "items": [{
    "itemId": "…", "name": "Paneer Tikka",
    "variantId": "…", "variantName": "Full", "variantPrice": 260,
    "price": 260, "otherPrice": 320,
    "quantity": 2, "isVeg": true, "image": "…", "notes": "less spicy"
  }],
  "restaurantId": "…",
  "deliveryAddressId": "…",
  "zoneId": "…",
  "couponCode": "SAVE50",
  "deliveryMode": "basic",                                    // basic | quick
  "deliveryFleet": "…",
  "deliveryAddress": { "location": { "coordinates": [lng, lat] } },
  "scheduledAt": "2026-07-24T18:30:00.000Z"                   // full ISO-8601 datetime
}
```

→
```json
{
  "items": [ /* server-resolved items — authoritative names and prices */ ],
  "priceChanges": [
    { "itemId": "…", "name": "Paneer Tikka", "previousPrice": 240, "price": 260 }
  ],
  "pricing": {
    "subtotal": 520,
    "tax": 24,
    "packagingFee": 10,
    "deliveryFee": 35,
    "deliveryFeeGst": 6,
    "platformFee": 5,
    "quickDeliveryFee": 0,
    "deliveryMode": "basic",
    "discount": 50,
    "couponCode": "SAVE50",
    "appliedCoupon": { "code": "SAVE50", "discount": 50 },
    "total": 550,
    "currency": "INR",
    "distanceKm": 3.9,
    "roadDistanceKm": 3.9,
    "straightLineDistanceKm": 3.1,
    "deliveryFeeBreakdown": {
      "source": "distance", "distanceKm": 3.9, "deliveryFee": 35,
      "message": "Distance: 3.9 km"
    }
  }
}
```

**`priceChanges` is non-empty when the menu changed under the user.** Show a "prices updated" confirmation before letting them place the order — it's the whole reason the field exists.

Coupon behaviour: `couponCode` is echoed back even when rejected, but `appliedCoupon` is `null` and `discount` is 0. Check `appliedCoupon`, not `couponCode`. A coupon can fail on status, dates, restaurant scope, min order value, global usage limit, per-user limit, or first-order-only.

Maths, so your UI can explain the bill:
- discount is clamped to ≤ subtotal, floored to whole rupees, and percentage discounts respect `maxDiscount`
- GST is charged on `subtotal − discount`
- `total = subtotal + packagingFee + deliveryFee + deliveryFeeGst + platformFee + tax − discount`
- quick mode adds a surcharge to **both** `platformFee` and `total`, and reports it separately as `quickDeliveryFee`

### `POST /food/orders`
```json
{
  "items": [ /* same item shape */ ],
  "address": {
    "label": "Home", "name": "Om", "fullName": "Om Parteki",
    "street": "required", "additionalDetails": "Flat 302",
    "city": "required", "state": "required",
    "zipCode": "440001", "phone": "9876543210",
    "location": { "type": "Point", "coordinates": [lng, lat] }
  },
  "restaurantId": "…",
  "restaurantName": "…",
  "customerName": "…",
  "customerPhone": "…",
  "pricing": { /* echo back what /calculate returned */ },
  "paymentMethod": "razorpay",       // razorpay | razorpay_qr | card | wallet
  "deliveryMode": "basic",
  "deliveryFleet": "…",
  "note": "kitchen note",
  "deliveryInstructions": "Ring the bell",
  "sendCutlery": false,
  "zoneId": "…",
  "scheduledAt": "…"
}
```

**Cash on delivery is rejected** — the enum error reads *"Cash on Delivery is no longer available. Please pay online."* `razorpay_qr` is the pay-at-door flow where the rider generates a Razorpay QR.

→ 201:
```json
{
  "order": { /* full order, see below */ },
  "razorpay": { "key": "rzp_live_…", "orderId": "order_…", "amount": 55000, "currency": "INR" }
}
```
`razorpay` is `null` for non-`razorpay` methods or when the gateway isn't configured. Online orders under ₹1 total are rejected (*"Amount too low for online payment"*).

An online order starts at `orderStatus: "pending_payment"` and the **restaurant is not notified until payment is verified**. Unpaid orders are swept away by an expiry job and never appear in `GET /food/orders`.

### `POST /food/orders/verify-payment`
```json
{ "orderId": "…", "razorpayOrderId": "…", "razorpayPaymentId": "…", "razorpaySignature": "…" }
```
All four required. Idempotent — an already-paid order returns success without reprocessing. `razorpayOrderId` must match the one stored on the order or you get *"Payment verification failed"*.

→ `{ order, payment }`

The Razorpay webhook (`POST /api/v1/payments/webhook`, server-to-server) is the real source of truth. If the client verify fails but the webhook lands, the order still succeeds — poll `GET /food/orders/:orderId` rather than showing a hard failure.

### The order object

Returned by every order endpoint, normalized for clients:
```json
{
  "_id": "…", "orderMongoId": "…",
  "order_id": "FOD-1234567890", "orderId": "FOD-1234567890",
  "userId": "…",
  "restaurantId": {
    "_id": "…", "restaurantName": "…", "profileImage": "…",
    "area": "…", "city": "…", "location": { … }, "rating": 4.3, "totalRatings": 88
  },
  "zoneId": "…", "transactionId": "…",
  "items": [ /* order items */ ],
  "deliveryAddress": { /* address snapshot */ },
  "customerName": "…", "customerPhone": "…",
  "pricing": {
    "subtotal": 520, "tax": 24, "packagingFee": 10,
    "deliveryFee": 35, "deliveryFeeGst": 6, "platformFee": 5, "quickDeliveryFee": 0,
    "deliveryMode": "basic", "restaurantCommission": 78,
    "discount": 50, "couponCode": "SAVE50",
    "total": 550, "currency": "INR",
    "distanceKm": 3.1, "roadDistanceKm": 3.9, "roadDurationMins": 14
  },
  "payment": {
    "method": "razorpay",
    "status": "paid",
    "amountDue": 550,
    "razorpay": { "orderId": "…", "paymentId": "…", "signature": "…" },
    "qr": { "qrId": "…", "imageUrl": "…", "paymentLinkId": "…", "shortUrl": "…", "status": "…", "expiresAt": "…" },
    "refund": { "status": "none", "amount": 0, "refundId": "", "processedAt": null }
  },
  "orderStatus": "preparing",
  "status": "preparing",
  "dispatch": {
    "status": "assigned",
    "deliveryPartnerId": { "_id": "…", "name": "…", "phone": "…", "rating": 4.8, "totalRatings": 300 },
    "assignedAt": "…", "acceptedAt": "…",
    "offeredTo": [ … ], "dispatchingAt": "…"
  },
  "deliveryPartnerId": "…",
  "deliveryState": {
    "currentPhase": "en_route_to_pickup",
    "reachedPickupAt": null, "pickedUpAt": null, "reachedDropAt": null, "deliveredAt": null,
    "currentLocation": { "lat": 21.14, "lng": 79.08 }
  },
  "deliveryVerification": { "dropOtp": { "required": true, "verified": false } },
  "statusHistory": [ { "at": "…", "byRole": "RESTAURANT", "from": "confirmed", "to": "preparing", "note": "" } ],
  "ratings": { "restaurant": { "rating": 5, "comment": "…", "ratedAt": "…" }, "deliveryPartner": { … } },
  "rating": 5,
  "note": "kitchen note", "deliveryInstructions": "Ring the bell",
  "sendCutlery": false, "deliveryFleet": "standard", "scheduledAt": null,
  "acceptanceWindowSeconds": 240, "acceptanceDeadlineAt": "…",
  "cancellationReason": "", "cancelledBy": "", "cancelledAt": null,
  "deliveredAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

`deliveryState.currentLocation` is derived from the rider's last GPS ping — `{lat, lng}` here, even though the raw field is GeoJSON. Use it as the map marker seed before the socket connects.

`cancelledBy` is resolved server-side to `"customer"` / `"restaurant"` / `"admin"`; `deliveryOtp` is never in the response.

**Status values** — `pending_payment`, `created`, `confirmed`, `preparing`, `ready_for_pickup`, `reached_pickup`, `picked_up`, `reached_drop`, `delivered`, `cancelled_by_user`, `cancelled_by_restaurant`, `cancelled_by_admin`.

**Phases** — `en_route_to_pickup` → `at_pickup` → `en_route_to_delivery` → `at_drop` → `delivered` → `completed`.

### Remaining order endpoints

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/food/orders` | `page`, `limit` (20, max 100) | `{ data: [orders], meta: {...} }` |
| GET | `/food/orders/:orderId` | — | `{ order }` |
| GET | `/food/orders/:orderId/payments` | — | payment ledger rows |
| GET | `/food/orders/:orderId/drop-otp` | — | `{ otp: "1234" }` |
| DELETE | `/food/orders/:orderId/pending-payment` | — | `{ deleted: true, orderId }` |
| PATCH | `/food/orders/:orderId/cancel` | `{ "reason": "…" }` optional | `{ order }` |
| PATCH | `/food/orders/:orderId/instructions` | `{ "instructions": "…" }` | `{ order }` |
| PATCH | `/food/orders/:orderId/ratings` | below | `{ order }` |

`GET /food/orders` excludes `pending_payment` orders entirely and expires stale ones on read — an abandoned checkout simply vanishes from history.

`DELETE .../pending-payment` only works while the order is in `pending_payment` (else *"Order is not awaiting payment"*). Call it when the user dismisses the Razorpay sheet, so you don't leave ghost orders.

Ratings body:
```json
{
  "restaurantRating": 5,            // required, 1–5
  "deliveryPartnerRating": 4,       // optional, 1–5
  "restaurantComment": "…",         // optional, ≤500
  "deliveryPartnerComment": "…"     // optional, ≤500
}
```
Submitting also updates the restaurant's and rider's aggregate `rating` / `totalRatings`.

---

## 7b. Live order tracking — the full flow

Everything the tracking screen needs, in the order you use it.

### Step 1 — seed the screen from REST

`GET /food/orders/:orderId` gives you the whole current state before any socket connects:

| What you render | Where it comes from |
|---|---|
| Stage stepper | `orderStatus` + `deliveryState.currentPhase` |
| Rider marker | `deliveryState.currentLocation` → `{ lat, lng }` |
| Restaurant marker | `restaurantId.location.coordinates` → `[lng, lat]` |
| Drop marker | `deliveryAddress.location.coordinates` → `[lng, lat]` |
| Rider name / phone / rating | `dispatch.deliveryPartnerId` (populated object) |
| "Call rider" enabled? | `dispatch.status === "accepted"` |
| ETA distance | `pricing.roadDistanceKm`, `pricing.roadDurationMins` |
| Timeline / audit trail | `statusHistory[]` — each `{ at, byRole, from, to, note }` |
| Timestamps per stage | `deliveryState.reachedPickupAt` / `pickedUpAt` / `reachedDropAt` / `deliveredAt` |
| Show the handover OTP? | `deliveryVerification.dropOtp.required && !verified` |
| Cancelled banner | `cancellationReason`, `cancelledBy`, `cancelledAt` |

### Step 2 — the two status axes

`orderStatus` is the **order's** lifecycle. `deliveryState.currentPhase` is the **rider's**. They advance together but answer different questions — drive your stepper off `orderStatus` and your map copy ("heading to restaurant" vs "heading to you") off `currentPhase`.

```
orderStatus:  pending_payment → created → confirmed → preparing → ready_for_pickup
              → reached_pickup → picked_up → reached_drop → delivered
              (or cancelled_by_user | cancelled_by_restaurant | cancelled_by_admin)

currentPhase: en_route_to_pickup → at_pickup → en_route_to_delivery → at_drop
              → delivered → completed
```

`dispatch.status` is a third, independent axis — `unassigned` → `assigned` → `accepted` (or `rejected` / `cancelled`). An order can be `preparing` with `dispatch.status: "unassigned"`: food is cooking, no rider yet. Show "finding a delivery partner" off `dispatch.status`, not off `orderStatus`.

### Step 3 — subscribe to live updates

```dart
final socket = IO.io(host, IO.OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({'token': accessToken})
    .build());

socket.onConnect((_) => socket.emit('join-tracking', orderId));
socket.on('tracking-room-joined', (d) { /* ack: { room, orderId } */ });

socket.on('location-update',      (d) => moveRiderMarker(d));   // rider GPS ping
socket.on('order_status_update',  (d) => refetchOrder());       // status changed
socket.on('order_ready',          (d) => refetchOrder());       // ready for pickup
socket.on('delivery_drop_otp',    (d) => showOtp(d['otp']));    // handover OTP

// on dispose:
socket.emit('leave-tracking', orderId);
```

You are auto-joined to `user:<userId>` at connect, so user-targeted events arrive without any join. `join-tracking` is what puts you in `tracking:<orderId>` to receive `location-update` for that specific order.

On `order_status_update` / `order_ready`, refetch the order rather than patching state from the payload — the REST object is the complete, normalized one.

### Step 3b — live ETA

Every order read includes a freshly computed ETA:

```json
"eta": { "minutes": 13, "distanceKm": 4.51,
         "source": "live",        // live | estimate | completed | unavailable
         "target": "customer" }   // customer | restaurant | null
```

| `target` | meaning |
|---|---|
| `restaurant` | rider is still going to collect the food |
| `customer` | rider has the food and is coming to you |

| `source` | meaning |
|---|---|
| `live` | computed from the rider's actual position — recomputed on every read |
| `estimate` | no rider GPS yet; the order-time estimate |
| `completed` | delivered/cancelled, `minutes` is `null` |
| `unavailable` | show "Calculating…", **not** "0 min" |

Distance-based (road factor 1.3, ~22 km/h city average), **not** a Directions call — free to poll. Refresh on each `location-update`, or re-render every ~30s.

### Step 4 — the handover OTP

The customer reads a 4-digit OTP to the rider at the door. Two ways to get it:

- `GET /food/orders/:orderId/drop-otp` → `{ "otp": "1234" }` — pull it when the user opens the tracking screen
- socket `delivery_drop_otp` → `{ orderMongoId, orderId, otp, message }` — pushed automatically when the rider reaches the drop

Show it only while `deliveryVerification.dropOtp.required && !verified`. The rider never sees it in their API responses — they type in what the customer says.

### Step 5 — cancelling

`PATCH /food/orders/:orderId/cancel` with an optional `{ "reason": "…" }`. The resulting order carries `cancelledBy: "customer"` and the reason back in `cancellationReason`.

### Fallback — polling

Sockets are an optimization, not the contract. If the socket is down, poll `GET /food/orders/:orderId` every ~10 s while the tracking screen is open. Every field above comes back over REST; only the rider marker updates less smoothly. Ship the polling version first, then layer the socket on top.

### What is *not* available

There is no route/polyline endpoint and no server-computed live ETA. You get the rider's current point, the two endpoints, and `roadDistanceKm` / `roadDurationMins` captured at order time. Draw the path client-side if you want one.

---

## 7c. Chat — `/food/chat` (Bearer)

Customer ↔ delivery partner (order-scoped) and customer ↔ admin support.

| Method | Path | Body / query |
|---|---|---|
| POST | `/food/chat/messages` | `{ "orderId": "<orderMongoId>", "text": "..." }` |
| GET | `/food/chat/conversations` | — |
| GET | `/food/chat/messages` | `?conversationId=&page=&limit=` |
| PATCH | `/food/chat/conversations/:conversationId/read` | — |

**Send** takes only `orderId` + `text`. The recipient is resolved **server-side** from the order (customer → assigned rider, and vice versa) — a client-supplied `peerId` is not trusted. For admin support send `{ "peerRole": "ADMIN", "text": "..." }` with no `orderId`.

```json
// message
{ "id","conversationId","orderId","senderRole","senderId",
  "recipientRole","recipientId","text","readAt","createdAt" }

// conversation
{ "conversationId","orderId","peerToken","lastMessage","lastAt","unread" }
```

`peerToken` is a single string `"ROLE:id"` (e.g. `"DELIVERY_PARTNER:64f..."`) — split on `:`. `"ADMIN"` has no id.

**`conversationId` for a customer↔rider thread is exactly `order._id.toString()`** — look a thread up by the order id you already hold.

History returns **oldest → newest** (render top-down) and auto-marks incoming messages read.

**Realtime** (same socket as tracking, don't open a second):
```dart
socket.on('chat:message', (msg) { ... });          // same shape as the POST response
socket.emit('chat:typing', { 'toRole':'DELIVERY_PARTNER', 'toId': riderId,
                             'conversationId': convId, 'typing': true });
socket.on('chat:typing', (d) { ... });             // {conversationId, fromRole, fromId, typing}
```
Offline delivery via FCM: `data.type: "chat_message"`, `data.conversationId`.

Errors: `"orderId is required to chat outside of admin support"`, `"You are not a participant of this order"`, `"No delivery partner is assigned to this order yet"`.

---

## 8. Payments — `/food/payments` (Bearer)

| Method | Path |
|---|---|
| GET | `/food/payments/orders/:orderId/payments` |
| GET | `/food/payments/orders/:orderId/transactions` |
| GET | `/food/payments/orders/:orderId/refunds` |
| GET | `/food/payments/wallet/balance` |
| GET | `/food/payments/wallet/transactions` |

Webhook (never called by the app): `POST /payments/webhook`.

Refund state lives on `order.payment.refund` — `status` is `none` | `pending` | `processed` | `failed`.

---

## 9. Notifications

### In-app inbox — `/food/notifications` (Bearer)

`GET /food/notifications/inbox` — query `page`, `limit`:
```json
{
  "items": [ { "_id": "…", "title": "…", "message": "…", "link": "…", "category": "broadcast", "isRead": false, "createdAt": "…" } ],
  "pagination": { "page": 1, "limit": 20, "total": 34, "totalPages": 2 },
  "unreadCount": 5
}
```

| Method | Path |
|---|---|
| PATCH | `/food/notifications/:id/read` |
| DELETE | `/food/notifications/:id` |
| DELETE | `/food/notifications/inbox/all` |

### Push tokens — `/fcm-tokens` (Bearer)

| Method | Path | Notes |
|---|---|---|
| POST | `/fcm-tokens/mobile/save` | **use this from Flutter** |
| POST | `/fcm-tokens/save` | web variant |
| DELETE | `/fcm-tokens/remove` | token in body |
| DELETE | `/fcm-tokens/remove/:token` | |
| POST | `/fcm-tokens/test` | send yourself a test push |

Or pass `fcmToken` + `platform: "mobile"` in the OTP verify body and skip a round trip. Still re-save on token refresh.

**Push payloads carry a `data.type`** you should route on: `order_created`, `order_created_pending_payment`, `payment_success`. They also include `orderId`, `orderMongoId`, and a `link` like `/food/user/orders/<id>` — use it for deep links.

Flutter side: `firebase_messaging`, same Firebase project as the backend service account.

---

## 10. Realtime — Socket.IO

Connect to the socket server (`Backend/socket-server.js`), not the REST path.

**Handshake auth** — access token via `auth.token`, the `Authorization` header, or `?token=`:
```dart
IO.io(host, IO.OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'token': accessToken})
  .build());
```
Failure reasons: `AUTH_MISSING`, `AUTH_INVALID`.

On connect the server auto-joins `user:<userId>`. For live tracking, join explicitly:
```dart
socket.emit('join-tracking', orderId);   // ack: 'tracking-room-joined'
socket.emit('leave-tracking', orderId);  // on leaving the screen
```

**Listen:**
| Event | Meaning |
|---|---|
| `order_status_update` | order moved to a new status |
| `order_ready` | restaurant marked ready for pickup |
| `location-update` | rider GPS ping — move the marker |
| `delivery_drop_otp` | `{ orderMongoId, orderId, otp, message }` — the handover OTP, pushed to the user |
| `tracking-room-joined` | join ack |

`new_order`, `new_order_available`, `order_claimed`, `order_deassigned`, `admin_notification` are restaurant/rider/admin events — ignore them.

Sockets are an optimization. The tracking screen must still work by polling `GET /food/orders/:orderId`.

---

## 11. Uploads

`POST /uploads/...` — multipart. Most user-facing uploads go through the dedicated route instead: `POST /food/user/profile/profile-image`, field name `file`.

---

## Client implementation notes

1. **One Dio instance + interceptor.** Base URL from env, attach the Bearer token, on 401 try `refresh-token` once, then force logout.
2. **Unwrap the envelope in the interceptor** so models parse `data` directly and never see `success`/`message`.
3. **GeoJSON is `[lng, lat]`** in every stored/returned payload. Saved-address *input* is flat `latitude`/`longitude` numbers. The single most likely bug.
4. **Pricing is server-owned.** `/calculate` → display → echo the same `pricing` object into `POST /orders`. Handle `priceChanges` before submitting.
5. **Check `appliedCoupon`, not `couponCode`,** to know whether a discount actually landed.
6. **Payment truth is the webhook.** Client verify is best-effort; poll the order on ambiguity. Call `DELETE .../pending-payment` when the user backs out.
7. **Zone first.** Location permission → `/food/zones/detect` → check `data.status` → home screen.
8. **Restaurant list items come in two shapes** (geo vs non-geo). Model `profileImage` as string-or-`{url}` and fall back to `restaurantName` for `name`.
9. `scheduledAt` must be a full ISO-8601 datetime with timezone, not a date.
10. Three different pagination envelopes exist across the API. Parse per-endpoint.

## Build order

auth/OTP → zone + landing → restaurant list/detail/menu → cart → `/calculate` → checkout + Razorpay → order tracking (REST first, sockets after) → profile/addresses/orders history → wallet/referrals → notifications + FCM.
