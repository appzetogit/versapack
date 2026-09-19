# Rider dispatch & notifications — Flutter integration guide

For the developers of the three apps: **VersaPack User**, **VersaPack Seller**,
**VersaPack Delivery**.

This describes what the backend does, what it requires of each app, and how to
tell which side a problem is on. It was written while fixing the bug where
"Handed Over" in the seller app produced no notification in the delivery app.

> **Scope note.** Everything here about the *backend* is verified against the
> source and tested end to end. I did not have the Flutter source while writing
> this, so where it says "the app must…", treat it as the contract the backend
> expects — not a claim about what your code currently does. Those are the
> places worth checking first.

---

## 1. The bug that was fixed, and what it means for you

**Symptom:** seller taps *Handed Over*, no notification reaches the delivery
app, no rider can take the order.

**Cause:** the seller app sends `orderStatus: "picked_up"`. In the backend
`picked_up` means *a rider physically has the order*. Sent with no rider
assigned it orphaned the order:

- no rider hunt runs for that status, and
- the available-orders list only includes `confirmed`, `preparing`,
  `ready_for_pickup` — so the order vanished from every rider's screen while no
  rider was holding it.

Nothing errored. That is why it looked like a lost push.

**Fix (backend, already deployed to `main`):**

1. A restaurant marking `picked_up` **with no rider assigned** is stored as
   `ready_for_pickup`. The order stays grabbable.
2. Reaching `ready_for_pickup` with nobody assigned now **starts a rider hunt**.
   Previously it only pinged an already-assigned rider and otherwise wrote a log
   line and stopped.
3. Dispatch no longer sits behind a Socket.IO check. The FCM push lives inside
   the dispatch routine, so a socket outage used to silence pushes too.

### What this means for the seller app

**No app change is required.** Keep sending `picked_up`; the backend now
interprets it correctly in both cases:

| Situation | Sent | Stored | Effect |
|---|---|---|---|
| No rider assigned yet | `picked_up` | `ready_for_pickup` | rider hunt starts |
| A rider already accepted | `picked_up` | `picked_up` | normal pickup recorded |

If you would rather be explicit, send `ready_for_pickup` for "packed / handed to
counter" and leave `picked_up` to the delivery app. Both work.

---

## 2. Order lifecycle — who sets what

```
created → confirmed → preparing → ready_for_pickup → reached_pickup
        → picked_up → reached_drop → delivered
```

| Status | Set by | Means |
|---|---|---|
| `created` | system | order placed |
| `confirmed` / `preparing` | **seller** (Accept) | seller accepted |
| `ready_for_pickup` | **seller** (Mark Ready / Handed Over) | packed, waiting |
| `reached_pickup` | **delivery** | rider arrived at store |
| `picked_up` | **delivery** | rider physically has it |
| `reached_drop` | **delivery** | rider at customer |
| `delivered` | **delivery** | handed to customer |

Status may only move **forward**. `STATUS_PRIORITY` ranks them, and a request
that moves backwards is rejected with a validation error. The one exception the
backend now makes is a repeated *Handed Over* on an order already at
`ready_for_pickup` — that is treated as "find me a rider again", not a
regression.

---

## 3. When riders are notified

There are exactly two moments:

**A. Seller accepts** (`confirmed` / `preparing`)
Riders are recruited here, not at handover. The rider rides to the store while
the order is being packed — that is what keeps the promise in minutes.

**B. Order becomes `ready_for_pickup` with no rider assigned**
New since the fix. If a rider was already assigned, they get an `order_ready`
socket event instead.

Both go out over **two independent channels**:

- **Socket.IO** — `new_order` (or `new_order_available` on a re-offer) to the
  rider's room
- **FCM push** — see §5

A rider with the app closed only ever sees the push. Do not rely on sockets.

---

## 4. Why a push may legitimately not arrive

Before blaming FCM, note that a rider is only offered an order when **all** of
these hold. Any one failing silently produces zero riders:

| Requirement | Field | Notes |
|---|---|---|
| Rider is online | `availabilityStatus === 'online'` | set via `PATCH /food/delivery/availability` |
| Rider is approved | `status === 'approved'` | **production accepts only `approved`**; development also accepts `pending`. A pending rider works on staging and never in production. |
| GPS is fresh | `lastLocationAt` within `DISPATCH_STALE_GPS_MS` | default 45 min |
| GPS exists | `lastLocation` GeoJSON point | the query is a `$geoNear`; no point means not found |
| Within radius | distance ≤ current band | widens across retry attempts |
| Store has coordinates | `restaurant.location.coordinates` | missing → no riders at all |

Server log lines to look for:

```
Broadcasting order <id> to N riders          ← riders were found
tryAutoAssign: No NEW eligible partners …    ← one of the above failed
```

**Retries** run through the BullMQ `DISPATCH_TIMEOUT_CHECK` job. If
`BULLMQ_ENABLED=false` there is no retry — the first attempt is the only one.

---

## 5. Android push contract

This is the part most likely to look like "the push never arrived" while the
server thinks it sent fine.

### 5.1 Notification channel — the usual culprit

The backend sends new-order alerts on channel id **`new_orders_v2`**
(overridable via `FCM_NEW_ORDER_CHANNEL_ID`).

**The delivery app must create this exact channel**, with:

- `Importance.max`
- full-screen intent enabled
- sound set **on the channel** (`raw/neworder.mp3`)

If the app has not created a channel with that id, Android **silently** drops
the message onto FCM's auto-created *Miscellaneous* channel at
`IMPORTANCE_DEFAULT`: no heads-up, no sound, no full-screen. On the device this
is indistinguishable from the push never arriving.

A channel's importance and sound are frozen at creation — you cannot re-point an
existing id. That is why ids are versioned (`_v2`, `_v3`). The app also still
registers the legacy `incoming_orders_channel_v3`; that can be removed once
`new_orders_v2` is confirmed live on all installs.

The user app's default channel is `high_importance_channel`.

### 5.2 Two messages per alert, in a fixed order

Every new-order alert is sent as **two FCM messages**:

1. a **notification** message (with `androidTag`, `androidChannelId`) — this is
   what gets through on ROMs that refuse to start a stopped app
2. a **data-only** message — this is what triggers the app's own full-screen UI,
   because Android will not call your background handler for a message that
   carries a notification block

The notification leg is sent **first on purpose**. The app cancels the plain copy
by tag when its handler runs; sending data-only first meant cancelling a
notification that had not arrived yet, and it then appeared and stayed — two
alerts instead of one.

**Your side of this contract:**

- cancel by tag: `androidTag` is `order_<orderMongoId>` — this must match
  `cancel(0, tag:)` in `fcm_service.dart`
- expect `message.notification` to be **null** on the data-only leg; read the
  strings from `message.data` instead (see below)

### 5.3 `data` payload fields (new order)

All values are strings.

| Key | Meaning |
|---|---|
| `type` | `new_order` |
| `title`, `body` | ready-made strings — use these, not `message.notification` |
| `orderId`, `orderMongoId` | order id |
| `orderDisplayId` | human id, e.g. `FOD-7160372458` |
| `restaurantName`, `restaurantAddress`, `pickupAddress` | pickup |
| `customerAddress`, `dropAddress` | drop |
| `tripDistanceKm`, `tripDurationMins` | store → customer |
| `pickupDistanceKm` | rider → store (ranking only) |
| `riderEarning`, `earnings`, `price` | payout |
| `paymentMethod`, `total` | order money |
| `acceptanceDeadlineAt` | ISO timestamp — **prefer this** |
| `acceptTimeoutSeconds` | fallback window (45s) |

Drive the countdown from `acceptanceDeadlineAt`. If it is already in the past
(the message sat in Doze), fall back to `acceptTimeoutSeconds` — a card that
opens short is better than one that opens at zero.

Message TTL is **60s** (`FCM_NEW_ORDER_TTL_SECONDS`), just above the 45s accept
window. An offer that cannot be delivered within that is dropped rather than
arriving stale.

---

## 6. FCM token registration

```
POST /api/v1/fcm-tokens/mobile/save
Authorization: Bearer <token for that app's role>
{ "token": "<fcm token>" }
```

- The owner is taken from the **JWT**, not the body. Register with the token of
  the app whose user you are — a seller token registers a seller device.
- Tokens are stored on the profile document (`fcmTokenMobile` for mobile,
  `fcmTokens` for web). The sender reads both, so platform mix-ups do not break
  delivery.
- Only the **3 most recent** devices per platform are kept.
- Re-register on every app start and on `onTokenRefresh`. A token moved to
  another account is detached from the old one automatically.

---

## 7. Delivery app — required behaviour

### 7.1 Going online, and staying eligible

```
PATCH /api/v1/food/delivery/availability
{ "status": "online", "latitude": 22.7196, "longitude": 75.8577 }
```

Both `status`/`availabilityStatus` and `lat`/`latitude` spellings are accepted.
Sending coordinates also refreshes `lastLocationAt`, which is what keeps the
rider inside the freshness window.

**Push GPS periodically while online.** The staleness window was widened to 45
minutes precisely because of a deadlock: Android Doze suppresses the background
location upload → GPS goes stale → rider is excluded from the offer → no push is
sent → nothing wakes the app → GPS stays stale. A rider parked outside the store
would never hear about an order.

### 7.2 Trip endpoints

```
GET   /api/v1/food/delivery/orders/available
PATCH /api/v1/food/delivery/orders/:orderId/accept
PATCH /api/v1/food/delivery/orders/:orderId/reject
PATCH /api/v1/food/delivery/orders/:orderId/reached-pickup
PATCH /api/v1/food/delivery/orders/:orderId/confirm-pickup
PATCH /api/v1/food/delivery/orders/:orderId/reached-drop
POST  /api/v1/food/delivery/orders/:orderId/verify-drop-otp   { "otp": "1234" }
PATCH /api/v1/food/delivery/orders/:orderId/complete
```

`/available` is the safety net when a push is missed — it returns orders that are
`unassigned` and in `confirmed` / `preparing` / `ready_for_pickup`, plus the
rider's own active trip. **Poll it**; do not depend on push alone.

### 7.3 Socket events

Join the rider room after connecting. Events: `new_order`,
`new_order_available` (re-offer), `order_ready`, `order_status_update`.

---

## 8. Seller app — status endpoint

```
PATCH /api/v1/food/restaurant/orders/:orderId/status
{ "orderStatus": "preparing" | "ready_for_pickup" | "picked_up" | "delivered"
                 | "confirmed" | "cancelled_by_restaurant",
  "note": "optional" }
```

Accepting the order (`confirmed` / `preparing`) is what starts the rider hunt.
The response returns the order with its **stored** status — which, as described
in §1, may differ from what you sent when you send `picked_up` with no rider.
Render the returned status rather than assuming your request was applied
verbatim.

---

## 9. Debugging checklist

When a rider reports "no notification":

1. **Was a rider found?** Server log: `Broadcasting order … to N riders` vs
   `No NEW eligible partners`. If the latter, it is §4 — not a push problem.
2. **Is the rider eligible?** online, `approved`, GPS fresh, in radius. In
   production `pending` riders are never offered anything.
3. **Did FCM accept the send?** Look for push failures around that order id.
4. **Does the device have the channel?** `new_orders_v2`, importance max. This
   is the most common silent failure — the message arrives and Android files it
   somewhere invisible.
5. **Is the app reading `message.data`?** The data-only leg has
   `message.notification == null`. Reading `notification.title` there renders a
   blank alert, which reads as a broken push.
6. **Does `/orders/available` show it?** If yes, delivery works and only the
   push path is broken. That single check splits the problem in half.

---

## 10. Recommended app-side work

Not required for the fix, but worth doing:

- **Confirm `new_orders_v2` exists** in the shipped delivery APK with
  `Importance.max` and a full-screen intent. If it does not, nothing else in §5
  matters.
- **Poll `/orders/available`** on the rider home screen so a missed push is not a
  missed order.
- **Keep GPS flowing** while online, with a foreground service if needed — see
  §7.1 for why this is self-reinforcing when it breaks.
- **Drive the countdown from `acceptanceDeadlineAt`**, falling back to
  `acceptTimeoutSeconds`.
- **Seller app:** consider sending `ready_for_pickup` for handover and leaving
  `picked_up` to the delivery app. The backend no longer needs it, but it makes
  the intent explicit on the wire.

---

## 11. Server-side items still open

These are not app work, but they affect what you will see while testing:

- **`BULLMQ_ENABLED`** — with it off there are no dispatch retries. The new
  handover trigger softens this, but a retry path is still worth having.
- **Firebase service account** must be configured in the environment, or no push
  is sent at all.
- **Rider approval** — riders sitting at `pending` are invisible to production
  dispatch.
