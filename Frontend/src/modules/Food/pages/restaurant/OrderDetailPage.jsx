import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ArrowLeft, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  Package, 
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Printer,
  Copy,
  Navigation,
  History,
  Wallet,
  X,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { getTimelineStatusLabel, getTimelineRoleLabel } from "@food/utils/orderStatus"
import { getRestaurantCookingNote } from "@food/utils/orderCookingNote"

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`
const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function OrderDetailPage({
  orderId: propOrderId = null,
  isSidebar = false,
  onClose = null,
}) {
  const { id: paramId } = useParams()
  const goBack = useRestaurantBackNavigation()
  const id = propOrderId || paramId
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Short-pick reporting. `picked` is parallel to order.items, because order lines
  // carry no id of their own and the server addresses them by index too.
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState([])
  const [submittingPick, setSubmittingPick] = useState(false)

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await restaurantAPI.getOrderById(id)
        
        // Backend returns { success: true, data: { order: { ... } } }
        const orderData = response.data?.data?.order || response.data?.order || response.data?.data
        
        if (orderData) {
          setOrder(orderData)
        } else {
          setError("Order details not found in response")
        }
      } catch (err) {
        console.error("Error fetching order:", err)
        setError(err.response?.data?.message || "Failed to fetch order details")
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchOrder()
    }
  }, [id])

  const handleClose = () => {
    if (isSidebar && typeof onClose === "function") {
      onClose()
      return
    }
    goBack()
  }

  const handleCopyId = (e) => {
    if (e) e.stopPropagation()
    const orderId = order?.orderId || order?.order_id || id
    navigator.clipboard.writeText(orderId)
    toast.success("Order ID copied")
  }

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase()
    if (s.includes("delivered") || s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200"
    if (s.includes("cancel") || s === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
    if (s === "preparing") return "bg-sky-50 text-sky-700 border-sky-200"
    if (s === "ready_for_pickup") return "bg-indigo-50 text-indigo-700 border-indigo-200"
    return "bg-amber-50 text-amber-700 border-amber-200"
  }

  if (loading) {
    return (
      <div className={`${isSidebar ? "h-full min-h-[400px]" : "min-h-screen"} bg-[#F8F9FB] flex items-center justify-center p-6`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <div className="absolute inset-0 bg-blue-600/10 rounded-full blur-xl animate-pulse"></div>
          </div>
          <p className="text-gray-500 font-bold text-sm tracking-wide uppercase">Preparing Details</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className={`${isSidebar ? "h-full min-h-[400px]" : "min-h-screen"} bg-[#F8F9FB]`}>
        <header className={`bg-white px-5 py-4 border-b border-gray-100 flex items-center gap-4 ${isSidebar ? "shrink-0" : "sticky top-0 z-50"}`}>
          <button type="button" onClick={handleClose} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
            {isSidebar ? <X className="w-6 h-6 text-gray-900" /> : <ArrowLeft className="w-6 h-6 text-gray-900" />}
          </button>
          <h1 className="text-lg font-black text-gray-900">Order Details</h1>
        </header>
        <div className="p-10 flex flex-col items-center text-center gap-6">
          <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center rotate-3">
            <AlertCircle className="w-10 h-10 text-rose-500 -rotate-3" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Order Not Found</h2>
            <p className="text-gray-500 leading-relaxed max-w-xs">{error || "The order you're looking for doesn't exist or has been removed."}</p>
          </div>
          {!isSidebar && (
            <button 
              type="button"
              onClick={handleClose}
              className="w-full max-w-xs py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl shadow-gray-200 active:scale-95 transition-transform"
            >
              Back to Orders
            </button>
          )}
        </div>
      </div>
    )
  }

  const items = order.items || []
  const status = order.orderStatus || order.status || "Created"

  // Mirrors PICKABLE_STATUSES on the server: before acceptance there is nothing to
  // pick, and once a rider has the bag it is too late to change what is in it.
  const PICKABLE = ["confirmed", "preparing", "ready_for_pickup"]
  const alreadyReported = Boolean(order.fulfilment?.reportedAt)
  const canReportPick = PICKABLE.includes(String(status)) && !alreadyReported

  const pickedFor = (idx) => {
    const value = picked[idx]
    return Number.isFinite(value) ? value : toNumber(items[idx]?.quantity)
  }

  const setPickedFor = (idx, next) => {
    const ordered = toNumber(items[idx]?.quantity)
    const clamped = Math.max(0, Math.min(ordered, Math.floor(Number(next) || 0)))
    setPicked((prev) => {
      const copy = items.map((it, i) =>
        Number.isFinite(prev[i]) ? prev[i] : toNumber(it?.quantity),
      )
      copy[idx] = clamped
      return copy
    })
  }

  // Exactly the server's `removedValue`: the sum of the line values not being
  // delivered. Deliberately NOT a full refund preview — tax and the coupon also move,
  // and duplicating that arithmetic here would only let the two drift apart. The real
  // figure comes back from the server and is shown once it has been applied.
  const removedValue = items.reduce(
    (sum, item, idx) => sum + toNumber(item.price) * (toNumber(item.quantity) - pickedFor(idx)),
    0,
  )
  const shortCount = items.filter((item, idx) => pickedFor(idx) < toNumber(item.quantity)).length

  const submitPickedQuantities = async () => {
    const lines = items.map((_, idx) => ({ index: idx, fulfilledQty: pickedFor(idx) }))

    if (shortCount === 0) {
      toast.info("Nothing is short — no need to report.")
      return
    }
    if (lines.every((line) => line.fulfilledQty === 0)) {
      const ok = window.confirm(
        "None of the items can be packed. This will cancel the whole order and refund the customer in full. Continue?",
      )
      if (!ok) return
    }

    try {
      setSubmittingPick(true)
      const response = await restaurantAPI.reportPickedQuantities(id, lines)
      const updated =
        response.data?.data?.order || response.data?.order || response.data?.data
      if (updated) setOrder(updated)
      setPicking(false)
      setPicked([])
      const refunded = toNumber(updated?.fulfilment?.refundAmount)
      toast.success(
        refunded > 0
          ? `Recorded. ${formatMoney(refunded)} is being refunded to the customer.`
          : "Picked quantities recorded.",
      )
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Could not record picked quantities",
      )
    } finally {
      setSubmittingPick(false)
    }
  }
  const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) : "Date not available"

  const customerName = order.customerName || order.userId?.name || order.userId?.fullName || order.deliveryAddress?.fullName || order.deliveryAddress?.name || "Customer"
  const customerPhone = order.customerPhone || order.userId?.phone || order.deliveryAddress?.phone || "No phone provided"
  const deliveryAddress = order.deliveryAddress?.formattedAddress || order.deliveryAddress?.address || 
                         (order.deliveryAddress?.street ? `${order.deliveryAddress.street}, ${order.deliveryAddress.city || ""}` : "Address not specified")
  const cookingNote = getRestaurantCookingNote(order)

  return (
    <div className={`${isSidebar ? "h-full flex flex-col overflow-hidden" : "min-h-screen"} bg-[#F8F9FB] ${isSidebar ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`}>
      {/* Premium Header */}
      <header className={`bg-white/80 backdrop-blur-xl px-5 py-4 border-b border-gray-100 flex items-center justify-between ${isSidebar ? "shrink-0" : "sticky top-0 z-50"}`}>
        <div className="flex items-center gap-4">
          <button type="button" onClick={handleClose} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
            {isSidebar ? <X className="w-6 h-6 text-gray-900" /> : <ArrowLeft className="w-6 h-6 text-gray-900" />}
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-gray-900 leading-none">Order Details</h1>
            <p className="text-[10px] font-bold text-gray-400 mt-1 tracking-wider uppercase">{createdAt}</p>
          </div>
        </div>
      </header>

      <div className={`p-4 space-y-4 ${isSidebar ? "flex-1 overflow-y-auto" : "max-w-2xl mx-auto"}`}>
        {/* Status Card - Mobile Friendly & Polished */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm shadow-gray-100/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-[0.05em] border ${getStatusColor(status)}`}>
                {status.replace(/_/g, ' ').toUpperCase()}
              </span>
              {(order.payment?.method || order.paymentMethod) && (
                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-[0.05em] bg-gray-50 text-gray-600 border border-gray-100">
                  {String(order.payment?.method || order.paymentMethod).replace(/_/g, ' ').toUpperCase()}
                </span>
              )}
            </div>
            <button 
              onClick={handleCopyId}
              className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-100 active:scale-95 transition-all"
            >
              <span className="text-[11px] font-black font-mono text-gray-600">#{order.orderId || order.order_id || id}</span>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Customer & Delivery Section */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm shadow-gray-100/50 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</h3>
                <p className="text-base font-black text-gray-900">{customerName}</p>
              </div>
            </div>
            {customerPhone && customerPhone !== "No phone provided" && (
              <a 
                href={`tel:${customerPhone}`}
                className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 active:scale-90 transition-transform"
              >
                <Phone className="w-5 h-5" />
              </a>
            )}
          </div>

          <div className="pt-5 border-t border-gray-50 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center">
                <MapPin className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery Address</h3>
                <p className="text-sm font-bold text-gray-700 leading-relaxed mt-0.5">{deliveryAddress}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm shadow-gray-100/50 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-sm font-black text-gray-900">Order Items</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black text-gray-500">{items.length} Items</span>
              {canReportPick && !picking && (
                <button
                  onClick={() => setPicking(true)}
                  className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[10px] font-black uppercase tracking-tighter hover:bg-amber-100 active:scale-95 transition-all"
                >
                  Something out of stock?
                </button>
              )}
            </div>
          </div>

          {picking && (
            <div className="bg-amber-50/70 border border-amber-100 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-black text-amber-900">Set what you can actually pack</p>
              <p className="text-[11px] font-bold text-amber-700/80 leading-relaxed">
                The customer is refunded for whatever is short and the rest of the order
                goes out as normal. Unpicked units go back into your stock. This can only
                be submitted once.
              </p>
            </div>
          )}

          {alreadyReported && (
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-black text-blue-900">Short items already reported</p>
              <p className="text-[11px] font-bold text-blue-700/80 leading-relaxed">
                {toNumber(order.fulfilment?.refundAmount) > 0
                  ? `${formatMoney(order.fulfilment.refundAmount)} was refunded to the customer.`
                  : "No refund was needed."}
              </p>
            </div>
          )}

          <div className="space-y-5">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl overflow-hidden shrink-0 border border-gray-100">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-black text-gray-900 leading-tight pr-2">{item.name}</p>
                    <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoney(item.price * item.quantity)}</p>
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">
                    {item.quantity} × {formatMoney(item.price)}
                  </p>

                  {picking && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                        Packing
                      </span>
                      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-1 py-1">
                        <button
                          type="button"
                          aria-label={`Reduce packed quantity for ${item.name}`}
                          onClick={() => setPickedFor(idx, pickedFor(idx) - 1)}
                          disabled={pickedFor(idx) <= 0}
                          className="w-7 h-7 rounded-lg bg-gray-50 text-gray-600 font-black disabled:opacity-30 hover:bg-gray-100 active:scale-90 transition-all"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-black text-gray-900 tabular-nums">
                          {pickedFor(idx)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase packed quantity for ${item.name}`}
                          onClick={() => setPickedFor(idx, pickedFor(idx) + 1)}
                          disabled={pickedFor(idx) >= toNumber(item.quantity)}
                          className="w-7 h-7 rounded-lg bg-gray-50 text-gray-600 font-black disabled:opacity-30 hover:bg-gray-100 active:scale-90 transition-all"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        of {item.quantity}
                      </span>
                      {pickedFor(idx) < toNumber(item.quantity) && (
                        <span className="text-[10px] font-black text-rose-600 uppercase tracking-tighter">
                          −{formatMoney(toNumber(item.price) * (toNumber(item.quantity) - pickedFor(idx)))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Already reported: show what actually went out. */}
                  {!picking && alreadyReported && Number.isFinite(Number(item.fulfilledQty)) &&
                    Number(item.fulfilledQty) < toNumber(item.quantity) && (
                      <p className="text-[10px] font-black text-rose-600 mt-1.5 uppercase tracking-tighter">
                        {Number(item.fulfilledQty) === 0
                          ? "Out of stock — refunded"
                          : `Only ${item.fulfilledQty} packed — ${toNumber(item.quantity) - Number(item.fulfilledQty)} refunded`}
                      </p>
                    )}
                  {item.addons && item.addons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.addons.map((addon, aIdx) => (
                        <span key={aIdx} className="text-[9px] font-black bg-gray-50 text-gray-500 px-2 py-1 rounded-lg border border-gray-100 uppercase tracking-tighter">
                          + {addon.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {picking && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-gray-500 uppercase tracking-tighter">
                  {shortCount === 0
                    ? "Nothing short"
                    : `${shortCount} ${shortCount === 1 ? "item" : "items"} short`}
                </span>
                <span className="text-sm font-black text-rose-600 tabular-nums">
                  −{formatMoney(removedValue)}
                </span>
              </div>
              <p className="text-[10px] font-bold text-gray-400 leading-relaxed">
                Item value shown. The final refund also adjusts tax and any coupon, and is
                confirmed once you submit. Delivery and packaging fees are not charged again.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPicking(false)
                    setPicked([])
                  }}
                  disabled={submittingPick}
                  className="flex-1 py-3 rounded-2xl bg-gray-50 text-gray-600 text-xs font-black uppercase tracking-tighter border border-gray-100 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitPickedQuantities}
                  disabled={submittingPick || shortCount === 0}
                  className="flex-1 py-3 rounded-2xl bg-gray-900 text-white text-xs font-black uppercase tracking-tighter hover:bg-black active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submittingPick && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submittingPick ? "Saving" : "Confirm & refund"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Earnings & Deductions */}
        {order.finance && (
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm shadow-gray-100/50 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-black text-gray-900">Your Earnings</h3>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
                <span>Item Total</span>
                <span className="text-gray-900">{formatMoney(order.finance.itemTotal)}</span>
              </div>
              {toNumber(order.finance.packagingFee) > 0 && (
                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <span>Packaging Fee</span>
                  <span className="text-gray-900">{formatMoney(order.finance.packagingFee)}</span>
                </div>
              )}
              {toNumber(order.finance.commission) > 0 && (
                <div className="flex justify-between text-xs font-black text-rose-600 uppercase tracking-wider">
                  <span>Platform Commission</span>
                  <span>-{formatMoney(order.finance.commission)}</span>
                </div>
              )}
              {toNumber(order.finance.restaurantDiscountShare) > 0 && (
                <div className="flex justify-between text-xs font-black text-rose-600 uppercase tracking-wider">
                  <span>Your Discount Share</span>
                  <span>-{formatMoney(order.finance.restaurantDiscountShare)}</span>
                </div>
              )}
              <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                <span className="text-sm font-black text-gray-900 tracking-tight">Net Payout</span>
                <span className="text-xl font-black text-emerald-600 tabular-nums tracking-tighter">{formatMoney(order.finance.netPayout)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${order.finance.isSettled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[10px] font-black uppercase tracking-[0.05em] text-gray-500">
                  {order.finance.isSettled
                    ? `Settled${order.finance.settledAt ? ` on ${new Date(order.finance.settledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                    : 'Settlement Pending'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Order Timeline */}
        {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm shadow-gray-100/50 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-violet-50 rounded-2xl flex items-center justify-center">
                <History className="w-5 h-5 text-violet-600" />
              </div>
              <h3 className="text-sm font-black text-gray-900">Order Timeline</h3>
            </div>

            <div className="space-y-0">
              {[...order.statusHistory]
                .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
                .map((entry, idx, arr) => {
                  const isLast = idx === arr.length - 1
                  const isCancelled = String(entry.to || '').includes('cancel')
                  return (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full border-2 mt-1 shrink-0 ${isCancelled ? 'bg-rose-500 border-rose-200' : isLast ? 'bg-blue-600 border-blue-200' : 'bg-emerald-500 border-emerald-200'}`} />
                        {!isLast && <div className="w-0.5 flex-1 bg-gray-100 my-1" />}
                      </div>
                      <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
                        <div className="flex justify-between items-start gap-2">
                          <p className={`text-xs font-black leading-tight ${isCancelled ? 'text-rose-600' : 'text-gray-900'}`}>
                            {getTimelineStatusLabel(entry.to)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                            {entry.at
                              ? new Date(entry.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                              : ''}
                          </p>
                        </div>
                        {getTimelineRoleLabel(entry.byRole) && (
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                            by {getTimelineRoleLabel(entry.byRole)}
                          </p>
                        )}
                        {entry.note && (
                          <p className="text-[11px] font-medium text-gray-500 mt-1 leading-snug">{entry.note}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Notes/Instructions if any */}
        {cookingNote ? (
          <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-5 space-y-2">
            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Cooking Requests</h3>
            <p className="text-sm font-bold text-blue-700 italic">"{cookingNote}"</p>
          </div>
        ) : null}

        {/* Rejection/Cancellation Reason */}
        {(order.rejectionReason || order.cancellationReason) && (
          <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5 space-y-2">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
              Reason for {status.includes('REJECTED') ? 'Rejection' : 'Cancellation'}
            </p>
            <p className="text-sm font-bold text-rose-700">{order.rejectionReason || order.cancellationReason}</p>
          </div>
        )}
      </div>
      
      {/* Fixed Bottom Action */}
      {!isSidebar && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-50 flex gap-3">
          <button 
            type="button"
            onClick={handleClose}
            className="flex-1 bg-gray-900 text-white py-4 rounded-2xl font-black shadow-xl shadow-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to List
          </button>
        </div>
      )}
    </div>
  )
}
