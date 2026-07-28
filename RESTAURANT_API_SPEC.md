# Restaurant Partner App — API Spec

Verified against `Backend/src/modules/food/restaurant/` and `Backend/src/modules/food/orders/`.

## Global

- **Base URL:** `{HOST}/api/v1`
- **Prefix for everything here:** `/food/restaurant`
- **Auth:** `Authorization: Bearer <accessToken>`, role must be `RESTAURANT`
- **Envelope:** `{ "success": true, "message": "…", "data": … }` / errors `{ "success": false, "message": "…" }`
- **Static files:** `{HOST}/uploads/...`
- **Caching:** the public read endpoints (`/restaurants`, `/restaurants/:id`, menu, timings, addons, categories) are server-cached 5–10 min. Writes from the dashboard invalidate them automatically — but a partner's own edit may take a beat to appear on the public route.

---

## 1. Auth

### `POST /food/auth/restaurant/request-otp`
`{ "phone": "9876543210" }`

### `POST /food/auth/restaurant/verify-otp`
```json
{ "phone": "9876543210", "otp": "1234", "fcmToken": "…", "platform": "mobile" }
```
→ `{ accessToken, refreshToken, user }`

`POST /food/auth/refresh-token`, `POST /food/auth/logout`, `GET /food/auth/me` behave as in the user app.

---

## 2. Onboarding (no auth)

### `POST /food/restaurant/register` — `multipart/form-data`

File fields: `profileImage` (1), `panImage` (1), `gstImage` (1), `fssaiImage` (1), `menuImages` (up to 10), **`coverImage` (1)**, **`galleryImages` (up to 10)**.

Text fields — note several are **comma-joined strings**, not arrays, because this is FormData:
```json
{
  "restaurantName": "required",
  "ownerName": "required",
  "ownerEmail": "optional email",
  "ownerPhone": "9876543210",           // ^[6-9]\d{9}$
  "primaryContactNumber": "9876543210",
  "pureVegRestaurant": "true",          // required; accepts true/false/1/0/yes/no
  "addressLine1": "", "addressLine2": "",
  "area": "", "city": "", "state": "", "pincode": "", "landmark": "",
  "formattedAddress": "", "latitude": "21.1458", "longitude": "79.0882",
  "zoneId": "",
  "cuisines": "North Indian,Chinese",   // comma-separated → array
  "openDays": "Monday,Tuesday",         // comma-separated → array
  "openingTime": "09:00", "closingTime": "22:00",
  "estimatedDeliveryTime": "30",
  "panNumber": "ABCDE1234F", "nameOnPan": "",
  "gstRegistered": "true",
  "gstNumber": "", "gstLegalName": "", "gstAddress": "",
  "fssaiNumber": "", "fssaiExpiry": "",
  "accountNumber": "", "ifscCode": "", "accountHolderName": "", "accountType": "",
  "subscriptionPlan": "", "subscriptionAmount": "0",
  "subscriptionPaidAmount": "0", "subscriptionDueAmount": "0",
  "onboardingFeeAmount": "0", "onboardingFeePaid": "false",
  "paymentType": "",
  "razorpayOrderId": "", "razorpayPaymentId": "", "razorpaySignature": ""
}
```
Latitude/longitude are **strings** here (FormData), unlike everywhere else in the API.

→ 201, `data` = the created restaurant.

### `POST /food/restaurant/onboarding-fee/order`
`{ "ownerPhone": "9876543210" }` → Razorpay order for the joining fee.

### `POST /food/restaurant/unregistered`
Lead capture for restaurants not on the platform: `{ ownerName, restaurantName, mobileNumber, emailId, location }`.

### `POST /food/restaurant/upload-attachment` — multipart, field `file`
Body also takes `folder`. → `data` = upload result (URL). Use this to pre-upload images, then pass the URLs as text fields in register.

---

## 3. Restaurant profile (Bearer)

### `GET /food/restaurant/current`
→ `data: { restaurant }`:
```json
{
  "_id": "…",
  "restaurantName": "…", "ownerName": "…", "ownerEmail": "…", "ownerPhone": "…",
  "primaryContactNumber": "…", "pureVegRestaurant": true,
  "area": "…", "city": "…", "state": "…", "pincode": "…", "landmark": "…",
  "cuisines": ["North Indian"],
  "openingTime": "09:00", "closingTime": "22:00",
  "openDays": ["Monday", "…"],
  "isAcceptingOrders": true,
  "outsideHoursOverride": false,
  "panNumber": "…", "nameOnPan": "…",
  "gstRegistered": true, "gstNumber": "…", "gstLegalName": "…", "gstAddress": "…",
  "fssaiNumber": "…", "fssaiExpiry": "…",
  "accountNumber": "…", "ifscCode": "…", "accountHolderName": "…", "accountType": "…",
  "upiId": "…", "upiQrImage": "…",
  "profileImage": "…", "coverImages": [], "menuImages": [],
  "panImage": "…", "gstImage": "…", "fssaiImage": "…",
  "location": { "type": "Point", "coordinates": [lng, lat] },
  "pendingLocation": { … }, "pendingZoneId": "…",
  "locationUpdateStatus": "…", "locationUpdateRequestedAt": "…",
  "locationUpdateReviewedAt": "…", "locationRejectionReason": "",
  "zoneId": "…", "businessModel": "…",
  "estimatedDeliveryTime": "30", "estimatedDeliveryTimeMinutes": 30,
  "featuredDish": "…", "featuredPrice": 260, "offer": "…",
  "rating": 4.3, "totalRatings": 88,
  "diningSettings": { "isEnabled": false, "maxGuests": 6, "diningType": "family-dining" },
  "status": "approved",              // pending | approved | rejected (gates the whole app)
  "approvedAt": "…", "rejectedAt": null, "rejectionReason": "",
  "onboardingFeePaid": true, "onboardingFeeAmount": 999, "onboardingFeePaidAt": "…",
  "subscriptionPlan": "…", "subscriptionAmount": 0, "subscriptionPaidAmount": 0,
  "subscriptionAutoDeductedAmount": 0, "subscriptionDueAmount": 0,
  "subscriptionStatus": "…", "subscriptionValidTill": "…",
  "createdAt": "…", "updatedAt": "…"
}
```

**Location changes are admin-moderated** — a location edit lands in `pendingLocation` / `pendingZoneId` with `locationUpdateStatus`, not on `location` directly. Show the pending state in the UI.

| Method | Path | Body | Response |
|---|---|---|---|
| PATCH | `/food/restaurant/profile` | partial restaurant fields | `{ restaurant }` |
| PATCH | `/food/restaurant/availability` | `{ "isAcceptingOrders": true }` | `{ restaurant }` |
| PATCH | `/food/restaurant/dining-settings` | `{ "isEnabled": true, "maxGuests": 6, "diningType": "family-dining" }` | `{ restaurant }` |
| DELETE | *(none — deletion is `deleteCurrentRestaurantAccount`, not routed publicly)* | | |

`maxGuests` is clamped to ≥ 1 (default 6); `isEnabled` accepts booleans or `"true"/"1"/"yes"` strings.

### Image uploads (all Bearer, all multipart)

| Method | Path | Field | Max |
|---|---|---|---|
| POST | `/food/restaurant/profile/profile-image` | `file` | 1 |
| POST | `/food/restaurant/profile/menu-image` | `file` | 1 |
| POST | `/food/restaurant/profile/cover-images` | `files` | 20 |
| POST | `/food/restaurant/profile/menu-images` | `files` | 20 |

→ `data` = upload result with the stored URL(s).

---

## 3b. Page banners, cover image & premises gallery

### Public-page banners (the carousel on `/restaurants/:id`)

| Method | Path | Body |
|---|---|---|
| GET | `/food/restaurant/banners` | → `{ banners: [url], primaryBanner, maxBanners: 10 }` |
| POST | `/food/restaurant/banners` | multipart, field `files` (≤10) → `{ banners, primaryBanner, uploaded, skipped }` |
| DELETE | `/food/restaurant/banners` | `{ "bannerUrl": "<exact url from the API>" }` |
| PATCH | `/food/restaurant/banners/order` | `{ "banners": [ ...full list in order... ] }` |

**Index 0 is the header image.** Reorder must be a **permutation of the current set** — send every banner exactly once, or it's rejected (this stops a stale client silently dropping a banner it never loaded).

Send the **raw relative path** the API returned on delete/reorder, not the absolute URL you built for display, or you'll get *"Banner not found on this restaurant"*.

⚠️ Do **not** use the older `POST /food/restaurant/profile/cover-images` for this — it resets the restaurant to `status: "pending"` and forces admin re-approval. `/banners` never touches status.

### Main cover image + premises gallery

| Method | Path | Body |
|---|---|---|
| GET | `/food/restaurant/media` | → `{ coverImage, galleryImages, maxGalleryImages: 10 }` |
| POST | `/food/restaurant/media/cover-image` | multipart, field `file` → `{ coverImage }` |
| POST | `/food/restaurant/media/gallery` | multipart, field `files` (≤10) → `{ galleryImages, uploaded, skipped }` |
| DELETE | `/food/restaurant/media/gallery` | `{ "imageUrl": "…" }` |

The **gallery is shown to the delivery partner at pickup** so they can identify the premises, and appears on the customer page. Both can also be supplied at onboarding (§2) as `coverImage` and `galleryImages`.

### Admin promo banners shown *inside* this app

`GET /food/restaurant/app-banners` (Bearer RESTAURANT, read-only)
```json
{ "banners": [ { "id","imageUrl","title","ctaLink","sortOrder","isActive" } ],
  "recommendedSize": { "width": 350, "height": 100 },
  "aspectRatio": 3.5 }
```
Admin-managed; the restaurant can't edit these. Size the widget from `aspectRatio`, don't hardcode 350×100. `ctaLink` may be `""` → not tappable. Empty list → render nothing.

---

## 4. Outlet timings

### `GET /food/restaurant/outlet-timings` (own) · `GET /food/restaurant/restaurants/:id/outlet-timings` (public)
```json
{
  "outletTimings": {
    "Monday":    { "isOpen": true,  "openingTime": "09:00", "closingTime": "22:00" },
    "Tuesday":   { "isOpen": true,  "openingTime": "09:00", "closingTime": "22:00" },
    "Wednesday": { … }, "Thursday": { … }, "Friday": { … }, "Saturday": { … },
    "Sunday":    { "isOpen": false, "openingTime": "",      "closingTime": "" }
  }
}
```
Always all seven days, always full names, always present (defaults 09:00–22:00 open if never configured). A closed day returns empty time strings.

### `PUT /food/restaurant/outlet-timings`
```json
{ "outletTimings": { "Monday": { "isOpen": true, "openingTime": "10:00", "closingTime": "23:00" }, … } }
```
Must be an object keyed by day name, not an array. Times are `HH:mm` (24h); anything unparseable falls back to 09:00 / 22:00.

Side effect: saving also syncs the restaurant's top-level `openingTime` / `closingTime` / `openDays` from today's row, and busts the public caches.

---

## 5. Menu — categories, items, add-ons

### Categories

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/food/restaurant/categories` | query `zoneId` (defaults to the restaurant's zone) | `data` = category list |
| POST | `/food/restaurant/categories` | category fields | `{ category }` |
| PATCH | `/food/restaurant/categories/:id` | partial | `{ category }` (404 if missing) |
| DELETE | `/food/restaurant/categories/:id` | — | delete result |
| GET | `/food/restaurant/categories/public` | no auth, zone-aware | approved categories |

Unauthenticated calls to the same handler fall through to the public, approved-only list.

### `GET /food/restaurant/menu` (own) · `GET /food/restaurant/restaurants/:id/menu` (public)
```json
{
  "menu": {
    "sections": [{
      "id": "…", "categoryId": "…", "name": "Starters", "image": "…",
      "sortOrder": 0, "itemCount": 12,
      "subsections": [],
      "items": [{
        "id": "…", "name": "Paneer Tikka", "description": "…",
        "price": 260, "otherPrice": 320,
        "variants":   [{ "name": "Full", "price": 260, "otherPrice": 320 }],
        "variations": [ /* same array, duplicated under a legacy key */ ],
        "image": "…",
        "foodType": "Veg",                 // Veg | Non-Veg
        "isAvailable": true,
        "approvalStatus": "approved",      // pending | approved | rejected
        "rejectionReason": "",
        "requestedAt": "…", "approvedAt": "…", "rejectedAt": null,
        "preparationTime": "20",
        "createdAt": "…", "updatedAt": "…"
      }]
    }],
    "categories": [
      { "id": "…", "categoryId": "…", "name": "Starters", "image": "…", "sortOrder": 0, "itemCount": 12 }
    ]
  }
}
```
Sections sort by `sortOrder` then name; items inside a section sort newest-first. The public route 404s for a non-approved restaurant.

### `PATCH /food/restaurant/menu`
Bulk menu update. → `{ menu }`

### Items

### `POST /food/restaurant/foods`
```json
{
  "name": "required, ≤200 chars",
  "description": "",
  "price": 260,
  "otherPrice": 320,
  "variants": [{ "name": "Full", "price": 260, "otherPrice": 0 }],
  "image": "…",
  "foodType": "Veg",
  "isAvailable": true,
  "isRecommended": false,
  "preparationTime": "20",
  "categoryId": "…"          // or categoryName — resolved server-side
}
```
→ 201, `{ food }` with **`approvalStatus: "pending"`**. New items are invisible to customers until an admin approves; admins get a push at creation. Surface the pending badge or partners will think the item is live.

### `PATCH /food/restaurant/foods/:id`
Partial update of the same fields. → `{ food }`, 404 if not yours.

### Stock-off scheduling
Items carry `stockResumeAt` and `stockOffMode` (`manual` | `specific-time` | `next-business-day` | `custom-date-time`) — an item auto-returns to available at `stockResumeAt`, server-side.

### Bulk menu upload

| Method | Path | Notes |
|---|---|---|
| GET | `/food/restaurant/bulk-upload/template` | returns an **.xlsx file stream**, not JSON — `Content-Disposition: attachment` |
| POST | `/food/restaurant/bulk-upload` | multipart, field `file`, must be .xlsx |

Upload response:
```json
{ "success": 42, "failed": 3, "details": [ /* per-row errors */ ] }
```
Note `data.success` (a count) sits inside the envelope's own `success` (a boolean). Don't confuse them.

### Add-ons

| Method | Path | Body |
|---|---|---|
| GET | `/food/restaurant/addons` | query: `status` (`pending`/`approved`/`rejected`), `search` (≤80), `page`, `limit` (≤100), `includeDeleted` |
| POST | `/food/restaurant/addons` | see below |
| PATCH | `/food/restaurant/addons/:id` | `{ "draft": { …partial… }, "isAvailable": true }` |
| DELETE | `/food/restaurant/addons/:id` | — |

Create body:
```json
{
  "name": "required, ≤200",
  "description": "",              // ≤2000
  "foodType": "veg",              // veg | non-veg (lowercase here — unlike food items' Veg/Non-Veg)
  "price": 40,
  "image": "…",
  "images": ["…"]                 // ≤10; image defaults to images[0]
}
```
Add-ons are also admin-approved. Edits go through `draft` — the live version stays until approval.

Public read: `GET /food/restaurant/restaurants/:id/addons` → `{ addons }`.

---

## 6. Orders (Bearer)

### `GET /food/restaurant/orders`
Query:
- `page`, `limit` (default 20, max 100)
- `startDate` / `from`, `endDate` / `to` — day-inclusive on both ends
- `orderStatus` / `status` — comma-separated list
- `search` / `orderId` — partial match on the display id

Only orders that are actually payable are returned: payment method `cash`/`wallet`, or payment status in `paid`/`authorized`/`captured`/`settled`/`refunded`. Unpaid `pending_payment` orders never reach the restaurant.

→ paginated:
```json
{ "data": [ /* orders, userId populated with name/phone/email/profileImage */ ],
  "meta": { "total": 240, "page": 1, "limit": 20, "totalPages": 12 } }
```

### `GET /food/restaurant/orders/:orderId` → `{ order }`

### `PATCH /food/restaurant/orders/:orderId/status`
```json
{ "orderStatus": "preparing", "note": "optional" }
```
Allowed values: `confirmed`, `preparing`, `ready_for_pickup`, `picked_up`, `delivered`, `cancelled_by_restaurant`. In practice the restaurant drives `confirmed` → `preparing` → `ready_for_pickup`; the rider owns the rest.
→ `{ order }`

### `POST /food/restaurant/orders/:orderId/resend-notification`
Re-pings delivery partners for an order that hasn't been picked up.

### Order object

Same canonical shape as the user app, with `userId` populated. Key fields for the restaurant screen:
```json
{
  "_id": "…", "orderMongoId": "…", "order_id": "FOD-1234567890", "orderId": "FOD-1234567890",
  "userId": { "_id": "…", "name": "…", "phone": "…", "email": "…", "profileImage": "…" },
  "items": [{
    "itemId": "…", "name": "…", "variantId": "…", "variantName": "…", "variantPrice": 260,
    "price": 260, "otherPrice": 320, "quantity": 2, "isVeg": true, "image": "…", "notes": "less spicy"
  }],
  "deliveryAddress": { "label": "Home", "street": "…", "city": "…", "state": "…",
                       "zipCode": "…", "phone": "…", "location": { "type": "Point", "coordinates": [lng, lat] } },
  "customerName": "…", "customerPhone": "…",
  "pricing": {
    "subtotal": 520, "tax": 26, "packagingFee": 10,
    "deliveryFee": 35, "deliveryFeeGst": 6, "platformFee": 5, "quickDeliveryFee": 0,
    "deliveryMode": "basic", "restaurantCommission": 78,
    "discount": 50, "couponCode": "SAVE50",
    "total": 546, "currency": "INR",
    "distanceKm": 3.1, "roadDistanceKm": 3.9, "roadDurationMins": 14
  },
  "payment": {
    "method": "razorpay",            // cash | razorpay | razorpay_qr | wallet
    "status": "paid",                // cod_pending | created | authorized | paid | failed | refunded | pending_qr
    "amountDue": 546,
    "razorpay": { "orderId": "…", "paymentId": "…", "signature": "…" },
    "qr": { "qrId": "…", "imageUrl": "…", "paymentLinkId": "…", "shortUrl": "…", "status": "…", "expiresAt": "…" },
    "refund": { "status": "none", "amount": 0, "refundId": "", "processedAt": null }
  },
  "orderStatus": "preparing",
  "status": "preparing",             // alias of orderStatus
  "dispatch": {
    "status": "assigned",            // unassigned | assigned | accepted | rejected | cancelled
    "deliveryPartnerId": "…", "assignedAt": "…", "acceptedAt": "…",
    "offeredTo": [{ "partnerId": "…", "at": "…", "action": "offered" }],
    "dispatchingAt": "…"
  },
  "deliveryState": {
    "currentPhase": "en_route_to_pickup",
    "reachedPickupAt": null, "pickedUpAt": null, "reachedDropAt": null, "deliveredAt": null,
    "currentLocation": { "lat": 21.14, "lng": 79.08 }
  },
  "statusHistory": [{ "at": "…", "byRole": "RESTAURANT", "byId": "…", "from": "confirmed", "to": "preparing", "note": "" }],
  "ratings": { "restaurant": { "rating": 5, "comment": "…", "ratedAt": "…" },
               "deliveryPartner": { … } },
  "rating": 5,
  "note": "kitchen note",
  "deliveryInstructions": "Ring the bell",
  "sendCutlery": false,
  "deliveryFleet": "standard",
  "scheduledAt": null,
  "acceptanceWindowSeconds": 240,
  "acceptanceDeadlineAt": "…",
  "cancellationReason": "", "cancelledBy": "", "cancelledAt": null,
  "deliveredAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

**Acceptance deadline is real.** `acceptanceDeadlineAt` (default 240s from placement) auto-expires unaccepted orders on the next list read. Run a countdown on the incoming-order card.

Full status enum on the order document: `pending_payment`, `created`, `confirmed`, `preparing`, `ready_for_pickup`, `reached_pickup`, `picked_up`, `reached_drop`, `delivered`, `cancelled_by_user`, `cancelled_by_restaurant`, `cancelled_by_admin`.

---

## 7. Finance & payouts

### `GET /food/restaurant/finance`
Query: `page`, `limit`, `startDate`, `endDate` (the date range drives `pastCycles` only).
```json
{
  "restaurant": {
    "name": "…", "restaurantId": "REST000123", "address": "…",
    "subscriptionDueAmount": 2360, "subscriptionStatus": "due"
  },
  "subscription": { "lockedAmount": 2360, "lockedMonths": "May, Jun 2026", "openInvoices": 2 },
  "features": { "restaurantSubscriptionEnabled": true },
  "wallet": {
    "totalEarnings": 84200,
    "totalWithdrawn": 20000,
    "estimatedPayout": 84200,
    "withdrawableBalance": 64200,
    "netAvailable": 61840,
    "totalOrders": 512,
    "payoutDate": null,
    "orders": [{
      "orderId": "FOD-…", "createdAt": "…",
      "items": [ … ], "foodNames": [ … ],
      "orderTotal": 520, "totalAmount": 546,
      "payout": 430, "commission": 78,
      "discount": 50, "adminDiscountShare": 25, "restaurantDiscountShare": 25,
      "discountAdminBearPercentage": 50, "discountRestaurantBearPercentage": 50,
      "paymentMethod": "razorpay", "orderStatus": "delivered", "status": "captured"
    }],
    "pagination": { … }
  },
  "currentCycle": { /* identical to wallet — legacy alias */ },
  "invoiceSummary": { "count": 512, "subtotal": 266240, "taxes": 13312, "gross": 279552 },
  "pastCycles": { "orders": [ … ], "totalOrders": 0, "pagination": { … } }
}
```
`netAvailable` = `withdrawableBalance − lockedAmount`. **Withdraw against `netAvailable`, never `totalEarnings`** — subscription dues are locked out of payouts.

### `POST /food/restaurant/withdraw`
```json
{ "amount": 5000, "bankDetails": { … } }
```
Rejected with a rupee-formatted message if `amount > netAvailable`, and the message names the locked subscription amount and months when dues exist. → 201, `data` = the withdrawal document (`status: "pending"`).

### `GET /food/restaurant/withdrawals`
→ `data` = **a bare array** of withdrawals, newest first (not `{ withdrawals: [...] }`).

---

## 8. Subscription (calendar-month postpaid)

### `GET /food/restaurant/subscription/overview`
```json
{
  "featureEnabled": true,
  "currentMonth": {
    "billingMonth": "2026-07",
    "label": "July 2026",
    "periodStart": "…", "periodEnd": "…",
    "gmv": 184000, "orderCount": 412,
    "estimatedPlan": "growth", "estimatedPlanLabel": "Growth",
    "estimatedPlanAmount": 2000, "estimatedGst": 360, "estimatedTotal": 2360,
    "planCatalog": [ { "id": "…", "label": "…", "basePrice": 2000, … } ]
  },
  "outstanding": { "totalDue": 2360, "lockedAmount": 2360, "lockedMonths": "May, Jun 2026", "openInvoices": 2 },
  "wallet": { "totalBalance": 64200, "netAvailable": 61840 }
}
```
The plan is derived from the month's GMV, so the estimate moves during the month. Zero GMV → `estimatedPlan: null` and a ₹0 amount.

### `GET /food/restaurant/subscription/invoices`
Query: `status`, `page`, `limit` (default 20, max 100).
```json
{
  "invoices": [ { "…invoice fields…", "billingMonthLabel": "June 2026" } ],
  "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1 }
}
```

### `GET /food/restaurant/subscription/invoices/:invoiceId`
→ `{ invoice: { …, billingMonthLabel }, transactions: [ … ] }` — 400 on a malformed id, 404 if it isn't yours.

### `GET /food/restaurant/subscription/transactions`
Query: `billingMonth` (e.g. `2026-07`), `page`, `limit`.
→ `{ transactions: [ { …, billingMonthLabel } ], pagination: { … } }`

### `GET /food/restaurant/subscription-history`
Legacy history endpoint. → `data` = history payload.

---

## 9. Offers

### `POST /food/restaurant/my-offers`
`restaurantScope` and `restaurantId` are injected server-side — don't send them.
```json
{
  "couponCode": "SAVE50",
  "discountType": "percentage",      // percentage | flat-price
  "discountValue": 20,               // > 0
  "customerScope": "all",            // all | first-time
  "minOrderValue": 199,
  "maxDiscount": 100,
  "usageLimit": 500,
  "perUserLimit": 1,
  "isFirstOrderOnly": false,
  "startDate": "2026-08-01T00:00:00.000Z",
  "endDate": "2026-08-31T23:59:59.000Z"
}
```
→ 201, `{ doc }`. A restaurant-created offer is always `restaurantBearPercentage: 100` / `adminBearPercentage: 0` — the restaurant funds its own discounts. An `endDate` in the past creates the offer as `inactive`.

Duplicate `couponCode` across the platform is rejected.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/food/restaurant/my-offers` | — | `{ offers: [...] }` |
| PATCH | `/food/restaurant/my-offers/:id/status` | `{ "status": "active" }` | `{ doc }` |
| DELETE | `/food/restaurant/my-offers/:id` | — | no `data` |

Public read (user app): `GET /food/restaurant/offers` — optional auth, personalized when a token is sent.

Offer errors come back through `sendError` with `err.statusCode || 400`, so expect 400s rather than 422s on validation failure.

---

## 10. Complaints, support, feedback

### `GET /food/restaurant/complaints`
Query passes through to the admin complaint service (pagination + filters). → `data` = complaint list.

### `POST /food/restaurant/support/tickets`
```json
{
  "category": "orders",        // orders | payments | menu | restaurant | technical | other — required
  "issueType": "required, free text",
  "subject": "…",
  "description": "…",
  "orderRef": "FOD-…",         // or "orderId"
  "priority": "medium"         // low | medium | high
}
```
→ 201, `{ ticket }`. Invalid `category` / `priority` → 400. Note: `priority` here has no `urgent` — that's the delivery app's enum.

### `GET /food/restaurant/support/tickets` → `{ tickets: [...] }` (+ pagination)

### `POST /food/restaurant/feedback-experience`
Dashboard NPS/feedback submission.

---

## 11. Push notifications

Same as the other apps: `POST /fcm-tokens/mobile/save`, `DELETE /fcm-tokens/remove`, or pass `fcmToken` + `platform: "mobile"` at OTP verify.

Inbox: `GET /food/notifications/inbox`, `PATCH /food/notifications/:id/read`, `DELETE /food/notifications/:id`, `DELETE /food/notifications/inbox/all`.

---

## 12. Realtime

Handshake with the access token. On connect the server auto-joins `restaurant:<restaurantId>`.

**Emit:**
| Event | Payload | Notes |
|---|---|---|
| `join-restaurant` | `restaurantId` | explicit re-join; ack `restaurant-room-joined`. Only your own id is accepted |
| `join-tracking` / `leave-tracking` | `orderId` | ack `tracking-room-joined` |

**Listen:**
| Event | Meaning |
|---|---|
| `new_order` | a paid order landed — ring the alarm, start the acceptance countdown |
| `order_status_update` | status changed by anyone |
| `location-update` | rider position for an order you're tracking |

The order alarm must not depend on the socket alone — poll `/orders` with a short interval as a fallback, and reconcile against `acceptanceDeadlineAt`.

---

## Client notes

1. `status !== 'approved'` blocks the dashboard. Check every launch.
2. New foods and add-ons start `pending` and are invisible to customers until admin approval — show that state or partners will file bugs.
3. `netAvailable`, not `totalEarnings`, is the withdrawable number.
4. `acceptanceDeadlineAt` auto-expires orders server-side; your countdown must match or you'll show accept buttons that 400.
5. Register is FormData: arrays are comma-joined strings and lat/lng are strings. Everything after registration is normal JSON.
6. Location edits go to `pendingLocation` for admin review, not straight to `location`.
7. `GET /withdrawals` returns a bare array; most other list endpoints return `{ data, meta }` or a named key. Don't assume one shape.
