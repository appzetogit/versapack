import { useEffect, useState } from "react"
import { Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, CheckCircle2, History, Banknote } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { adminAPI } from "@/services/api"
import { getTimelineStatusLabel, getTimelineRoleLabel } from "@food/utils/orderStatus"
import { computeDeliveryFeeGst, formatDeliveryFeeBreakdownSubtext, getDeliveryFeeTotal, resolveDeliveryFeeGst } from "@food/utils/deliveryFeeDisplay"
import { getCartCompareItemTotal, getLineCompareUnitPrice } from "@food/utils/foodVariants"
import { DualMoney } from "@food/components/user/FoodPriceDisplay"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid" || paymentStatus === "Collected") return "text-emerald-600"
  if (paymentStatus === "Not Collected") return "text-amber-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

const formatDialogMoney = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return "₹0.00"
  return `${num < 0 ? "-" : ""}₹${Math.abs(num).toFixed(2)}`
}

export default function ViewOrderDialog({ isOpen, onOpenChange, order }) {
  // Full order detail (statusHistory + transaction split) fetched on open;
  // the `order` prop only carries the mapped list-row fields.
  const [detail, setDetail] = useState(null)
  const detailOrderId = order?._id || order?.orderMongoId || order?.id || null

  useEffect(() => {
    let active = true
    if (!isOpen || !detailOrderId) {
      setDetail(null)
      return undefined
    }
    adminAPI
      .getOrderById(detailOrderId)
      .then((res) => {
        if (!active) return
        setDetail(res?.data?.data?.order || res?.data?.data || null)
      })
      .catch((err) => {
        debugError("Failed to load full order detail:", err)
        if (active) setDetail(null)
      })
    return () => {
      active = false
    }
  }, [isOpen, detailOrderId])

  if (!order) return null

  const statusHistory = Array.isArray(detail?.statusHistory)
    ? detail.statusHistory
    : Array.isArray(order.statusHistory)
      ? order.statusHistory
      : []
  const transaction = detail?.transaction || null
  const refundInfo = detail?.payment?.refund || order.payment?.refund || null
  const orderPricing = detail?.pricing || order.pricing || transaction?.pricing || {}
  const deliveryFeeBase = Number(
    order.deliveryCharge ?? orderPricing.deliveryFee ?? 0,
  )
  const deliveryFeeGst = resolveDeliveryFeeGst(deliveryFeeBase, order.deliveryFeeGst ?? orderPricing.deliveryFeeGst)
  const quickDeliveryFee = Number(
    order.quickDeliveryFee ?? orderPricing.quickDeliveryFee ?? 0,
  )
  const totalPlatformFee = Number(
    order.platformFee ?? orderPricing.platformFee ?? 0,
  )
  const basePlatformFee = Math.max(0, totalPlatformFee - quickDeliveryFee)

  // Debug: Log order data to check billImageUrl
  if (order.billImageUrl) {
    debugLog('?? Bill Image URL found:', order.billImageUrl)
  } else {
    debugLog('?? Bill Image URL not found in order:', {
      orderId: order.orderId,
      hasBillImageUrl: !!order.billImageUrl,
      orderKeys: Object.keys(order)
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address || typeof address !== "object") return "N/A"

    const formattedAddress = String(address.formattedAddress || "").trim()
    const rawAddress = String(address.address || "").trim()
    const parts = [
      formattedAddress,
      rawAddress,
      address.label,
      address.street,
      address.additionalDetails,
      address.landmark,
      address.addressLine1,
      address.addressLine2,
      address.area,
      address.city,
      address.state,
      address.zipCode,
      address.postalCode,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    const uniqueParts = []
    parts.forEach((part) => {
      const key = part.toLowerCase()
      const isContained = uniqueParts.some((existingPart) => {
        const existingKey = existingPart.toLowerCase()
        return existingKey === key || existingKey.includes(key) || key.includes(existingKey)
      })
      if (isContained) return
      uniqueParts.push(part)
    })

    return uniqueParts.length > 0 ? uniqueParts.join(", ") : "Address not available"
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  const orderItems = Array.isArray(order.items) ? order.items : []
  const itemSubtotal =
    Number(order.totalItemAmount) ||
    orderItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0,
    )
  const compareItemTotal = getCartCompareItemTotal(orderItems)
  const orderTotal = Number(order.totalAmount || order.total) || 0
  const compareOrderTotal =
    compareItemTotal > itemSubtotal
      ? orderTotal + (compareItemTotal - itemSubtotal)
      : orderTotal

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-600" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{order.date}{order.time ? `, ${order.time}` : ""}</p>
              </div>
              {order.orderOtp && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Handover Code (OTP)
                  </p>
                  <p className="text-lg font-bold text-slate-950 tracking-[0.2em]">{order.orderOtp}</p>
                </div>
              )}
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.estimatedDeliveryTime} minutes</p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                    {order.orderStatus}
                  </span>
                  {order.cancellationReason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">
                        {order.cancelledBy === 'user' ? 'Cancelled by User - ' : 
                         order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant - ' : 
                         'Cancellation '}Reason:
                      </span> {order.cancellationReason}
                    </p>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  <p className={`text-sm font-medium ${getPaymentStatusColor(
                    order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus
                  )}`}>
                    {order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus}
                  </p>
                </div>
              )}
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{order.customerName || "N/A"}</p>
              </div>
              {order.customerPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerPhone}</p>
                </div>
              )}
              {order.customerEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant Information */}
          {order.restaurant && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Restaurant Information</h3>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurant}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => {
                  const qty = Number(item.quantity) || 1
                  const price = Number(item.price) || 0
                  const compareUnit = getLineCompareUnitPrice(item)
                  return (
                  <div key={index} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {qty}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item.name || "Unknown Item"}</p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <DualMoney
                      amount={price * qty}
                      compareAmount={compareUnit > 0 ? compareUnit * qty : 0}
                      decimals={2}
                      plainClassName="text-sm font-semibold text-slate-900 tabular-nums"
                      saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
                    />
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-2xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[500px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      debugError('? Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      debugLog('? Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {order.address && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-900">{formatAddress(order.address)}</p>
                {getCoordinates(order.address) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium">Coordinates:</span> {getCoordinates(order.address)}
                  </p>
                )}
                {order.address.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Label:</span> {order.address.label}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Partner Information */}
          {(order.deliveryPartnerName || order.deliveryPartnerPhone) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Delivery Partner
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.deliveryPartnerName && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerName}</p>
                  </div>
                )}
                {order.deliveryPartnerPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {order.totalItemAmount !== undefined && (
                <div className="flex justify-between text-sm items-start gap-3">
                  <span className="text-slate-600 shrink-0">Subtotal</span>
                  <DualMoney
                    amount={Number(order.totalItemAmount) || 0}
                    compareAmount={compareItemTotal}
                    decimals={2}
                    plainClassName="font-medium text-slate-900 tabular-nums"
                    saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
                  />
                </div>
              )}
              {order.itemDiscount !== undefined && order.itemDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.itemDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.couponDiscount !== undefined && order.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.deliveryCharge !== undefined && (
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-600">Delivery Charge</span>
                    {deliveryFeeBase > 0 && (
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                        {formatDeliveryFeeBreakdownSubtext(deliveryFeeBase, deliveryFeeGst)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-right font-medium text-slate-900">
                    {deliveryFeeBase > 0 ? (
                      formatDialogMoney(getDeliveryFeeTotal(deliveryFeeBase, deliveryFeeGst))
                    ) : (
                      <span className="text-emerald-600">Free delivery</span>
                    )}
                  </span>
                </div>
              )}
              {quickDeliveryFee > 0 && (
                <div className="flex justify-between text-sm font-semibold text-[#FA0272]">
                  <span>Quick Mode</span>
                  <span>₹{quickDeliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {basePlatformFee > 0
                    ? `₹${basePlatformFee.toFixed(2)}`
                    : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {order.vatTax !== undefined && order.vatTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{order.vatTax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-base font-semibold text-slate-700 shrink-0">Total Amount</span>
                  <DualMoney
                    amount={orderTotal}
                    compareAmount={compareOrderTotal}
                    decimals={2}
                    plainClassName="text-xl font-bold text-emerald-600 tabular-nums"
                    saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-base font-bold text-[#FA0272] tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Money Split (from FoodTransaction) */}
          {transaction?.amounts && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                Money Split
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Customer Paid</span>
                  <span className="font-medium text-slate-900">{formatDialogMoney(transaction.amounts.totalCustomerPaid)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Restaurant Payout</span>
                  <span className="font-medium text-slate-900">{formatDialogMoney(transaction.amounts.restaurantShare)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Restaurant Commission</span>
                  <span className="font-medium text-slate-900">{formatDialogMoney(transaction.amounts.restaurantCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Rider Earning</span>
                  <span className="font-medium text-slate-900">{formatDialogMoney(transaction.amounts.riderShare)}</span>
                </div>
                {Number(transaction.amounts.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax (GST)</span>
                    <span className="font-medium text-slate-900">{formatDialogMoney(transaction.amounts.taxAmount)}</span>
                  </div>
                )}
                {Number(transaction.amounts.adminDiscountShare) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Discount Borne by Platform</span>
                    <span className="font-medium text-rose-600">-{formatDialogMoney(transaction.amounts.adminDiscountShare)}</span>
                  </div>
                )}
                {Number(transaction.amounts.restaurantDiscountShare) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Discount Borne by Restaurant</span>
                    <span className="font-medium text-rose-600">-{formatDialogMoney(transaction.amounts.restaurantDiscountShare)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">Platform Net Profit</span>
                  <span className={`font-bold ${Number(transaction.amounts.platformNetProfit) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatDialogMoney(transaction.amounts.platformNetProfit)}
                  </span>
                </div>
                {transaction.settlement && (
                  <p className="text-xs text-slate-500 pt-1">
                    Restaurant settlement: {transaction.settlement.isRestaurantSettled ? "Settled" : "Pending"}
                    {transaction.settlement.restaurantSettledAt
                      ? ` (${new Date(transaction.settlement.restaurantSettledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Refund Information */}
          {refundInfo?.status && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Refund
              </h3>
              <div className="space-y-2 p-4 bg-sky-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className="font-medium text-slate-900 capitalize">{String(refundInfo.status).replace(/_/g, " ")}</span>
                </div>
                {refundInfo.amount != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Amount</span>
                    <span className="font-medium text-slate-900">{formatDialogMoney(refundInfo.amount)}</span>
                  </div>
                )}
                {refundInfo.processedAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Processed At</span>
                    <span className="font-medium text-slate-900">
                      {new Date(refundInfo.processedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Timeline */}
          {statusHistory.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Order Timeline
              </h3>
              <div>
                {[...statusHistory]
                  .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
                  .map((entry, index, arr) => {
                    const isLast = index === arr.length - 1
                    const isCancelled = String(entry.to || "").includes("cancel")
                    return (
                      <div key={index} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full border-2 mt-1 shrink-0 ${isCancelled ? "bg-rose-500 border-rose-200" : isLast ? "bg-blue-600 border-blue-200" : "bg-emerald-500 border-emerald-200"}`} />
                          {!isLast && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                        </div>
                        <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-4"}`}>
                          <div className="flex justify-between items-start gap-2">
                            <p className={`text-sm font-semibold leading-tight ${isCancelled ? "text-rose-600" : "text-slate-900"}`}>
                              {getTimelineStatusLabel(entry.to)}
                            </p>
                            <p className="text-xs text-slate-500 whitespace-nowrap">
                              {entry.at
                                ? new Date(entry.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                : ""}
                            </p>
                          </div>
                          {getTimelineRoleLabel(entry.byRole) && (
                            <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">by {getTimelineRoleLabel(entry.byRole)}</p>
                          )}
                          {entry.note && <p className="text-xs text-slate-500 mt-1 leading-snug">{entry.note}</p>}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Transaction money events */}
          {Array.isArray(transaction?.history) && transaction.history.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Payment Events
              </h3>
              <div className="space-y-2">
                {[...transaction.history]
                  .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
                  .map((event, index) => (
                    <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 capitalize">{String(event.kind || "").replace(/_/g, " ")}</p>
                        {event.note && <p className="text-xs text-slate-500 mt-0.5">{event.note}</p>}
                        {getTimelineRoleLabel(event.byRole) && (
                          <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">by {getTimelineRoleLabel(event.byRole)}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {event.amount != null && (
                          <p className="text-sm font-semibold text-slate-900">{formatDialogMoney(event.amount)}</p>
                        )}
                        <p className="text-xs text-slate-500">
                          {event.at
                            ? new Date(event.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


