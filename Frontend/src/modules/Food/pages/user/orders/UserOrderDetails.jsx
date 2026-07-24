import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import {
  ArrowLeft,
  ShoppingBag,
  Phone,
  Copy,
  Download,
  User,
  CreditCard,
  Calendar,
  MapPin,
  RotateCcw,
  FileText,
} from "lucide-react"
import { orderAPI, restaurantAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import { getCartCompareItemTotal, getLineCompareUnitPrice } from "@food/utils/foodVariants"
import { DualMoney } from "@food/components/user/FoodPriceDisplay"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function UserOrderDetails() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { replaceCart } = useCart()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        // Fetch using the ID from params (which will now be the MongoDB _id)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order && typeof response.data.order === 'object') {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/user/orders")
          return
        }

        setOrder(orderData)

        // If restaurantId is just a string (not populated), fetch restaurant details separately
        const restaurantId = orderData.restaurantId
        if (restaurantId && typeof restaurantId === 'string' && !orderData.restaurant) {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              setRestaurant(restaurantResponse.data.data.restaurant)
            } else if (restaurantResponse?.data?.restaurant) {
              setRestaurant(restaurantResponse.data.restaurant)
            }
          } catch (restaurantError) {
            debugWarn("Failed to fetch restaurant details:", restaurantError)
            // Don't show error toast, just log it - order details can still be shown
          }
        }
      } catch (error) {
        debugError("Error fetching order details:", error)
        toast.error(
          error?.response?.data?.message || "Failed to load order details"
        )
        navigate("/user/orders")
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-700 text-sm font-medium">Order not found</p>
          <button
            onClick={() => navigate("/user/orders")}
            className="px-4 py-2 rounded-lg bg-[#EB590E] text-white text-sm font-semibold"
          >
            Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const orderIdDisplay = order.orderId || order._id || orderId
  // Use fetched restaurant data if available, otherwise use order.restaurantId or order.restaurant
  const restaurantObj = restaurant || order.restaurantId || order.restaurant || {}
  const restaurantName =
    order.restaurantName || restaurantObj.restaurantName || restaurantObj.name || "Restaurant"

  // Build restaurant address (try restaurant fields first, then fall back)
  const restaurantLocation = (() => {
    const loc = restaurantObj.location || {}

    // Priority 1: direct address on restaurant object
    if (restaurantObj.address) return restaurantObj.address

    // Priority 2: formattedAddress from location
    if (loc.formattedAddress) return loc.formattedAddress

    // Priority 3: generic address / street-style fields
    if (loc.address) return loc.address

    if (loc.street || loc.city) {
      const parts = [
        loc.street,
        loc.area,
        loc.city,
        loc.state,
        loc.zipCode || loc.pincode || loc.postalCode,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 4: addressLine1 / addressLine2 style
    if (loc.addressLine1) {
      const parts = [
        loc.addressLine1,
        loc.addressLine2,
        loc.city,
        loc.state,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 5: order-level restaurantAddress if present
    if (order.restaurantAddress) return order.restaurantAddress

    // Don't fallback to user delivery address - show empty or "Address not available"
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}
  const sendsCutlery = order.sendCutlery !== false

  const userName = order.customerName || order.userName || order.userId?.name || order.userId?.fullName || ""
  const userPhone = order.customerPhone || order.userPhone || order.userId?.phone || ""
  const paymentMethod = order.payment?.method || "Online"
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : ""

  const addressText =
    order.deliveryAddress?.formattedAddress ||
    order.address?.formattedAddress ||
    [
      order.deliveryAddress?.street || order.address?.street,
      order.deliveryAddress?.city || order.address?.city,
      order.deliveryAddress?.state || order.address?.state,
      order.deliveryAddress?.zipCode || order.address?.zipCode
    ]
      .filter(Boolean)
      .join(", ")

  const savings =
    (pricing.discount || 0) +
    (pricing.originalItemTotal || 0) -
    (pricing.subtotal || 0)

  const compareItemTotal = getCartCompareItemTotal(items)
  const itemSubtotal = Number(pricing.subtotal || pricing.total || 0) || 0
  const orderPayTotal = Number(pricing.total || 0) || 0
  const displayCompareItemTotal =
    compareItemTotal > itemSubtotal
      ? compareItemTotal
      : Number(pricing.originalItemTotal) > itemSubtotal
        ? Number(pricing.originalItemTotal)
        : 0
  const compareToPay =
    displayCompareItemTotal > itemSubtotal
      ? orderPayTotal + (displayCompareItemTotal - itemSubtotal)
      : orderPayTotal

  // Restaurant phone (multiple fallbacks) - use fetched restaurant data first
  const restaurantPhone =
    restaurantObj.primaryContactNumber ||
    restaurantObj.phone ||
    restaurantObj.contactNumber ||
    order.restaurantPhone ||
    ""

  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    window.location.href = `tel:${restaurantPhone}`
  }

  const handleDownloadSummary = async () => {
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])
      const companyName = await getCompanyNameAsync()
      // Create new PDF document
      const doc = new jsPDF()

      // Title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`${companyName} Order: Summary and Receipt`, 105, 20, { align: 'center' })

      // Order details section
      let yPos = 35
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      // Order ID
      doc.setFont('helvetica', 'bold')
      doc.text('Order ID:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(orderIdDisplay, 60, yPos)
      yPos += 7

      // Order Time
      doc.setFont('helvetica', 'bold')
      doc.text('Order Time:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const orderTimeLines = doc.splitTextToSize(paymentDate || 'N/A', 130)
      doc.text(orderTimeLines, 60, yPos)
      yPos += orderTimeLines.length * 7

      // Customer Name
      doc.setFont('helvetica', 'bold')
      doc.text('Customer Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(userName || 'Customer', 60, yPos)
      yPos += 7

      // Delivery Address
      doc.setFont('helvetica', 'bold')
      doc.text('Delivery Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const addressLines = doc.splitTextToSize(addressText || 'N/A', 130)
      doc.text(addressLines, 60, yPos)
      yPos += addressLines.length * 7

      // Restaurant Name
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(restaurantName, 60, yPos)
      yPos += 7

      // Restaurant Address
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const restaurantAddressLines = doc.splitTextToSize(restaurantLocation || 'N/A', 130)
      doc.text(restaurantAddressLines, 60, yPos)
      yPos += restaurantAddressLines.length * 7 + 5

      // Items table
      const tableData = items.map(item => [
        item.variantName ? `${item.name || 'Item'} (${item.variantName})` : (item.name || 'Item'),
        String(item.quantity || item.qty || 1),
        `Rs. ${Number(item.price || 0).toFixed(2)}`,
        `Rs. ${Number((item.price || 0) * (item.quantity || item.qty || 1)).toFixed(2)}`
      ])

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        }
      })

      // Get final Y position after table (autoTable adds lastAutoTable property)
      const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : yPos + (tableData.length * 8) + 20

      // Total
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Total:', 145, finalY + 10, { align: 'right' })
      doc.text(`Rs. ${Number(pricing.total || 0).toFixed(2)}`, 195, finalY + 10, { align: 'right' })

      // Save PDF instantly
      const fileName = `Order_Summary_${orderIdDisplay}_${Date.now()}.pdf`
      doc.save(fileName)

      toast.success("Summary downloaded successfully!")
    } catch (error) {
      debugError("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }

  const handleReorder = (currentOrder) => {
    const restaurantTarget =
      restaurantObj.slug ||
      restaurantObj._id ||
      restaurantObj.restaurantId ||
      (typeof currentOrder?.restaurantId === "string" ? currentOrder.restaurantId : currentOrder?.restaurantId?._id)

    if (!restaurantTarget || !items.length) {
      toast.error("Order items or restaurant information not available")
      return
    }

    const reorderItems = items
      .map((item, index) => {
        const itemId = item.id || item.itemId || item._id
        if (!itemId) return null

        return {
          id: itemId,
          name: item.name || item.foodName || "Item",
          price: Number(item.price) || 0,
          image: item.image || "",
          restaurant: restaurantName,
          restaurantId: restaurantObj._id || restaurantObj.restaurantId || currentOrder?.restaurantId,
          description: item.description || "",
          isVeg: item.isVeg !== false,
          quantity: Math.max(1, Number(item.quantity || item.qty) || 1),
          reorderIndex: index,
        }
      })
      .filter(Boolean)

    if (!reorderItems.length) {
      toast.error("No reorderable items found in this order")
      return
    }

    replaceCart(reorderItems)
    toast.success("Items added to cart")
    navigate(`/food/user/restaurants/${restaurantTarget}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24 font-sans relative">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 p-4 flex items-center sticky top-0 z-20 shadow-sm border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200 cursor-pointer" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white">Order Details</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="p-4 space-y-4">
        {/* Status Card */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl flex items-center gap-3 shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="bg-gray-100 dark:bg-zinc-800 p-2 rounded-lg">
            <ShoppingBag className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white">
              {order.status === "delivered"
                ? "Order was delivered"
                : "Order status: " + (order.status || "Processing")}
            </h2>
          </div>
        </div>

        {/* Restaurant Info Card */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img
                src={
                  // Prefer the food image from the first ordered item
                  (Array.isArray(items) && items[0]?.image) ||
                  restaurantObj.profileImage?.url ||
                  restaurantObj.profileImage ||
                  order.restaurantImage ||
                  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"
                }
                alt={restaurantName}
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">{restaurantName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{restaurantLocation}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCallRestaurant}
              className="w-8 h-8 rounded-full border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-[#EB590E] hover:bg-orange-50 dark:hover:bg-orange-950/30"
            >
              <Phone className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">
              Order ID: #{orderIdDisplay}
            </span>
            <button type="button" onClick={handleCopyOrderId}>
              <Copy className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-pointer" />
            </button>
          </div>

          {order.status !== "delivered" && (
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${sendsCutlery
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                    : "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                  }`}
              >
                {sendsCutlery ? "Send cutlery" : "Don't send cutlery"}
              </span>
            </div>
          )}

          <div className="border-t border-dashed border-gray-200 dark:border-zinc-800 my-3" />

          {/* Items */}
          {items.map((item, idx) => {
            const qty = Number(item.quantity || item.qty) || 1
            const price = Number(item.price) || 0
            const compareUnit = getLineCompareUnitPrice(item)
            return (
            <div key={idx} className="flex justify-between items-start mt-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-3 h-3 border shrink-0 ${item.isVeg ? "border-green-600" : "border-red-600"
                    } flex items-center justify-center p-[1px]`}
                >
                  <div
                    className={`w-full h-full rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"
                      }`}
                  />
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {qty} x {item.name}{item.variantName ? ` (${item.variantName})` : ""}
                </span>
              </div>
              <DualMoney
                amount={price * qty}
                compareAmount={compareUnit > 0 ? compareUnit * qty : 0}
                decimals={2}
                plainClassName="text-sm text-gray-800 dark:text-gray-200 font-medium tabular-nums"
                saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
              />
            </div>
            )
          })}
        </div>

        {/* Bill Summary Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-zinc-800">
          <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-800 dark:text-white">Bill Summary</h3>
            </div>
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-[#EB590E] hover:bg-orange-100 dark:hover:bg-orange-900/40"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-2 text-sm">
            <div className="flex justify-between items-start gap-3">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Item total</span>
              <DualMoney
                amount={itemSubtotal}
                compareAmount={displayCompareItemTotal}
                decimals={2}
                plainClassName="text-gray-800 dark:text-gray-200 tabular-nums"
                saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">GST (govt. taxes)</span>
              <span className="text-gray-800 dark:text-gray-200">
                ₹{Number(pricing.tax || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 dark:text-gray-500 font-medium">Delivery fee</span>
              {pricing.deliveryFee === 0 && (
                <span className="text-[#EB590E] text-[10px] font-bold border border-[#EB590E] px-1 rounded ml-1">
                  FREE
                </span>
              )}
              <span className="text-[#EB590E] font-medium uppercase">
                {pricing.deliveryFee ? `₹${Number(pricing.deliveryFee).toFixed(2)}` : "Free"}
              </span>
            </div>
            {Number(pricing.quickDeliveryFee || 0) > 0 && (
              <div className="flex justify-between font-semibold">
                <span className="text-[#FA0272]">Quick Mode</span>
                <span className="text-[#FA0272]">
                  ₹{Number(pricing.quickDeliveryFee).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Platform fee</span>
              <span className="text-gray-800 dark:text-gray-200">
                ₹{Math.max(0, Number(pricing.platformFee || 0) - Number(pricing.quickDeliveryFee || 0)).toFixed(2)}
              </span>
            </div>

            <div className="border-t border-gray-100 dark:border-zinc-800 my-2 pt-2 flex justify-between items-start gap-3">
              <span className="font-bold text-gray-800 dark:text-white shrink-0">Paid</span>
              <DualMoney
                amount={orderPayTotal}
                compareAmount={compareToPay}
                decimals={2}
                plainClassName="font-bold text-gray-800 dark:text-white tabular-nums"
                saleClassName="inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums"
              />
            </div>
          </div>

          {/* Savings Banner */}
          {savings > 0 && (
            <div className="relative bg-orange-50 dark:bg-orange-950/20 p-3 pb-4 mt-2">
              <div className="absolute -top-1.5 left-0 w-full overflow-hidden leading-none">
                <svg
                  className="relative block w-[calc(100%+1.3px)] h-[8px]"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 1200 120"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,0V46.29c47,0,47,69.5,94,69.5s47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5V0Z"
                    fill="currentColor"
                    className="text-white dark:text-zinc-900"
                  />
                </svg>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1 text-[#EB590E] font-bold text-sm">
                <span>??</span>
                <span>
                  You saved ₹{Number(savings).toFixed(2)} on this order!
                </span>
              </div>
            </div>
          )}
        </div>

        {/* User & Delivery Details */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm space-y-5 border border-gray-100 dark:border-zinc-800">
          {/* User */}
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                {userName || "Customer"}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs">{userPhone}</p>
            </div>
          </div>

          {/* Payment */}
          <div className="flex gap-3">
            <div className="mt-0.5">
              <CreditCard className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                Payment method
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                Paid via: {paymentMethod.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Date */}
          <div className="flex gap-3">
            <div className="mt-0.5">
              <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                Payment date
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{paymentDate}</p>
            </div>
          </div>

          {/* Address */}
          <div className="flex gap-3">
            <div className="mt-0.5">
              <MapPin className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-white text-sm">
                Delivery address
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 leading-relaxed">
                {addressText || "Address not available"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Buttons */}
      <div className="fixed bottom-0 w-full bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 p-4 flex gap-3 z-20">
        <button
          type="button"
          onClick={() => handleReorder(order)}
          className="flex-1 bg-[#EB590E] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-[#D94F0C] transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reorder
        </button>
        <button
          type="button"
          onClick={handleDownloadSummary}
          className="flex-1 bg-white dark:bg-zinc-800 border border-[#EB590E] text-[#EB590E] py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
        >
          <Download className="w-4 h-4" />
          Invoice
        </button>
      </div>

      {/* Restaurant Complaint Button - Below Order Details */}
      {order && (
        <div className="p-4 pb-24">
          <button
            type="button"
            onClick={() => {
              // Use MongoDB _id (ObjectId) for the API call - backend complaint controller expects ObjectId
              // Priority: order._id (MongoDB ObjectId) > orderId from route params
              const orderMongoId = order._id || orderId

              if (!orderMongoId) {
                debugError("Order ID not available:", {
                  order: order ? { _id: order._id, orderId: order.orderId } : null,
                  routeOrderId: orderId
                })
                toast.error("Order ID not available. Please refresh the page.")
                return
              }

              // Convert to string if it's an ObjectId object
              const orderIdString = typeof orderMongoId === 'object' && orderMongoId.toString
                ? orderMongoId.toString()
                : String(orderMongoId)

              debugLog("Navigating to complaint page with orderId:", orderIdString)
              navigate(`/user/complaints/submit/${encodeURIComponent(orderIdString)}`)
            }}
            className="w-full bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 text-orange-700 dark:text-orange-400 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Restaurant Complaint
          </button>
        </div>
      )}
    </div>
  )
}


