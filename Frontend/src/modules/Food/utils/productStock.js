/**
 * Stock semantics for the quick-commerce catalog.
 *
 * The backend added `stockQty`, `lowStockThreshold` and `maxQtyPerOrder` to
 * products (see QUICK_COMMERCE_CHANGES.md). The one rule that matters most:
 *
 *   `null` is not `0`.
 *
 * `null` means the seller never opted this product into stock tracking — it
 * behaves exactly like it did in the food-delivery era, always orderable.
 * `0` means the shelf is empty. Rendering those two the same way would mark
 * every legacy product as sold out, so every read of `stockQty` goes through
 * here rather than being compared inline.
 */

export const STOCK_UNTRACKED = "untracked"
export const STOCK_OUT = "out"
export const STOCK_LOW = "low"
export const STOCK_IN = "in"

/**
 * How few units left before the customer sees a scarcity hint. The seller's own
 * `lowStockThreshold` drives their restock list and is often much higher (a
 * shop may reorder at 50), so it is used only when it is tighter than this.
 */
const CUSTOMER_LOW_STOCK_HINT = 5

const toCount = (value) => {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Products arrive from several endpoints with slightly different shapes. */
const readStockQty = (product) => toCount(product?.stockQty)
const readLowStockThreshold = (product) => toCount(product?.lowStockThreshold)
const readMaxQtyPerOrder = (product) => toCount(product?.maxQtyPerOrder)

/**
 * A seller can switch a product off by hand. The backend treats that as
 * outranking stock — a restock does not bring back something manually hidden —
 * so it is checked before the count.
 */
export const isManuallyUnavailable = (product) =>
  product?.isAvailable === false

export const getStockState = (product) => {
  if (isManuallyUnavailable(product)) return STOCK_OUT

  const qty = readStockQty(product)
  if (qty === null) return STOCK_UNTRACKED
  if (qty <= 0) return STOCK_OUT

  const sellerThreshold = readLowStockThreshold(product)
  const hintAt =
    sellerThreshold === null
      ? CUSTOMER_LOW_STOCK_HINT
      : Math.min(sellerThreshold, CUSTOMER_LOW_STOCK_HINT)

  return qty <= hintAt ? STOCK_LOW : STOCK_IN
}

export const isOutOfStock = (product) => getStockState(product) === STOCK_OUT

export const isOrderable = (product) => !isOutOfStock(product)

/**
 * The most units a customer may hold of this product, as the smaller of what is
 * on the shelf and what one order is allowed to take. `null` means uncapped —
 * an untracked product with no per-order cap.
 */
export const getMaxOrderableQty = (product) => {
  const qty = readStockQty(product)
  const cap = readMaxQtyPerOrder(product)

  if (qty === null && cap === null) return null
  if (qty === null) return cap
  if (cap === null) return qty
  return Math.min(qty, cap)
}

/**
 * Whether one more unit can be added, and why not when it cannot.
 *
 * The reasons mirror what checkout would reject with, so the cart can say the
 * same thing before the customer gets there rather than failing at payment.
 */
export const canAddMore = (product, currentQty = 0) => {
  if (isOutOfStock(product)) {
    return { allowed: false, reason: "out_of_stock", message: "Out of stock" }
  }

  const max = getMaxOrderableQty(product)
  if (max === null || currentQty < max) return { allowed: true }

  const cap = readMaxQtyPerOrder(product)
  const qty = readStockQty(product)

  // Which limit was hit changes the wording: a per-order cap is a rule, an
  // empty shelf is a fact, and telling the customer the wrong one is confusing.
  if (cap !== null && cap <= (qty ?? Infinity)) {
    return {
      allowed: false,
      reason: "max_per_order",
      message: `You can order at most ${cap} of this item`,
    }
  }

  return {
    allowed: false,
    reason: "stock_limit",
    message: `Only ${max} left`,
  }
}

/**
 * Short badge text for a product tile, or `null` when there is nothing worth
 * saying. Untracked and comfortably-stocked products get no badge — a badge on
 * everything is noise that stops meaning anything.
 */
export const getStockLabel = (product) => {
  const state = getStockState(product)
  if (state === STOCK_OUT) return "Out of stock"
  if (state === STOCK_LOW) {
    const qty = readStockQty(product)
    return `Only ${qty} left`
  }
  return null
}

/** Pack size and brand, joined for the one line under a product name. */
export const getProductSubtitle = (product) => {
  const parts = [product?.brand, product?.packSize].filter(
    (part) => typeof part === "string" && part.trim() !== ""
  )
  return parts.join(" · ")
}

/**
 * MRP is shown struck through next to the selling price, but only when it is
 * genuinely higher — an MRP equal to (or below) the price is not a saving and
 * printing it as one is misleading.
 */
export const getMrpDisplay = (product) => {
  const mrp = toCount(product?.mrp)
  const price = toCount(product?.price)

  if (mrp === null || price === null || mrp <= price) return null

  const discountPercent = Math.round(((mrp - price) / mrp) * 100)
  return { mrp, discountPercent }
}
