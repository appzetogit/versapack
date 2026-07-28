# Delivery Partner App — API Spec

Verified against `Backend/src/modules/food/delivery/` and `Backend/src/modules/food/orders/`.

## Global

- **Base URL:** `{HOST}/api/v1`
- **Prefix for everything here:** `/food/delivery`
- **Auth:** `Authorization: Bearer <accessToken>`, role must be `DELIVERY_PARTNER`
- **Envelope:** `{ "success": true, "message": "…", "data": … }` / errors `{ "success": false, "message": "…" }`
- **Static files:** `{HOST}/uploads/...`

---

## 1. Auth

### `POST /food/auth/delivery/request-otp`
```json
{ "phone": "9876543210" }
```
→ `data: { phone, ... }`

### `POST /food/auth/delivery/verify-otp`
```json
{ "phone": "9876543210", "otp": "1234", "fcmToken": "…", "platform": "mobile" }
```
→
```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "user": { /* delivery partner document, see §2 */ }
}
```

### `POST /food/auth/refresh-token` · `POST /food/auth/logout` · `GET /food/auth/me`
Same as the user app.

---

## 2. Registration & profile

### `POST /food/delivery/register` — no auth, `multipart/form-data`

File fields: `profilePhoto`, `aadharPhoto`, `panPhoto`, `drivingLicensePhoto`, `upiQrCode` (max 1 each).

Text fields:
```json
{
  "name": "required",
  "phone": "required, 8–15 digits",
  "email": "optional",
  "countryCode": "+91",
  "address": "", "city": "", "state": "",
  "vehicleType": "", "vehicleName": "", "vehicleNumber": "",
  "drivingLicenseNumber": "MH1234567890",   // ^[A-Z]{2}[0-9A-Z]{8,16}$, normalized (no spaces/hyphens)
  "panNumber": "ABCDE1234F",                // ^[A-Z]{5}[0-9]{4}[A-Z]$
  "aadharNumber": "123456789012",           // exactly 12 digits
  "ref": "<referrerId>",                    // optional referral
  "fcmToken": "…",
  "platform": "mobile"
}
```
→ 201, `data` = the created partner document.

### `GET /food/delivery/check-vehicle/:number` — no auth
→ **non-standard envelope** — has `isAvailable` at the top level, not inside `data`:
```json
{ "success": true, "isAvailable": false, "message": "Vehicle number already registered" }
```

### Delivery partner document (returned by profile, login, updates)
```json
{
  "_id": "…",
  "name": "…", "phone": "…", "email": "…", "countryCode": "+91",
  "address": "…", "city": "…", "state": "…",
  "vehicleType": "…", "vehicleName": "…", "vehicleNumber": "MH12AB1234",
  "panNumber": "…", "aadharNumber": "…", "drivingLicenseNumber": "…",
  "profilePhoto": "…", "aadharPhoto": "…", "panPhoto": "…", "drivingLicensePhoto": "…",
  "status": "pending",              // pending | approved | rejected | deactivated
  "rejectionReason": "…", "rejectedAt": null, "approvedAt": null,
  "bankAccountHolderName": "…", "bankAccountNumber": "…", "bankIfscCode": "…",
  "bankName": "…", "upiId": "…", "upiQrCode": "…",
  "availabilityStatus": "offline",  // online | offline
  "lastLocation": { "type": "Point", "coordinates": [lng, lat] },
  "lastLat": 21.14, "lastLng": 79.08, "lastLocationAt": "…",
  "referralCode": "…", "referredBy": null, "referralCount": 0,
  "rating": 4.6, "totalRatings": 120,
  "fcmTokens": [], "fcmTokenMobile": [],
  "createdAt": "…", "updatedAt": "…"
}
```

**`status` gates the app.** Only `approved` partners can go online or see orders. Show a pending/rejected screen otherwise.

### `PATCH /food/delivery/profile` — multipart (same file fields as register)
Body (all optional): `name`, `countryCode`, `address`, `city`, `state`, `vehicleType`, `vehicleName`, `vehicleNumber`, `drivingLicenseNumber`, `fcmToken`, `platform`.
→ `data` = update result.

### `PATCH /food/delivery/profile/details` — JSON only, no files
Same fields. Use this from Flutter for plain text edits — cheaper than multipart.
→ `data: { partner }`

### `POST /food/delivery/profile/photo-base64`
Base64 photo upload (built for in-app camera). → `data: { partner }`

### `PATCH /food/delivery/profile/bank-details` — multipart (`upiQrCode` file)
```json
{
  "documents": {
    "bankDetails": {
      "accountHolderName": "…", "accountNumber": "…",
      "ifscCode": "…", "bankName": "…", "upiId": "…"
    },
    "pan": { "number": "ABCDE1234F" }
  }
}
```
From `multipart/form-data`, flat bracket keys are also accepted and reassembled server-side: `documents[bankDetails][accountNumber]`, etc.

### `DELETE /food/delivery/profile/account`
Hard-deletes the partner, their wallet, and all their support tickets. → `data: { success: true }`

### `POST /food/delivery/reverify`
Stub. Always returns `{ "success": true, "message": "Submitted" }` — no `data`. Don't build on it.

---

## 3. Availability (go online / offline)

### `PATCH /food/delivery/availability`
```json
{ "status": "online", "latitude": 21.1458, "longitude": 79.0882 }
```
`status` accepts `"online"` / `"offline"` / `true` / `false`; anything else falls back to `offline`. Lat/lng must be **numbers** (strings are silently ignored) and are stored as `[lng, lat]`.

→ `data: { "availabilityStatus": "online" }`

Location freshness drives the offer radius (20 km cap), so keep pinging this while online.

---

## 4. Orders

### `GET /food/delivery/orders/available`
Query: `page`, `limit` (default 20, max 100).

Behaviour depends on state:
- **Partner has an active accepted delivery** → returns only that order.
- **Partner is idle** → returns unassigned orders in `confirmed` / `preparing` / `ready_for_pickup`, filtered to within 20 km of the partner's last known GPS, excluding any order they were previously deassigned from.

→ `data` is the paginated envelope:
```json
{
  "data": [ /* delivery-sanitized orders */ ],
  "meta": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 }
}
```

**Delivery-sanitized order** — the order object with `deliveryOtp` stripped, `deliveryVerification.dropOtp` reduced to `{ required, verified }`, and:
```json
{
  "_id": "…", "orderMongoId": "…",
  "order_id": "FOD-1234567890", "orderId": "FOD-1234567890",
  "userId": { "_id": "…", "name": "…", "phone": "…", "email": "…" },
  "restaurantId": {
    "_id": "…", "restaurantName": "…", "name": "…", "phone": "…", "ownerPhone": "…",
    "location": { "type": "Point", "coordinates": [lng, lat] },
    "addressLine1": "…", "area": "…", "city": "…", "state": "…", "profileImage": "…"
  },
  "deliveryAddress": { /* see address shape */ },
  "customerName": "…", "customerPhone": "…",
  "items": [ /* order items */ ],
  "pricing": { /* pricing block */ },
  "payment": { /* payment block */ },
  "paymentMethod": "razorpay",        // merged in from the transaction when one exists
  "amounts": { … }, "transactionStatus": "…",
  "orderStatus": "ready_for_pickup",
  "dispatch": { … }, "deliveryState": { … },
  "cookingNote": "less spicy",        // the restaurant-facing note
  "deliveryInstructions": "Ring bell",
  "note": "Ring bell",                // NOTE: aliased to deliveryInstructions, NOT the cooking note
  "riderEarning": 42,
  "tripDistanceKm": 3.4, "tripDurationMins": 14,
  "lastRiderLocation": { "type": "Point", "coordinates": [lng, lat] },
  "deliveryFleet": "standard",
  "ratings": { … },
  "restaurantCoverImage": "/uploads/food/restaurants/cover/….webp",
  "restaurantGalleryImages": ["/uploads/….webp"],
  "restaurantLandmark": "Near SBI ATM",
  "restaurantCallUri": "tel:9632587410",
  "customerCallUri": "tel:9876543210",
  "pickupDistanceKm": 1.2,
  "createdAt": "…", "updatedAt": "…"
}
```

Watch out: `note` on a delivery-facing order is the **delivery instruction**, not the cooking note. Read `cookingNote` if you want the kitchen note.

### `GET /food/delivery/orders/current`
→ `data: { "activeOrder": <order|null> }`

### `GET /food/delivery/orders/:orderId`
→ `data: { order }`. 403 if not assigned to this partner.

### Trip lifecycle — call in this order

| Method | Path | Body | Response |
|---|---|---|---|
| PATCH | `/orders/:orderId/accept` | — | `{ order }` |
| PATCH | `/orders/:orderId/reject` | — | `{ order }` |
| PATCH | `/orders/:orderId/reached-pickup` | — | `{ order }` |
| PATCH | `/orders/:orderId/confirm-pickup` | `{ "billImageUrl": "…" }` optional | `{ order }` |
| PATCH | `/orders/:orderId/reached-drop` | — | `{ order }` |
| POST | `/orders/:orderId/verify-drop-otp` | `{ "otp": "1234" }` | `{ order }` |
| PATCH | `/orders/:orderId/complete` | free-form body passed through | `{ order }` |
| PATCH | `/orders/:orderId/status` | `{ "orderStatus": "…", "note": "…" }` | `{ order }` |

`orderStatus` on the generic status endpoint accepts only: `confirmed`, `preparing`, `ready_for_pickup`, `picked_up`, `delivered`, `cancelled_by_restaurant`. Prefer the dedicated lifecycle endpoints — they also maintain `deliveryState.currentPhase`.

`deliveryState.currentPhase` progresses: `en_route_to_pickup` → `at_pickup` → `en_route_to_delivery` → `at_drop` → `delivered` → `completed`.

The drop OTP is never exposed to the partner in any response. The customer reads it out; the partner types it into verify-drop-otp.

---

### `GET /food/delivery/orders/:orderId/route`

Driving route for the active-trip map. Accepts the display id **or** the Mongo `_id`.

Query: `lat`, `lng` (rider's current position — falls back to the last stored ping),
`target` = `restaurant` | `customer` (optional; inferred from trip phase when omitted —
restaurant before pickup, customer after).

```json
{ "polyline": "<encoded google polyline>",
  "distanceMeters": 10936, "distanceKm": 10.94,
  "durationSeconds": 1612, "durationMins": 27,
  "target": "restaurant",
  "origin": { "lat": 22.68, "lng": 75.83 },
  "destination": { "lat": 22.7282195, "lng": 75.8843622 } }
```

The polyline is **full-detail** (stitched from Google's per-step geometry, not the
simplified `overview_polyline`), so it follows the road at street zoom. Decode it before
drawing — it is an encoded string, not coordinates.

When Directions can't produce a route you get **200** with `polyline: ""` and null
distances — don't draw the line, keep the markers. Don't treat it as an error.

⚠️ Each call is a **billed** Directions request. Call it when a trip phase starts and on a
real re-route, not on a timer. The same polyline is also written to Firebase RTDB
`active_orders/{orderMongoId}` at accept time and is free to read.

⚠️ A near-zero-distance order (test data where the customer is metres from the restaurant)
legitimately returns a 2-point polyline. That's correct, not a bug.

---

## 5. Payment collection at the door

### `POST /food/delivery/orders/:orderId/collect/qr`
Body (optional, falls back to the order's customer): `{ "name": "…", "email": "…", "phone": "…" }`

→
```json
{
  "shortUrl": "https://rzp.io/i/xxxx",
  "imageUrl": "https://rzp.io/i/xxxx",
  "amount": 546,
  "expiresAt": "2026-07-24T19:30:00.000Z"
}
```

Errors: `Order already paid`, `No amount due` (due < ₹1), `QR payment not configured` (Razorpay keys missing), `Not your order`.

### `GET /food/delivery/orders/:orderId/payment-status`
Polls and syncs the Razorpay link status server-side. Poll this after showing the QR.
```json
{
  "payment": { "method": "razorpay_qr", "status": "paid", "amountDue": 546, "qr": { … }, "refund": { … } },
  "latestPaymentSnapshot": { … },
  "riderEarning": 42,
  "platformProfit": 18,
  "pricingTotal": 546,
  "transactionStatus": "captured"
}
```

### `POST /food/delivery/orders/:orderId/collect/cash`
Falls back from QR to physical cash. → `data: { "success": true }`

Rejected unless the order's payment method is `cash` or `razorpay_qr` and it is not already paid — online-prepaid orders cannot be switched.

---

## 6. Wallet / pocket

### `GET /food/delivery/wallet`
Query: `type` (transaction-type filter), `limit`.
```json
{
  "wallet": {
    "totalBalance": 5400,
    "pocketBalance": 5400,
    "cashInHand": 1200,
    "totalWithdrawn": 0,
    "totalEarned": 5100,
    "totalCashLimit": 3000,
    "availableCashLimit": 1800,
    "deliveryWithdrawalLimit": 100,
    "joiningBonusClaimed": false,
    "joiningBonusAmount": 0,
    "transactions": [
      {
        "_id": "…", "type": "payment", "amount": 42, "status": "Completed",
        "date": "…", "createdAt": "…", "orderId": "FOD-…",
        "paymentMethod": "cash", "metadata": { "orderId": "FOD-…" },
        "description": "COD delivery earning"
      },
      {
        "_id": "…", "type": "earning_addon", "amount": 200, "status": "Completed",
        "date": "…", "createdAt": "…", "metadata": { "reference": "WEEKEND-BONUS" },
        "description": "Bonus - WEEKEND-BONUS"
      }
    ]
  }
}
```
`totalWithdrawn` is hardcoded to 0 in this endpoint — use the withdrawal list for real withdrawal history.

### `POST /food/delivery/wallet/withdraw`
```json
{ "amount": 500, "paymentMethod": "bank_transfer", "bankDetails": { … } }
```
Rejected if `amount < deliveryWithdrawalLimit` or `amount > pocketBalance`.
→ 201, `data: { withdrawal }`

### `POST /food/delivery/wallet/deposit/order`
Rider hands collected cash back to the company. `{ "amount": 1200 }` — must be ≥ ₹1, ≤ ₹5,00,000, and ≤ `cashInHand`.
```json
{ "razorpay": { "key": "rzp_live_…", "orderId": "order_…", "amount": 120000, "currency": "INR" } }
```
`amount` is in **paise**. Without Razorpay configured, a dummy dev order is returned instead.

### `POST /food/delivery/wallet/deposit/verify`
```json
{
  "razorpay_order_id": "…",
  "razorpay_payment_id": "…",
  "razorpay_signature": "…",
  "amount": 1200
}
```
Note the **snake_case** keys here — the controller maps them internally. This differs from the user app's order verify, which uses camelCase.

---

## 7. Earnings, trips, settings

### `GET /food/delivery/earnings`
Query: `period` = `today` | `week` (default) | `month` | `all`, `date` (anchor, ISO), `page`, `limit`.
```json
{
  "summary": {
    "totalEarnings": 5100, "totalOrders": 122,
    "totalHours": 0, "totalMinutes": 0,
    "orderEarning": 5100, "incentive": 0, "otherEarnings": 0
  },
  "period": "week",
  "date": "2026-07-24T…",
  "pagination": { "page": 1, "limit": 50, "total": 122 }
}
```
`totalHours` / `totalMinutes` / `incentive` are not computed yet — always 0. Don't surface them.

### `GET /food/delivery/trip-history`
Query: `period` = `daily` (default) | `weekly` | `monthly`, `date`, `status` = `Completed` | `Cancelled` | `Pending` | `ALL TRIPS`, `limit` (default 50, max 1000).
```json
{
  "period": "daily",
  "date": "2026-07-24T…",
  "range": { "start": "…", "end": "…" },
  "trips": [{
    "id": "…", "_id": "…", "orderId": "FOD-…",
    "status": "Completed",                        // Completed | Cancelled | Pending
    "restaurantName": "…", "restaurant": "…",
    "items": [ … ], "orderItems": [ … ],
    "paymentMethod": "cash",
    "totalAmount": 546, "orderTotal": 546,
    "codAmount": 546, "codCollectedAmount": 546,
    "deliveryEarning": 42, "earningAmount": 42, "amount": 42,
    "createdAt": "…", "deliveredAt": "…", "completedAt": "…",
    "date": "…", "time": "07:42 PM"
  }]
}
```
Weeks run Sunday → Saturday. `time` is pre-formatted `en-IN`.

### `GET /food/delivery/pocket-details`
Query: `date` (anchors the week), `limit`.
```json
{
  "week": { "start": "…", "end": "…" },
  "summary": { "totalEarning": 1400, "totalBonus": 200, "grandTotal": 1600 },
  "trips": [ /* same trip DTO as above */ ],
  "transactions": {
    "payment": [ { "_id": "…", "type": "payment", "amount": 42, … } ],
    "bonus":   [ { "_id": "…", "type": "bonus",   "amount": 200, … } ]
  }
}
```
Note the type label differs between endpoints: `earning_addon` in `/wallet`, `bonus` here.

### `GET /food/delivery/earning-addons/active`
```json
{
  "activeOffer": {
    "id": "…", "title": "Weekend Guarantee", "description": "…",
    "targetAmount": 2000, "targetOrders": 30,
    "currentOrders": 12, "currentEarnings": 810,
    "startDate": "…", "endDate": "…", "validTill": "…", "isLive": true
  },
  "offers": [ /* all live addons, soonest-expiring first */ ]
}
```
`activeOffer` is just `offers[0]`, or `null`.

### `GET /food/delivery/cash-limit`
```json
{ "deliveryCashLimit": 3000, "deliveryWithdrawalLimit": 100 }
```

### `GET /food/delivery/emergency-help`
```json
{
  "medicalEmergency": "102",
  "accidentHelpline": "108",
  "contactPolice": "100",
  "insurance": ""
}
```
Indian defaults are served when admin hasn't configured them.

### `GET /food/delivery/referrals/stats`
```json
{ "stats": {
    "referralCode": "6a64baafc8248e1b5dc44e0f",
    "referralLink": "https://…?referrer=6a64baaf…",   // "" when admin hasn't set one
    "rewardAmount": 50, "referralLimit": 20, "remainingReferrals": 19,
    "referralCount": 1, "totalReferralEarnings": 50,
    "totalInvited": 1, "creditedCount": 1, "pendingCount": 0, "rejectedCount": 0,
    "rewardCondition": "Your referral must be approved and complete 1 delivery.",
    "invitedPartners": [
      { "id","name","phone","partnerStatus","deliveriesCompleted",
        "status","reason","rewardAmount","earnedAmount","invitedAt" } ] } }
```

Share `referralLink` when non-empty, else the bare `referralCode`. Never hardcode the URL or
the amount — both are admin-set. The reward pays only after the referred rider is
**approved AND completes their first delivery**, so a referral can sit `pending` for days.

Pass the code at signup as a `ref` text field on `POST /food/delivery/register`.

---

## 8. Support tickets

### `POST /food/delivery/support-tickets`
```json
{
  "subject": "min 3 chars, required",
  "description": "min 10 chars, required",
  "category": "payment",   // payment | account | technical | order | other (default other)
  "priority": "medium"     // low | medium | high | urgent (default medium)
}
```
→ 201, `data` = the ticket, including a generated `ticketId` and `status: "open"`.

### `GET /food/delivery/support-tickets` → `data: { tickets: [...] }`
### `GET /food/delivery/support-tickets/:id` → `data` = the ticket

---

## 9. Emergency order reassignment

For when the rider physically can't finish a trip (breakdown, accident).

### `POST /food/delivery/order-emergency-requests`
```json
{ "reason": "at least 10 characters" }
```
No order id — the server finds the partner's currently accepted order itself. Only allowed **before pickup**: order status in `confirmed` / `preparing` / `ready_for_pickup` / `reached_pickup`, `pickedUpAt` unset. One active request per order.

→ 201, `data: { request }`:
```json
{
  "_id": "…", "orderId": "…", "deliveryPartnerId": "…", "restaurantId": "…",
  "reason": "…",
  "status": "open",              // open | in_progress | processing | resolved | closed
  "adminResponse": "", "failureReason": "",
  "deassignedAt": null, "resolvedAt": null, "resolvedBy": null,
  "createdAt": "…", "updatedAt": "…"
}
```

### `GET /food/delivery/order-emergency-requests` → `data: { requests: [...] }`
### `GET /food/delivery/order-emergency-requests/:id` → `data: { request, … }`

List/detail responses populate `order`, `deliveryPartner`, `restaurant`, and `resolvedBy` as nested objects alongside the raw ids.

Errors to handle: `Emergency reassignment is available only for an accepted order before pickup`, `An active reassignment request already exists for this order`.

---

## 10. Push notifications

Same as the user app: `POST /fcm-tokens/mobile/save`, `DELETE /fcm-tokens/remove`, or pass `fcmToken` + `platform: "mobile"` at OTP verify.

Inbox: `GET /food/notifications/inbox`, `PATCH /food/notifications/:id/read`, `DELETE /food/notifications/:id`, `DELETE /food/notifications/inbox/all`.

---

## 11. Realtime

Handshake with the access token (`auth.token`, `Authorization` header, or `?token=`). On connect the server auto-joins `delivery:<partnerId>`.

**Emit:**
| Event | Payload | Notes |
|---|---|---|
| `join-delivery` | `deliveryPartnerId` | explicit re-join; ack `delivery-room-joined`. Rejected if the id isn't yours or your role isn't DELIVERY_PARTNER |
| `join-tracking` | `orderId` | ack `tracking-room-joined` |
| `leave-tracking` | `orderId` | |
| location ping | `{ orderId, lat, lng, userId, restaurantId }` | broadcast to the tracking room as `location-update` |

**Listen:**
| Event | Meaning |
|---|---|
| `new_order_available` | a new order is offered to you — show the accept modal |
| `order_claimed` | another rider took it — dismiss the modal |
| `order_deassigned` | the order was taken off you |
| `order_ready` | restaurant marked ready for pickup |
| `order_status_update` | any status change |

Poll `/orders/available` as a fallback — the modal must not depend on the socket alone.

---

## Client notes

1. `status !== 'approved'` blocks everything. Check on every launch, not just at login.
2. GPS is `[lng, lat]` in every payload the server stores and returns.
3. Deposit-verify uses **snake_case** Razorpay keys; the user app's order-verify uses camelCase. Easy to get wrong.
4. `note` on a delivery order = delivery instruction. `cookingNote` = kitchen note.
5. Drop OTP is customer-held and never in your responses — only the verify call.
