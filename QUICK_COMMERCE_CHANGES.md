# Quick Commerce Conversion

What changed when this backend moved from food delivery to quick commerce with
third-party sellers, and what the apps need to do about it.

Nothing here removes an existing endpoint or renames a field. Order statuses,
dispatch, payments, tracking and the seller acceptance flow are unchanged. A
client that ignores this document keeps working; it just will not show stock,
per-product tax or a delivery promise.

---

## 1. Inventory

Products now carry a count. Before this, availability was a boolean and nothing
was ever decremented — fine for a kitchen, wrong for a shelf.

**New fields on a product**

| Field | Meaning |
|---|---|
| `stockQty` | Units on hand. `null` means untracked — the product behaves exactly as it did before. |
| `lowStockThreshold` | At or below this, the product appears in the seller's low-stock list. `null` disables. |
| `maxQtyPerOrder` | Cap for a single order, so one buyer cannot clear the shelf. `null` = uncapped. |

**`null` is not `0`.** Untracked and out-of-stock are different states and the
apps must not render them the same way. Every product created before this change
has `stockQty: null`.

**How stock moves**

Units are claimed when the order is created, using a conditional update, so two
customers cannot both buy the last one. Orders awaiting online payment hold
their units too — otherwise the hold means nothing at the moment it matters —
and the existing 30-minute pending-payment cleanup returns them.

Units are returned when an order dies, from any path: user cancel, seller
cancel, admin cancel, acceptance timeout, admin delete, or a failed wallet
debit. This is guarded so it can only happen once per order.

A product is hidden automatically when its count reaches zero, and comes back
when restocked — unless the seller switched it off by hand, which outranks a
restock.

**Errors the checkout can now return** (all HTTP 400, `ValidationError`):

- `Only 2 left of <product>. Please reduce the quantity.`
- `<product> just went out of stock`
- `You can order at most <n> of <product>`

These name the product deliberately — the cart screen should highlight that
line rather than showing a generic failure.

**Not built:** partial fulfilment. A seller who finds one of six items missing
cancels the whole order (full refund, full restock). Item-level removal needs
order editing, which does not exist in this codebase.

### Seller endpoints

```
PATCH /api/v1/food/foods/stock
```
Body is either an array or `{ items: [...] }`. Each entry takes `itemId` plus
any of `stockQty`, `lowStockThreshold`, `maxQtyPerOrder`, `isAvailable`.
Max 500 entries.

Returns `{ updated, failed, updatedCount, failedCount }` — per-item results, so
one bad id does not discard the rest of a stock-take.

```
GET /api/v1/food/foods/low-stock
```
Products at or below their own threshold, lowest first.

---

## 2. Catalog

**New product fields:** `brand`, `packSize` (free text: `"500 g"`, `"pack of
6"`), `mrp`, `gstRate`.

`mrp` is the printed maximum retail price, shown struck through. It is separate
from `otherPrice`, which is a compare-against-other-platforms number. Selling
above MRP is illegal and is refused on both create and update.

`gstRate` is the product's own GST percentage. `null` falls back to the
order-wide rate in fee settings, which is what every pre-existing product does.

**Categories can nest one level.** A category may have `parentId`. Unset means
top level. Two levels is the ceiling and it is enforced from both directions:
nothing nests under a subcategory, and a category with children cannot be
demoted into one. Pass `parentId: ""` to promote back to top level.

---

## 3. Tax

GST is computed per line instead of once across the basket. Groceries span
0/5/12/18%, so a single basket rate over- or under-charges depending on what
was bought.

A basket coupon reduces every line in proportion to its share, because a
basket-level discount is not attributable to any one product. Lines are summed
before rounding.

For a basket where no product has its own rate, the result is identical to the
old arithmetic — this is not a repricing of existing orders.

Order lines now store the `gstRate` they were charged at, alongside `brand` and
`packSize`, so an invoice stays truthful after a product is reclassified.

---

## 4. Serviceability

The delivery address is now checked against the zone polygons at order time.

Previously the client detected a zone once — wherever the customer happened to
be standing — and passed the id down. Choosing a different saved address at
checkout never re-ran the detection, so an order could be placed to an address
outside the zone entirely.

- `We don't deliver to this address yet` — the address is in no active zone.
- `This seller does not deliver to the selected address` — the address is in a
  different zone than the seller's.

The order stores the zone the **server** resolved, not the one the client sent.

Addresses saved before coordinates were captured cannot be tested and are
allowed through — refusing them would block real customers over data they never
entered. Apps should send coordinates with every address.

---

## 5. Product search

```
GET /api/v1/food/search/products?q=milk&zoneId=...&categoryId=...&isVeg=true&inStockOnly=true&page=1&limit=20
```

Returns a product grid: `{ products, total, page, limit, zoneFiltered }`. Each
product carries `inStock` and a `seller` object (`name`, `image`, `rating`,
`isAcceptingOrders`, `estimatedDeliveryTime`).

Matches on product name **and** brand. Out-of-stock products sink to the bottom
rather than disappearing — a shopper looking for something we carry but cannot
sell today is better told that than shown an empty grid.

**No zone fallback.** Unlike `/search/unified`, this never silently widens to
other zones: a cart built from sellers who cannot reach the address is a cart
checkout will refuse.

`/search/unified` is unchanged and still returns a seller list.

---

## 6. Delivery promise

`pricing.deliveryPromiseMinutes` is returned by the price-calculation endpoint,
so the wait can be shown **before** the customer commits.

The live ETA object gained `promiseMinutes` alongside the existing `minutes`:

- `minutes` — the rider's journey to wherever they are currently heading. Before
  pickup that is the seller's counter. This is the number the map needs.
- `promiseMinutes` — what the customer is actually waiting for: packing, the
  ride to the seller, then the ride to the door, with the first two overlapping
  because a rider riding while the order is packed costs the longer of the two,
  not both.

**Show `promiseMinutes` to customers.** `minutes` alone reads late from the
moment the order is placed. Both come from the same constants as the checkout
quote, so the two screens cannot disagree.

Packing time defaults to 3 minutes (`PACKING_MINUTES`).

---

## 7. Dispatch

Rider search radius bands drop from 15/25/40/60 km to **3/5/8/12 km**. A rider
40 km from the seller cannot serve a promise measured in minutes; offering to
them mostly delays the escalation that would have got the order delivered.

Override without a deploy: `DISPATCH_RADIUS_BANDS_KM=3,5,8,12`.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DISPATCH_RADIUS_BANDS_KM` | `3,5,8,12` | Rider search radius per attempt |
| `PACKING_MINUTES` | `3` | Packing time in the delivery promise |

---

## Checks

No framework, no fixtures — run them directly:

```bash
node Backend/src/modules/food/orders/inventory.selfcheck.mjs
node Backend/src/modules/food/orders/pricing.selfcheck.mjs
node Backend/src/modules/food/orders/promise.selfcheck.mjs
node Backend/src/modules/food/shared/zoneServiceability.selfcheck.mjs
```

These cover the pure arithmetic and the polygon test. The atomic stock
decrement, the partial rollback and the restock claim are single Mongo
operations and **have not been exercised against a database yet** — simulating
them would test a copy of the semantics rather than the semantics. Do that
before production.

---

## Still open

- **Partial fulfilment** — needs order editing; today it is fulfil-fully or
  cancel-fully.
- **Master catalog** — sellers type their own product names, so expect several
  spellings of the same product. Item approval is the manual dedup point for
  now.
- **Per-variant stock** — counts are per product; variants (pack sizes) share
  one number.
- **Search at scale** — regex, not a text index, deliberately: it matches
  prefixes and mid-word, which a text index does not. Revisit if a zone's
  catalog outgrows a bounded scan.
- **Zone geometry** — zones are plain lat/lng arrays, so the polygon test runs
  in Node rather than Mongo. Store as GeoJSON with a 2dsphere index if the zone
  list gets long.
