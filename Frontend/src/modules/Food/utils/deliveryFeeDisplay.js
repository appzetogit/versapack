/** Fixed 18% GST on delivery fee (matches backend order-pricing.service.js). */
export const DELIVERY_FEE_GST_RATE = 0.18

export function computeDeliveryFeeGst(deliveryFee) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  if (base <= 0) return 0
  return Math.round(base * DELIVERY_FEE_GST_RATE * 100) / 100
}

/** Use stored GST when present; otherwise derive 18% from base delivery fee. */
export function resolveDeliveryFeeGst(deliveryFee, deliveryFeeGst) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  if (base <= 0) return 0
  const stored = Number(deliveryFeeGst)
  if (Number.isFinite(stored) && stored > 0) return stored
  return computeDeliveryFeeGst(base)
}

export function getDeliveryFeeTotal(deliveryFee, deliveryFeeGst) {
  const base = Math.max(0, Number(deliveryFee) || 0)
  if (base <= 0) return 0
  const gst = resolveDeliveryFeeGst(base, deliveryFeeGst)
  return Math.round((base + gst) * 100) / 100
}

/**
 * Compact subtext for bill rows, e.g. "₹40.00 + ₹7.20 (GST 18%)"
 */
export function formatDeliveryFeeBreakdownSubtext(deliveryFee, deliveryFeeGst, rupee = "\u20B9") {
  const base = Math.max(0, Number(deliveryFee) || 0)
  if (base <= 0) return ""
  const gst = resolveDeliveryFeeGst(base, deliveryFeeGst)
  if (gst > 0) {
    return `${rupee}${base.toFixed(2)} + ${rupee}${gst.toFixed(2)} (GST 18%)`
  }
  return `${rupee}${base.toFixed(2)}`
}

/**
 * Format delivery fee for bill breakdown, e.g. "₹40.00 + 7.20 (GST 18%)"
 */
export function formatDeliveryFeeWithGst(deliveryFee, deliveryFeeGst, rupee = "\u20B9") {
  const base = Math.max(0, Number(deliveryFee) || 0)
  if (base <= 0) return "FREE"
  const gst =
    deliveryFeeGst != null && Number.isFinite(Number(deliveryFeeGst))
      ? Number(deliveryFeeGst)
      : computeDeliveryFeeGst(base)
  if (gst > 0) {
    return `${rupee}${base.toFixed(2)} + ${gst.toFixed(2)} (GST 18%)`
  }
  return `${rupee}${base.toFixed(2)}`
}
