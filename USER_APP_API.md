# Suvio — User App API Reference

Every endpoint below was enumerated from the live route files, not from memory.
Anything not listed here does not exist.

- **Base URL:** `https://<api-host>/api`
- **Auth:** `Authorization: Bearer <accessToken>` unless marked **Public**
- **Response envelope:** `{ "success": true, "message": "...", "data": { ... } }`
- **Errors:** `{ "success": false, "message": "<human readable>" }` with a 4xx/5xx status

Two route groups are mounted with a hard role gate — `/v1/food/user/*` and
`/v1/food/orders/*` both require `requireRoles('USER')`. A restaurant or delivery
token gets 403 on those, not 404.

---

## 1. Auth — `/v1/auth`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/auth/user/request-otp` | Public | Send login OTP |
| POST | `/v1/auth/user/verify-otp` | Public | Verify OTP, get tokens |
| POST | `/v1/auth/refresh-token` | Public | Exchange refresh token |
| POST | `/v1/auth/logout` | Bearer | Invalidate session |
| GET | `/v1/auth/me` | Bearer | Current identity |

```jsonc
// POST /v1/auth/user/request-otp
{ "phone": "9876543210" }

// POST /v1/auth/user/verify-otp
{ "phone": "9876543210", "otp": "1234" }
// -> data: { accessToken, refreshToken, user: { _id, name, phone, role } }
```

---

## 2. Catalog & discovery — **Public**

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/food/restaurant/restaurants` | Restaurant list (supports lat/lng, paging) |
| GET | `/v1/food/restaurant/restaurants/:id` | Restaurant detail |
| GET | `/v1/food/restaurant/restaurants/:id/menu` | Menu |
| GET | `/v1/food/restaurant/restaurants/:id/addons` | **Add-ons — see §3** |
| GET | `/v1/food/restaurant/restaurants/:id/outlet-timings` | Opening hours |
| GET | `/v1/food/restaurant/public/foods` | Flat dish list |
| GET | `/v1/food/restaurant/offers` | Offers |
| GET | `/v1/food/restaurant/categories/public` | Categories |
| GET | `/v1/food/search/unified` | Unified search |
| GET | `/v1/food/dining/categories/public` | Dining categories |
| GET | `/v1/food/dining/restaurants/public` | Dining restaurants |

### Landing / banners — all Public

`/v1/food/hero-banners/public`, `/top-banners/public`,
`/hero-banners/under-250/public`, `/hero-banners/dining/public`,
`/hero-banners/home-promotion/public`, `/hero-banners/gourmet/public`,
`/explore-icons/public`, `/landing/settings/public`, `/pages/:key`,
`/referral-settings`, `/zones/detect`, `/zones/nearby`

> The non-`/public` variants of the banner routes are **admin-only** and will 403.

---

## 3. Add-ons (per-item, Zomato-style)

```
GET /v1/food/restaurant/restaurants/:restaurantId/addons?foodId=<menuItemId>
```

`foodId` is optional. With it you get that dish's add-ons **plus** any whole-menu
ones. Without it you get everything the restaurant offers.

```jsonc
{
  "data": {
    // Flat list — every add-on, each carrying its own foodIds + group
    "addons": [
      {
        "id": "...", "name": "Extra Cheese Slice", "price": 30,
        "isVeg": true, "image": "", "images": [],
        "foodIds": ["6a646591..."],       // empty => applies to whole menu
        "appliesToWholeMenu": false,
        "group": { "name": "Upgrade Your Base", "minSelect": 0, "maxSelect": 1, "sortOrder": 1 }
      }
    ],
    // Ready-to-render groups — use THIS for the item sheet
    "groups": [
      {
        "name": "Upgrade Your Base",
        "title": "Upgrade Your Base",
        "minSelect": 0,
        "maxSelect": 1,
        "isRequired": false,
        "selectionLabel": "Select up to 1 option",
        "selectionType": "single",      // "single" => radios, "multi" => checkboxes
        "options": [ /* addon objects */ ]
      }
    ]
  }
}
```

Rendering rules, so the sheet matches Zomato:
- `selectionType: "single"` → radio buttons, at most one selected
- `selectionType: "multi"` → checkboxes, capped at `maxSelect`
- `isRequired: true` → block "Add item" until `minSelect` are chosen
- Show `selectionLabel` verbatim as the group subtitle

**Adding add-ons to the cart:** send each selected add-on as its own entry in
`items[]` using its add-on `id` as `itemId`. The server prices it from the
published record — client prices are ignored.

> Known gap: add-on line items carry no parent-item reference yet, so the cart
> cannot yet say *which* burger the cheese belongs to. Needs a `parentItemId`
> field on the order item schema.

---

## 4. Cart & addresses — `/v1/food/user`

| Method | Path | Purpose |
|---|---|---|
| PUT | `/v1/food/user/cart` | Replace the server-side cart |
| GET | `/v1/food/user/addresses` | List addresses |
| POST | `/v1/food/user/addresses` | Add address |
| PATCH | `/v1/food/user/addresses/:addressId` | Edit address |
| DELETE | `/v1/food/user/addresses/:addressId` | Remove address |
| PATCH | `/v1/food/user/addresses/:addressId/default` | Set default |

---

## 5. Orders — `/v1/food/orders`

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/food/orders/calculate` | Price the cart before placing |
| POST | `/v1/food/orders` | Place order |
| POST | `/v1/food/orders/verify-payment` | Verify Razorpay signature |
| DELETE | `/v1/food/orders/:orderId/pending-payment` | Abandon an unpaid order |
| GET | `/v1/food/orders` | Order history (paged) |
| GET | `/v1/food/orders/:orderId` | Single order |
| GET | `/v1/food/orders/:orderId/route` | **Live tracking route — see §6** |
| GET | `/v1/food/orders/:orderId/drop-otp` | Handover OTP |
| GET | `/v1/food/orders/:orderId/payments` | Payment ledger |
| PATCH | `/v1/food/orders/:orderId/cancel` | Cancel |
| PATCH | `/v1/food/orders/:orderId/ratings` | **Ratings — see §7** |
| PATCH | `/v1/food/orders/:orderId/instructions` | Update delivery instructions |

### Placing an order

```jsonc
POST /v1/food/orders
{
  "restaurantId": "6a633bd2bacbe2b007e206e7",
  "items": [
    { "itemId": "6a646591e53ad2837c40e3d4", "quantity": 1, "variantId": "", "notes": "" },
    { "itemId": "<addonId>", "quantity": 1 }
  ],
  "address": { "street": "...", "city": "...", "state": "...", "location": { "lat": 0, "lng": 0 } },
  "pricing": { /* from /calculate */ },
  "paymentMethod": "razorpay_qr",
  "note": "", "deliveryInstructions": "", "sendCutlery": true
}
```

### Payment methods

`"razorpay" | "razorpay_qr" | "card" | "wallet"`

**Cash on delivery is disabled.** Sending `"cash"` returns 400 with
`"Cash on Delivery is no longer available. Please pay online."` Legacy COD orders
still work everywhere else — only creation is blocked.

**`razorpay_qr` is the pay-at-the-door replacement.** Same UX as COD: nothing is
charged upfront, the order dispatches immediately, `payment.status` stays
`pending_qr`, and the rider presents a QR on arrival. No `verify-payment` call.
If the QR fails the rider can switch the order to cash from their side.

For `razorpay` / `card`, call `verify-payment` after checkout:

```jsonc
POST /v1/food/orders/verify-payment
{ "orderId": "...", "razorpayOrderId": "...", "razorpayPaymentId": "...", "razorpaySignature": "..." }
```

---

## 6. Live tracking

```
GET /v1/food/orders/:orderId/route
```

```jsonc
{
  "data": {
    "polyline": "<encoded polyline>",
    "distanceKm": 2.94, "distanceMeters": 2940,
    "durationSeconds": 660, "durationMins": 11,
    "target": "restaurant",              // "restaurant" pre-pickup, "customer" after
    "origin": { "lat": 22.72, "lng": 75.88 },   // the RIDER's position
    "destination": { "lat": 22.71, "lng": 75.88 }
  }
}
```

- The origin is the rider's last known position, resolved **server-side**. This
  endpoint accepts no coordinates from the client.
- `target` flips automatically at pickup, so the polyline is always the leg the
  rider is actually on.
- Poll roughly every 12s while an order is active, plus immediately on any status
  change. `polyline` may be `""` before a rider is assigned and located — draw a
  dotted arc between restaurant and address until then.
- `origin` doubles as the rider marker position when no socket fix has arrived.

Live position also arrives over Socket.IO (`location-update` in room
`tracking:<orderId>`) and Firebase RTDB at `active_orders/{orderMongoId}`.

> RTDB caveat: `boy_lat`/`boy_lng` in that node are seeded with the **restaurant's**
> coordinates at accept time. They are not a rider fix until the rider actually
> pings. Do not treat them as a position.

---

## 7. Ratings

```
PATCH /v1/food/orders/:orderId/ratings
```

```jsonc
{
  "restaurantRating": 5,
  "restaurantComment": "Great food",
  "deliveryPartnerRating": 4,
  "deliveryPartnerComment": "Fast and polite",
  "itemRatings": [
    { "itemId": "6a646591e53ad2837c40e3d4", "rating": 5, "comment": "Perfect" }
  ]
}
```

Returns the updated order in `data.order`.

Constraints the UI must respect:
- Only `delivered` orders → else `"You can rate only delivered orders"`
- `deliveryPartnerRating` is **mandatory** when the order had a rider → show both
  star rows together
- One submission per order → a second call returns `"Ratings already submitted"`
- `itemRatings` is optional; `itemId` must be a dish on **that** order, and each
  dish may be rated once

| Direction | Where |
|---|---|
| Customer → restaurant | `restaurantRating` |
| Customer → delivery boy | `deliveryPartnerRating` |
| Customer → each dish | `itemRatings[]` |
| Rider → customer | `PATCH /v1/food/delivery/orders/:orderId/rate-customer` (rider token) |

`GET /v1/food/orders/:orderId` populates the rider with `rating` and
`totalRatings`, so their score can be shown on the tracking screen with no extra
call.

---

## 8. Wallet, cashback, refunds, referrals — `/v1/food/user`

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/food/user/wallet` | Balance + transactions |
| POST | `/v1/food/user/wallet/topup/order` | Create a top-up order |
| POST | `/v1/food/user/wallet/topup/verify` | Verify top-up payment |
| GET | `/v1/food/user/cashback` | Cashback history |
| GET | `/v1/food/user/refunds` | Refund history |
| GET | `/v1/food/user/referrals/stats` | Referral totals |
| GET | `/v1/food/user/referrals/details` | Referral breakdown |

Read-only mirrors under `/v1/food/payments`: `/wallet/balance`,
`/wallet/transactions`, `/orders/:orderId/payments`, `/orders/:orderId/transactions`,
`/orders/:orderId/refunds`.

---

## 9. Profile & support — `/v1/food/user`

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/food/user/profile` | Get profile |
| PATCH | `/v1/food/user/profile` | Update profile |
| POST | `/v1/food/user/profile/profile-image` | Upload avatar |
| DELETE | `/v1/food/user/profile` | Delete account |
| POST | `/v1/food/user/support/ticket` | Raise a ticket |
| GET | `/v1/food/user/support/my-tickets` | List tickets |
| POST | `/v1/food/user/safety-emergency-reports` | Raise an SOS report |
| GET | `/v1/food/user/safety-emergency-reports` | List SOS reports |

---

## 10. Chat — `/v1/food/chat`

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/food/chat/conversations` | Conversation list |
| GET | `/v1/food/chat/messages` | Messages in a conversation |
| POST | `/v1/food/chat/messages` | Send a message |

`conversationId` equals `order._id.toString()`. Live messages arrive over
Socket.IO.

---

## 11. Notifications & FCM

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/food/notifications/inbox` | Notification inbox |
| PATCH | `/v1/food/notifications/:id/read` | Mark read |
| DELETE | `/v1/food/notifications/:id` | Delete one |
| DELETE | `/v1/food/notifications/inbox/all` | Clear inbox |
| POST | `/v1/fcm-tokens/mobile/save` | **Register device token** |
| DELETE | `/v1/fcm-tokens/remove` | Unregister |

```jsonc
POST /v1/fcm-tokens/mobile/save
{ "ownerType": "USER", "ownerId": "<userId>", "token": "<fcm token>", "platform": "mobile" }
```

Call this on login **and on every token refresh**. A device with no stored token
cannot be reached by any push, and this is currently the most common cause of
"notifications not arriving".

User-facing pushes carry `data.type = "order_status_update"` with `orderId`,
`orderMongoId` and `orderStatus`, and use the Android channel
`high_importance_channel` — which the user app already creates at
`Importance.max`. Keep that channel id, or Android silently downgrades the
notification to a non-heads-up default channel.

---

## 12. Socket.IO

Rooms: `user:<userId>`, `tracking:<orderId>`.

| Event | Direction | Meaning |
|---|---|---|
| `location-update` | in | Rider moved: `{ lat, lng, heading }` |
| `order_status_update` | in | Status changed — refetch the order over REST |
| `delivery_drop_otp` | in | Handover OTP |
| `new_message` | in | Chat message |

REST is authoritative. Treat socket events as a signal to refetch, not as the
source of truth.
