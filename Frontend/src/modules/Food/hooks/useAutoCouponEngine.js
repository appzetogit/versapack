import { useEffect, useRef } from "react"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { orderAPI, restaurantAPI } from "@food/api"
import {
  AUTO_COUPON_APPLIED_EVENT,
  buildCartItemsForPricing,
  dispatchAutoCouponApplied,
  dispatchAutoCouponState,
  getCartSignature,
  getCartSubtotal,
  isManualCouponOptOut,
  isUserSelectedCoupon,
  normalizeCouponFromApi,
  rankCouponsBySavings,
  syncCartPreferenceKeys,
  writeAutoCouponState,
} from "@food/utils/autoCoupon"

const formatAddressForPricing = (address) => {
  if (!address || typeof address !== "object") return null
  return {
    label: address.label || "Home",
    name: address.name || address.fullName || "",
    fullName: address.fullName || address.name || "",
    street: address.street || "",
    additionalDetails: address.additionalDetails || "",
    city: address.city || "",
    state: address.state || "",
    zipCode: address.zipCode || "",
    phone: address.phone || "",
    location: address.location,
    formattedAddress: address.formattedAddress || address.address || "",
  }
}

async function fetchRestaurantCoupons(restaurantId, cart, subtotal) {
  const unique = new Map()
  for (const cartItem of cart) {
    const itemId = cartItem.itemId || cartItem.id
    if (!itemId) continue
    try {
      const response = await restaurantAPI.getCouponsByItemIdPublic(restaurantId, itemId, subtotal)
      const coupons = response?.data?.data?.coupons
      if (!Array.isArray(coupons)) continue
      coupons.forEach((coupon) => {
        const normalized = normalizeCouponFromApi(coupon, cartItem)
        if (normalized && !unique.has(normalized.code)) {
          unique.set(normalized.code, normalized)
        }
      })
    } catch {
      // ignore per-item fetch errors
    }
  }
  return Array.from(unique.values())
}

async function validateCouponWithBackend({
  cart,
  restaurantId,
  deliveryAddress,
  couponCode,
  deliveryMode = "basic",
}) {
  const response = await orderAPI.calculateOrder({
    items: buildCartItemsForPricing(cart),
    restaurantId,
    deliveryAddress,
    couponCode,
    deliveryMode,
  })
  const pricing = response?.data?.data?.pricing
  if (!pricing?.appliedCoupon) return null
  return {
    pricing,
    savings: Number(pricing.appliedCoupon.discount) || 0,
    code: String(pricing.appliedCoupon.code || couponCode).toUpperCase(),
  }
}

export default function useAutoCouponEngine({ deliveryMode = "basic", enabled = true } = {}) {
  const { cart } = useCart()
  const { getDefaultAddress } = useProfile()
  const lastAppliedCodeRef = useRef("")
  const runningRef = useRef(false)
  const userOrderCountRef = useRef(0)

  useEffect(() => {
    let active = true
    orderAPI
      .getOrders({ page: 1, limit: 1 })
      .then((response) => {
        if (!active) return
        userOrderCountRef.current = Number(response?.data?.data?.pagination?.total) || 0
      })
      .catch(() => {
        userOrderCountRef.current = 0
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined

    const restaurantId = cart[0]?.restaurantId
    const cartSignature = getCartSignature(cart)
    const subtotal = getCartSubtotal(cart)

    if (!cart.length || !restaurantId) {
      lastAppliedCodeRef.current = ""
      writeAutoCouponState(null)
      dispatchAutoCouponState({ action: "clear" })
      return undefined
    }

    syncCartPreferenceKeys(restaurantId, cartSignature)

    if (isManualCouponOptOut(restaurantId, cartSignature)) {
      return undefined
    }

    if (isUserSelectedCoupon(restaurantId, cartSignature)) {
      return undefined
    }

    const timer = setTimeout(async () => {
      if (runningRef.current) return
      runningRef.current = true

      try {
        const coupons = await fetchRestaurantCoupons(restaurantId, cart, subtotal)
        const ranked = rankCouponsBySavings(coupons, subtotal, userOrderCountRef.current)

        if (!ranked.length) {
          if (lastAppliedCodeRef.current) {
            lastAppliedCodeRef.current = ""
            writeAutoCouponState(null)
            dispatchAutoCouponState({ action: "clear" })
          }
          return
        }

        const defaultAddress = getDefaultAddress?.()
        const deliveryAddress = formatAddressForPricing(defaultAddress)
        const hasAddress = Boolean(
          deliveryAddress &&
            (deliveryAddress.street || deliveryAddress.formattedAddress || deliveryAddress.city),
        )

        const userSelected = isUserSelectedCoupon(restaurantId, cartSignature)
        const storedCode = lastAppliedCodeRef.current

        let bestMatch = null

        if (hasAddress) {
          const tryOrder = [...ranked]
          if (storedCode) {
            const current = ranked.find((c) => c.code === storedCode)
            if (current) {
              tryOrder.splice(tryOrder.indexOf(current), 1)
              tryOrder.unshift(current)
            }
          }

          for (const coupon of tryOrder) {
            try {
              const validated = await validateCouponWithBackend({
                cart,
                restaurantId,
                deliveryAddress,
                couponCode: coupon.code,
                deliveryMode,
              })
              if (validated) {
                bestMatch = { coupon, ...validated }
                break
              }
            } catch {
              // try next coupon
            }
          }
        } else {
          const coupon = ranked[0]
          const savings = Number(coupon.discount) || 0
          if (savings > 0) {
            bestMatch = {
              coupon,
              pricing: null,
              savings,
              code: coupon.code,
              estimated: true,
            }
          }
        }

        if (!bestMatch) {
          if (lastAppliedCodeRef.current) {
            lastAppliedCodeRef.current = ""
            writeAutoCouponState(null)
            dispatchAutoCouponState({ action: "clear" })
          }
          return
        }

        const { coupon, pricing, savings, code, estimated } = bestMatch
        const isNewCode = code !== lastAppliedCodeRef.current

        lastAppliedCodeRef.current = code
        writeAutoCouponState({
          code,
          savings,
          restaurantId: String(restaurantId),
          cartSignature,
          estimated: Boolean(estimated),
          at: Date.now(),
        })

        dispatchAutoCouponState({
          action: "apply",
          coupon: { ...coupon, discount: savings, autoApplied: !userSelected },
          code,
          savings,
          pricing,
          estimated: Boolean(estimated),
        })

        if (isNewCode) {
          dispatchAutoCouponApplied({
            code,
            savings,
            estimated: Boolean(estimated),
            message: estimated
              ? "Best Offer Found!"
              : savings > 0
                ? `Congratulations! You saved ₹${Math.round(savings)}`
                : "Best Coupon Applied Automatically",
          })
        }
      } finally {
        runningRef.current = false
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [cart, enabled, deliveryMode, getDefaultAddress])

  return null
}
