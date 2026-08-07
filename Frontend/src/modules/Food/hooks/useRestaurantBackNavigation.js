import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router-dom"

const toRestaurantPath = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()

  if (!trimmed) return null
  if (trimmed.startsWith("/seller")) return trimmed
  if (trimmed === "/restaurant") return "/seller"
  if (trimmed.startsWith("/restaurant/")) return `/food${trimmed}`

  return null
}

const getNormalizedRestaurantPath = (pathname) => {
  if (pathname.startsWith("/seller")) {
    return pathname.slice("/seller".length) || "/"
  }

  return pathname || "/"
}

const resolveRestaurantBackPath = ({ pathname, state }) => {
  const normalizedPath = getNormalizedRestaurantPath(pathname)
  const explicitBackPath = toRestaurantPath(state?.backTo) || toRestaurantPath(state?.from)

  if (normalizedPath === "/orders/all") {
    return explicitBackPath || "/seller/explore"
  }

  if (/^\/orders\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || "/seller/orders/all"
  }

  if (
    normalizedPath === "/food/all" ||
    /^\/food\/[^/]+$/.test(normalizedPath) ||
    /^\/food\/[^/]+\/edit$/.test(normalizedPath)
  ) {
    return explicitBackPath || "/seller"
  }

  if (
    normalizedPath === "/advertisements/new" ||
    /^\/advertisements\/[^/]+$/.test(normalizedPath) ||
    /^\/advertisements\/[^/]+\/edit$/.test(normalizedPath)
  ) {
    return explicitBackPath || "/seller"
  }

  if (
    normalizedPath === "/coupon" ||
    normalizedPath === "/coupon/new" ||
    /^\/coupon\/[^/]+\/edit$/.test(normalizedPath)
  ) {
    return explicitBackPath || (normalizedPath === "/coupon" ? "/seller/explore" : "/seller/coupon")
  }

  if (
    normalizedPath === "/edit" ||
    normalizedPath === "/edit-owner" ||
    normalizedPath === "/edit-cuisines" ||
    normalizedPath === "/edit-address" ||
    normalizedPath === "/phone" ||
    normalizedPath === "/manage-outlets" ||
    normalizedPath === "/update-bank-details" ||
    normalizedPath === "/fssai" ||
    normalizedPath === "/fssai/update" ||
    normalizedPath === "/outlet-info" ||
    normalizedPath === "/outlet-timings" ||
    /^\/outlet-timings\/[^/]+$/.test(normalizedPath) ||
    normalizedPath === "/zone-setup"
  ) {
    return explicitBackPath || "/seller/explore"
  }

  if (
    normalizedPath === "/settings" ||
    normalizedPath === "/delivery-settings" ||
    normalizedPath === "/rush-hour" ||
    normalizedPath === "/status" ||
    normalizedPath === "/business-plan" ||
    normalizedPath === "/config" ||
    normalizedPath === "/categories" ||
    normalizedPath === "/menu-categories" ||
    normalizedPath === "/privacy" ||
    normalizedPath === "/terms"
  ) {
    return explicitBackPath || "/seller/explore"
  }

  if (
    normalizedPath === "/reviews" ||
    /^\/reviews\/[^/]+\/reply$/.test(normalizedPath) ||
    normalizedPath === "/ratings-reviews" ||
    normalizedPath === "/dish-ratings"
  ) {
    return explicitBackPath || "/seller/feedback"
  }

  if (
    normalizedPath === "/help-centre/support" ||
    normalizedPath === "/share-feedback"
  ) {
    return explicitBackPath || "/seller/feedback"
  }

  if (
    normalizedPath === "/finance-details" ||
    normalizedPath === "/download-report"
  ) {
    return explicitBackPath || "/seller/hub-finance"
  }

  if (/^\/hub-menu\/item\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || "/seller/explore"
  }

  if (explicitBackPath && explicitBackPath !== pathname) {
    return explicitBackPath
  }

  return "/seller"
}

export default function useRestaurantBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    navigate(resolveRestaurantBackPath(location))
  }, [location, navigate])
}
