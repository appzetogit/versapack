/**
 * Stock semantics checks. No framework, no fixtures — run it directly:
 *
 *   node Frontend/src/modules/Food/utils/productStock.selfcheck.mjs
 *
 * Mirrors the backend's selfcheck convention. The cases that matter most are
 * the `null` vs `0` ones: getting those backwards marks every product created
 * before stock tracking existed as sold out.
 */

import assert from "node:assert/strict"
import {
  STOCK_UNTRACKED,
  STOCK_OUT,
  STOCK_LOW,
  STOCK_IN,
  getStockState,
  getMaxOrderableQty,
  canAddMore,
  getStockLabel,
  getProductSubtitle,
  getMrpDisplay,
  isOrderable,
  matchStockError,
  findCartLineForStockError,
} from "./productStock.js"

// --- null is not 0 -----------------------------------------------------------

assert.equal(
  getStockState({ stockQty: null }),
  STOCK_UNTRACKED,
  "null stock must be untracked, not out of stock"
)
assert.equal(getStockState({}), STOCK_UNTRACKED, "missing stock field is untracked")
assert.equal(getStockState({ stockQty: 0 }), STOCK_OUT, "0 is out of stock")
assert.equal(isOrderable({ stockQty: null }), true, "untracked stays orderable")
assert.equal(isOrderable({ stockQty: 0 }), false, "empty shelf is not orderable")
assert.equal(getStockLabel({ stockQty: null }), null, "untracked gets no badge")

// --- low stock ---------------------------------------------------------------

assert.equal(getStockState({ stockQty: 3 }), STOCK_LOW, "3 left is low by default hint")
assert.equal(getStockState({ stockQty: 50 }), STOCK_IN, "50 left is comfortably in stock")
assert.equal(getStockLabel({ stockQty: 2 }), "Only 2 left")
assert.equal(getStockLabel({ stockQty: 50 }), null, "no badge when well stocked")

// A seller restocking at 50 should not make every product shout scarcity at the
// customer — their threshold is used only when tighter than the customer hint.
assert.equal(
  getStockState({ stockQty: 20, lowStockThreshold: 50 }),
  STOCK_IN,
  "seller's generous restock threshold must not drive customer scarcity text"
)
assert.equal(
  getStockState({ stockQty: 2, lowStockThreshold: 3 }),
  STOCK_LOW,
  "a tighter seller threshold still flags low"
)

// --- manual switch-off outranks stock ---------------------------------------

assert.equal(
  getStockState({ isAvailable: false, stockQty: 100 }),
  STOCK_OUT,
  "a seller hiding a product outranks a full shelf"
)

// --- caps --------------------------------------------------------------------

assert.equal(getMaxOrderableQty({ stockQty: null, maxQtyPerOrder: null }), null, "uncapped")
assert.equal(getMaxOrderableQty({ stockQty: 8, maxQtyPerOrder: null }), 8)
assert.equal(getMaxOrderableQty({ stockQty: null, maxQtyPerOrder: 3 }), 3)
assert.equal(
  getMaxOrderableQty({ stockQty: 8, maxQtyPerOrder: 3 }),
  3,
  "the tighter of shelf and per-order cap wins"
)
assert.equal(getMaxOrderableQty({ stockQty: 2, maxQtyPerOrder: 5 }), 2)

// --- canAddMore --------------------------------------------------------------

assert.equal(canAddMore({ stockQty: null }, 99).allowed, true, "untracked never blocks")
assert.equal(canAddMore({ stockQty: 0 }, 0).allowed, false)
assert.equal(canAddMore({ stockQty: 5 }, 4).allowed, true, "one more still fits")
assert.equal(canAddMore({ stockQty: 5 }, 5).allowed, false, "shelf exhausted")

const capped = canAddMore({ stockQty: 20, maxQtyPerOrder: 2 }, 2)
assert.equal(capped.allowed, false)
assert.equal(capped.reason, "max_per_order", "a per-order rule is not an empty shelf")
assert.match(capped.message, /at most 2/)

const depleted = canAddMore({ stockQty: 2, maxQtyPerOrder: 10 }, 2)
assert.equal(depleted.reason, "stock_limit")
assert.match(depleted.message, /Only 2 left/)

// --- catalog display ---------------------------------------------------------

assert.equal(getProductSubtitle({ brand: "Amul", packSize: "500 g" }), "Amul · 500 g")
assert.equal(getProductSubtitle({ brand: "", packSize: "1 L" }), "1 L", "blank brand is skipped")
assert.equal(getProductSubtitle({}), "", "nothing to say stays empty")

assert.equal(getMrpDisplay({ price: 100, mrp: null }), null, "no MRP, no strike-through")
assert.equal(
  getMrpDisplay({ price: 100, mrp: 100 }),
  null,
  "MRP equal to price is not a saving and must not be printed as one"
)
assert.equal(getMrpDisplay({ price: 120, mrp: 100 }), null, "MRP below price is not a saving")

const saving = getMrpDisplay({ price: 80, mrp: 100 })
assert.equal(saving.mrp, 100)
assert.equal(saving.discountPercent, 20)

// --- checkout stock errors ---------------------------------------------------

const only = matchStockError("Only 2 left of Amul Gold Milk 500 ml. Please reduce the quantity.")
assert.equal(only.kind, "stock_limit")
assert.equal(only.productName, "Amul Gold Milk 500 ml", "product name drives the highlight")

const gone = matchStockError("Tata Salt 1 kg just went out of stock")
assert.equal(gone.kind, "out_of_stock")
assert.equal(gone.productName, "Tata Salt 1 kg")

const capped2 = matchStockError("You can order at most 3 of Maggi Noodles")
assert.equal(capped2.kind, "max_per_order")
assert.equal(capped2.productName, "Maggi Noodles")

assert.equal(matchStockError("Payment failed"), null, "unrelated errors must not match")
assert.equal(matchStockError(""), null)
assert.equal(matchStockError(null), null)

const cartLines = [
  { id: "a", name: "Tata Salt 1 kg" },
  { id: "b", name: "Amul Gold Milk 500 ml" },
]
assert.equal(findCartLineForStockError(cartLines, "amul gold milk 500 ml").id, "b", "match is case-insensitive")
assert.equal(findCartLineForStockError(cartLines, "Nothing Here"), null)
assert.equal(findCartLineForStockError(null, "x"), null)

console.log("productStock selfcheck: all assertions passed")
