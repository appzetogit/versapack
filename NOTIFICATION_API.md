# Notification API — Flutter Developer Guide

**Base URL:** `https://<your-domain>/api/v1/food/notifications`

> The `/api` prefix is not optional. Every route is mounted under it
> (`app.use('/api', routes)`), and a path without it does **not** return 404 —
> nginx serves the web app's `index.html` instead, with **HTTP 200**. The app
> then reads HTML where it expected JSON, sees no data, and reports no error.
> If the inbox looks empty for everybody, check this first.

These endpoints are the **in-app inbox**. They are separate from push
notifications; see [Push notifications](#push-notifications-a-separate-thing) at
the end.

---

## Common headers

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <JWT_ACCESS_TOKEN>` | yes |
| `Content-Type` | `application/json` | yes |

The token is the one login returns. Who the notifications belong to is taken
from that token — there is no `ownerId` to pass, and no way to read someone
else's inbox.

Allowed roles: `USER`, `RESTAURANT`, `DELIVERY_PARTNER`. Admins are not on these
routes.

---

## Notification object

```json
{
  "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
  "ownerType": "USER",
  "ownerId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "title": "Order Confirmed!",
  "message": "Your order #1234 has been confirmed by the restaurant.",
  "link": "/orders/64f1a2b3c4d5e6f7a8b9c0d3",
  "category": "broadcast",
  "source": "ADMIN_BROADCAST",
  "broadcastId": null,
  "metadata": {},
  "isRead": false,
  "readAt": null,
  "dismissedAt": null,
  "createdAt": "2026-09-26T06:30:00.000Z",
  "updatedAt": "2026-09-26T06:30:00.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `_id` | String | Used by the read and dismiss endpoints |
| `ownerType` | String | `USER`, `RESTAURANT`, `DELIVERY_PARTNER` |
| `ownerId` | String | ObjectId of the owner |
| `title` | String | Heading |
| `message` | String | Body |
| `link` | String | Deep link or route; empty string when there is none |
| `category` | String | Defaults to `broadcast` |
| `source` | String | `ADMIN_BROADCAST`, `FSSAI_EXPIRY`, `SUPPORT_RESPONSE`, `SUBSCRIPTION_BILLING` |
| `broadcastId` | String \| null | Set when it came from an admin broadcast |
| `metadata` | Object | Extra data; usually `{}` |
| `isRead` | Boolean | |
| `readAt` | String \| null | ISO datetime |
| `dismissedAt` | String \| null | ISO datetime; dismissed rows are hidden from the inbox |
| `createdAt` / `updatedAt` | String | ISO datetime |

**Notifications are deleted after 7 days** by a TTL index on `createdAt`. Do not
treat the inbox as durable history.

**One broadcast produces at most one row per recipient.** A unique index on
`{ broadcastId, ownerType, ownerId }` enforces it, so the app does not need to
de-duplicate.

---

## 1. Inbox

```
GET /api/v1/food/notifications/inbox?page=1&limit=20
```

Returns notifications that have not been dismissed, newest first, plus the
unread count for the badge. No request body.

| Query | Type | Default | Max |
|---|---|---|---|
| `page` | Integer | 1 | — |
| `limit` | Integer | 20 | 100 (higher values are clamped) |

**200 OK**

```json
{
  "success": true,
  "message": "Notifications fetched successfully",
  "data": {
    "items": [ /* notification objects */ ],
    "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 },
    "unreadCount": 5
  }
}
```

---

## 2. Mark one as read

```
PATCH /api/v1/food/notifications/:id/read
```

Sets `isRead` and `readAt`. The notification stays in the inbox. No body.

**200 OK** — `message: "Notification marked as read"`, `data` is the updated
notification.

---

## 3. Dismiss one

```
DELETE /api/v1/food/notifications/:id
```

Sets `dismissedAt`, which hides it from the inbox. The row itself is removed by
the 7-day TTL, not by this call. No body.

**200 OK** — `message: "Notification removed successfully"`, `data` is the
updated notification.

---

## 4. Mark all as read

```
PATCH /api/v1/food/notifications/inbox/read-all
```

No body.

**200 OK**

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": { "modifiedCount": 5 }
}
```

---

## 5. Clear the inbox

```
DELETE /api/v1/food/notifications/inbox/all
```

Dismisses everything. No body.

> This also marks them read — it sets `isRead` and `readAt` alongside
> `dismissedAt`. After Clear All the badge is already zero; there is no need to
> call read-all as well.

**200 OK**

```json
{
  "success": true,
  "message": "All notifications removed successfully",
  "data": { "modifiedCount": 12 }
}
```

---

## Errors

Every endpoint can return these. The messages below are what the server
actually sends.

| Status | `message` | When |
|---|---|---|
| 401 | `Authentication token missing` | No `Authorization` header |
| 401 | `Invalid or expired token` | Token bad or past its expiry |
| 401 | `Account not found` / `User account is deactivated` | Token valid, account gone or disabled |
| 403 | `Forbidden: insufficient permissions` | Role not one of the three allowed |
| 404 | `Notification not found` | Wrong id, or it belongs to someone else |
| 500 | `Failed to fetch notifications` | Server-side failure |

Access tokens are short-lived in production. A 401 with `Invalid or expired
token` means refresh and retry, not log out.

---

## Quick reference

| Method | Path (after the base URL) | Body |
|---|---|---|
| `GET` | `/inbox?page=1&limit=20` | none |
| `PATCH` | `/:id/read` | none |
| `DELETE` | `/:id` | none |
| `PATCH` | `/inbox/read-all` | none |
| `DELETE` | `/inbox/all` | none |

None of these take a request body.

---

## Flutter notes

- Use `unreadCount` for the bell badge rather than counting `items` — `items` is
  one page, the count is the whole inbox.
- On tap: `PATCH /:id/read`, then navigate using `link` if it is not empty.
- On swipe: `DELETE /:id`.
- Paginate by incrementing `page` until `page == pagination.totalPages`.

---

## Push notifications: a separate thing

The inbox is stored in the database. A push notification is delivered by
Firebase. **They are independent**: a broadcast writes the inbox row *and*
attempts a push, and the push can fail while the row is written — which looks
like "the notification exists in the app but my phone never buzzed".

For the device to receive anything, the app must register its FCM token:

```
POST /api/v1/fcm-tokens/mobile/save     mobile app
POST /api/v1/fcm-tokens/save            web / Chrome
DELETE /api/v1/fcm-tokens/remove        on logout
```

Both take the same `Authorization` header. Without this call the inbox still
fills up and no push ever arrives.
