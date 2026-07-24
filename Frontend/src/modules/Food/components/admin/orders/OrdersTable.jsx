import { useState, useEffect, useMemo } from "react"
import { Eye, Printer, ArrowUpDown, Loader2, Check, X, Trash2, RefreshCw, Volume2, PackageCheck } from "lucide-react"

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
  if (paymentStatus === "Refunded") return "text-sky-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

export default function OrdersTable({
  orders,
  visibleColumns,
  isLoading = false,
  onViewOrder,
  onPrintOrder,
  onRefund,
  onDeleteOrder,
  onAcceptOrder,
  onRejectOrder,
  onCancelOrder,
  onDeassignAndResend,
  onResendNotification,
  onMarkDelivered,
  actionLoadingOrderId,
  deletingOrderId,
  showAssignedDeliveryPartner = false,
  serverPagination = false,
  totalCount = 0,
  currentPage: externalCurrentPage,
  totalPages: externalTotalPages,
  pageSize = 10,
  onPageChange,
}) {
  const [internalCurrentPage, setInternalCurrentPage] = useState(1)
  const currentPage = serverPagination ? externalCurrentPage || 1 : internalCurrentPage
  const itemsPerPage = serverPagination ? pageSize : 10
  const resolvedTotalCount = serverPagination ? totalCount : orders.length
  const totalPages = serverPagination
    ? Math.max(1, externalTotalPages || Math.ceil(resolvedTotalCount / itemsPerPage))
    : Math.ceil(orders.length / itemsPerPage)

  // Reset to page 1 when orders change (client-side pagination only)
  useEffect(() => {
    if (!serverPagination) {
      setInternalCurrentPage(1)
    }
  }, [orders.length, serverPagination])

  const paginatedOrders = useMemo(() => {
    if (serverPagination) return orders
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return orders.slice(start, end)
  }, [orders, currentPage, itemsPerPage, serverPagination])

  const handlePageChange = (page) => {
    if (serverPagination) {
      onPageChange?.(page)
      return
    }
    setInternalCurrentPage(page)
  }

  const formatRestaurantName = (name) => {
    if (name === "Cafe Monarch") return "Café Monarch"
    return name
  }

  const canShowCancelAction = (order) => {
    const currentStatus = String(order?.orderStatus || "").trim().toLowerCase()
    return [
      "pending",
      "accepted",
      "processing",
      "food on the way",
    ].includes(currentStatus)
  }

  const canDeassignAndResend = (order) => {
    const backendStatus = String(order?.status || "").trim().toLowerCase()
    const phase = String(order?.deliveryState?.currentPhase || "").trim().toLowerCase()
    return (
      ["confirmed", "preparing", "ready_for_pickup", "reached_pickup"].includes(backendStatus) &&
      order?.dispatch?.status === "accepted" &&
      Boolean(order?.dispatch?.deliveryPartnerId) &&
      !order?.deliveryState?.pickedUpAt &&
      !["en_route_to_delivery", "at_drop", "delivered", "completed"].includes(phase)
    )
  }

  const canResendNotification = (order) => {
    const backendStatus = String(order?.status || "").trim().toLowerCase()
    const phase = String(order?.deliveryState?.currentPhase || "").trim().toLowerCase()
    return (
      ["confirmed", "preparing", "ready_for_pickup", "ready"].includes(backendStatus) &&
      (!order?.dispatch?.status || order?.dispatch?.status === "unassigned") &&
      !order?.dispatch?.deliveryPartnerId &&
      !order?.deliveryState?.pickedUpAt &&
      !["en_route_to_delivery", "at_drop", "delivered", "completed"].includes(phase)
    )
  }

  const canMarkAsDelivered = (order) => {
    const status = String(order?.orderStatus || "").trim().toLowerCase()
    return ![
      "delivered",
      "canceled",
      "cancelled by restaurant",
      "cancelled by user",
      "payment failed",
      "refunded",
    ].includes(status)
  }

  if (orders.length === 0 && !isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md">
              <span className="text-5xl text-orange-500 font-bold">!</span>
            </div>
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
          <p className="text-sm text-slate-500">There are no orders matching your criteria</p>
        </div>
      </div>
    )
  }

  if (orders.length === 0 && isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full relative">
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleColumns.si && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>SI</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderId && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderDate && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderOtp && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order OTP</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.customer && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Customer Information</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.restaurant && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Restaurant</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.foodItems && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span>Food Items / Item Price</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.totalAmount && (
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center justify-end gap-2">
                    <span>Total Amount</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentType !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Type</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {(visibleColumns.paymentCollectionStatus !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.orderStatus && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {showAssignedDeliveryPartner && visibleColumns.deliveryPartner !== false && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Assigned Delivery Partner</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                  </div>
                </th>
              )}
              {visibleColumns.actions && (
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  &nbsp;
                </th>
              )}
              {visibleColumns.actions && (
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {paginatedOrders.map((order, index) => (
              <tr
                key={order.orderId}
                className="hover:bg-slate-50 transition-colors"
              >
                {visibleColumns.si && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                  </td>
                )}
                {visibleColumns.orderId && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-900">{order.orderId}</span>
                  </td>
                )}
                {visibleColumns.orderDate && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{order.date}, {order.time}</span>
                  </td>
                )}
                {visibleColumns.orderOtp && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-slate-900">
                      {order.orderOtp || "--"}
                    </span>
                  </td>
                )}
                {visibleColumns.customer && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{order.customerPhone}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.restaurant && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{formatRestaurantName(order.restaurant)}</span>
                  </td>
                )}
                {visibleColumns.foodItems && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                      {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                        order.items.map((item, idx) => (
                          <div key={idx || item.itemId || idx} className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded min-w-[2.5rem] text-center">
                              {item.quantity || 1}x
                            </span>
                            <span className="text-slate-800 font-medium flex-1">
                              {item.name || item.itemName || item.title || 'Unknown Item'}
                            </span>
                            {item.price && (
                              <span className="text-xs text-slate-500">
                                ₹{item.price}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">No items found</span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.totalAmount && (
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-slate-900">
                      {(() => {
                        const rawAmount =
                          order.totalAmount ??
                          order.total ??
                          order.pricing?.total ??
                          0;
                        const amount = Number.isFinite(Number(rawAmount))
                          ? Number(rawAmount)
                          : 0;
                        return `₹${amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`;
                      })()}
                    </div>
                    <div className={`text-xs mt-0.5 ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </div>
                  </td>
                )}
                {(visibleColumns.paymentType !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      // Determine payment type display
                      let paymentTypeDisplay = order.paymentType;

                      if (!paymentTypeDisplay) {
                        const paymentMethod = order.payment?.method || order.paymentMethod;
                        if (paymentMethod === 'cash' || paymentMethod === 'cod') {
                          paymentTypeDisplay = 'Cash on Delivery';
                        } else if (paymentMethod === 'wallet') {
                          paymentTypeDisplay = 'Wallet';
                        } else {
                          paymentTypeDisplay = 'Online';
                        }
                      }

                      // Override if payment method is wallet but paymentType is not set correctly
                      const paymentMethod = order.payment?.method || order.paymentMethod;
                      if (paymentMethod === 'wallet' && paymentTypeDisplay !== 'Wallet') {
                        paymentTypeDisplay = 'Wallet';
                      }

                      const isCod = paymentTypeDisplay === 'Cash on Delivery';
                      const isWallet = paymentTypeDisplay === 'Wallet';

                      return (
                        <span className={`text-sm font-medium ${isCod ? 'text-amber-600' :
                            isWallet ? 'text-purple-600' :
                              'text-emerald-600'
                          }`}>
                          {paymentTypeDisplay}
                        </span>
                      );
                    })()}
                  </td>
                )}
                {(visibleColumns.paymentCollectionStatus !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                        {order.paymentStatus || "Pending"}
                      </span>
                      {order.paymentCollectionStatus && (
                        <span className="text-xs text-slate-500 mt-0.5">
                          {order.paymentCollectionStatus}
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.orderStatus && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                          {order.orderStatus}
                        </span>
                        <span className="text-xs text-slate-500">{order.deliveryType}</span>
                      </div>
                      {order.cancellationReason && (
                        <div className="text-xs text-red-600 mt-1">
                          <span className="font-medium">
                            {order.cancelledBy === 'user' ? 'Cancelled by User - ' :
                              order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant - ' :
                                'Reason: '}
                          </span>
                          {order.cancellationReason}
                        </div>
                      )}
                    </div>
                  </td>
                )}
                {showAssignedDeliveryPartner && visibleColumns.deliveryPartner !== false && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {order.deliveryPartnerName ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-800">
                          {order.deliveryPartnerName}
                        </span>
                        <span className="mt-0.5 text-xs text-slate-500">
                          {order.deliveryPartnerPhone || "Phone not available"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-slate-400">
                        Not assigned
                      </span>
                    )}
                  </td>
                )}
                {visibleColumns.actions && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {onCancelOrder ? (
                        <button
                          onClick={() => canShowCancelAction(order) && onCancelOrder(order)}
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            !canShowCancelAction(order)
                          }
                          className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${canShowCancelAction(order)
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          title="Cancel Order"
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                          <span>Cancel</span>
                        </button>
                      ) : null}
                      {onResendNotification ? (
                        <button
                          onClick={() =>
                            canResendNotification(order) && onResendNotification(order)
                          }
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            !canResendNotification(order)
                          }
                          className={`inline-flex items-center justify-center gap-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${canResendNotification(order)
                              ? "bg-blue-600 text-white hover:bg-blue-700"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          title={
                            canResendNotification(order)
                              ? "Resend delivery notification to nearby partners"
                              : "Available only after restaurant accepts the order and no delivery partner is assigned"
                          }
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                          <span>Resend</span>
                        </button>
                      ) : null}
                      {onDeassignAndResend ? (
                        <button
                          onClick={() =>
                            canDeassignAndResend(order) && onDeassignAndResend(order)
                          }
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            !canDeassignAndResend(order)
                          }
                          className={`inline-flex items-center justify-center gap-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${canDeassignAndResend(order)
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          title={
                            canDeassignAndResend(order)
                              ? "Remove the current delivery partner and resend this order"
                              : "Available only for an accepted delivery before pickup"
                          }
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span>Deassign &amp; Resend</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                )}
                {visibleColumns.actions && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {onAcceptOrder && (
                        <button
                          onClick={() => onAcceptOrder(order)}
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            String(order.orderStatus || "").trim().toLowerCase() !== "pending"
                          }
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                            String(order.orderStatus || "").trim().toLowerCase() === "pending"
                              ? "text-white bg-emerald-600 hover:bg-emerald-700"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                          title={
                            String(order.orderStatus || "").trim().toLowerCase() === "pending"
                              ? "Accept Order"
                              : "Available only for pending orders"
                          }
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Accept</span>
                        </button>
                      )}
                      {onRejectOrder && (
                        <button
                          onClick={() => onRejectOrder(order)}
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            String(order.orderStatus || "").trim().toLowerCase() !== "pending"
                          }
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                            String(order.orderStatus || "").trim().toLowerCase() === "pending"
                              ? "text-white bg-rose-600 hover:bg-rose-700"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                          title={
                            String(order.orderStatus || "").trim().toLowerCase() === "pending"
                              ? "Reject Order"
                              : "Available only for pending orders"
                          }
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                          <span>Reject</span>
                        </button>
                      )}
                      {onMarkDelivered ? (
                        <button
                          onClick={() => canMarkAsDelivered(order) && onMarkDelivered(order)}
                          disabled={
                            actionLoadingOrderId === (order.id || order.orderId) ||
                            !canMarkAsDelivered(order)
                          }
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                            canMarkAsDelivered(order)
                              ? "text-white bg-emerald-700 hover:bg-emerald-800"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                          title={
                            canMarkAsDelivered(order)
                              ? "Mark order as delivered"
                              : "Not available for delivered or cancelled orders"
                          }
                        >
                          {actionLoadingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PackageCheck className="w-3.5 h-3.5" />
                          )}
                          <span>Delivered</span>
                        </button>
                      ) : null}
                      <button
                        onClick={() => onViewOrder(order)}
                        className="p-1.5 rounded text-orange-600 hover:bg-orange-50 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onPrintOrder(order)}
                        className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Print Order"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {onDeleteOrder && (
                        <button
                          onClick={() => onDeleteOrder(order)}
                          disabled={deletingOrderId === (order.id || order.orderId)}
                          className="p-1.5 rounded text-rose-600 hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          title="Delete Order"
                        >
                          {deletingOrderId === (order.id || order.orderId) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {/* Show Refund button or Refunded status for cancelled orders with Online/Wallet payment (restaurant or user cancelled) */}
                      {(() => {
                        // Check if order is cancelled by restaurant or user
                        const isCancelled = order.orderStatus === "Cancelled by Restaurant" ||
                          order.orderStatus === "Cancelled" ||
                          order.orderStatus === "Cancelled by User" ||
                          (order.status === "cancelled" && (order.cancelledBy === "user" || order.cancelledBy === "restaurant"));

                        // Check if payment type is Online or Wallet (not Cash on Delivery)
                        const paymentMethod = order.payment?.method || order.paymentMethod;
                        const isOnlinePayment = order.paymentType === "Online" ||
                          (order.paymentType !== "Cash on Delivery" &&
                            order.payment?.method !== "cash" &&
                            order.payment?.method !== "cod" &&
                            (order.paymentMethod === "razorpay" ||
                              order.paymentMethod === "online" ||
                              order.payment?.paymentMethod === "razorpay" ||
                              order.payment?.method === "razorpay" ||
                              order.payment?.method === "online"));

                        const isWalletPayment = order.paymentType === "Wallet" || paymentMethod === "wallet";

                        return isCancelled && (isOnlinePayment || isWalletPayment);
                      })() && (
                          <>
                            {order.refundStatus === 'processed' || order.refundStatus === 'initiated' ? (
                              <span className={`px-3 py-1.5 rounded-md text-xs font-medium ${order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-emerald-100 text-emerald-700"
                                }`}>
                                {order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "Wallet Refunded"
                                  : "Refunded"}
                              </span>
                            ) : onRefund ? (
                              <button
                                onClick={() => onRefund(order)}
                                className={`px-3 py-1.5 rounded-md text-white text-xs font-medium hover:opacity-90 transition-colors shadow-sm flex items-center gap-1.5 ${order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                    ? "bg-purple-600 hover:bg-purple-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                                  }`}
                                title={order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "Process Wallet Refund (Add to user wallet)"
                                  : "Process Refund via Razorpay"}
                              >
                                <span className="text-sm">₹</span>
                                <span>Refund</span>
                              </button>
                            ) : null}
                          </>
                        )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * itemsPerPage, resolvedTotalCount)}</span> of{" "}
            <span className="font-semibold">{resolvedTotalCount}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${currentPage === pageNum
                        ? "bg-emerald-500 text-white shadow-md"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
