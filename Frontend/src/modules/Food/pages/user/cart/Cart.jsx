import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Minus, ArrowLeft, ChevronRight, Clock, MapPin, Phone, FileText, Utensils, Tag, Percent, Share2, ChevronUp, ChevronDown, X, Check, Settings, CreditCard, Wallet, Building2, Sparkles, Banknote, Zap, CheckCircle2, MessageCircle, Send, Mail, Copy, Home, Briefcase, Pencil, Square, Receipt, ShoppingCart, DoorOpen, PhoneOff, BellOff } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"

import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { useOrders } from "@food/context/OrdersContext"
import { useLocation as useUserLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { orderAPI, restaurantAPI, adminAPI, userAPI, API_ENDPOINTS } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import { getCachedFeeSettings, loadCorePublicAppConfig } from "@food/services/publicAppConfig"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import {
  calculateDistanceKm,
  normalizeLocationForPricing,
  normalizeRestaurantLocation,
} from "@food/utils/geo"
import {
  fetchDrivingDistanceKm,
  fetchDrivingDistancesMatrix,
  formatDistanceLabel,
} from "@food/utils/roadDistance"
import { computeDeliveryFeeGst, formatDeliveryFeeBreakdownSubtext, getDeliveryFeeTotal, resolveDeliveryFeeGst } from "@food/utils/deliveryFeeDisplay"
import { getCartCompareItemTotal } from "@food/utils/foodVariants"
import { DualMoney } from "@food/components/user/FoodPriceDisplay"
import {
  AUTO_COUPON_STATE_EVENT,
  getCartSignature,
  isManualCouponOptOut,
  markManualCouponOptOut,
  markUserSelectedCoupon,
} from "@food/utils/autoCoupon"
import CartAutoCouponBanner from "@food/components/user/CartAutoCouponBanner"
import zoopSound from "@food/assets/audio/zomato_sms.mp3"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }



// Removed hardcoded suggested items - now fetching approved addons from backend
// Coupons will be fetched from backend based on items in cart

/**
 * Format full address string from address object
 * @param {Object} address - Address object with street, additionalDetails, city, state, zipCode, or formattedAddress
 * @returns {String} Formatted address string
 */
const formatFullAddress = (address) => {
  if (!address) return ""

  const looksLikeLatLng = (s) => {
    if (!s) return false
    const v = String(s).trim()
    // Matches "12.34, 56.78" (lat,lng) with optional decimals/spaces
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)
  }

  // Priority 1: Use formattedAddress if available (for live location addresses)
  if (address.formattedAddress && address.formattedAddress !== "Select location") {
    // If formattedAddress is still raw coordinates, don't show it as-is.
    // Fall back to composing from city/state/area instead.
    if (!looksLikeLatLng(address.formattedAddress)) {
      return address.formattedAddress
    }
  }

  // Priority 2: Build address from parts
  const addressParts = []
  if (address.street) addressParts.push(address.street)
  if (address.additionalDetails) addressParts.push(address.additionalDetails)
  if (address.city) addressParts.push(address.city)
  if (address.state) addressParts.push(address.state)
  if (address.zipCode) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  // Priority 3: Use address field if available
  if (address.address && address.address !== "Select location") {
    return address.address
  }

  return ""
}

const RUPEE_SYMBOL = "\u20B9"
const CART_RECIPIENT_DETAILS_STORAGE_KEY = "food-cart-recipient-details-v1"
const CART_ORDER_NOTE_STORAGE_KEY = "food-cart-order-note-v1"
const CART_DELIVERY_PREFS_STORAGE_KEY = "food-cart-delivery-prefs-v1"
const RECIPIENT_NAME_REGEX = /^[A-Za-z ]+$/
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

const PREDEFINED_DELIVERY_INSTRUCTIONS = [
  { id: "leave_at_door", label: "Leave at the door", Icon: DoorOpen },
  { id: "avoid_calling", label: "Avoid calling", Icon: PhoneOff },
  { id: "avoid_bell", label: "Avoid ringing bell", Icon: BellOff },
]

const getConfiguredQuickDeliveryFee = (feeSettings = {}) => {
  const configured = Number(feeSettings?.quickDeliveryFee)
  return Number.isFinite(configured) && configured >= 0 ? configured : 0
}

const buildDeliveryInstructionsText = ({
  deliveryInstructionMode = "preset",
  selectedDeliveryInstruction = null,
  customDeliveryInstruction = "",
}) => {
  if (deliveryInstructionMode === "custom") {
    return String(customDeliveryInstruction || "").trim()
  }
  if (!selectedDeliveryInstruction) return ""
  const preset = PREDEFINED_DELIVERY_INSTRUCTIONS.find((item) => item.id === selectedDeliveryInstruction)
  return preset?.label || ""
}

const clearCartInstructionStorage = () => {
  try {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
    window.localStorage.removeItem(CART_DELIVERY_PREFS_STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}

const resolveFallbackDeliveryFee = ({
  feeSettings = {},
  restaurantData = null,
  defaultAddress = null,
  distanceKmOverride = null,
}) => {
  const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
    ? [...feeSettings.deliveryFeeRanges]
    : []
  const rangeFees = ranges
    .map((range) => Number(range?.fee))
    .filter((fee) => Number.isFinite(fee) && fee >= 0)

  const flat = Number(feeSettings.deliveryFee)
  const hasPositiveFlat = Number.isFinite(flat) && flat > 0

  const distanceKm = Number.isFinite(Number(distanceKmOverride))
    ? Number(distanceKmOverride)
    : calculateDistanceKm(restaurantData, defaultAddress)
  if (Number.isFinite(distanceKm) && ranges.length > 0) {
      const sortedRanges = ranges.sort((a, b) => Number(a.min) - Number(b.min))
      for (let i = 0; i < sortedRanges.length; i += 1) {
        const range = sortedRanges[i]
        const min = Number(range.min)
        const max = Number(range.max)
        const fee = Number(range.fee)
        const isLastRange = i === sortedRanges.length - 1
        const inRange = isLastRange
          ? distanceKm >= min && distanceKm <= max
          : distanceKm >= min && distanceKm < max

        if (inRange && Number.isFinite(fee)) return fee
      }
  }

  if (rangeFees.length > 0) {
    return hasPositiveFlat ? flat : Math.min(...rangeFees)
  }

  return Number.isFinite(flat) && flat >= 0 ? flat : 0
}

const normalizeRestaurantForPricing = (restaurant) => {
  if (!restaurant || typeof restaurant !== "object") return restaurant
  if (!restaurant.location) return restaurant
  return {
    ...restaurant,
    location: normalizeRestaurantLocation(restaurant.location),
  }
}

const buildEffectiveCartPricing = ({
  cart = [],
  pricing = null,
  feeSettings = {},
  defaultAddress = null,
  restaurantData = null,
  appliedCoupon = null,
  deliveryMode = "basic",
  roadDistanceKm = null,
}) => {
  const subtotal =
    pricing?.subtotal ||
    cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)

  const fallbackDeliveryFee = resolveFallbackDeliveryFee({
    feeSettings,
    restaurantData,
    defaultAddress,
    distanceKmOverride: roadDistanceKm,
  })

  // When backend pricing is available, trust it so cart total matches payment amount.
  const hasServerPricing =
    pricing != null && Number.isFinite(Number(pricing.total)) && Number(pricing.total) >= 0

  if (hasServerPricing) {
    const serverDeliveryFee = Number(pricing.deliveryFee)
    const serverDeliveryFeeGst = Number(pricing.deliveryFeeGst)
    const serverPlatformFee = Number(pricing.platformFee)
    const serverTax = Number(pricing.tax)
    const serverDiscount = Number(pricing.discount)
    const serverTotal = Number(pricing.total)
    const quickDeliveryFee =
      deliveryMode === "quick"
        ? Number(pricing.quickDeliveryFee) || getConfiguredQuickDeliveryFee(feeSettings)
        : 0

    return {
      subtotal: Number.isFinite(Number(pricing.subtotal)) ? Number(pricing.subtotal) : subtotal,
      tax: Number.isFinite(serverTax) ? serverTax : 0,
      packagingFee: Number(pricing.packagingFee) || 0,
      deliveryFee: Number.isFinite(serverDeliveryFee) ? serverDeliveryFee : 0,
      deliveryFeeGst: Number.isFinite(serverDeliveryFeeGst)
        ? serverDeliveryFeeGst
        : computeDeliveryFeeGst(Number.isFinite(serverDeliveryFee) ? serverDeliveryFee : 0),
      platformFee: Number.isFinite(serverPlatformFee) ? serverPlatformFee : 0,
      quickDeliveryFee,
      discount: Number.isFinite(serverDiscount) ? serverDiscount : 0,
      total: serverTotal,
      savings: Number.isFinite(Number(pricing.savings))
        ? Number(pricing.savings)
        : Math.max(0, subtotal + (Number.isFinite(serverDeliveryFee) ? serverDeliveryFee : 0) + (Number.isFinite(serverDeliveryFeeGst) ? serverDeliveryFeeGst : 0) + (Number.isFinite(serverPlatformFee) ? serverPlatformFee : 0) + (Number.isFinite(serverTax) ? serverTax : 0) - serverTotal),
      couponCode: pricing?.couponCode || pricing?.appliedCoupon?.code || appliedCoupon?.code || "",
      deliveryFeeBreakdown: pricing?.deliveryFeeBreakdown || null,
      appliedCoupon: pricing?.appliedCoupon || appliedCoupon || null,
      deliveryMode: deliveryMode === "quick" ? "quick" : "basic",
    }
  }

  // Mirror of backend order-pricing: discount clamped to subtotal, GST on post-discount base.
  const deliveryFee = fallbackDeliveryFee
  const deliveryFeeGst = computeDeliveryFeeGst(deliveryFee)
  const basePlatformFee = Number(feeSettings.platformFee || 0)
  const quickDeliveryFee = deliveryMode === "quick" ? getConfiguredQuickDeliveryFee(feeSettings) : 0
  const platformFee = basePlatformFee + quickDeliveryFee
  const discount = appliedCoupon
    ? Math.max(0, Math.min(Math.floor(Number(appliedCoupon.discount) || 0), subtotal))
    : 0
  const gstCharges = Math.round(Math.max(0, subtotal - discount) * (Number(feeSettings.gstRate || 0) / 100))
  const totalBeforeDiscount = subtotal + deliveryFee + deliveryFeeGst + platformFee + gstCharges
  const total = Math.max(0, subtotal + deliveryFee + deliveryFeeGst + platformFee + gstCharges - discount)
  const savings = Math.max(0, totalBeforeDiscount - total)

  return {
    subtotal,
    tax: gstCharges,
    packagingFee: 0,
    deliveryFee,
    deliveryFeeGst,
    platformFee,
    quickDeliveryFee,
    discount,
    total,
    savings,
    couponCode: appliedCoupon?.code || "",
    deliveryFeeBreakdown: null,
    appliedCoupon: appliedCoupon || null,
    deliveryMode: deliveryMode === "quick" ? "quick" : "basic",
  }
}

export default function Cart() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const orderSuccessAudioRef = useRef(null)
  const hasRestoredRecipientRef = useRef(false)
  const appliedCouponRef = useRef(null)

  // Defensive check: Ensure CartProvider is available
  let cartContext;
  try {
    cartContext = useCart();
  } catch (error) {
    debugError('? CartProvider not found. Make sure Cart component is rendered within UserLayout.');
    // Return early with error message
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cart Error</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Cart functionality is not available. Please refresh the page.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const { cart, updateQuantity, addToCart, getCartCount, clearCart, cleanCartForRestaurant, replaceCart } = cartContext;
  const { getDefaultAddress, getDefaultPaymentMethod, setDefaultAddress, addresses, paymentMethods, userProfile, vegMode } = useProfile()
  const { createOrder } = useOrders()
  const { location: currentLocation, loading: currentLocationLoading } = useUserLocation() // Get live location address

  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState("")
  const [manualCouponCode, setManualCouponCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("razorpay")
  const [showPaymentSheet, setShowPaymentSheet] = useState(false)
  const [showAddressSheet, setShowAddressSheet] = useState(false)
  const [showCookingSheet, setShowCookingSheet] = useState(false)
  const [showOffersView, setShowOffersView] = useState(false)
  const [deliverySectionTab, setDeliverySectionTab] = useState("modes")
  const [deliveryMode, setDeliveryMode] = useState("basic")
  const [selectedDeliveryInstruction, setSelectedDeliveryInstruction] = useState(null)
  const [deliveryInstructionMode, setDeliveryInstructionMode] = useState("preset")
  const [customDeliveryInstruction, setCustomDeliveryInstruction] = useState("")
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [note, setNote] = useState("")
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [isEditingRecipient, setIsEditingRecipient] = useState(false)
  const [recipientDetails, setRecipientDetails] = useState({
    name: "",
    phone: "",
  })

  const [sendCutlery, setSendCutlery] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [showBillDetails, setShowBillDetails] = useState(true)
  const [showPlacingOrder, setShowPlacingOrder] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")
  const [orderProgress, setOrderProgress] = useState(0)
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState(null)
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    try {
      if (typeof window === "undefined") return "saved"
      return localStorage.getItem("deliveryAddressMode") || "saved"
    } catch {
      return "saved"
    }
  })

  useEffect(() => {
    const audio = new Audio(zoopSound)
    audio.preload = "auto"
    audio.volume = 0.8
    orderSuccessAudioRef.current = audio

    return () => {
      if (orderSuccessAudioRef.current) {
        orderSuccessAudioRef.current.pause()
        orderSuccessAudioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!showOrderSuccess || !orderSuccessAudioRef.current) return

    orderSuccessAudioRef.current.currentTime = 0
    orderSuccessAudioRef.current.play().catch((error) => {
      debugWarn("Order success sound blocked by browser:", error?.message || error)
    })
  }, [showOrderSuccess])

  // Restaurant and pricing state
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [pricing, setPricing] = useState(null)
  const [loadingPricing, setLoadingPricing] = useState(false)
  // Same Google road Rest→User distance as Home / delivery (overrides Haversine 6.9).
  const [roadDistanceKm, setRoadDistanceKm] = useState(null)
  const [addressRoadKmById, setAddressRoadKmById] = useState({})

  // Addons state
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)

  // Coupons state - fetched from backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [userOrderCount, setUserOrderCount] = useState(0)
  const [availabilityTick, setAvailabilityTick] = useState(() => Date.now())

  useEffect(() => {
    appliedCouponRef.current = appliedCoupon
  }, [appliedCoupon])

  useEffect(() => {
    const onAutoCouponState = (event) => {
      const detail = event?.detail || {}
      const resolvedRestaurantId =
        restaurantData?.restaurantId || restaurantData?._id || cart[0]?.restaurantId
      const cartSignature = getCartSignature(cart)

      if (!resolvedRestaurantId || !cart.length) return
      if (isManualCouponOptOut(resolvedRestaurantId, cartSignature)) return

      if (detail.action === "clear") {
        if (appliedCouponRef.current?.autoApplied) {
          setAppliedCoupon(null)
          setCouponCode("")
          setManualCouponCode("")
        }
        if (detail.pricing) setPricing(detail.pricing)
        return
      }

      if (detail.action !== "apply" || !detail.coupon || !detail.code) return

      const nextCode = String(detail.code).toUpperCase()
      if (appliedCouponRef.current?.code === nextCode) {
        if (detail.pricing) setPricing(detail.pricing)
        return
      }

      setAppliedCoupon({
        ...detail.coupon,
        discount: Number(detail.savings ?? detail.coupon.discount) || 0,
        autoApplied: true,
      })
      setCouponCode(nextCode)
      setManualCouponCode(nextCode)
      if (detail.pricing) setPricing(detail.pricing)
    }

    window.addEventListener(AUTO_COUPON_STATE_EVENT, onAutoCouponState)
    return () => window.removeEventListener(AUTO_COUPON_STATE_EVENT, onAutoCouponState)
  }, [cart, restaurantData])

  const suggestedAddons = useMemo(() => {
    if (!Array.isArray(addons) || addons.length === 0) return []
    // Veg mode ON => only veg suggestions.
    // Veg mode OFF => show all suggestions.
    if (vegMode !== true) return addons
    return addons.filter((addon) => {
      if (addon?.isVeg === true) return true
      const ft = String(addon?.foodType || "").trim().toLowerCase()
      return ft === "veg" || ft === "vegetarian"
    })
  }, [addons, vegMode])

  // Fee settings from database (used for platform fee and GST fallback only)
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 0,
    deliveryFeeRanges: [],
    platformFee: 0,
    quickDeliveryFee: 0,
    gstRate: 0,
  })

  const configuredQuickDeliveryFee = getConfiguredQuickDeliveryFee(feeSettings)

  const resetCartPreferences = useCallback(() => {
    setNote("")
    setShowNoteInput(false)
    setDeliveryMode("basic")
    setDeliverySectionTab("modes")
    setSelectedDeliveryInstruction(null)
    setDeliveryInstructionMode("preset")
    setCustomDeliveryInstruction("")
    clearCartInstructionStorage()
  }, [])

  const deliveryInstructionText = useMemo(
    () =>
      buildDeliveryInstructionsText({
        deliveryInstructionMode,
        selectedDeliveryInstruction,
        customDeliveryInstruction,
      }),
    [deliveryInstructionMode, selectedDeliveryInstruction, customDeliveryInstruction],
  )

  // Cash on Delivery has been removed; coerce any stale selection to online payment.
  useEffect(() => {
    if (selectedPaymentMethod === "cash") {
      setSelectedPaymentMethod("razorpay")
    }
  }, [selectedPaymentMethod])

  useEffect(() => {
    const timer = setInterval(() => setAvailabilityTick(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const scheduledOrderAt = useMemo(() => {
    if (!isScheduled || !scheduledDate || !scheduledTime) return null
    const scheduleDate = new Date(`${scheduledDate}T${scheduledTime}:00`)
    return Number.isNaN(scheduleDate.getTime()) ? null : scheduleDate
  }, [isScheduled, scheduledDate, scheduledTime])

  const cartRestaurantAvailability = useMemo(() => {
    if (!restaurantData) return { isOpen: false, reason: "loading" }
    const targetDate = scheduledOrderAt || new Date(availabilityTick)
    return getRestaurantAvailabilityStatus(restaurantData, targetDate)
  }, [restaurantData, availabilityTick, scheduledOrderAt])

  const canPlaceOrder = Boolean(restaurantData) && cartRestaurantAvailability.isOpen === true


  const availableTimeSlots = useMemo(() => {
    if (!isScheduled || !scheduledDate || !restaurantData) return []

    try {
      const targetDate = new Date(scheduledDate)
      const status = getRestaurantAvailabilityStatus(restaurantData, targetDate)

      let openingHour = 9
      let closingHour = 22

      if (status.openingTime) {
        const [h] = status.openingTime.split(':')
        openingHour = parseInt(h, 10)
      }

      if (status.closingTime) {
        const [h] = status.closingTime.split(':')
        closingHour = parseInt(h, 10)
      }

      if (closingHour < openingHour) {
        closingHour += 24 // Handle overnight slots
      }

      const slots = []
      const now = new Date()
      // Fix timezone date comparison by comparing date strings YYYY-MM-DD
      const nowStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
      const targetStr = scheduledDate
      const isToday = targetStr === nowStr
      const currentHour = now.getHours()

      for (let h = openingHour; h <= closingHour; h++) {
        const actualHour = h % 24
        // Skip past hours if today. Add 1 hour buffer so they can't order right at the boundary
        if (isToday && h <= currentHour) continue

        const period = actualHour >= 12 ? 'PM' : 'AM'
        const display12 = actualHour % 12 || 12
        const timeString = `${String(actualHour).padStart(2, '0')}:00`
        const displayString = `${display12}:00 ${period}`

        slots.push({ value: timeString, label: displayString })
      }

      return slots
    } catch {
      return []
    }
  }, [isScheduled, scheduledDate, restaurantData])

  // Reset scheduledTime if it's no longer valid in the new slots
  useEffect(() => {
    if (isScheduled && availableTimeSlots.length > 0) {
      const isValid = availableTimeSlots.some(slot => slot.value === scheduledTime)
      if (!isValid) {
        setScheduledTime(availableTimeSlots[0].value)
      }
    } else if (!isScheduled) {
      setScheduledDate("")
      setScheduledTime("")
    }
  }, [isScheduled, availableTimeSlots, scheduledTime])

  const cartCount = getCartCount()
  const getAddressId = (address) => address?.id || address?._id || null
  const normalizeAddressLabel = (label) => {
    if (!label) return ""
    const value = String(label).trim().toLowerCase()
    if (value === "work" || value === "office") return "office"
    if (value === "home") return "home"
    if (value === "other") return "other"
    return value
  }
  const getDisplayAddressLabel = (label) => {
    const normalized = normalizeAddressLabel(label)
    if (normalized === "office") return "Work"
    if (normalized === "home") return "Home"
    if (normalized === "other") return "Other"
    return label || "Saved address"
  }
  const sanitizeRecipientName = (value) => String(value || "").replace(/[^A-Za-z ]/g, "").replace(/\s+/g, " ")
  const sanitizeRecipientPhone = (value) => String(value || "").replace(/\D/g, "").slice(0, 10)
  const isValidRecipientName = (value) => {
    const normalized = String(value || "").replace(/\s+/g, " ").trim()
    return normalized.length >= 2 && RECIPIENT_NAME_REGEX.test(normalized)
  }
  const isValidIndianMobile = (value) => INDIAN_MOBILE_REGEX.test(String(value || ""))
  const savedAddress = getDefaultAddress()
  const selectedAddress = addresses.find((addr) => getAddressId(addr) && getAddressId(addr) === selectedAddressId)

  const currentLocationAddress = useMemo(() => {
    // `LocationSelectorOverlay` updates backend + localStorage, but Cart's live hook might lag.
    // So we fall back to `localStorage.userLocation` when `currentLocation` doesn't have a usable payload yet.
    let locFromStorage = null
    try {
      const storedRaw = localStorage.getItem("userLocation")
      locFromStorage = storedRaw ? JSON.parse(storedRaw) : null
    } catch {
      locFromStorage = null
    }

    const loc = currentLocation?.latitude && currentLocation?.longitude ? currentLocation : locFromStorage
    if (!loc?.latitude || !loc?.longitude) return null

    const formattedAddress = loc?.formattedAddress || loc?.address || ""
    if (!formattedAddress || formattedAddress === "Select location") return null

    return {
      // Backend deliveryAddressSchema expects label in ['Home','Office','Other'].
      label: "Home",
      formattedAddress,
      address: formattedAddress,
      street: loc?.street || loc?.address || loc?.area || "Current Location",
      additionalDetails: loc?.area || "",
      city: loc?.city || loc?.area || "Current City",
      state: loc?.state || loc?.city || "Current State",
      zipCode: loc?.postalCode || loc?.zipCode || "",
      phone: userProfile?.phone || "",
      location: {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude], // [lng, lat]
      },
    }
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    currentLocation?.formattedAddress,
    currentLocation?.address,
    currentLocation?.street,
    currentLocation?.area,
    currentLocation?.city,
    currentLocation?.state,
    currentLocation?.postalCode,
    currentLocation?.zipCode,
    userProfile?.phone,
    // Re-evaluate derived address when mode changes (overlay closes -> Cart rerenders).
    deliveryAddressMode,
  ])

  const defaultAddress = useMemo(() => {
    return deliveryAddressMode === "current"
      ? currentLocationAddress || selectedAddress || savedAddress || null
      : selectedAddress || savedAddress || currentLocationAddress || null
  }, [deliveryAddressMode, currentLocationAddress, selectedAddress, savedAddress])

  const pricingAddress = useMemo(
    () => normalizeLocationForPricing(defaultAddress),
    [defaultAddress],
  )

  const hasSavedAddress = Boolean(defaultAddress && formatFullAddress(defaultAddress))
  const recipientName = String(recipientDetails.name || "").trim() || userProfile?.name || "Your Name"
  const recipientPhone = sanitizeRecipientPhone(recipientDetails.phone || "") || userProfile?.phone || ""
  const selectedAddressCoordinates = defaultAddress?.location?.coordinates
  const zoneLocation = selectedAddressCoordinates?.length === 2
    ? {
      latitude: selectedAddressCoordinates[1],
      longitude: selectedAddressCoordinates[0]
    }
    : currentLocation
  const { zoneId } = useZone(zoneLocation) // Prefer selected/saved address zone
  const defaultPayment = getDefaultPaymentMethod()

  useEffect(() => {
    // Sync delivery mode from overlay/localStorage changes.
    // No dependency array: overlay open/close re-renders Cart via provider state update,
    // even when GPS coords don't move enough to update `currentLocation`.
    try {
      const mode = localStorage.getItem("deliveryAddressMode") || "saved"
      setDeliveryAddressMode((prev) => (prev === mode ? prev : mode))
    } catch {
      // ignore
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(CART_RECIPIENT_DETAILS_STORAGE_KEY)
      if (!raw) {
        hasRestoredRecipientRef.current = true
        return
      }

      const stored = JSON.parse(raw)
      setRecipientDetails({
        name: stored?.name || "",
        phone: sanitizeRecipientPhone(stored?.phone || ""),
      })
      setIsEditingRecipient(Boolean(stored?.isEditingRecipient))
    } catch {
      setRecipientDetails({ name: "", phone: "" })
      setIsEditingRecipient(false)
    } finally {
      hasRestoredRecipientRef.current = true
    }
  }, [])

  useEffect(() => {
    setRecipientDetails((prev) => ({
      name: prev.name || userProfile?.name || "",
      phone: prev.phone || userProfile?.phone || "",
    }))
  }, [userProfile?.name, userProfile?.phone])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredRecipientRef.current) return

    try {
      window.localStorage.setItem(
        CART_RECIPIENT_DETAILS_STORAGE_KEY,
        JSON.stringify({
          name: recipientDetails.name || "",
          phone: sanitizeRecipientPhone(recipientDetails.phone || ""),
          isEditingRecipient,
        })
      )
    } catch {
      // Ignore storage errors and keep cart flow working.
    }
  }, [recipientDetails, isEditingRecipient])

  const handleRecipientEditToggle = () => {
    if (!isEditingRecipient) {
      setIsEditingRecipient(true)
      return
    }

    const normalizedName = String(recipientDetails.name || "").replace(/\s+/g, " ").trim()
    const normalizedPhone = sanitizeRecipientPhone(recipientDetails.phone || "")

    if (!isValidRecipientName(normalizedName)) {
      toast.error("Name should contain only letters and spaces")
      return
    }
    if (!isValidIndianMobile(normalizedPhone)) {
      toast.error("Enter a valid 10-digit Indian mobile number")
      return
    }

    setRecipientDetails((prev) => ({
      ...prev,
      name: normalizedName,
      phone: normalizedPhone,
    }))
    setIsEditingRecipient(false)
  }

  useEffect(() => {
    if (deliveryAddressMode === "current") {
      setSelectedAddressId(null)
    }
  }, [deliveryAddressMode])

  useEffect(() => {
    const defaultId = getAddressId(savedAddress)
    if (deliveryAddressMode !== "current" && !selectedAddressId && defaultId) {
      setSelectedAddressId(defaultId)
    }
  }, [savedAddress, selectedAddressId, deliveryAddressMode])

  // Get restaurant ID from cart or restaurant data
  // Priority: restaurantData > cart[0].restaurantId
  // DO NOT use cart[0].restaurant as slug fallback - it creates wrong slugs
  const restaurantId = cart.length > 0
    ? (restaurantData?._id || restaurantData?.restaurantId || cart[0]?.restaurantId || null)
    : null

  // Stable restaurant ID for addons fetch (memoized to prevent dependency array issues)
  // Prefer restaurantData IDs (more reliable) over slug from cart
  const restaurantIdForAddons = useMemo(() => {
    // Only use restaurantData if it's loaded, otherwise wait
    if (restaurantData) {
      return restaurantData._id || restaurantData.restaurantId || null
    }
    // If restaurantData is not loaded yet, return null to wait
    return null
  }, [restaurantData])



  // Lock body scroll and scroll to top when any full-screen modal opens
  useEffect(() => {
    if (showPlacingOrder || showOrderSuccess) {
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${window.scrollY}px`

      // Scroll window to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else {
      // Restore body scroll
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
    }
  }, [showPlacingOrder, showOrderSuccess])

  // Fetch restaurant data when cart has items
  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (cart.length === 0) {
        setRestaurantData(null)
        return
      }

      // If we already have restaurantData, don't fetch again
      if (restaurantData) {
        return
      }

      setLoadingRestaurant(true)

      // Strategy 1: Try using restaurantId from cart if available
      if (cart[0]?.restaurantId) {
        try {
          const cartRestaurantId = cart[0].restaurantId;
          const cartRestaurantName = cart[0].restaurant;

          debugLog("?? Fetching restaurant data by restaurantId from cart:", cartRestaurantId)
          const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
          const data = response?.data?.data?.restaurant || response?.data?.restaurant

          if (data) {
            // CRITICAL: Validate that fetched restaurant matches cart items
            const fetchedRestaurantId = data.restaurantId || data._id?.toString();
            const fetchedRestaurantName = data.name;

            // Check if restaurantId matches
            const restaurantIdMatches =
              fetchedRestaurantId === cartRestaurantId ||
              data._id?.toString() === cartRestaurantId ||
              data.restaurantId === cartRestaurantId;

            // Check if restaurant name matches (if available in cart)
            const restaurantNameMatches =
              !cartRestaurantName ||
              fetchedRestaurantName?.toLowerCase().trim() === cartRestaurantName.toLowerCase().trim();

            if (!restaurantIdMatches) {
              debugError('? CRITICAL: Fetched restaurant ID does not match cart restaurantId!', {
                cartRestaurantId: cartRestaurantId,
                fetchedRestaurantId: fetchedRestaurantId,
                fetched_id: data._id?.toString(),
                fetched_restaurantId: data.restaurantId,
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Don't set restaurantData if IDs don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            if (!restaurantNameMatches) {
              debugWarn('?? WARNING: Restaurant name mismatch:', {
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Still proceed but log warning
            }

            debugLog("? Restaurant data loaded from cart restaurantId:", {
              _id: data._id,
              restaurantId: data.restaurantId,
              name: data.name,
              cartRestaurantId: cartRestaurantId,
              cartRestaurantName: cartRestaurantName
            })
            setRestaurantData(normalizeRestaurantForPricing(data))
            setLoadingRestaurant(false)
            return
          }
        } catch (error) {
          debugWarn("?? Failed to fetch by cart restaurantId, trying fallback...", error)
        }
      }

      // Strategy 2: If no restaurantId in cart, search by restaurant name
      if (cart[0]?.restaurant && !restaurantData) {
        try {
          debugLog("?? Searching restaurant by name:", cart[0].restaurant)
          const searchResponse = await restaurantAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []
          debugLog("?? Fetched", restaurants.length, "restaurants for name search")

          // Try exact match first
          let matchingRestaurant = restaurants.find(r =>
            r.name?.toLowerCase().trim() === cart[0].restaurant?.toLowerCase().trim()
          )

          // If no exact match, try partial match
          if (!matchingRestaurant) {
            debugLog("?? No exact match, trying partial match...")
            matchingRestaurant = restaurants.find(r =>
              r.name?.toLowerCase().includes(cart[0].restaurant?.toLowerCase().trim()) ||
              cart[0].restaurant?.toLowerCase().trim().includes(r.name?.toLowerCase())
            )
          }

          if (matchingRestaurant) {
            // CRITICAL: Validate that the found restaurant matches cart items
            const cartRestaurantName = cart[0]?.restaurant?.toLowerCase().trim();
            const foundRestaurantName = matchingRestaurant.name?.toLowerCase().trim();

            if (cartRestaurantName && foundRestaurantName && cartRestaurantName !== foundRestaurantName) {
              debugError("? CRITICAL: Restaurant name mismatch!", {
                cartRestaurantName: cart[0]?.restaurant,
                foundRestaurantName: matchingRestaurant.name,
                cartRestaurantId: cart[0]?.restaurantId,
                foundRestaurantId: matchingRestaurant.restaurantId || matchingRestaurant._id
              });
              // Don't set restaurantData if names don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            debugLog("? Found restaurant by name:", {
              name: matchingRestaurant.name,
              _id: matchingRestaurant._id,
              restaurantId: matchingRestaurant.restaurantId,
              slug: matchingRestaurant.slug,
              cartRestaurantName: cart[0]?.restaurant
            })
            setRestaurantData(normalizeRestaurantForPricing(matchingRestaurant))
            setLoadingRestaurant(false)
            return
          } else {
            debugWarn("?? Restaurant not found even by name search. Searched in", restaurants.length, "restaurants")
            if (restaurants.length > 0) {
              debugLog("?? Available restaurant names:", restaurants.map(r => r.name).slice(0, 10))
            }
          }
        } catch (searchError) {
          debugWarn("?? Error searching restaurants by name:", searchError)
        }
      }

      // If all strategies fail, set to null
      setRestaurantData(null)
      setLoadingRestaurant(false)
    }

    fetchRestaurantData()
  }, [cart.length, cart[0]?.restaurantId, cart[0]?.restaurant])

  // Keep restaurant online/offline status fresh while user stays on cart
  useEffect(() => {
    const cartRestaurantId = cart[0]?.restaurantId
    if (!cartRestaurantId || cart.length === 0) return

    const refreshRestaurantStatus = async () => {
      try {
        const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) setRestaurantData(normalizeRestaurantForPricing(data))
      } catch (error) {
        debugWarn("Failed to refresh restaurant status:", error)
      }
    }

    refreshRestaurantStatus()
    const intervalId = setInterval(refreshRestaurantStatus, 60000)
    const handleFocus = () => refreshRestaurantStatus()
    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("focus", handleFocus)
    }
  }, [cart.length, cart[0]?.restaurantId])

  // Fetch approved addons for the restaurant
  useEffect(() => {
    const fetchAddonsWithId = async (idToUse) => {

      debugLog("?? Addons fetch - Using ID:", {
        restaurantData: restaurantData ? {
          _id: restaurantData._id,
          restaurantId: restaurantData.restaurantId,
          name: restaurantData.name
        } : 'Not loaded',
        cartRestaurantId: restaurantId,
        idToUse: idToUse
      })

      // Convert to string for validation
      const idString = String(idToUse)
      debugLog("?? Restaurant ID string:", idString, "Type:", typeof idString, "Length:", idString.length)

      // Validate ID format (should be ObjectId or restaurantId format)
      const isValidIdFormat = /^[a-zA-Z0-9\-_]+$/.test(idString) && idString.length >= 3

      if (!isValidIdFormat) {
        debugWarn("?? Restaurant ID format invalid:", idString)
        setAddons([])
        return
      }

      try {
        setLoadingAddons(true)
        debugLog("?? Fetching addons for restaurant ID:", idString)
        const response = await restaurantAPI.getAddonsByRestaurantId(idString)
        debugLog("? Addons API response received:", response?.data)
        debugLog("?? Response structure:", {
          success: response?.data?.success,
          data: response?.data?.data,
          addons: response?.data?.data?.addons,
          directAddons: response?.data?.addons
        })

        const data = response?.data?.data?.addons || response?.data?.addons || []
        debugLog("?? Fetched addons count:", data.length)
        debugLog("?? Fetched addons data:", JSON.stringify(data, null, 2))

        if (data.length === 0) {
          debugWarn("?? No addons returned from API. Response:", response?.data)
        } else {
          debugLog("? Successfully fetched", data.length, "addons:", data.map(a => a.name))
        }

        setAddons(data.map(addon => ({
          ...addon,
          isVeg: addon.isVeg ?? (restaurantData?.pureVegRestaurant === true),
          foodType: addon.foodType || (restaurantData?.pureVegRestaurant ? "Veg" : "Non-Veg")
        })))
      } catch (error) {
        // Log error for debugging
        debugError("? Addons fetch error:", {
          code: error.code,
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
          data: error.response?.data
        })
        // Silently handle network errors and 404 errors
        // Network errors (ERR_NETWORK) happen when backend is not running - this is OK for development
        // 404 errors mean restaurant might not have addons or restaurant not found - also OK
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error fetching addons:", error)
        }
        // Continue with cart even if addons fetch fails
        setAddons([])
      } finally {
        setLoadingAddons(false)
      }
    }

    const fetchAddons = async () => {
      if (cart.length === 0) {
        setAddons([])
        return
      }

      // Wait for restaurantData to be loaded (including fallback search)
      if (loadingRestaurant) {
        debugLog("? Waiting for restaurantData to load (including fallback search)...")
        return
      }

      // Must have restaurantData to fetch addons
      if (!restaurantData) {
        debugWarn("?? No restaurantData available for addons fetch")
        setAddons([])
        return
      }

      // Use restaurantData ID (most reliable)
      const idToUse = restaurantData._id || restaurantData.restaurantId
      if (!idToUse) {
        debugWarn("?? No valid restaurant ID in restaurantData")
        setAddons([])
        return
      }

      debugLog("? Using restaurantData ID for addons:", idToUse)
      fetchAddonsWithId(idToUse)
    }

    fetchAddons()
  }, [restaurantData, cart.length, loadingRestaurant])

  // Fetch coupons for items in cart
  useEffect(() => {
    const fetchCouponsForCartItems = async () => {
      if (cart.length === 0 || !restaurantId) {
        setAvailableCoupons([])
        return
      }

      debugLog(`[CART-COUPONS] Fetching coupons for ${cart.length} items in cart`)
      setLoadingCoupons(true)

      const allCoupons = []
      const uniqueCouponCodes = new Set()

      // Fetch coupons for each item in cart
      for (const cartItem of cart) {
        const couponItemId = cartItem.itemId || cartItem.id
        if (!couponItemId) {
          debugLog(`[CART-COUPONS] Skipping item without id:`, cartItem)
          continue
        }

        try {
          debugLog(`[CART-COUPONS] Fetching coupons for itemId: ${couponItemId}, name: ${cartItem.name}`)
          const response = await restaurantAPI.getCouponsByItemIdPublic(restaurantId, couponItemId, subtotal)

          if (response?.data?.success && response?.data?.data?.coupons) {
            const coupons = response.data.data.coupons
            debugLog(`[CART-COUPONS] Found ${coupons.length} coupons for item ${couponItemId}`)

            // Add coupons, avoiding duplicates
            coupons.forEach(coupon => {
              if (!uniqueCouponCodes.has(coupon.couponCode)) {
                uniqueCouponCodes.add(coupon.couponCode)
                // Convert backend coupon format to frontend format
                allCoupons.push({
                  code: coupon.couponCode,
                  discount: coupon.originalPrice - coupon.discountedPrice,
                  discountPercentage: coupon.discountPercentage,
                  discountDisplay: coupon.discountType === "percentage"
                    ? `${coupon.discountPercentage}% OFF`
                    : `${RUPEE_SYMBOL}${Math.max(0, (coupon.originalPrice || 0) - (coupon.discountedPrice || 0))} OFF`,
                  minOrder: coupon.minOrderValue || 0,
                  description: coupon.discountType === "percentage"
                    ? `${coupon.discountPercentage}% OFF with '${coupon.couponCode}'`
                    : `Save ${RUPEE_SYMBOL}${Math.max(0, (coupon.originalPrice || 0) - (coupon.discountedPrice || 0))} with '${coupon.couponCode}'`,
                  originalPrice: coupon.originalPrice,
                  discountedPrice: coupon.discountedPrice,
                  customerGroup: coupon.customerGroup || "all",
                  isGlobalCoupon: Boolean(coupon.isGlobalCoupon),
                  itemId: couponItemId,
                  itemName: cartItem.name,
                })
              }
            })
          }
        } catch (error) {
          debugError(`[CART-COUPONS] Error fetching coupons for item ${cartItem.id}:`, error)
        }
      }

      debugLog(`[CART-COUPONS] Total unique coupons found: ${allCoupons.length}`, allCoupons)
      setAvailableCoupons(allCoupons)
      setLoadingCoupons(false)
    }

    fetchCouponsForCartItems()
  }, [cart, restaurantId])

  // Calculate pricing from backend whenever cart, address, or coupon changes
  useEffect(() => {
    const calculatePricing = async () => {
      if (cart.length === 0 || !hasSavedAddress) {
        setPricing(null)
        return
      }

      try {
        setLoadingPricing(true)
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price, // Price should already be in INR
          variantId: item.variantId || undefined,
          variantName: item.variantName || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const resolvedRestaurantId = restaurantData?.restaurantId || restaurantData?._id || restaurantId || undefined
        const resolvedCouponCode = appliedCoupon?.code || couponCode || undefined

        const calculatePayload = {
          items,
          restaurantId: resolvedRestaurantId,
          deliveryAddress: pricingAddress,
          couponCode: resolvedCouponCode,
          deliveryMode,
        }

        if (scheduledOrderAt) {
          calculatePayload.scheduledAt = scheduledOrderAt.toISOString()
        }

        const response = await orderAPI.calculateOrder(calculatePayload)

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)

          const resolvedItems = Array.isArray(response.data.data.items)
            ? response.data.data.items
            : []
          if (resolvedItems.length > 0) {
            const priceById = new Map(
              resolvedItems.map((item) => [String(item.itemId), item]),
            )
            const nextCart = cart.map((cartItem) => {
              const itemId = String(cartItem.itemId || cartItem.id || "")
              const resolved = priceById.get(itemId)
              if (!resolved) return cartItem

              const nextPrice = Number(resolved.price)
              if (!Number.isFinite(nextPrice) || nextPrice === Number(cartItem.price)) {
                return cartItem
              }

              return {
                ...cartItem,
                name: resolved.name || cartItem.name,
                price: nextPrice,
                variantPrice: Number(resolved.variantPrice ?? nextPrice),
                variantName: resolved.variantName || cartItem.variantName,
              }
            })

            const pricesChanged = nextCart.some(
              (item, index) => Number(item.price) !== Number(cart[index]?.price),
            )
            if (pricesChanged) {
              replaceCart(nextCart)
              const priceChanges = response.data.data.priceChanges || []
              if (priceChanges.length > 0) {
                toast.info("Cart prices were updated to match the latest menu")
              }
            }
          }

          // Update applied coupon if backend returns one
          if (response.data.data.pricing.appliedCoupon && !appliedCoupon) {
            const coupon = availableCoupons.find(c => c.code === response.data.data.pricing.appliedCoupon.code)
            if (coupon) {
              setAppliedCoupon(coupon)
            }
          }
        }
      } catch (error) {
        const apiMessage =
          error?.response?.data?.message ||
          error?.response?.data?.error?.message ||
          error?.message ||
          ""

        if (
          apiMessage.toLowerCase().includes("offline") ||
          apiMessage.toLowerCase().includes("closed")
        ) {
          setPricing(null)
          return
        }

        // Network errors or 404 errors - silently handle, fallback to frontend calculation
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error calculating pricing:", error)
        }
        // Fallback to frontend calculation if backend fails
        setPricing(null)
      } finally {
        setLoadingPricing(false)
      }
    }

    calculatePricing()
  }, [cart, pricingAddress, appliedCoupon, couponCode, restaurantId, restaurantData, scheduledOrderAt, replaceCart, deliveryMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!Array.isArray(cart) || cart.length === 0) {
      sessionStorage.removeItem("food_cart_pricing_snapshot")
      return
    }

    try {
      const snapshot = buildEffectiveCartPricing({
        cart,
        pricing,
        feeSettings,
        defaultAddress: pricingAddress,
        restaurantData,
        appliedCoupon,
        deliveryMode,
        roadDistanceKm:
          Number.isFinite(Number(pricing?.distanceKm))
            ? Number(pricing.distanceKm)
            : Number.isFinite(Number(pricing?.roadDistanceKm))
              ? Number(pricing.roadDistanceKm)
              : roadDistanceKm,
      })
      sessionStorage.setItem("food_cart_pricing_snapshot", JSON.stringify(snapshot))
      window.dispatchEvent(new CustomEvent("food_cart_pricing_updated"))
    } catch {
      // ignore storage errors
    }
  }, [cart, pricing, feeSettings, pricingAddress, restaurantData, appliedCoupon, deliveryMode, roadDistanceKm])

  // Selected address Rest→User road distance (same source as Home / delivery).
  useEffect(() => {
    let cancelled = false
    if (!restaurantData || !pricingAddress) {
      setRoadDistanceKm(null)
      return undefined
    }

    // Prefer backend pricing distance once available.
    if (Number.isFinite(Number(pricing?.distanceKm)) || Number.isFinite(Number(pricing?.roadDistanceKm))) {
      const fromPricing = Number(pricing?.distanceKm ?? pricing?.roadDistanceKm)
      setRoadDistanceKm(fromPricing)
      return undefined
    }

    const run = async () => {
      const km = await fetchDrivingDistanceKm(restaurantData, pricingAddress)
      if (!cancelled && Number.isFinite(Number(km))) {
        setRoadDistanceKm(Number(km))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    restaurantData,
    pricingAddress,
    pricing?.distanceKm,
    pricing?.roadDistanceKm,
  ])

  // Address sheet labels: batch road distances for saved addresses.
  useEffect(() => {
    let cancelled = false
    if (!restaurantData || !Array.isArray(addresses) || addresses.length === 0) {
      setAddressRoadKmById({})
      return undefined
    }

    const run = async () => {
      const kms = await fetchDrivingDistancesMatrix(restaurantData, addresses)
      if (cancelled || !Array.isArray(kms)) return
      const next = {}
      addresses.forEach((address, index) => {
        const id = getAddressId(address)
        if (!id || !Number.isFinite(Number(kms[index]))) return
        next[String(id)] = Number(kms[index])
      })
      setAddressRoadKmById(next)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [restaurantData, addresses])

  // Fetch wallet balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setIsLoadingWallet(true)
        const response = await userAPI.getWallet()
        if (response?.data?.success && response?.data?.data?.wallet) {
          setWalletBalance(response.data.data.wallet.balance || 0)
        }
      } catch (error) {
        debugError("Error fetching wallet balance:", error)
        setWalletBalance(0)
      } finally {
        setIsLoadingWallet(false)
      }
    }
    fetchWalletBalance()
  }, [])

  // Fetch user order count (used for first-time coupon eligibility)
  useEffect(() => {
    const fetchOrderCount = async () => {
      try {
        const response = await orderAPI.getOrders({ page: 1, limit: 1 })
        if (response?.data?.success) {
          const totalOrders = response?.data?.data?.pagination?.total || 0
          setUserOrderCount(totalOrders)
        }
      } catch (error) {
        debugError("Error fetching user order count:", error)
        setUserOrderCount(0)
      }
    }

    fetchOrderCount()
  }, [])

  // Fee settings from centralized public config (cached; refresh on admin update only)
  useEffect(() => {
    const applyFeeSettings = (raw) => {
      if (!raw) return
      setFeeSettings({
        deliveryFee: raw.deliveryFee ?? 0,
        deliveryFeeRanges: raw.deliveryFeeRanges || [],
        platformFee: raw.platformFee ?? 0,
        quickDeliveryFee: raw.quickDeliveryFee ?? 0,
        gstRate: raw.gstRate ?? 0,
      })
    }

    applyFeeSettings(getCachedFeeSettings())

    void loadCorePublicAppConfig().then((snapshot) => {
      applyFeeSettings(snapshot.feeSettings)
    })

    const handleSettingsUpdate = () => {
      void loadCorePublicAppConfig({ force: true }).then((snapshot) => {
        applyFeeSettings(snapshot.feeSettings)
      })
    }

    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  const effectivePricing = useMemo(
    () =>
      buildEffectiveCartPricing({
        cart,
        pricing,
        feeSettings,
        defaultAddress: pricingAddress,
        restaurantData,
        appliedCoupon,
        deliveryMode,
        roadDistanceKm:
          Number.isFinite(Number(pricing?.distanceKm))
            ? Number(pricing.distanceKm)
            : Number.isFinite(Number(pricing?.roadDistanceKm))
              ? Number(pricing.roadDistanceKm)
              : roadDistanceKm,
      }),
    [cart, pricing, feeSettings, pricingAddress, restaurantData, appliedCoupon, deliveryMode, roadDistanceKm],
  )
  const subtotal = effectivePricing.subtotal
  const deliveryFee = effectivePricing.deliveryFee
  const deliveryFeeGst = effectivePricing.deliveryFeeGst != null
    ? resolveDeliveryFeeGst(deliveryFee, effectivePricing.deliveryFeeGst)
    : computeDeliveryFeeGst(deliveryFee)
  const quickDeliveryFee = effectivePricing.quickDeliveryFee || 0
  const deliveryFeeBreakdown = effectivePricing.deliveryFeeBreakdown
  const displayDistanceKm = Number.isFinite(Number(deliveryFeeBreakdown?.distanceKm))
    ? Number(deliveryFeeBreakdown.distanceKm)
    : Number.isFinite(Number(pricing?.distanceKm))
      ? Number(pricing.distanceKm)
      : Number.isFinite(Number(pricing?.roadDistanceKm))
        ? Number(pricing.roadDistanceKm)
        : Number.isFinite(Number(roadDistanceKm))
          ? Number(roadDistanceKm)
          : null
  const hasDistanceDeliveryBreakdown =
    Number.isFinite(displayDistanceKm)
  const deliveryFeeBreakdownText = hasDistanceDeliveryBreakdown
    ? deliveryFeeBreakdown?.message || `Distance: ${displayDistanceKm.toFixed(1)} km`
    : null
  const platformFee = effectivePricing.platformFee
  const gstCharges = effectivePricing.tax
  const discount = effectivePricing.discount
  const totalBeforeDiscount = subtotal + deliveryFee + deliveryFeeGst + platformFee + gstCharges
  const total = effectivePricing.total
  const savings = effectivePricing.savings
  const itemDiscountAmount = appliedCoupon && discount > 0 ? discount : 0
  const otherSavings = Math.max(0, savings - itemDiscountAmount)
  const compareItemTotal = getCartCompareItemTotal(cart)
  const selectedPaymentLabel =
    selectedPaymentMethod === "wallet" ? "Wallet" : "Online Payment"

  const headerDeliveryTime = deliveryMode === "quick" ? "20-25 mins" : (restaurantData?.estimatedDeliveryTime || "35-40 mins")
  const basicDeliveryTime = restaurantData?.estimatedDeliveryTime || "35-40 mins"
  const quickDeliveryTime = "20-25 mins"
  const headerAddressLabel = defaultAddress ? getDisplayAddressLabel(defaultAddress.label) : "Select address"
  const headerAddressText = defaultAddress
    ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Add delivery address")
    : "Add delivery address"

  const formatAddressDistanceLabel = (address) => {
    const addressId = getAddressId(address)
    const cached = addressId ? addressRoadKmById[String(addressId)] : null
    const km = Number.isFinite(Number(cached))
      ? Number(cached)
      : calculateDistanceKm(restaurantData, address)
    if (!Number.isFinite(km)) return null
    return formatDistanceLabel(km)
  }

  const getAddressIcon = (address) => {
    const label = normalizeAddressLabel(address?.label)
    if (label === "office") return Briefcase
    return Home
  }

  const handleOpenAddAddress = () => {
    setShowAddressSheet(false)
    navigate("/food/user/cart/address-selector", { state: { backTo: "/food/user/cart" } })
  }

  const handleSelectAddressFromSheet = async (address) => {
    await handleSelectSavedAddress(address)
    setShowAddressSheet(false)
  }

  // Restaurant name from data or cart
  const restaurantName = restaurantData?.name || restaurantData?.restaurantName || cart[0]?.restaurant || "Restaurant"

  const handleShare = async () => {
    const restaurantNameStr = restaurantName || companyName || "this restaurant"
    const shareUrl = window.location.href
    const shareText = `Check out what I'm ordering from ${restaurantNameStr}! ${shareUrl}`

    const payload = {
      title: `My Cart at ${restaurantNameStr}`,
      text: shareText,
      url: shareUrl,
    }

    if (isMobileDevice()) {
      openShareModal(payload)
      return
    }

    const shared = await tryNativeShare(payload)
    if (shared) {
      toast.success("Link shared successfully")
      return
    }

    openShareModal(payload)
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return true
      return false
    }
  }

  const isMobileDevice = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(navigator.userAgent)
    const smallViewport = window.matchMedia?.("(max-width: 768px)")?.matches
    return Boolean(mobileUA || smallViewport)
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return

    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)

    let shareLink = ""

    if (target === "whatsapp") {
      shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "telegram") {
      shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    } else if (target === "email") {
      shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    }

    if (shareLink) {
      window.open(shareLink, "_blank", "noopener,noreferrer")
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.opacity = "0"
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand("copy")
        toast.success("Link copied to clipboard!")
      } catch (err) {
        toast.error("Failed to copy link")
      }
      document.body.removeChild(textArea)
    }
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) {
      setShowShareModal(false)
      toast.success("Shared successfully")
    }
  }

  const handleBack = () => {
    // Priority: slug > restaurantId (both work for the restaurant details route)
    const idOrSlug = restaurantData?.slug || restaurantId
    if (idOrSlug) {
      navigate(`/food/user/restaurants/${idOrSlug}`)
    } else {
      goBack()
    }
  }

  // Handler to select address by label (Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      // Find address with matching label
      const targetLabel = normalizeAddressLabel(label)
      const address = addresses.find(addr => normalizeAddressLabel(addr.label) === targetLabel)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      await handleSelectSavedAddress(address)
    } catch (error) {
      debugError(`Error selecting ${label} address:`, error)
      toast.error(`Failed to select ${label} address. Please try again.`)
    }
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const addressId = getAddressId(address)
      if (addressId) {
        setSelectedAddressId(addressId)
        setDefaultAddress(addressId)
      }

      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (!latitude || !longitude) {
        toast.error(`Invalid coordinates for ${address.label || "saved"} address`)
        return
      }

      // Update location in backend
      await userAPI.updateLocation({
        latitude,
        longitude,
        address: `${address.street}, ${address.city}`,
        city: address.city,
        state: address.state,
        area: address.additionalDetails || "",
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      })

      // Update the location in localStorage
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))
      // User selected a saved address from Cart; prefer saved mode.
      try {
        localStorage.setItem("deliveryAddressMode", "saved")
        setDeliveryAddressMode("saved")
      } catch { }

      toast.success(`${address.label || "Saved"} address selected!`)
    } catch (error) {
      debugError("Error selecting saved address:", error)
      toast.error("Failed to select address. Please try again.")
    }
  }

  const handleApplyCoupon = async (coupon) => {
    if (coupon?.customerGroup === "new" && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    if (subtotal < (Number(coupon.minOrder) || 0)) {
      toast.error(`Min order ${RUPEE_SYMBOL}${Number(coupon.minOrder || 0)}`)
      return
    }

    // Validate with backend first; only set applied if backend accepts
    if (cart.length > 0 && hasSavedAddress) {
      try {
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price,
          variantId: item.variantId || undefined,
          variantName: item.variantName || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: pricingAddress,
          couponCode: coupon.code,
          deliveryMode,
        })

        const pricingData = response?.data?.data?.pricing
        if (!pricingData || !pricingData.appliedCoupon) {
          toast.error("Coupon not applicable")
          return
        }

        setPricing(pricingData)
        setAppliedCoupon({ ...coupon, autoApplied: false })
        setCouponCode(coupon.code)
        setManualCouponCode(coupon.code)
        markUserSelectedCoupon(
          restaurantData?.restaurantId || restaurantData?._id || restaurantId || cart[0]?.restaurantId,
          getCartSignature(cart),
          coupon.code,
        )
        setShowOffersView(false)
      } catch (error) {
        debugError("Error recalculating pricing:", error)
        toast.error("Failed to apply coupon")
      }
    }
  }

  const handleApplyCouponCode = async () => {
    const inputCode = manualCouponCode.trim().toUpperCase()
    if (!inputCode) {
      toast.error("Enter coupon code")
      return
    }

    if (cart.length === 0 || !hasSavedAddress) {
      toast.error("Add items and delivery address first")
      return
    }

    const matchedCoupon = availableCoupons.find(
      (coupon) => String(coupon.code || "").toUpperCase() === inputCode,
    )

    // If we know this is first-time only and user already ordered, block early.
    if (matchedCoupon?.customerGroup === "new" && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    try {
      const items = cart.map(item => ({
        itemId: item.itemId || item.id,
        name: item.name,
        price: item.price,
        variantId: item.variantId || undefined,
        variantName: item.variantName || undefined,
        variantPrice: item.variantPrice || item.price,
        quantity: item.quantity || 1,
        image: item.image,
        description: item.description,
        isVeg: item.isVeg !== false
      }))

      const response = await orderAPI.calculateOrder({
        items,
        restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
        deliveryAddress: pricingAddress,
        couponCode: inputCode,
        deliveryMode,
      })

      const pricingData = response?.data?.data?.pricing
      if (!pricingData) {
        toast.error("Unable to validate coupon")
        return
      }

      if (!pricingData.appliedCoupon) {
        toast.error("Invalid or unavailable coupon code")
        setCouponCode("")
        return
      }

      setPricing(pricingData)
      setCouponCode(inputCode)
      setAppliedCoupon(
        {
          ...(matchedCoupon || {
            code: inputCode,
            discount: pricingData.appliedCoupon.discount || 0,
            minOrder: 0,
            customerGroup: "all",
          }),
          autoApplied: false,
        },
      )
      setManualCouponCode(inputCode)
      markUserSelectedCoupon(
        restaurantData?.restaurantId || restaurantData?._id || restaurantId || cart[0]?.restaurantId,
        getCartSignature(cart),
        inputCode,
      )
      setShowOffersView(false)
      toast.success("Coupon applied")
    } catch (error) {
      debugError("Error applying coupon code:", error)
      toast.error("Failed to apply coupon")
    }
  }


  const handleRemoveCoupon = async () => {
    const resolvedRestaurantId =
      restaurantData?.restaurantId || restaurantData?._id || restaurantId || cart[0]?.restaurantId
    if (resolvedRestaurantId) {
      markManualCouponOptOut(resolvedRestaurantId, getCartSignature(cart))
    }

    setAppliedCoupon(null)
    setCouponCode("")
    setManualCouponCode("")

    // Recalculate pricing without coupon
    if (cart.length > 0 && hasSavedAddress) {
      try {
        const items = cart.map(item => ({
          itemId: item.itemId || item.id,
          name: item.name,
          price: item.price,
          variantId: item.variantId || undefined,
          variantName: item.variantName || undefined,
          variantPrice: item.variantPrice || item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: pricingAddress,
          couponCode: null,
          deliveryMode,
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)
        }
      } catch (error) {
        debugError("Error recalculating pricing:", error)
      }
    }
  }


  const handlePlaceOrder = async () => {
    if (!hasSavedAddress) {
      toast.error("Please choose a delivery location to continue")
      setShowAddressSheet(true)
      return
    }

    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please select both date and time to schedule your order")
        return
      }
      const scheduleString = `${scheduledDate}T${scheduledTime}:00`
      const scheduleDateObj = new Date(scheduleString)
      if (scheduleDateObj < new Date()) {
        toast.error("Scheduled time must be in the future")
        return
      }
    }

    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    if (!canPlaceOrder) {
      toast.error("Restaurant is currently offline. Please try again later.")
      return
    }

    setIsPlacingOrder(true)

    // Use API_BASE_URL from config (supports both dev and production)

    try {
      debugLog("?? Starting order placement process...")
      debugLog("?? Cart items:", cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })))
      debugLog("?? Applied coupon:", appliedCoupon?.code || "None")
      debugLog("?? Delivery address:", defaultAddress?.label || defaultAddress?.city)

      // Include all cart items (main items + addons)
      // Note: Addons are added as separate cart items when user clicks the + button
      const orderItems = cart.map(item => ({
        itemId: item.itemId || item.id,
        name: item.name,
        price: item.price,
        variantId: item.variantId || undefined,
        variantName: item.variantName || undefined,
        variantPrice: item.variantPrice || item.price,
        quantity: item.quantity || 1,
        image: item.image || "",
        description: item.description || "",
        isVeg: item.isVeg !== false,
        preparationTime: item.preparationTime
      }))

      debugLog("?? Order items to send:", orderItems)

      // Check API base URL before making request (for debugging)
      const fullUrl = `${API_BASE_URL}${API_ENDPOINTS.ORDER.CREATE}`;
      debugLog("?? Making request to:", fullUrl)
      debugLog("?? Authentication token present:", !!localStorage.getItem('accessToken') || !!localStorage.getItem('user_accessToken'))

      // CRITICAL: Validate restaurant ID before placing order
      // Ensure we're using the correct restaurant from restaurantData (most reliable)
      const finalRestaurantId = restaurantData?.restaurantId || restaurantData?._id || null;
      const finalRestaurantName = restaurantData?.name || null;

      if (!finalRestaurantId) {
        debugError('? CRITICAL: Cannot place order - Restaurant ID is missing!');
        debugError('?? Debug info:', {
          restaurantData: restaurantData ? {
            _id: restaurantData._id,
            restaurantId: restaurantData.restaurantId,
            name: restaurantData.name
          } : 'Not loaded',
          cartRestaurantId: restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });
        alert('Error: Restaurant information is missing. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      // CRITICAL: Validate that ALL cart items belong to the SAME restaurant
      const cartRestaurantIds = cart
        .map(item => item.restaurantId)
        .filter(Boolean)
        .map(id => String(id).trim()); // Normalize to string and trim

      const cartRestaurantNames = cart
        .map(item => item.restaurant)
        .filter(Boolean)
        .map(name => name.trim().toLowerCase()); // Normalize names

      // Get unique values (after normalization)
      const uniqueRestaurantIds = [...new Set(cartRestaurantIds)];
      const uniqueRestaurantNames = [...new Set(cartRestaurantNames)];

      // Check if cart has items from multiple restaurants
      // Note: If restaurant names match, allow even if IDs differ (same restaurant, different ID format)
      if (uniqueRestaurantNames.length > 1) {
        // Different restaurant names = definitely different restaurants
        debugError('? CRITICAL ERROR: Cart contains items from multiple restaurants!', {
          restaurantIds: uniqueRestaurantIds,
          restaurantNames: uniqueRestaurantNames,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });

        // Automatically clean cart to keep items from the restaurant matching restaurantData
        if (finalRestaurantId && finalRestaurantName) {
          debugLog('?? Auto-cleaning cart to keep items from:', finalRestaurantName);
          cleanCartForRestaurant(finalRestaurantId, finalRestaurantName);
          toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
        } else {
          // If restaurantData is not available, keep items from first restaurant in cart
          const firstRestaurantId = cart[0]?.restaurantId;
          const firstRestaurantName = cart[0]?.restaurant;
          if (firstRestaurantId && firstRestaurantName) {
            debugLog('?? Auto-cleaning cart to keep items from first restaurant:', firstRestaurantName);
            cleanCartForRestaurant(firstRestaurantId, firstRestaurantName);
            toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
          } else {
            toast.error('Cart contains items from different restaurants. Please clear cart and try again.');
          }
        }

        setIsPlacingOrder(false);
        return;
      }

      // If restaurant names match but IDs differ, that's OK (same restaurant, different ID format)
      // But log a warning in development
      if (uniqueRestaurantIds.length > 1 && uniqueRestaurantNames.length === 1) {
        if (process.env.NODE_ENV === 'development') {
          debugWarn('?? Cart items have different restaurant IDs but same name. This is OK if IDs are in different formats.', {
            restaurantIds: uniqueRestaurantIds,
            restaurantName: uniqueRestaurantNames[0]
          });
        }
      }

      // Validate that cart items' restaurantId matches the restaurantData
      if (cartRestaurantIds.length > 0) {
        const cartRestaurantId = cartRestaurantIds[0];

        // Check if cart restaurantId matches restaurantData
        const restaurantIdMatches =
          cartRestaurantId === finalRestaurantId ||
          cartRestaurantId === restaurantData?._id?.toString() ||
          cartRestaurantId === restaurantData?.restaurantId;

        if (!restaurantIdMatches) {
          debugError('? CRITICAL ERROR: Cart restaurantId does not match restaurantData!', {
            cartRestaurantId: cartRestaurantId,
            finalRestaurantId: finalRestaurantId,
            restaurantDataId: restaurantData?._id?.toString(),
            restaurantDataRestaurantId: restaurantData?.restaurantId,
            restaurantDataName: restaurantData?.name,
            cartRestaurantName: cartRestaurantNames[0]
          });
          alert(`Error: Cart items belong to "${cartRestaurantNames[0] || 'Unknown Restaurant'}" but restaurant data doesn't match. Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Validate restaurant name matches
      if (cartRestaurantNames.length > 0 && finalRestaurantName) {
        const cartRestaurantName = cartRestaurantNames[0];
        if (cartRestaurantName.toLowerCase().trim() !== finalRestaurantName.toLowerCase().trim()) {
          debugError('? CRITICAL ERROR: Restaurant name mismatch!', {
            cartRestaurantName: cartRestaurantName,
            finalRestaurantName: finalRestaurantName
          });
          alert(`Error: Cart items belong to "${cartRestaurantName}" but restaurant data shows "${finalRestaurantName}". Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Log order details for debugging
      debugLog('? Order validation passed - Placing order with restaurant:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        restaurantDataId: restaurantData?._id,
        restaurantDataRestaurantId: restaurantData?.restaurantId,
        cartRestaurantId: cartRestaurantIds[0],
        cartRestaurantName: cartRestaurantNames[0],
        cartItemCount: cart.length
      });

      // FINAL VALIDATION: Double-check restaurantId before sending to backend
      const cartRestaurantId = cart[0]?.restaurantId;
      if (cartRestaurantId && cartRestaurantId !== finalRestaurantId &&
        cartRestaurantId !== restaurantData?._id?.toString() &&
        cartRestaurantId !== restaurantData?.restaurantId) {
        debugError('? CRITICAL: Final validation failed - restaurantId mismatch!', {
          cartRestaurantId: cartRestaurantId,
          finalRestaurantId: finalRestaurantId,
          restaurantDataId: restaurantData?._id?.toString(),
          restaurantDataRestaurantId: restaurantData?.restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          finalRestaurantName: finalRestaurantName
        });
        alert('Error: Restaurant information mismatch detected. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      const resolvedCouponCode = appliedCoupon?.code || couponCode || pricing?.couponCode || undefined
      const calculatePayload = {
        items: orderItems,
        restaurantId: finalRestaurantId,
        deliveryAddress: pricingAddress,
        couponCode: resolvedCouponCode,
        deliveryMode,
      }
      if (isScheduled) {
        calculatePayload.scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
      }

      let serverPricing = null
      try {
        const pricingResponse = await orderAPI.calculateOrder(calculatePayload)
        serverPricing = pricingResponse?.data?.data?.pricing || null
      } catch (pricingError) {
        debugError("Failed to refresh order pricing before checkout:", pricingError)
        toast.error("Unable to calculate order total. Please try again.")
        setIsPlacingOrder(false)
        return
      }

      if (!serverPricing || !Number.isFinite(Number(serverPricing.total)) || Number(serverPricing.total) <= 0) {
        toast.error("Unable to calculate order total. Please try again.")
        setIsPlacingOrder(false)
        return
      }

      setPricing(serverPricing)

      const orderPricing = {
        subtotal: Number(serverPricing.subtotal) || subtotal,
        deliveryFee: Number(serverPricing.deliveryFee) || 0,
        tax: Number(serverPricing.tax) || 0,
        platformFee: Number(serverPricing.platformFee) || 0,
        discount: Number(serverPricing.discount) || 0,
        total: Number(serverPricing.total),
        couponCode: serverPricing.couponCode || serverPricing.appliedCoupon?.code || resolvedCouponCode || null,
      }

      const checkoutTotal = orderPricing.total

      debugLog("?? Order pricing (server):", orderPricing)

      const orderPayload = {
        items: orderItems,
        address: {
          ...pricingAddress,
          phone: recipientPhone || defaultAddress?.phone || "",
          name: recipientName,
          fullName: recipientName,
        },
        customerName: recipientName,
        customerPhone: recipientPhone || defaultAddress?.phone || "",
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName || undefined,
        pricing: orderPricing,
        note: String(note || "").trim(),
        deliveryInstructions: deliveryInstructionText,
        deliveryMode,
        sendCutlery: sendCutlery !== false,
        paymentMethod: selectedPaymentMethod,
        // `useZone()` can return `null`. Zod expects string/undefined, not null.
        zoneId: zoneId || undefined,
        scheduledAt: isScheduled ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() : undefined,
      };
      // Log final order details (including paymentMethod for COD debugging)
      debugLog('?? FINAL: Sending order to backend with:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        itemCount: orderItems.length,
        totalAmount: orderPricing.total,
        paymentMethod: orderPayload.paymentMethod
      });

      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < checkoutTotal) {
        toast.error(`Insufficient wallet balance. Required: ${RUPEE_SYMBOL}${checkoutTotal.toFixed(0)}, Available: ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`)
        setIsPlacingOrder(false)
        return
      }

      // Create order in backend
      const orderResponse = await orderAPI.createOrder(orderPayload)

      debugLog("? Order created successfully:", orderResponse.data)

      const { order, razorpay } = orderResponse.data.data
      const pendingOnlineOrderId = order?._id || order?.id || order?.orderMongoId || null

      const cleanupAbandonedOnlinePayment = async () => {
        if (!pendingOnlineOrderId) return
        try {
          await orderAPI.abandonOnlinePayment(pendingOnlineOrderId)
          debugLog("Cleaned up abandoned online payment order:", pendingOnlineOrderId)
        } catch (cleanupError) {
          debugError("Failed to cleanup abandoned online payment order:", cleanupError)
        }
      }

      // Wallet flow: order placed with wallet payment (already processed in backend)
      if (selectedPaymentMethod === "wallet") {
        toast.success("Order placed with Wallet payment")
        setPlacedOrderId(order?._id || order?.orderId || order?.id || null)
        setShowOrderSuccess(true)
        window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
        clearCart()
        resetCartPreferences()
        setIsPlacingOrder(false)
        // Refresh wallet balance
        try {
          const walletResponse = await userAPI.getWallet()
          if (walletResponse?.data?.success && walletResponse?.data?.data?.wallet) {
            setWalletBalance(walletResponse.data.data.wallet.balance || 0)
          }
        } catch (error) {
          debugError("Error refreshing wallet balance:", error)
        }
        return
      }

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        debugError("? Razorpay initialization failed:", { razorpay, order })
        throw new Error(razorpay ? "Razorpay payment gateway is not configured. Please contact support." : "Failed to initialize payment")
      }

      debugLog("?? Razorpay order created:", {
        orderId: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        keyPresent: !!razorpay.key
      })

      // Get user info for Razorpay prefill
      const userInfo = userProfile || {}
      const userPhone = recipientPhone || userInfo.phone || defaultAddress?.phone || ""
      const userEmail = userInfo.email || ""
      const userName = recipientName || userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

      debugLog("?? User info for payment:", {
        name: userName,
        email: userEmail,
        phone: formattedPhone
      })

      // Get company name for Razorpay
      const companyName = await getCompanyNameAsync()

      // Initialize Razorpay payment
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount, // Already in paise from backend
        currency: razorpay.currency || 'INR',
        order_id: razorpay.orderId,
        name: companyName,
        description: `Order ${order._id || order.orderId} - ${RUPEE_SYMBOL}${(razorpay.amount / 100).toFixed(2)}`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone
        },
        notes: {
          orderId: order._id || order.orderId,
          userId: userInfo.id || "",
          restaurantId: restaurantId || "unknown"
        },
        handler: async (response) => {
          try {
            debugLog("? Payment successful, verifying...", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id
            })

            // Verify payment with backend
            const verifyOrderId = order?._id || order?.id || order?.orderMongoId
            if (!verifyOrderId) {
              throw new Error("Unable to verify payment: missing order id from create-order response")
            }
            const verifyResponse = await orderAPI.verifyPayment({
              orderId: verifyOrderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })

            debugLog("? Payment verification response:", verifyResponse.data)

            if (verifyResponse.data.success) {
              // Payment successful
              debugLog("?? Order placed successfully:", {
                orderId: order._id || order.orderId,
                paymentId: verifyResponse.data.data?.payment?.paymentId
              })
              setPlacedOrderId(order._id || order.orderId)
              setShowOrderSuccess(true)
              window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
              clearCart()
              resetCartPreferences()
              setIsPlacingOrder(false)
            } else {
              throw new Error(verifyResponse.data.message || "Payment verification failed")
            }
          } catch (error) {
            debugError("? Payment verification error:", error)
            const errorMessage =
              error?.response?.data?.message ||
              error?.response?.data?.error?.message ||
              error?.response?.data?.errors?.[0]?.message ||
              error?.message ||
              "Payment verification failed. Please contact support."
            alert(errorMessage)
            setIsPlacingOrder(false)
          }
        },
        onError: async (error) => {
          debugError("? Razorpay payment error:", error)
          // Don't show alert for user cancellation
          if (error?.code !== 'PAYMENT_CANCELLED' && error?.message !== 'PAYMENT_CANCELLED') {
            const errorMessage = error?.description || error?.message || "Payment failed. Please try again."
            alert(errorMessage)
          } else {
            await cleanupAbandonedOnlinePayment()
          }
          setIsPlacingOrder(false)
        },
        onClose: async () => {
          debugLog("?? Payment modal closed by user")
          await cleanupAbandonedOnlinePayment()
          setIsPlacingOrder(false)
        }
      })
    } catch (error) {
      debugError("? Order creation error:", error)

      let errorMessage = "Failed to create order. Please try again."

      // Handle network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        const backendUrl = API_BASE_URL.replace('/api', '');
        errorMessage = `Network Error: Cannot connect to backend server.\n\n` +
          `Expected backend URL: ${backendUrl}\n\n` +
          `Please check:\n` +
          `1. Backend server is running\n` +
          `2. Backend is accessible at ${backendUrl}\n` +
          `3. Check browser console (F12) for more details\n\n` +
          `If backend is not running, start it with:\n` +
          `cd switcheats/backend && npm start`

        debugError("?? Network Error Details:", {
          code: error.code,
          message: error.message,
          config: {
            url: error.config?.url,
            baseURL: error.config?.baseURL,
            fullUrl: error.config?.baseURL + error.config?.url,
            method: error.config?.method
          },
          backendUrl: backendUrl,
          apiBaseUrl: API_BASE_URL
        })

        // Backend disconnected - no health check (new backend in progress)
      }
      // Handle timeout errors
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again."
      }
      // Handle other axios errors
      else if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`
      }
      // Handle other errors
      else if (error.message) {
        errorMessage = error.message
      }

      alert(errorMessage)
      setIsPlacingOrder(false)
    }
  }

  const handleGoToOrders = () => {
    setShowOrderSuccess(false)
    navigate(`/user/orders/${placedOrderId}?confirmed=true`)
  }

  // Empty cart state - but don't show if order success or placing order modal is active
  if (cart.length === 0 && !showOrderSuccess && !showPlacingOrder) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="bg-white dark:bg-[#1a1a1a] border-b dark:border-gray-800 sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-gray-800 dark:text-white">Cart</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Utensils className="h-10 w-10 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Your cart is empty</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">Add items from a restaurant to start a new order</p>
          <Link to="/user">
            <Button
              className="text-white border-0"
              style={{
                background: "linear-gradient(135deg, rgba(var(--module-theme-rgb,250,2,114),0.9), var(--module-theme-color,#FA0272))",
                boxShadow: "0 8px 18px rgba(var(--module-theme-rgb,250,2,114),0.25)",
              }}
            >
              Browse Restaurants
            </Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="sticky top-0 z-20 flex-shrink-0 text-white">
        <div style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}>
          <div className="max-w-7xl mx-auto px-3 md:px-6 pt-4 pb-4 md:pt-5 md:pb-5">
            <div className="flex items-start gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-white hover:bg-white/15 mt-0.5"
                onClick={handleBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <button
                type="button"
                onClick={() => setShowAddressSheet(true)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-[15px] md:text-base font-semibold leading-snug truncate">
                  {restaurantName}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 text-[12px] md:text-[13px] text-white/90">
                  <Home className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {headerDeliveryTime} to <span className="font-semibold">{headerAddressLabel}</span>
                    {headerAddressText ? ` | ${headerAddressText}` : ""}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-90" />
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-white hover:bg-white/15 mt-0.5"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Transition curve: Downward green corners effect */}
        <div 
          className="h-5 md:h-6 w-full relative"
          style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}
        >
          <div 
            className="absolute top-0 left-0 w-full bg-slate-50 dark:bg-[#0a0a0a] rounded-t-[1.75rem] md:rounded-t-[2rem]" 
            style={{ height: 'calc(100% + 2px)' }}
          />
        </div>
      </div>

      {!canPlaceOrder && cart.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 md:px-6 py-2.5">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {restaurantName} is currently offline. You can keep items in your cart, but checkout will open once the restaurant is back online.
            </p>
          </div>
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-24 relative z-10 bg-slate-50 dark:bg-[#0a0a0a]">
        <CartAutoCouponBanner
          appliedCoupon={appliedCoupon?.autoApplied ? appliedCoupon : null}
          savings={itemDiscountAmount}
        />

        {/* Savings Banner */}
        {otherSavings > 0 && (
          <div className="bg-blue-100 dark:bg-blue-900/20 px-4 md:px-6 py-2 md:py-3 flex-shrink-0">
            <div className="max-w-7xl mx-auto">
              <p className="text-sm md:text-base font-medium text-blue-800 dark:text-blue-200">
                Saved {RUPEE_SYMBOL}{otherSavings.toFixed(0)} on this order
              </p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6">
          <div className="max-w-3xl mx-auto">
            {/* Main Cart Content */}
            <div className="space-y-2 md:space-y-4">
              {/* Cart Items */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-4 md:py-5 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 dark:border-gray-800">
                <div className="space-y-3 md:space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 md:gap-4">
                      {/* Veg/Non-veg indicator */}
                      <div
                        className="w-4 h-4 md:w-5 md:h-5 border-2 flex items-center justify-center mt-1 flex-shrink-0"
                        style={{ borderColor: item.foodType === 'Veg' || item.isVeg === true ? "#16a34a" : "#dc2626" }}
                      >
                        <div
                          className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
                          style={{ backgroundColor: item.foodType === 'Veg' || item.isVeg === true ? "#16a34a" : "#dc2626" }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 leading-tight">{item.name}</p>
                        {item.variantName ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.variantName}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3 md:gap-4">
                        {/* Quantity controls */}
                        <div className="flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#141414] px-1 py-0.5">
                          <button
                            type="button"
                            className="h-5 w-5 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:opacity-70"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[14px] text-center tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="h-5 w-5 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:opacity-70"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="min-w-[70px] text-right">
                          {Number(item.otherPrice) > 0 &&
                          Number(item.otherPrice) > Number(item.price || 0) ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[11px] text-gray-400 line-through tabular-nums">
                                {RUPEE_SYMBOL}
                                {Math.round(
                                  Number(item.otherPrice) * (item.quantity || 1),
                                )}
                              </span>
                              <div className="flex items-center gap-1 justify-end">
                                <span className="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-xs font-bold text-[#FA0272] tabular-nums">
                                  {RUPEE_SYMBOL}
                                  {((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                              {RUPEE_SYMBOL}
                              {((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1.5 shrink-0 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-[12px] font-semibold text-gray-700 dark:text-gray-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Items
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCookingSheet(true)}
                    className={`flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-2 text-[12px] font-semibold ${
                      note.trim()
                        ? "border-[#EB590E]/40 bg-[#FFF1E8] text-[#EB590E]"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {note.trim() ? "Edit cooking requests" : "Cooking requests"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendCutlery(!sendCutlery)}
                    className={`flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-2 text-[12px] font-semibold ${
                      sendCutlery
                        ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] text-gray-700 dark:text-gray-300"
                        : "border-[#EB590E]/40 bg-[#FFF1E8] text-[#EB590E]"
                    }`}
                  >
                    <Square className={`h-3.5 w-3.5 ${sendCutlery ? "" : "fill-current"}`} />
                    {sendCutlery ? "Send cutlery" : "No cutlery"}
                  </button>
                </div>
                {note.trim() ? (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Cooking note:</span> {note.trim()}
                  </p>
                ) : null}
              </div>

              {/* Complete your meal section - Approved Addons */}
              {suggestedAddons.length > 0 && (
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-4 rounded-2xl shadow-sm border border-slate-100 dark:border-gray-800">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-3">
                    Complete your meal
                  </p>
                  {loadingAddons ? (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-[84px] md:w-[92px] animate-pulse">
                          <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg" />
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mt-1 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2.5 md:gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {suggestedAddons.map((addon) => (
                        <div key={addon.id} className="flex-shrink-0 w-[84px] md:w-[92px]">
                          <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-square">
                            <img
                              src={addon.image || (addon.images && addon.images[0]) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"}
                              alt={addon.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.onerror = null
                                e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"
                              }}
                            />
                            <div className="absolute top-1 md:top-2 left-1 md:left-2">
                              <div
                                className="w-3.5 h-3.5 md:w-4 md:h-4 bg-white border flex items-center justify-center rounded"
                                style={{ borderColor: addon.foodType === 'Veg' || addon.isVeg === true ? "#16a34a" : "#dc2626" }}
                              >
                                <div
                                  className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full"
                                  style={{ backgroundColor: addon.foodType === 'Veg' || addon.isVeg === true ? "#16a34a" : "#dc2626" }}
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                // Use restaurant info from existing cart items to ensure format consistency
                                const cartRestaurantId = cart[0]?.restaurantId || restaurantId;
                                const cartRestaurantName = cart[0]?.restaurant || restaurantName;

                                if (!cartRestaurantId || !cartRestaurantName) {
                                  debugError('? Cannot add addon: Missing restaurant information', {
                                    cartRestaurantId,
                                    cartRestaurantName,
                                    restaurantId,
                                    restaurantName,
                                    cartItem: cart[0]
                                  });
                                  toast.error('Restaurant information is missing. Please refresh the page.');
                                  return;
                                }

                                addToCart({
                                  id: addon.id,
                                  name: addon.name,
                                  price: addon.price,
                                  image: addon.image || (addon.images && addon.images[0]) || "",
                                  description: addon.description || "",
                                  isVeg: addon.isVeg,
                                  foodType: addon.foodType,
                                  restaurant: cartRestaurantName,
                                  restaurantId: cartRestaurantId
                                });
                              }}
                              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white border border-[#EB590E] flex items-center justify-center shadow-sm hover:bg-orange-50 transition-colors"
                            >
                              <Plus className="h-3 w-3 text-[#EB590E]" />
                            </button>
                          </div>
                          <p className="text-[11px] md:text-xs font-medium text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 leading-tight">{addon.name}</p>
                          {addon.description && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{addon.description}</p>
                          )}
                          <p className="text-[11px] md:text-xs text-gray-800 dark:text-gray-200 font-semibold mt-0.5">{RUPEE_SYMBOL}{addon.price}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Offers row */}
              <button
                type="button"
                onClick={() => setShowOffersView(true)}
                className={`w-full bg-white dark:bg-[#1a1a1a] rounded-2xl border shadow-sm px-4 py-3.5 flex items-center gap-3 text-left ${
                  appliedCoupon
                    ? "border-[#FA0272]/30 dark:border-[#FA0272]/40"
                    : "border-slate-100 dark:border-gray-800"
                }`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  appliedCoupon
                    ? "bg-pink-50 dark:bg-pink-950/40"
                    : "bg-emerald-50 dark:bg-emerald-950/40"
                }`}>
                  <Tag className={`h-4 w-4 ${appliedCoupon ? "text-[#FA0272]" : "text-emerald-600"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${appliedCoupon ? "text-[#FA0272]" : "text-gray-900 dark:text-white"}`}>
                    {appliedCoupon
                      ? `'${appliedCoupon.code}' applied`
                      : "Payment offers & more"}
                  </p>
                  <p className={`text-xs mt-0.5 truncate ${appliedCoupon ? "text-[#FA0272]/80 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                    {appliedCoupon
                      ? `You saved ${RUPEE_SYMBOL}${discount.toFixed(0)} on this order`
                      : loadingCoupons
                        ? "Loading offers..."
                        : availableCoupons.length > 0
                          ? `${availableCoupons.length} offer${availableCoupons.length > 1 ? "s" : ""} available`
                          : "Explore bank offers and coupons"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </button>

              {/* Delivery modes & instructions */}
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-slate-100 dark:border-gray-800 overflow-hidden">
                <div className="p-3">
                  <div className="flex items-center rounded-full bg-gray-100 dark:bg-[#222222] p-1">
                    <button
                      type="button"
                      onClick={() => setDeliverySectionTab("modes")}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-full px-2 sm:px-3 py-2 text-[11px] sm:text-[12px] font-semibold whitespace-nowrap transition-colors ${
                        deliverySectionTab === "modes"
                          ? "bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <span className="whitespace-nowrap">Delivery Modes</span>
                      <span
                        className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide px-1 sm:px-1.5 py-0.5 rounded-full text-white shrink-0"
                        style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}
                      >
                        New
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliverySectionTab("instructions")}
                      className={`flex-1 rounded-full px-2 sm:px-3 py-2 text-[11px] sm:text-[12px] font-semibold whitespace-nowrap transition-colors ${
                        deliverySectionTab === "instructions"
                          ? "bg-white dark:bg-[#1a1a1a] text-[#FA0272] shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      Instructions
                    </button>
                  </div>
                </div>

                {deliverySectionTab === "modes" ? (
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("quick")}
                      className="w-full flex items-start gap-3 text-left pb-3 border-b border-gray-100 dark:border-gray-800"
                    >
                      <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        deliveryMode === "quick" ? "border-[#FA0272]" : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {deliveryMode === "quick" ? <div className="h-2.5 w-2.5 rounded-full bg-[#FA0272]" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            Quick <Zap className="inline h-3.5 w-3.5 text-[#FA0272] mb-0.5" /> {quickDeliveryTime}
                          </p>
                          <p className={`text-xs font-semibold shrink-0 ${deliveryMode === "quick" ? "text-[#FA0272]" : "text-gray-500"}`}>
                            +{RUPEE_SYMBOL}{configuredQuickDeliveryFee}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          In a hurry? Get food up to 15 mins faster
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMode("basic")}
                      className="w-full flex items-start gap-3 text-left pt-3"
                    >
                      <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        deliveryMode === "basic" ? "border-[#FA0272]" : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {deliveryMode === "basic" ? <div className="h-2.5 w-2.5 rounded-full bg-[#FA0272]" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Basic | {basicDeliveryTime}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Your everyday delivery
                        </p>
                      </div>
                    </button>

                    {!hasSavedAddress && (
                      <button
                        type="button"
                        onClick={() => setShowAddressSheet(true)}
                        className="w-full text-left text-sm font-medium text-[#EB590E] pt-1"
                      >
                        Select a delivery location to continue
                      </button>
                    )}

                    {deliveryInstructionText ? (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Delivery note:</span> {deliveryInstructionText}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                      {PREDEFINED_DELIVERY_INSTRUCTIONS.map(({ id, label, Icon }) => {
                        const isSelected =
                          deliveryInstructionMode === "preset" && selectedDeliveryInstruction === id
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setDeliveryInstructionMode("preset")
                              setSelectedDeliveryInstruction(isSelected ? null : id)
                              setCustomDeliveryInstruction("")
                            }}
                            className={`shrink-0 w-[92px] rounded-xl border p-3 text-center transition-colors ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414]"
                            }`}
                          >
                            <Icon className={`h-5 w-5 mx-auto mb-2 ${isSelected ? "text-emerald-600" : "text-gray-600 dark:text-gray-300"}`} />
                            <p className={`text-[10px] font-semibold leading-tight ${isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-300"}`}>
                              {label}
                            </p>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryInstructionMode("custom")
                          setSelectedDeliveryInstruction(null)
                        }}
                        className={`shrink-0 w-[92px] rounded-xl border p-3 text-center transition-colors ${
                          deliveryInstructionMode === "custom"
                            ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414]"
                        }`}
                      >
                        <Pencil className={`h-5 w-5 mx-auto mb-2 ${deliveryInstructionMode === "custom" ? "text-emerald-600" : "text-gray-600 dark:text-gray-300"}`} />
                        <p className={`text-[10px] font-semibold leading-tight ${deliveryInstructionMode === "custom" ? "text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-300"}`}>
                          Add custom
                        </p>
                      </button>
                    </div>

                    {deliveryInstructionMode === "custom" ? (
                      <textarea
                        value={customDeliveryInstruction}
                        onChange={(e) => setCustomDeliveryInstruction(e.target.value)}
                        rows={3}
                        placeholder="Type delivery instructions for your partner..."
                        className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111111] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-emerald-600 resize-none"
                      />
                    ) : null}

                    {(deliveryInstructionMode === "preset" && selectedDeliveryInstruction) ||
                    (deliveryInstructionMode === "custom" && customDeliveryInstruction.trim()) ? (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Delivery note:</span>{" "}
                        {deliveryInstructionText}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-slate-100 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3.5 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Order recipient</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Delivery contact details</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecipientEditToggle}
                    className="text-xs font-bold uppercase tracking-wide shrink-0"
                    style={{ color: "var(--module-theme-color, #FA0272)" }}
                  >
                    {isEditingRecipient ? "Save" : "Change"}
                  </button>
                </div>

                {!isEditingRecipient ? (
                  <div className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{recipientName}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 tabular-nums">
                      {recipientPhone ? `+91 ${recipientPhone}` : "+91 XXXXXXXXXX"}
                    </p>
                  </div>
                ) : (
                  <div className="px-4 py-3.5 space-y-3 bg-gray-50/60 dark:bg-[#141414]/60">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                        Recipient name
                      </label>
                      <input
                        type="text"
                        value={recipientDetails.name}
                        onChange={(e) =>
                          setRecipientDetails((prev) => ({
                            ...prev,
                            name: sanitizeRecipientName(e.target.value),
                          }))
                        }
                        placeholder="Enter recipient name"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#FA0272]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                        Phone number
                      </label>
                      <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] overflow-hidden focus-within:border-[#FA0272]">
                        <span className="px-3 text-sm text-gray-500 border-r border-gray-200 dark:border-gray-700">+91</span>
                        <input
                          type="tel"
                          value={recipientDetails.phone}
                          onChange={(e) =>
                            setRecipientDetails((prev) => ({
                              ...prev,
                              phone: sanitizeRecipientPhone(e.target.value),
                            }))
                          }
                          maxLength={10}
                          placeholder="10-digit mobile"
                          className="flex-1 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none tabular-nums"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      Ordering for someone else? Save their name and phone here.
                    </p>
                  </div>
                )}
              </div>
{/* Bill Details */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 py-4 rounded-2xl shadow-sm border border-slate-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowBillDetails(!showBillDetails)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-3">
                    <Receipt className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        To Pay {RUPEE_SYMBOL}{total.toFixed(0)}
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">Incl. all taxes & charges</p>
                    </div>
                  </div>
                  <ChevronUp className={`h-4 w-4 text-gray-400 transition-transform ${showBillDetails ? "" : "rotate-180"}`} />
                </button>

                {showBillDetails && (
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-800 space-y-3">
                    <div className="flex justify-between text-sm items-start gap-3">
                      <span className="text-gray-600 dark:text-gray-400 border-b border-dotted border-gray-300 shrink-0">Item Total</span>
                      <DualMoney
                        amount={subtotal}
                        compareAmount={compareItemTotal}
                        decimals={2}
                        showDiscountTag={false}
                        plainClassName="text-gray-800 dark:text-gray-200 font-medium tabular-nums"
                        saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
                      />
                    </div>
                    {itemDiscountAmount > 0 && (
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-[#FA0272] border-b border-dotted border-pink-300">Coupon Discount</span>
                        <span className="text-[#FA0272]">-{RUPEE_SYMBOL}{itemDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-gray-600 dark:text-gray-400 border-b border-dotted border-gray-300">
                          Delivery Fee
                          {deliveryFeeBreakdownText
                            ? ` | ${deliveryFeeBreakdownText.replace(/^Distance:\s*/i, "")}`
                            : ""}
                        </span>
                        {deliveryFee > 0 && (
                          <p className="mt-0.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
                            {formatDeliveryFeeBreakdownSubtext(deliveryFee, deliveryFeeGst, RUPEE_SYMBOL)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 whitespace-nowrap text-right font-medium ${
                          deliveryFee === 0
                            ? "text-emerald-600 font-semibold"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {deliveryFee === 0
                          ? "FREE"
                          : `${RUPEE_SYMBOL}${getDeliveryFeeTotal(deliveryFee, deliveryFeeGst).toFixed(2)}`}
                      </span>
                    </div>
                    {quickDeliveryFee > 0 && (
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-[#FA0272] border-b border-dotted border-pink-300">Quick Mode</span>
                        <span className="text-[#FA0272]">{RUPEE_SYMBOL}{quickDeliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 border-b border-dotted border-gray-300">Platform Fee</span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium">{RUPEE_SYMBOL}{Math.max(0, platformFee - quickDeliveryFee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 border-b border-dotted border-gray-300">Government Taxes</span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium">{RUPEE_SYMBOL}{gstCharges.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-3 mt-1 border-t border-gray-100 dark:border-gray-800 text-gray-900 dark:text-white">
                      <span>To Pay</span>
                      <span>{RUPEE_SYMBOL}{total.toFixed(2)}</span>
                    </div>
                    {otherSavings > 0 && (
                      <div className="rounded-xl bg-pink-50 dark:bg-pink-950/20 px-3 py-2.5 text-xs font-medium text-pink-700 dark:text-pink-300">
                        You saved {RUPEE_SYMBOL}{otherSavings.toFixed(0)} on fees and discounts
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-1">
                Cancellation policy: Please double-check your order and address details. Orders are non-refundable once placed.
              </p>

            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky - Pay bar */}
      <div
        className="bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-30 flex-shrink-0 fixed bottom-0 left-0 right-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="max-w-lg mx-auto flex items-stretch gap-3">
            <button
              type="button"
              onClick={() => setShowPaymentSheet(true)}
              className="flex-1 min-w-0 text-left px-1 py-1"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                Pay using <ChevronUp className="h-3 w-3" />
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {selectedPaymentLabel}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {selectedPaymentMethod === "wallet"
                  ? `Balance ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`
                  : "UPI, Cards, Netbanking"}
              </p>
            </button>
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={
                isPlacingOrder ||
                loadingRestaurant ||
                !canPlaceOrder ||
                (selectedPaymentMethod === "wallet" && walletBalance < total)
              }
              className="shrink-0 min-w-[132px] px-5 rounded-full text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{
                backgroundColor: "var(--module-theme-color, #FA0272)",
                boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 250,2,114), 0.28)",
              }}
            >
              {isPlacingOrder
                ? "Processing..."
                : loadingRestaurant
                  ? "Loading..."
                  : !canPlaceOrder
                    ? "Offline"
                    : !hasSavedAddress
                      ? "Add Address"
                      : `Pay ${RUPEE_SYMBOL}${total.toFixed(0)}`}
            </button>
          </div>
        </div>
      </div>

          {/* Placing Order Modal */}
          {showPlacingOrder && (
            <div className="fixed inset-0 z-[60] h-screen w-screen overflow-hidden">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

              {/* Modal Sheet */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
                style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                <div className="px-6 py-8">
                  {/* Title */}
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Placing your order</h2>

                  {/* Payment Info */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-white shadow-sm">
                      <CreditCard className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selectedPaymentMethod === "razorpay"
                          ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} online (Razorpay)`
                          : selectedPaymentMethod === "wallet"
                            ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} from Wallet`
                            : `Pay on delivery (COD)`}
                      </p>
                    </div>
                  </div>

                  {/* Delivery Address */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50">
                      <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">Delivering to Location</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Address") : "Add address"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {defaultAddress ? (formatFullAddress(defaultAddress) || "Address") : "Address"}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="relative mb-6">
                    <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#EB590E] to-[#D94F0C] rounded-full transition-all duration-100 ease-linear"
                        style={{
                          width: `${orderProgress}%`,
                          boxShadow: '0 0 10px rgba(235, 89, 14, 0.5)'
                        }}
                      />
                    </div>
                    {/* Animated shimmer effect */}
                    <div
                      className="absolute inset-0 h-2.5 rounded-full overflow-hidden pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                        animation: 'shimmer 1.5s infinite',
                        width: `${orderProgress}%`
                      }}
                    />
                  </div>

                  {/* Cancel Button */}
                  <button
                    onClick={() => {
                      setShowPlacingOrder(false)
                      setIsPlacingOrder(false)
                    }}
                    className="w-full text-right"
                  >
                    <span className="text-[#EB590E] font-semibold text-base hover:text-[#D94F0C] transition-colors">
                      CANCEL
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Order Success Celebration Page */}
          {showOrderSuccess && (
            <div
              className="fixed inset-0 z-[70] bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center h-screen w-screen overflow-hidden"
              style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
              {/* Confetti Background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Animated confetti pieces */}
                {[...Array(50)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-3 h-3 rounded-sm"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `-10%`,
                      backgroundColor: ['#EB590E', '#3b82f6', '#f59e0b', '#ef4444', '#D94F0C', '#ec4899'][Math.floor(Math.random() * 6)],
                      animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s infinite`,
                      transform: `rotate(${Math.random() * 360}deg)`,
                    }}
                  />
                ))}
              </div>

              {/* Success Content */}
              <div className="relative z-10 flex flex-col items-center px-6">
                {/* Success Tick Circle */}
                <div
                  className="relative mb-8"
                  style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}
                >
                  {/* Outer ring animation */}
                  <div
                    className="absolute inset-0 w-32 h-32 rounded-full border-4 border-green-500 dark:border-green-400"
                    style={{
                      animation: 'ringPulse 1.5s ease-out infinite',
                      opacity: 0.3
                    }}
                  />
                  {/* Main circle */}
                  <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-green-600 dark:from-green-500 dark:to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-200/60 dark:shadow-green-900/40">
                    <svg
                      className="w-16 h-16 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ animation: 'checkDraw 0.5s ease-out 0.5s both' }}
                    >
                      <path d="M5 12l5 5L19 7" className="check-path" />
                    </svg>
                  </div>
                  {/* Sparkles */}
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full"
                      style={{
                        top: '50%',
                        left: '50%',
                        animation: `sparkle 0.6s ease-out ${0.3 + i * 0.1}s both`,
                        transform: `rotate(${i * 60}deg) translateY(-80px)`,
                      }}
                    />
                  ))}
                </div>

                {/* Location Info */}
                <div
                  className="text-center"
                  style={{ animation: 'slideUp 0.5s ease-out 0.6s both' }}
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-5 h-5 text-red-500 dark:text-red-400">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {defaultAddress?.city || "Your Location"}
                    </h2>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-base">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Delivery Address") : "Delivery Address"}
                  </p>
                </div>

                {/* Order Placed Message */}
                <div
                  className="mt-12 text-center"
                  style={{ animation: 'slideUp 0.5s ease-out 0.8s both' }}
                >
                  <h3 className="text-3xl font-bold text-[#EB590E] dark:text-orange-400 mb-2">Order Placed!</h3>
                  <p className="text-gray-600 dark:text-gray-300">Your delicious food is on its way</p>
                </div>

                {/* Action Button */}
                <button
                  onClick={handleGoToOrders}
                  className="mt-10 bg-[#EB590E] hover:bg-[#D94F0C] text-white font-semibold py-4 px-12 rounded-xl shadow-lg shadow-orange-200/70 dark:shadow-orange-950/40 transition-all hover:shadow-xl hover:scale-105"
                  style={{ animation: 'slideUp 0.5s ease-out 1s both' }}
                >
                  Track Your Order
                </button>
              </div>
            </div>
          )}

          {/* Address Selection Bottom Sheet */}
          <AnimatePresence>
            {showAddressSheet && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowAddressSheet(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                  className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-[1.75rem] z-[101] shadow-2xl overflow-hidden max-h-[78vh] flex flex-col"
                  style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
                >
                  <div className="p-5 flex flex-col min-h-0">
                    <div className="w-10 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Choose a delivery address</h2>
                      <button
                        type="button"
                        onClick={() => setShowAddressSheet(false)}
                        className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenAddAddress}
                      className="flex items-center gap-3 w-full py-3 mb-3 text-left"
                    >
                      <div className="h-10 w-10 rounded-lg border-2 border-dashed border-emerald-500 flex items-center justify-center shrink-0">
                        <Plus className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">Add new Address</span>
                    </button>

                    <div className="space-y-2 overflow-y-auto pr-1 pb-2">
                      {addresses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center">
                          <MapPin className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No saved addresses yet</p>
                          <p className="text-xs text-gray-500 mt-1">Add an address to place your order</p>
                        </div>
                      ) : (
                        addresses.map((address) => {
                          const AddressIcon = getAddressIcon(address)
                          const addressId = getAddressId(address)
                          const isSelected = addressId && addressId === getAddressId(defaultAddress)
                          const distanceLabel = formatAddressDistanceLabel(address)

                          return (
                            <button
                              key={addressId || `${address.label}-${address.street}`}
                              type="button"
                              onClick={() => handleSelectAddressFromSheet(address)}
                              className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
                                isSelected
                                  ? "border-[#EB590E]/40 bg-[#FFF7F2] dark:bg-[#EB590E]/10"
                                  : "border-gray-100 dark:border-gray-800 bg-white dark:bg-[#222222] hover:border-gray-200"
                              }`}
                            >
                              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                                <AddressIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {getDisplayAddressLabel(address.label)}
                                  </p>
                                  {isSelected && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                  {formatFullAddress(address) || address?.formattedAddress || address?.address || "Address"}
                                </p>
                              </div>
                              {distanceLabel && (
                                <span className="text-[11px] font-semibold text-gray-400 shrink-0 mt-1">
                                  {distanceLabel}
                                </span>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Cooking Instructions Bottom Sheet */}
          <AnimatePresence>
            {showCookingSheet && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCookingSheet(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                  className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-[1.75rem] z-[101] shadow-2xl overflow-hidden"
                  style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
                >
                  <div className="p-5">
                    <div className="w-10 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Cooking requests</h2>
                      <button
                        type="button"
                        onClick={() => setShowCookingSheet(false)}
                        className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      These notes are shared with the restaurant partner while preparing your order
                    </p>
                    <textarea
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value)
                        setShowNoteInput(true)
                      }}
                      rows={4}
                      placeholder="E.g. less spicy, no onions, extra sauce..."
                      className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111111] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#EB590E] resize-none"
                    />
                    <div className="mt-4 flex gap-2">
                      {note.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setNote("")
                            setShowNoteInput(false)
                          }}
                          className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCookingSheet(false)}
                        className="flex-1 h-11 rounded-xl text-white text-sm font-bold"
                        style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Offers Full Page */}
          <AnimatePresence>
            {showOffersView && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
                className="fixed inset-0 z-[95] bg-slate-50 dark:bg-[#0a0a0a] flex flex-col"
              >
                <div
                  className="sticky top-0 z-10 text-white shadow-sm"
                  style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/15"
                      onClick={() => setShowOffersView(false)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                      <p className="text-base font-semibold">Payment offers & more</p>
                      <p className="text-xs text-white/80">Coupons and bank offers for this order</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8">
                  {appliedCoupon ? (
                    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-100 dark:border-gray-800 p-4 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">'{appliedCoupon.code}' applied</p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            You saved {RUPEE_SYMBOL}{discount.toFixed(0)} on this order
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs font-bold text-[#EB590E] uppercase tracking-wide shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}

                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-100 dark:border-gray-800 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Have a coupon code?</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualCouponCode}
                        onChange={(e) => setManualCouponCode(e.target.value.toUpperCase())}
                        placeholder="Enter coupon code"
                        className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111111] px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#EB590E]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCouponCode}
                        className="h-11 px-4 rounded-xl text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: "var(--module-theme-color, #FA0272)" }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {loadingCoupons ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-24 rounded-2xl bg-white dark:bg-[#1a1a1a] animate-pulse border border-slate-100 dark:border-gray-800" />
                      ))}
                    </div>
                  ) : availableCoupons.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">
                        Available offers ({availableCoupons.length})
                      </p>
                      {availableCoupons.map((coupon) => {
                        const isLocked = subtotal < (Number(coupon.minOrder) || 0)
                        const isFirstTimeOnly = coupon.customerGroup === "new" && userOrderCount > 0
                        const isApplied = appliedCoupon?.code === coupon.code
                        const isDisabled = isLocked || isFirstTimeOnly || isApplied

                        return (
                          <div
                            key={coupon.code}
                            className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-100 dark:border-gray-800 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                                  <Percent className="h-5 w-5 text-[#EB590E]" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                                    {coupon.discountDisplay || `Save ${RUPEE_SYMBOL}${coupon.discount}`}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">Use code '{coupon.code}'</p>
                                  {coupon.customerGroup === "new" ? (
                                    <p className="text-[11px] text-[#EB590E] mt-1">First-time users only</p>
                                  ) : isLocked ? (
                                    <p className="text-[11px] text-blue-600 mt-1">
                                      Add items worth {RUPEE_SYMBOL}{(Number(coupon.minOrder) - subtotal).toFixed(0)} more
                                    </p>
                                  ) : coupon.description ? (
                                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{coupon.description}</p>
                                  ) : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleApplyCoupon(coupon)}
                                disabled={isDisabled}
                                className="shrink-0 border border-[#EB590E] text-[#EB590E] rounded-full px-4 py-1.5 text-xs font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isApplied ? "Applied" : "Apply"}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                      <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-950/40 dark:to-orange-950/30 flex items-center justify-center">
                        <Sparkles className="h-7 w-7 text-[#EB590E]" />
                      </div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">No offers right now</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto">
                        We couldn't find active coupons for this cart. You can still enter a code above if you have one.
                      </p>
                      <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                        <div className="rounded-xl bg-slate-50 dark:bg-[#141414] p-3">
                          <Tag className="h-4 w-4 text-emerald-600 mb-2" />
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Bank offers</p>
                          <p className="text-[11px] text-gray-500 mt-1">Check at payment step</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-[#141414] p-3">
                          <Percent className="h-4 w-4 text-[#EB590E] mb-2" />
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Restaurant deals</p>
                          <p className="text-[11px] text-gray-500 mt-1">Add more items to unlock</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Payment Selection Bottom Sheet */}
          <AnimatePresence>
            {showPaymentSheet && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowPaymentSheet(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                  className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-[2rem] z-[101] shadow-2xl overflow-hidden max-h-[82vh] md:max-h-[60vh] flex flex-col"
                  style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
                >
                  <div className="p-5 md:p-6 flex flex-col h-full min-h-0">
                    {/* Compact Drag handle */}
                    <div className="w-10 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mx-auto mb-5" />

                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-none">Payment Method</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-1">Select how you want to pay</p>
                      </div>
                      <button
                        onClick={() => setShowPaymentSheet(false)}
                        className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar pb-4 flex-1 min-h-0">
                      {[
                        {
                          id: 'razorpay',
                          name: 'Online Payment',
                          description: 'UPI, Cards, Netbanking',
                          icon: <Zap className="w-5 h-5" />,
                          color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
                          selectedColor: 'bg-emerald-500 text-white',
                          badge: 'SECURE'
                        },
                        {
                          id: 'wallet',
                          name: 'Quick Wallet',
                          description: 'Pay from your wallet',
                          icon: <Wallet className="w-5 h-5" />,
                          color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
                          selectedColor: 'bg-blue-500 text-white',
                          subInfo: `Bal: ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`,
                          disabled: walletBalance < total,
                          disabledText: 'Low Balance'
                        },
                      ].map((option) => (
                        <button
                          key={option.id}
                          onClick={() => {
                            if (!option.disabled) {
                              setSelectedPaymentMethod(option.id)
                              setShowPaymentSheet(false)
                            }
                          }}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === option.id
                              ? 'border-[#EB590E] bg-[#EB590E] shadow-lg shadow-orange-500/30'
                              : 'border-gray-100 dark:border-gray-800/80 bg-white dark:bg-[#222222] hover:border-orange-200 dark:hover:border-orange-900/30 shadow-sm'
                            } ${option.disabled ? 'opacity-40 grayscale-[0.8] cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${selectedPaymentMethod === option.id
                                ? 'bg-white/20 text-white'
                                : option.color
                              }`}>
                              {option.icon}
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-black tracking-tight leading-none transition-colors ${selectedPaymentMethod === option.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                                  }`}>
                                  {option.name}
                                </span>
                                {option.badge && (
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm tracking-wider ${selectedPaymentMethod === option.id
                                      ? 'bg-white/20 text-white'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    }`}>
                                    {option.badge}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <p className={`text-[11px] font-bold transition-colors ${selectedPaymentMethod === option.id ? 'text-white/80' : 'text-gray-400'
                                  }`}>
                                  {option.description}
                                </p>
                                {option.subInfo && !option.disabled && (
                                  <>
                                    <span className={`w-1 h-1 rounded-full ${selectedPaymentMethod === option.id ? 'bg-white/40' : 'bg-orange-300 dark:bg-orange-700'
                                      }`} />
                                    <p className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${selectedPaymentMethod === option.id ? 'text-white' : 'text-green-600 dark:text-green-500'
                                      }`}>
                                      {option.subInfo}
                                    </p>
                                  </>
                                )}
                              </div>
                              {option.disabled && (
                                <p className="text-[9px] font-black text-red-500 mt-1 uppercase tracking-wide">
                                  {option.disabledText}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedPaymentMethod === option.id
                              ? 'bg-white border-white'
                              : 'border-gray-200 dark:border-gray-700'
                            }`}>
                            {selectedPaymentMethod === option.id && <Check className="w-3.5 h-3.5 text-[#EB590E]" strokeWidth={4} />}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div
                      className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 bg-white dark:bg-[#1a1a1a]"
                      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))" }}
                    >
                      <div className="flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Total Pay</p>
                        <p className="text-xl font-black text-[#EB590E] tabular-nums">{RUPEE_SYMBOL}{total.toFixed(0)}</p>
                      </div>
                      <Button
                        onClick={() => setShowPaymentSheet(false)}
                        className="flex-1 bg-[#EB590E] hover:bg-[#D94F0C] text-white h-11 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all active:scale-[0.98]"
                      >
                        Confirm Order
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Animation Styles */}
          <style>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpBannerSmooth {
          from { transform: translateY(100%) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes slideUpBanner {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmerBanner {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes scaleInBounce {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes checkMarkDraw {
          0% { stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0; }
          50% { opacity: 1; }
          100% { stroke-dasharray: 100; stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes slideUpFull {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideUpModal {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes checkDraw {
          0% { stroke-dasharray: 100; stroke-dashoffset: 100; }
          100% { stroke-dasharray: 100; stroke-dashoffset: 0; }
        }
        @keyframes ringPulse {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes sparkle {
          0% { transform: rotate(var(--rotation, 0deg)) translateY(0) scale(0); opacity: 1; }
          100% { transform: rotate(var(--rotation, 0deg)) translateY(-80px) scale(1); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        .animate-slideUpFull {
          animation: slideUpFull 0.3s ease-out;
        }
        .check-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
      `}</style>

      {/* Share Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showShareModal && sharePayload && (
              <>
                <motion.div
                  className="fixed inset-0 bg-black/50 z-[10020]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowShareModal(false)}
                />
                <motion.div
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10021] w-[92vw] max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.16 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Share</h3>
                    <button
                      className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowShareModal(false)}
                      aria-label="Close share modal"
                    >
                      <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </button>
                  </div>

                  <div className="px-5 py-4 space-y-2">
                    {typeof navigator !== "undefined" && navigator.share && (
                      <button
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                        onClick={handleSystemShareFromModal}
                      >
                        <Share2 className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Share via system apps</span>
                      </button>
                    )}
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("whatsapp")}
                    >
                      <MessageCircle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">WhatsApp</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("telegram")}
                    >
                      <Send className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Telegram</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("email")}
                    >
                      <Mail className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Email</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={copyShareLink}
                    >
                      <Copy className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Copy link</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}      
