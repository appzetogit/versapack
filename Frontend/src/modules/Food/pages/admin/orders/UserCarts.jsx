import { useCallback, useEffect, useState } from "react"
import {
  Search,
  RefreshCw,
  ShoppingBag,
  Loader2,
  ChevronDown,
  User,
  Store,
  Phone,
  Mail,
  Clock,
} from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { resolveDeliveryFeeGst, formatDeliveryFeeBreakdownSubtext, getDeliveryFeeTotal } from "@food/utils/deliveryFeeDisplay"
import { getCartCompareItemTotal } from "@food/utils/foodVariants"
import { DualMoney } from "@food/components/user/FoodPriceDisplay"

const PAGE_SIZE = 20
const RUPEE = "\u20B9"

const formatShortDateTime = (value) => {
  if (!value) return "-"
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return String(value)
  }
}

const ROW_GRID =
  "grid grid-cols-[28px_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.2fr)_36px_72px_minmax(0,0.95fr)_76px] gap-2 items-center"

const formatMoney = (value) => `${RUPEE}${Number(value || 0).toFixed(2)}`

const getDeliveryBreakdownText = (pricing) => {
  const breakdown = pricing?.deliveryFeeBreakdown
  if (!breakdown) return null
  if (breakdown.message) return breakdown.message
  if (Number.isFinite(Number(breakdown.distanceKm))) {
    return `Distance: ${Number(breakdown.distanceKm).toFixed(1)} km`
  }
  return null
}

function CartBillBreakdown({ pricing, fallbackSubtotal = 0, items = [] }) {
  const subtotal = Number(pricing?.subtotal ?? fallbackSubtotal) || 0
  const deliveryFee = Number(pricing?.deliveryFee) || 0
  const deliveryFeeGst = resolveDeliveryFeeGst(deliveryFee, pricing?.deliveryFeeGst)
  const platformFee = Number(pricing?.platformFee) || 0
  const deliveryMode = pricing?.deliveryMode === "quick" ? "quick" : "basic"
  const quickDeliveryFee = Number(pricing?.quickDeliveryFee) || 0
  const basePlatformFee = Math.max(0, platformFee - quickDeliveryFee)
  const gstCharges = Number(pricing?.tax) || 0
  const discount = Number(pricing?.discount) || 0
  const total = Number(pricing?.total) || Math.max(0, subtotal + deliveryFee + deliveryFeeGst + platformFee + gstCharges - discount)
  const savings = Number(pricing?.savings) || 0
  const totalBeforeDiscount = subtotal + deliveryFee + deliveryFeeGst + platformFee + gstCharges
  const deliveryFeeBreakdownText = getDeliveryBreakdownText(pricing)
  const couponCode = String(pricing?.couponCode || pricing?.appliedCoupon?.code || "").trim()
  const hasCoupon = Boolean(couponCode)
  const offerAmount = hasCoupon && discount > 0 ? discount : 0
  const otherSavings = Math.max(0, savings - offerAmount)
  const deliveryGstSubtext =
    deliveryFee > 0 ? formatDeliveryFeeBreakdownSubtext(deliveryFee, deliveryFeeGst, RUPEE) : ""
  const compareItemTotal = getCartCompareItemTotal(items)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-3">Bill Details</h4>
      <div className="space-y-2.5">
        <div className="flex justify-between text-sm items-start gap-3">
          <span className="text-slate-600 shrink-0">Item Total</span>
          <DualMoney
            amount={subtotal}
            compareAmount={compareItemTotal}
            decimals={2}
            showDiscountTag={false}
            plainClassName="font-medium text-slate-800 tabular-nums"
            saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
          />
        </div>
        {offerAmount > 0 && (
          <div className="flex justify-between text-sm font-semibold text-[#FA0272]">
            <span>Offer / Coupon{couponCode ? ` (${couponCode})` : ""}</span>
            <span>-{formatMoney(offerAmount)}</span>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0 flex-1">
            <span className="text-slate-600">Delivery Fee</span>
            {deliveryGstSubtext ? (
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                {deliveryGstSubtext}
              </p>
            ) : null}
            {deliveryFeeBreakdownText && (
              <p className="mt-0.5 text-[11px] text-slate-500 border-l-2 border-slate-200 pl-2">
                {deliveryFeeBreakdownText}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 whitespace-nowrap text-right font-medium ${
              deliveryFee === 0 ? "text-emerald-600" : "text-slate-800"
            }`}
          >
            {deliveryFee === 0
              ? "FREE"
              : formatMoney(getDeliveryFeeTotal(deliveryFee, deliveryFeeGst))}
          </span>
        </div>
        {quickDeliveryFee > 0 && (
          <div className="flex justify-between text-sm font-semibold text-[#FA0272]">
            <span>Quick Mode</span>
            <span>{formatMoney(quickDeliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Platform Fee</span>
          <span className="font-medium text-slate-800">{formatMoney(basePlatformFee)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">GST and Restaurant Charges</span>
          <span className="font-medium text-slate-800">{formatMoney(gstCharges)}</span>
        </div>
        {otherSavings > 0 && (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">
            You saved {formatMoney(otherSavings)}
            {totalBeforeDiscount > total && (
              <span className="text-slate-400 line-through ml-2">{formatMoney(totalBeforeDiscount)}</span>
            )}
          </div>
        )}
        <div className="flex justify-between text-base font-bold pt-2 mt-1 border-t border-dashed border-slate-200 text-slate-900">
          <span>To Pay</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  )
}

export default function UserCarts() {
  const [carts, setCarts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedCartId, setExpandedCartId] = useState(null)
  const [pricingByCartId, setPricingByCartId] = useState({})
  const [pricingLoadingId, setPricingLoadingId] = useState(null)

  const fetchCarts = useCallback(async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getUserCarts({
        page,
        limit: PAGE_SIZE,
        ...(searchQuery ? { search: searchQuery } : {}),
      })
      const data = response?.data?.data || response?.data || {}
      setCarts(Array.isArray(data.carts) ? data.carts : [])
      setTotal(Number(data.total) || 0)
      setTotalPages(Math.max(1, Number(data.totalPages) || 1))
    } catch (error) {
      setCarts([])
      setTotal(0)
      setTotalPages(1)
      toast.error(error?.response?.data?.message || "Failed to load user carts")
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => {
    fetchCarts()
  }, [fetchCarts])

  useEffect(() => {
    setExpandedCartId(null)
    setPricingByCartId({})
  }, [page, searchQuery])

  const handleSearch = () => {
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  const getDisplayTotal = useCallback((cart) => {
    // Prefer the freshly calculated breakdown loaded by "View". The cart list
    // snapshot can be older and may not yet include the Quick Mode surcharge.
    const pricing = pricingByCartId[cart.id] || cart.pricing
    if (pricing && Number(pricing.total) > 0) return Number(pricing.total)
    return Number(cart.subtotal) || 0
  }, [pricingByCartId])

  const handleToggleCart = async (cart) => {
    if (expandedCartId === cart.id) {
      setExpandedCartId(null)
      return
    }

    setExpandedCartId(cart.id)

    if (pricingByCartId[cart.id]) return

    try {
      setPricingLoadingId(cart.id)
      const response = await adminAPI.getUserCartPricing(cart.id)
      const pricing = response?.data?.data?.pricing || response?.data?.pricing || null
      if (pricing) {
        setPricingByCartId((prev) => ({ ...prev, [cart.id]: pricing }))
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load cart breakdown")
    } finally {
      setPricingLoadingId(null)
    }
  }

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User Carts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Use View to open item list and bill breakdown.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search user, phone, restaurant..."
              className="pl-9 bg-white h-9"
            />
          </div>
          <Button
            onClick={handleSearch}
            size="sm"
            className="!bg-emerald-600 hover:!bg-emerald-700 !text-white border-0"
          >
            Search
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCarts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
        <span>
          {total > 0
            ? `Showing ${showingFrom}-${showingTo} of ${total} active carts`
            : "No active carts found"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        )}

        {!loading && carts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ShoppingBag className="h-9 w-9 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">No user carts to display</p>
          </div>
        ) : (
          <>
            <div className={`${ROW_GRID} px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600`}>
              <span>SI</span>
              <span>Customer</span>
              <span>Restaurant</span>
              <span>Items</span>
              <span className="text-center">Qty</span>
              <span className="text-right">To Pay</span>
              <span>Updated</span>
              <span className="text-center"> </span>
            </div>

            <div className="divide-y divide-slate-100">
              {carts.map((cart, index) => {
                const isExpanded = expandedCartId === cart.id
                const pricing = pricingByCartId[cart.id] || cart.pricing || null
                const itemsPreview = (cart.items || [])
                  .slice(0, 2)
                  .map((item) => `${item.quantity || 1}x ${item.name}${item.variantName ? ` (${item.variantName})` : ""}`)
                  .join(", ")
                const moreItems = (cart.items || []).length > 2 ? ` +${cart.items.length - 2} more` : ""

                return (
                  <div key={cart.id} className={isExpanded ? "bg-slate-50/50" : "bg-white"}>
                    <div className={`${ROW_GRID} px-4 py-3 hover:bg-slate-50 transition-colors`}>
                      <span className="text-sm text-slate-500">
                        {(page - 1) * PAGE_SIZE + index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{cart.userName || "Unknown"}</p>
                        {cart.userPhone && (
                          <p className="text-[11px] text-slate-500 truncate">{cart.userPhone}</p>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800 truncate min-w-0">{cart.restaurantName || "-"}</p>
                      <p className="text-xs text-slate-600 truncate min-w-0">
                        {itemsPreview || "No items"}{moreItems}
                      </p>
                      <span className="text-center text-sm font-semibold text-slate-800">
                        {cart.itemCount || 0}
                      </span>
                      <span className="text-right text-sm font-bold text-slate-900">
                        {formatMoney(getDisplayTotal(cart))}
                      </span>
                      <span className="text-xs text-slate-500 truncate min-w-0">
                        {formatShortDateTime(cart.updatedAt)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleCart(cart)}
                        className="h-8 px-2.5 text-xs shrink-0 justify-center"
                      >
                        {isExpanded ? "Hide" : "View"}
                        <ChevronDown
                          className={`h-3.5 w-3.5 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                          <div className="xl:col-span-3 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <User className="h-4 w-4 text-blue-600" />
                                  <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
                                </div>
                                <p className="text-sm font-semibold text-slate-900">{cart.userName || "Unknown user"}</p>
                                <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                                  {cart.userPhone && (
                                    <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{cart.userPhone}</p>
                                  )}
                                  {cart.userEmail && (
                                    <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{cart.userEmail}</p>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Store className="h-4 w-4 text-orange-600" />
                                  <p className="text-xs font-semibold uppercase text-slate-500">Restaurant</p>
                                </div>
                                <p className="text-sm font-semibold text-slate-900">{cart.restaurantName || "-"}</p>
                                {cart.restaurantId && (
                                  <p className="text-[11px] text-slate-400 mt-1 truncate">{cart.restaurantId}</p>
                                )}
                                <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  Updated {formatShortDateTime(cart.updatedAt)}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cart Items</p>
                              </div>
                              <table className="w-full table-fixed text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                      <th className="px-3 py-2 font-medium w-[38%]">Item</th>
                                      <th className="px-3 py-2 font-medium w-[22%]">Variant</th>
                                      <th className="px-3 py-2 font-medium text-center w-[10%]">Qty</th>
                                      <th className="px-3 py-2 font-medium text-right w-[15%]">Price</th>
                                      <th className="px-3 py-2 font-medium text-right w-[15%]">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(cart.items || []).map((item, itemIndex) => {
                                      const qty = Number(item.quantity) || 1
                                      const price = Number(item.price) || 0
                                      return (
                                        <tr key={`${item.lineItemId || item.itemId || itemIndex}`} className="border-b border-slate-50 last:border-none">
                                          <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                              {item.image ? (
                                                <img src={item.image} alt={item.name || "Item"} className="h-8 w-8 shrink-0 rounded object-cover border border-slate-200" />
                                              ) : (
                                                <div className="h-8 w-8 shrink-0 rounded bg-slate-100 border border-slate-200" />
                                              )}
                                              <span className="font-medium text-slate-900 truncate">{item.name || "Item"}</span>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-slate-600 truncate">{item.variantName || "-"}</td>
                                          <td className="px-3 py-2.5 text-center font-medium">{qty}</td>
                                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(price)}</td>
                                          <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{formatMoney(price * qty)}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                            </div>
                          </div>

                          <div className="xl:col-span-2">
                            {pricingLoadingId === cart.id ? (
                              <div className="rounded-xl border border-slate-200 bg-white p-8 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                              </div>
                            ) : (
                              <CartBillBreakdown pricing={pricing} fallbackSubtotal={cart.subtotal} items={cart.items} />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
