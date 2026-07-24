const STORAGE_KEY = "food_auto_coupon_state"
const OPT_OUT_KEY = "food_auto_coupon_opt_out"
const USER_SELECTED_KEY = "food_auto_coupon_user_selected"

export const AUTO_COUPON_APPLIED_EVENT = "food_auto_coupon_applied"
export const AUTO_COUPON_STATE_EVENT = "food_auto_coupon_state"

export function getCartSignature(cart = []) {
  return (Array.isArray(cart) ? cart : [])
    .map((item) => `${item.itemId || item.id || item.lineItemId}:${Number(item.quantity) || 1}`)
    .sort()
    .join("|")
}

export function getCartSubtotal(cart = []) {
  return (Array.isArray(cart) ? cart : []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0,
  )
}

export function normalizeCouponFromApi(coupon, cartItem = null) {
  if (!coupon) return null
  const code = String(coupon.couponCode || coupon.code || "").trim().toUpperCase()
  if (!code) return null

  const originalPrice = Number(coupon.originalPrice)
  const discountedPrice = Number(coupon.discountedPrice)
  const flatDiscount =
    Number.isFinite(originalPrice) && Number.isFinite(discountedPrice)
      ? Math.max(0, originalPrice - discountedPrice)
      : Math.floor(Number(coupon.discount) || 0)

  return {
    code,
    discount: flatDiscount,
    discountPercentage: Number(coupon.discountPercentage) || undefined,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: coupon.maxDiscount,
    discountDisplay:
      coupon.discountType === "percentage" || coupon.discountPercentage
        ? `${Number(coupon.discountPercentage || coupon.discountValue || 0)}% OFF`
        : `₹${flatDiscount} OFF`,
    minOrder: Number(coupon.minOrderValue ?? coupon.minOrder ?? 0),
    description: coupon.description || coupon.title || "",
    customerGroup: coupon.customerGroup || "all",
    isGlobalCoupon: Boolean(coupon.isGlobalCoupon),
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : undefined,
    discountedPrice: Number.isFinite(discountedPrice) ? discountedPrice : undefined,
    itemId: cartItem?.itemId || cartItem?.id,
    itemName: cartItem?.name,
    autoApplied: true,
  }
}

export function estimateCouponDiscount(subtotal, coupon) {
  const base = Math.max(0, Number(subtotal) || 0)
  const minOrder = Number(coupon?.minOrder ?? coupon?.minOrderValue ?? 0)
  if (base < minOrder) return 0

  if (coupon?.discountType === "percentage" || coupon?.discountPercentage) {
    const pct = Number(coupon.discountPercentage ?? coupon.discountValue ?? 0)
    if (!Number.isFinite(pct) || pct <= 0) return 0
    let raw = base * (pct / 100)
    const maxDiscount = Number(coupon.maxDiscount)
    if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
      raw = Math.min(raw, maxDiscount)
    }
    return Math.max(0, Math.floor(raw))
  }

  if (
    Number.isFinite(Number(coupon?.originalPrice)) &&
    Number.isFinite(Number(coupon?.discountedPrice))
  ) {
    return Math.max(0, Number(coupon.originalPrice) - Number(coupon.discountedPrice))
  }

  return Math.max(0, Math.floor(Number(coupon?.discount) || 0))
}

export function isCouponLocallyEligible(coupon, subtotal, userOrderCount = 0) {
  if (!coupon?.code) return false
  if (coupon.customerGroup === "new" && userOrderCount > 0) return false
  const minOrder = Number(coupon.minOrder ?? coupon.minOrderValue ?? 0)
  if (subtotal < minOrder) return false
  return estimateCouponDiscount(subtotal, coupon) > 0
}

export function rankCouponsBySavings(coupons = [], subtotal, userOrderCount = 0) {
  return [...coupons]
    .filter((coupon) => isCouponLocallyEligible(coupon, subtotal, userOrderCount))
    .sort(
      (a, b) =>
        estimateCouponDiscount(subtotal, b) - estimateCouponDiscount(subtotal, a),
    )
}

export function readAutoCouponState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeAutoCouponState(state) {
  try {
    if (!state) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

function readJson(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (!value) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function syncCartPreferenceKeys(restaurantId, cartSignature) {
  const optOut = readJson(OPT_OUT_KEY)
  if (optOut && optOut.cartSignature !== cartSignature) {
    writeJson(OPT_OUT_KEY, null)
  }
  const userSelected = readJson(USER_SELECTED_KEY)
  if (userSelected && userSelected.cartSignature !== cartSignature) {
    writeJson(USER_SELECTED_KEY, null)
  }
}

export function isManualCouponOptOut(restaurantId, cartSignature) {
  const data = readJson(OPT_OUT_KEY)
  if (!data) return false
  return data.restaurantId === String(restaurantId) && data.cartSignature === cartSignature
}

export function markManualCouponOptOut(restaurantId, cartSignature) {
  writeJson(OPT_OUT_KEY, {
    restaurantId: String(restaurantId),
    cartSignature,
    at: Date.now(),
  })
}

export function isUserSelectedCoupon(restaurantId, cartSignature) {
  const data = readJson(USER_SELECTED_KEY)
  if (!data) return false
  return data.restaurantId === String(restaurantId) && data.cartSignature === cartSignature
}

export function markUserSelectedCoupon(restaurantId, cartSignature, code) {
  writeJson(USER_SELECTED_KEY, {
    restaurantId: String(restaurantId),
    cartSignature,
    code: String(code || "").toUpperCase(),
    at: Date.now(),
  })
}

export function clearUserCouponPreferences() {
  writeJson(OPT_OUT_KEY, null)
  writeJson(USER_SELECTED_KEY, null)
}

export function dispatchAutoCouponApplied(detail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AUTO_COUPON_APPLIED_EVENT, { detail }))
}

export function dispatchAutoCouponState(detail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AUTO_COUPON_STATE_EVENT, { detail }))
}

export function buildCartItemsForPricing(cart = []) {
  return cart.map((item) => ({
    itemId: item.itemId || item.id,
    name: item.name,
    price: item.price,
    variantId: item.variantId || undefined,
    variantName: item.variantName || undefined,
    variantPrice: item.variantPrice || item.price,
    quantity: item.quantity || 1,
    image: item.image,
    description: item.description,
    isVeg: item.isVeg !== false,
  }))
}
