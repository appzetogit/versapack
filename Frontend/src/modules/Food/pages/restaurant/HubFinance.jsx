import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Menu, ChevronDown, Calendar, Download, FileText, Wallet, X, Info, ArrowUpRight, History, TrendingUp, Receipt } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }

const ORDERS_PAGE_LIMIT = 10

function FinanceOrderRow({ order }) {
  return (
    <div className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            Order ID: {order.orderId || 'N/A'}
          </p>
          <p className="text-xs text-gray-600">
            {order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'}
          </p>
          {Number(order.discount || 0) > 0 && (
            <p className="mt-1 text-[11px] font-medium text-rose-600">
              Discount ₹{Number(order.restaurantDiscountShare || order.discount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {Number(order.adminDiscountShare || 0) > 0
                ? ` | Admin bear ₹${Number(order.adminDiscountShare || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : ""}
              {Number(order.restaurantDiscountShare || 0) > 0 && Number(order.discount || 0) > Number(order.restaurantDiscountShare || 0)
                ? ` | Total coupon ₹${Number(order.discount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : ""}
            </p>
          )}
        </div>
        <div className="text-right ml-4">
          <p className="text-sm font-bold text-gray-900">
            ₹{(order.payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500">
            Earning
          </p>
        </div>
      </div>
    </div>
  )
}

function OrdersPagination({ pagination, onPageChange }) {
  if (!pagination || (pagination.totalPages || pagination.pages || 1) <= 1) return null

  const page = pagination.page || 1
  const limit = pagination.limit || ORDERS_PAGE_LIMIT
  const total = pagination.total || 0
  const totalPages = pagination.totalPages || pagination.pages || 1

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-gray-200">
      <p className="text-xs text-gray-500">
        Showing {total === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} completed orders
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="text-xs text-gray-600">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}


export default function HubFinance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab")
    return tabParam === "invoices" ? "invoices" : "payouts"
  })
  const [selectedDateRange, setSelectedDateRange] = useState("Last 30 days")
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showDateRangePicker, setShowDateRangePicker] = useState(false)
  const downloadMenuRef = useRef(null)
  const dateRangePickerRef = useRef(null)
  const [financeData, setFinanceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pastCyclesData, setPastCyclesData] = useState(null)
  const [loadingPastCycles, setLoadingPastCycles] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false)
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [subscriptionHistory, setSubscriptionHistory] = useState([])
  const [loadingSubscriptionHistory, setLoadingSubscriptionHistory] = useState(false)
  const isRestaurantSubscriptionEnabled = financeData?.features?.restaurantSubscriptionEnabled !== false
  // Locked = total outstanding calendar-month subscription dues; the full balance stays visible.
  const subscriptionDueAmount = Number(financeData?.subscription?.lockedAmount ?? financeData?.restaurant?.subscriptionDueAmount ?? 0)
  const subscriptionLockedMonths = String(financeData?.subscription?.lockedMonths || '')
  const walletSummary = financeData?.wallet ?? financeData?.currentCycle ?? {}
  const walletAvailableBalance = Number(walletSummary?.withdrawableBalance ?? 0)
  const walletTotalEarnings = Number(walletSummary?.totalEarnings ?? walletSummary?.estimatedPayout ?? 0)
  const walletTotalWithdrawn = Number(walletSummary?.totalWithdrawn ?? 0)
  const walletNetAvailable = Number(
    walletSummary?.netAvailable ??
    walletAvailableBalance
  )
  const lockedReasonText = `₹${subscriptionDueAmount.toLocaleString('en-IN')} is locked against your subscription due${subscriptionLockedMonths ? ` for ${subscriptionLockedMonths}` : ''}. It will be released once the due is settled or waived.`

  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false)
  const [ordersPage, setOrdersPage] = useState(1)

  // Fetch finance data on mount and when orders page changes
  useEffect(() => {
    const fetchFinanceData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getFinance({
          ordersPage,
          ordersLimit: ORDERS_PAGE_LIMIT
        })
        if (response.data?.success && response.data?.data) {
          const data = response.data.data
          setFinanceData(data)
          debugLog('? Finance data fetched:', data)
        }
      } catch (error) {
        // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
        if (error.response?.status !== 401) {
          debugError('? Error fetching finance data:', error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchFinanceData()
  }, [ordersPage])

  useEffect(() => {
    const fetchWithdrawals = async () => {
      try {
        setLoadingWithdrawals(true)
        const response = await restaurantAPI.getWithdrawalHistory()
        const payload = response?.data?.data
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.withdrawals)
            ? payload.withdrawals
            : []
        setWithdrawalRequests(list)
      } catch (error) {
        if (error?.response?.status !== 401) {
          debugError('Error fetching withdrawal history:', error)
        }
        setWithdrawalRequests([])
      } finally {
        setLoadingWithdrawals(false)
      }
    }

    fetchWithdrawals()
  }, [])

  useEffect(() => {
    const fetchSubscriptionHistory = async () => {
      try {
        setLoadingSubscriptionHistory(true)
        const response = await restaurantAPI.getSubscriptionTransactions({ limit: 20 })
        const list = Array.isArray(response?.data?.data?.transactions) ? response.data.data.transactions : []
        setSubscriptionHistory(list)
      } catch (error) {
        if (error?.response?.status !== 401) {
          debugError("Error fetching subscription history:", error)
        }
        setSubscriptionHistory([])
      } finally {
        setLoadingSubscriptionHistory(false)
      }
    }
    fetchSubscriptionHistory()
  }, [])

  // Fetch restaurant data for header display
  useEffect(() => {
    // Use restaurant data from financeData if available, otherwise fetch separately
    if (financeData?.restaurant) {
      setRestaurantData(financeData.restaurant)
    } else {
      const fetchRestaurantData = async () => {
        try {
          const response = await restaurantAPI.getRestaurantByOwner()
          const data = response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data
          if (data) {
            setRestaurantData({
              name: data.name,
              restaurantId: data.restaurantId || data._id,
              address: data.location?.address || data.location?.formattedAddress || data.address || ''
            })
          }
        } catch (error) {
          // Suppress 401 errors as they're handled by axios interceptor
          if (error.response?.status !== 401) {
            debugError('? Error fetching restaurant data:', error)
          }
        }
      }
      fetchRestaurantData()
    }
  }, [financeData])

  // Format restaurant ID to REST###### format (e.g., REST005678)
  const formatRestaurantId = (restaurantId) => {
    if (!restaurantId) return ''

    // Extract numeric part from the end (e.g., "REST-1768762345335-5678" -> "5678")
    const strId = String(restaurantId)
    const numericMatch = strId.match(/(\d+)$/)

    if (numericMatch) {
      const numericPart = numericMatch[1]
      // Take last 6 digits and pad with zeros if needed
      const lastDigits = numericPart.slice(-6).padStart(6, '0')
      return `REST${lastDigits}`
    }

    // Fallback: if no numeric part found, use original
    return strId
  }

  const invoiceOrders = useMemo(() => {
    const allOrdersMap = new Map()

    const current = walletSummary?.orders || financeData?.currentCycle?.orders || []
    current.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id) {
        allOrdersMap.set(id, order)
      }
    })

    // Add past cycles orders, avoiding duplicates already in current map
    const past = pastCyclesData?.orders || []
    past.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id && !allOrdersMap.has(id)) {
        allOrdersMap.set(id, order)
      }
    })

    return Array.from(allOrdersMap.values())
  }, [financeData, pastCyclesData, walletSummary])

  const invoiceSummary = useMemo(() => {
    const earnings = invoiceOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0)
    const commission = invoiceOrders.reduce((sum, order) => sum + (order.commission || 0), 0)
    const gross = invoiceOrders.reduce((sum, order) => sum + (order.totalAmount || order.orderTotal || 0), 0)
    return { earnings, commission, gross, count: invoiceOrders.length }
  }, [invoiceOrders])

  const handleViewDetails = () => {
    navigate("/restaurant/finance-details", { state: { financeData, restaurantData } })
  }

  const getWithdrawalStatusClass = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase()
    if (status === 'approved') return 'bg-[#dce8f5] text-[#2f5280]'
    if (status === 'rejected') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  const formatWithdrawalStatus = (statusRaw) => {
    const status = String(statusRaw || '').trim().toLowerCase()
    if (!status) return 'Pending'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const formatDateTime = (dateValue) => {
    if (!dateValue) return 'N/A'
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Parse date range string to extract start and end dates
  const parseDateRange = (dateRangeStr) => {
    try {
      if (!dateRangeStr || typeof dateRangeStr !== 'string') return null;

      // Handle relative ranges
      const today = new Date();
      if (dateRangeStr === "Last 7 days") {
        const start = new Date();
        start.setDate(today.getDate() - 7);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "Last 30 days" || dateRangeStr === "Last 1 month") {
        const start = new Date();
        start.setDate(today.getDate() - 30);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This week") {
        const start = new Date();
        const day = today.getDay();
        start.setDate(today.getDate() - day);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }

      const parts = dateRangeStr.split(' - ')
      if (parts.length !== 2) return null

      const startStr = parts[0].trim() // "14 Nov"
      const endStr = parts[1].trim().replace("'", " ") // "14 Dec 25"

      const currentYear = new Date().getFullYear()
      const startParts = startStr.split(' ')
      const endParts = endStr.split(' ')

      if (startParts.length < 2 || endParts.length < 2) return null

      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      }

      const startDay = parseInt(startParts[0])
      const startMonth = monthMap[startParts[1]]
      const endDay = parseInt(endParts[0])
      const endMonth = monthMap[endParts[1]]
      const year = endParts.length > 2 ? parseInt('20' + endParts[2]) : currentYear

      if (startMonth === undefined || endMonth === undefined || isNaN(startDay) || isNaN(endDay)) {
        return null
      }

      const start = new Date(year, startMonth, startDay)
      const end = new Date(year, endMonth, endDay)

      return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    } catch (error) {
      debugError('Error parsing date range:', error)
      return null
    }
  }

  // Fetch past cycles data when date range changes
  const fetchPastCyclesData = async (startDate, endDate) => {
    if (!startDate || !endDate) {
      setPastCyclesData(null)
      return
    }

    try {
      setLoadingPastCycles(true)
      // Validate dates and format as ISO strings
      const startDateObj = startDate instanceof Date ? startDate : new Date(startDate)
      const endDateObj = endDate instanceof Date ? endDate : new Date(endDate)

      // Check if dates are valid
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        debugError('Invalid date values:', { startDate, endDate })
        setPastCyclesData(null)
        return
      }

      const startDateISO = startDateObj.toISOString().split('T')[0]
      const endDateISO = endDateObj.toISOString().split('T')[0]

      const response = await restaurantAPI.getFinance({
        startDate: startDateISO,
        endDate: endDateISO,
        ordersPage,
        ordersLimit: ORDERS_PAGE_LIMIT
      })
      if (response.data?.success && response.data?.data?.pastCycles) {
        setPastCyclesData(response.data.data.pastCycles)
        debugLog('? Past cycles data fetched:', response.data.data.pastCycles)
        debugLog('?? Orders array:', response.data.data.pastCycles?.orders)
        debugLog('?? Total orders:', response.data.data.pastCycles?.totalOrders)
      } else {
        setPastCyclesData(null)
      }
    } catch (error) {
      // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
      if (error.response?.status !== 401) {
        debugError('? Error fetching past cycles data:', error)
      }
      setPastCyclesData(null)
    } finally {
      setLoadingPastCycles(false)
    }
  }

  // Reset orders page when date range changes
  useEffect(() => {
    setOrdersPage(1)
  }, [selectedDateRange])

  // Fetch past cycles data on mount and when date range or orders page changes
  useEffect(() => {
    const dateRange = parseDateRange(selectedDateRange)
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      fetchPastCyclesData(dateRange.startDate, dateRange.endDate)
    } else {
      // If date range is invalid, don't fetch
      setPastCyclesData(null)
    }
  }, [selectedDateRange, ordersPage])


  const getReportData = () => {
    const restaurantName = financeData?.restaurant?.name || "Restaurant"
    const restaurantId = financeData?.restaurant?.restaurantId || "N/A"
    const summary = financeData?.wallet ?? financeData?.currentCycle ?? {}

    const allOrdersMap = new Map()

    const lifetimeOrders = summary?.orders || []
    lifetimeOrders.forEach(order => {
      if (order.orderId) {
        allOrdersMap.set(order.orderId, order)
      }
    })

    if (pastCyclesData?.orders && Array.isArray(pastCyclesData.orders)) {
      pastCyclesData.orders.forEach(order => {
        if (order.orderId && !allOrdersMap.has(order.orderId)) {
          allOrdersMap.set(order.orderId, order)
        }
      })
    }

    const allOrders = Array.from(allOrdersMap.values())

    return {
      restaurantName,
      restaurantId,
      dateRange: selectedDateRange,
      wallet: {
        totalEarnings: `₹${(summary.totalEarnings ?? summary.estimatedPayout ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        availableBalance: `₹${(summary.withdrawableBalance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        orders: summary.totalOrders || 0,
        withdrawn: `₹${(summary.totalWithdrawn || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      pastCycles: pastCyclesData,
      allOrders: allOrders
    }
  }

  // Generate HTML content for the report
  const generateHTMLContent = (reportData) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance Report - ${reportData.dateRange}</title>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 40px;
            color: #333;
            background-color: #fff;
            width: 794px; /* A4 width at 96dpi */
            box-sizing: border-box;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header p {
            margin: 5px 0;
            font-size: 14px;
            color: #444;
          }
          .section {
            margin-bottom: 30px;
            clear: both;
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #000;
            border-left: 4px solid #000;
            padding-left: 10px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px dashed #ddd;
          }
          .current-cycle {
            background-color: #fcfcfc;
            padding: 25px;
            border: 1px solid #eee;
            border-radius: 12px;
            margin-bottom: 25px;
          }
          .payout-amount {
            font-size: 36px;
            font-weight: 800;
            color: #000;
            margin: 10px 0;
          }
          .orders-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 20px;
            border: 1px solid #000;
          }
          .orders-table th {
            background-color: #f2f2f2;
            padding: 12px 8px;
            text-align: left;
            border: 1px solid #000;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
          }
          .orders-table td {
            padding: 10px 8px;
            border: 1px solid #000;
            font-size: 11px;
            word-wrap: break-word;
            vertical-align: top;
          }
          .footer {
            margin-top: 50px;
            padding-top: 25px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 12px;
            color: #555;
          }
          @media print {
            body { padding: 20px; width: auto; }
            .current-cycle { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Finance Report</h1>
          <p>${reportData.restaurantName}</p>
          <p>ID: ${reportData.restaurantId}</p>
          <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        </div>

        <div class="section">
          <div class="section-title">Wallet Summary</div>
          <div class="current-cycle">
            <p style="font-size: 12px; color: #666; margin: 0 0 5px 0;">
              Total earnings (lifetime)
            </p>
            <div class="payout-amount">${reportData.wallet.totalEarnings}</div>
            <p style="font-size: 14px; color: #666; margin: 5px 0;">${reportData.wallet.orders} completed orders</p>
            <div class="info-row">
              <div>
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Withdrawn</p>
                <p style="margin: 0; font-weight: 600;">${reportData.wallet.withdrawn}</p>
              </div>
              <div style="text-align: right;">
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Available balance</p>
                <p style="margin: 0; font-weight: 600;">${reportData.wallet.availableBalance}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Order Wise Report</div>
          ${reportData.allOrders && reportData.allOrders.length > 0 ? `
            <table class="orders-table">
              <thead>
                <tr>
                  <th style="width: 15%;">Order ID</th>
                  <th style="width: 12%;">Date</th>
                  <th style="width: 28%;">Items</th>
                  <th style="width: 8%;">Qty</th>
                  <th style="width: 11%;">Amount</th>
                  <th style="width: 12%;">Earning</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.allOrders.map(order => {
      const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : (order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-IN') : 'N/A')
      const foodItems = order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'
      const itemQuantities = order.items ? order.items.map(item => (item.quantity || 1).toString()).join(', ') : 'N/A'
      const orderAmount = order.totalAmount || order.orderTotal || order.amount || 0
      const earning = order.payout || order.restaurantEarning || 0

      return `
                    <tr>
                      <td>${order.orderId || 'N/A'}</td>
                      <td>${orderDate}</td>
                      <td>${foodItems}</td>
                      <td>${itemQuantities}</td>
                      <td>₹${orderAmount.toFixed(2)}</td>
                      <td>₹${earning.toFixed(2)}</td>
                    </tr>
                  `
    }).join('')}
              </tbody>
              <tfoot>
                <tr style="background-color: #e8f5e9; font-weight: bold;">
                  <td colspan="5" style="text-align: right;">Total Earnings:</td>
                  <td colspan="2">₹${reportData.allOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          ` : `
          <div class="info-row">
            <span class="info-label">Status:</span>
              <span class="info-value">No orders available</span>
          </div>
          `}
        </div>

        <div class="footer">
          <p>This is an auto-generated report. For detailed information, please visit the Finance section.</p>
          <p>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${reportData.allOrders?.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2) || '0.00'}</p>
        </div>
      </body>
      </html>
    `
  }

  // Download PDF report - Direct download without print dialog
  const downloadPDF = async () => {
    try {
      setShowDownloadMenu(false)

      const reportData = getReportData()
      const htmlContent = generateHTMLContent(reportData)

      debugLog('?? Generating PDF...')

      // Create a temporary hidden iframe to render HTML properly
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)

      // Write HTML to iframe
      iframe.contentDocument.open()
      iframe.contentDocument.write(htmlContent)
      iframe.contentDocument.close()

      // Wait for iframe content to load
      await new Promise((resolve) => {
        if (iframe.contentDocument.readyState === 'complete') {
          resolve()
        } else {
          iframe.contentWindow.onload = resolve
          setTimeout(resolve, 1000) // Fallback timeout
        }
      })

      // Wait a bit more for styles to apply
      await new Promise(resolve => setTimeout(resolve, 500))

      // Import html2canvas and jsPDF dynamically
      debugLog('?? Loading libraries...')
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')

      // Get the body element from iframe
      const iframeBody = iframe.contentDocument.body

      debugLog('?? Converting to canvas...')
      // Convert HTML to canvas
      const canvas = await html2canvas(iframeBody, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: iframeBody.scrollWidth,
        height: iframeBody.scrollHeight
      })

      debugLog('? Canvas created:', canvas.width, 'x', canvas.height)

      // Remove temporary iframe
      document.body.removeChild(iframe)

      // Calculate PDF dimensions
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      debugLog('?? PDF dimensions:', imgWidth, 'x', imgHeight, 'mm')

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0

      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      // Download PDF
      const fileName = `finance-report-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split("T")[0]}.pdf`
      debugLog('?? Downloading PDF:', fileName)
      pdf.save(fileName)
      debugLog('? PDF downloaded successfully!')
    } catch (error) {
      debugError('? Error downloading PDF:', error)
      debugError('Error details:', error.stack)
      alert(`Failed to download PDF: ${error.message}. Please check console for details.`)
      setShowDownloadMenu(false)
    }
  }

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setShowDownloadMenu(false)
      }
    }

    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDownloadMenu])

  const [showRestrictionModal, setShowRestrictionModal] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:h-full md:overflow-hidden md:bg-[#e9edf2]">
      {/* Restriction Modal */}
      <AnimatePresence>
        {showRestrictionModal && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRestrictionModal(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-8 overflow-hidden shadow-2xl"
            >
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 blur-3xl rounded-full -mr-16 -mt-16" />

              {/* Close Button */}
              <button
                onClick={() => setShowRestrictionModal(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 shadow-sm border border-amber-100">
                  <Info className="w-8 h-8 text-amber-600" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">Withdrawal Restricted</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-8">
                  {lockedReasonText} Available for withdrawal: <span className="font-bold text-gray-900">₹{walletNetAvailable.toLocaleString('en-IN')}</span>.
                </p>

                <div className="w-full space-y-3">
                  <button
                    onClick={() => setShowRestrictionModal(false)}
                    className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile header */}
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200 md:hidden">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-lg font-bold text-gray-900 truncate">
                  {restaurantData?.name || financeData?.restaurant?.name || "Restaurant"}
                </p>
                <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {(() => {
                  const restaurantId = restaurantData?.restaurantId || financeData?.restaurant?.restaurantId
                  const address = restaurantData?.address || financeData?.restaurant?.address || ''
                  const parts = []
                  if (restaurantId) {
                    const formattedId = formatRestaurantId(restaurantId)
                    parts.push(`ID: ${formattedId}`)
                  }
                  if (address) {
                    const shortAddress = address.length > 40 ? address.substring(0, 40) + '...' : address
                    parts.push(shortAddress)
                  }
                  return parts.length > 0 ? parts.join(' • ') : 'Loading...'
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/food/restaurant/withdrawal-history")}
              title="Withdrawal History"
            >
              <Wallet className="w-5 h-5" style={{ color: "var(--module-theme-color, #2563EB)" }} />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/notifications")}
            >
              <Bell className="w-5 h-5" style={{ color: "var(--module-theme-color, #2563EB)" }} />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/explore")}
            >
              <Menu className="w-5 h-5" style={{ color: "var(--module-theme-color, #2563EB)" }} />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop ink-ledger header */}
      <div className="hidden md:flex shrink-0 items-end justify-between gap-6 px-8 pt-7 pb-5 border-b border-[#d5dbe3] bg-[#f2f4f7]/90 backdrop-blur">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5c6775]">Restaurant finance</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[#141820]">Payouts</h1>
          <p className="mt-1 text-sm text-[#5c6775]">
            {restaurantData?.name || financeData?.restaurant?.name || "Restaurant"} · settle earnings and track every rupee
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full bg-[#141820] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("payouts")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === "payouts" ? "bg-[#4f6f9a] text-white" : "text-[#b8c2cf] hover:text-white"
              }`}
            >
              Payouts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === "invoices" ? "bg-[#4f6f9a] text-white" : "text-[#b8c2cf] hover:text-white"
              }`}
            >
              Invoices & Taxes
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate("/food/restaurant/withdrawal-history")}
            className="inline-flex items-center gap-2 rounded-full border border-[#c8d0da] bg-white px-4 py-2.5 text-sm font-semibold text-[#141820] hover:bg-[#eef1f5] transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>
      </div>

      {/* Primary Navigation Tabs — mobile */}
      <div className="px-4 py-3 md:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${activeTab === "payouts"
              ? ""
              : "bg-white text-gray-600 border border-gray-300"
              }`}
            style={activeTab === "payouts" ? {
              backgroundColor: "rgba(var(--module-theme-rgb, 37,99,235), 0.16)",
              color: "var(--module-theme-color, #2563EB)",
              border: "1px solid rgba(var(--module-theme-rgb, 37,99,235), 0.35)",
            } : undefined}
          >
            Payouts
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${activeTab === "invoices"
              ? ""
              : "bg-white text-gray-600 border border-gray-300"
              }`}
            style={activeTab === "invoices" ? {
              backgroundColor: "rgba(var(--module-theme-rgb, 37,99,235), 0.16)",
              color: "var(--module-theme-color, #2563EB)",
              border: "1px solid rgba(var(--module-theme-rgb, 37,99,235), 0.35)",
            } : undefined}
          >
            Invoices & Taxes
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28 md:px-8 md:pt-7 md:pb-8 md:min-h-0">
        {activeTab === "payouts" && (
          <div className="space-y-6 md:grid md:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] md:gap-8 md:space-y-0 md:items-start">
            {/* Subscription Dues Banner */}
            {isRestaurantSubscriptionEnabled && subscriptionDueAmount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 mb-2 shadow-sm cursor-pointer md:col-start-2 md:row-start-1 md:mb-0"
                onClick={() => navigate('/food/restaurant/subscription')}
              >
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-amber-100">
                  <Info className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-amber-900">Subscription Due Pending</h3>
                  <p className="text-[11px] text-amber-800 mt-1 leading-relaxed font-medium">
                    ₹{subscriptionDueAmount.toLocaleString('en-IN')} is locked against your subscription due{subscriptionLockedMonths ? ` for ${subscriptionLockedMonths}` : ''}. Tap to view your billing details.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Wallet balance — mobile card + desktop ink ledger hero */}
            <div className="md:col-start-1 md:row-start-1 md:row-span-4 md:sticky md:top-0">
              <h2 className="text-base font-bold text-gray-900 mb-3 md:hidden">Wallet balance</h2>
              {/* Mobile wallet */}
              <div className="bg-white rounded-lg p-4 md:hidden">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading...</div>
                ) : (
                  <>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      ₹{walletAvailableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">
                      {walletSummary?.totalOrders || 0} completed {walletSummary?.totalOrders === 1 ? 'order' : 'orders'}
                    </p>
                    {walletTotalWithdrawn > 0 && (
                      <p className="text-xs text-gray-500 mb-4">
                        ₹{walletTotalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} earned · ₹{walletTotalWithdrawn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} withdrawn
                      </p>
                    )}
                    {walletTotalWithdrawn <= 0 && <div className="mb-4" />}
                    <button
                      onClick={() => {
                        const netAvailable = walletNetAvailable;
                        const hasDues = isRestaurantSubscriptionEnabled && subscriptionDueAmount > 0;

                        if (hasDues && netAvailable <= 0) {
                          setShowRestrictionModal(true);
                          return;
                        }
                        setShowWithdrawalModal(true);
                      }}
                      disabled={!(walletNetAvailable > 0)}
                      className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 mt-4 transition-colors ${walletNetAvailable > 0
                        ? "text-white"
                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                      style={walletNetAvailable > 0 ? {
                        background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 37,99,235), 0.9), var(--module-theme-color, #2563EB))",
                        boxShadow: "0 10px 20px rgba(var(--module-theme-rgb, 37,99,235), 0.28)",
                      } : undefined}
                    >
                      <Wallet className="h-5 w-5" />
                      Withdraw
                    </button>
                  </>
                )}
              </div>

              {/* Desktop ink wallet rail */}
              <div className="hidden md:block relative overflow-hidden rounded-[28px] bg-[#141820] text-white shadow-[0_30px_60px_-36px_rgba(20,24,32,0.65)]">
                <div className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-[#4f6f9a]/25 blur-3xl" />
                <div className="pointer-events-none absolute -left-8 bottom-8 h-32 w-32 rounded-full bg-[#a8bdda]/10 blur-2xl" />
                <div className="relative p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8b98a8]">Available balance</p>
                    <TrendingUp className="w-4 h-4 text-[#a8bdda]" />
                  </div>
                  {loading ? (
                    <div className="py-10 text-sm text-[#8b98a8]">Loading...</div>
                  ) : (
                    <>
                      <p className="mt-4 text-[42px] leading-none font-black tracking-tight tabular-nums">
                        ₹{walletAvailableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="mt-3 text-sm text-[#9aa7b6]">
                        Withdrawable{" "}
                        <span className="font-semibold text-[#d7e2ef]">
                          ₹{walletNetAvailable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </p>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b98a8]">Orders</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{walletSummary?.totalOrders || 0}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b98a8]">Earned</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">
                            ₹{Number(walletTotalEarnings || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>

                      {walletTotalWithdrawn > 0 && (
                        <p className="mt-4 text-xs text-[#8b98a8]">
                          ₹{walletTotalWithdrawn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} already withdrawn
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const netAvailable = walletNetAvailable;
                          const hasDues = isRestaurantSubscriptionEnabled && subscriptionDueAmount > 0;
                          if (hasDues && netAvailable <= 0) {
                            setShowRestrictionModal(true);
                            return;
                          }
                          setShowWithdrawalModal(true);
                        }}
                        disabled={!(walletNetAvailable > 0)}
                        className={`mt-6 w-full py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                          walletNetAvailable > 0
                            ? "bg-[#4f6f9a] text-white hover:bg-[#3f5a80] shadow-[0_16px_30px_-18px_rgba(79,111,154,0.9)]"
                            : "bg-white/10 text-white/40 cursor-not-allowed"
                        }`}
                      >
                        <ArrowUpRight className="h-5 w-5" />
                        Withdraw now
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Withdrawal Requests */}
            <div className="md:col-start-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900 md:text-lg md:tracking-tight">Withdrawal requests</h2>
                <button
                  type="button"
                  onClick={() => navigate("/food/restaurant/withdrawal-history")}
                  className="hidden md:inline-flex text-xs font-semibold text-[#4f6f9a] hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="bg-white rounded-lg p-4 md:rounded-2xl md:border md:border-[#d6dce4] md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
                {loadingWithdrawals ? (
                  <div className="py-6 text-center text-sm text-gray-500">Loading withdrawal requests...</div>
                ) : withdrawalRequests.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">No withdrawal requests found.</div>
                ) : (
                  <div className="space-y-3">
                    {withdrawalRequests.slice(0, 8).map((request, index) => {
                      const status = formatWithdrawalStatus(request?.status)
                      return (
                        <div
                          key={request?._id || request?.id || index}
                          className="border border-gray-200 rounded-lg p-3 md:rounded-xl md:border-[#e2e7ed] md:bg-[#f5f7fa]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                ₹{Number(request?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Requested: {formatDateTime(request?.createdAt || request?.requestedAt)}
                              </p>
                              {request?.processedAt ? (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Processed: {formatDateTime(request?.processedAt)}
                                </p>
                              ) : null}
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getWithdrawalStatusClass(request?.status)}`}>
                              {status}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {withdrawalRequests.length > 8 ? (
                      <button
                        type="button"
                        onClick={() => navigate("/food/restaurant/withdrawal-history")}
                        className="w-full text-sm font-medium hover:underline pt-1 md:hidden"
                        style={{ color: "var(--module-theme-color, #2563EB)" }}
                      >
                        View all requests
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Order history */}
            <div className="md:col-start-2">
              <h2 className="text-base font-bold text-gray-900 mb-3 md:text-lg md:tracking-tight">Order history</h2>
              <div className="space-y-3 md:rounded-2xl md:border md:border-[#d6dce4] md:bg-white md:p-5 md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
                <div className="flex gap-2">
                  <div className="flex-1 relative" ref={dateRangePickerRef}>
                    <button
                      onClick={() => setShowDateRangePicker(!showDateRangePicker)}
                      className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer md:rounded-xl md:bg-[#f5f7fa] md:border-[#e2e7ed]"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">{selectedDateRange}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDateRangePicker ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Date Range Picker Dropdown */}
                    <AnimatePresence>
                      {showDateRangePicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
                        >
                          <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Date Range</h3>
                            <div className="space-y-2">
                              {(() => {
                                const getDateRanges = () => {
                                  const today = new Date()
                                  today.setHours(23, 59, 59, 999)

                                  // Last 7 days
                                  const last7DaysStart = new Date(today)
                                  last7DaysStart.setDate(today.getDate() - 7)
                                  last7DaysStart.setHours(0, 0, 0, 0)

                                  // Last 30 days
                                  const last30DaysStart = new Date(today)
                                  last30DaysStart.setDate(today.getDate() - 30)
                                  last30DaysStart.setHours(0, 0, 0, 0)

                                  // This week (Monday to Sunday)
                                  const currentDay = today.getDay()
                                  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
                                  const thisWeekStart = new Date(today)
                                  thisWeekStart.setDate(today.getDate() - daysFromMonday)
                                  thisWeekStart.setHours(0, 0, 0, 0)
                                  const thisWeekEnd = new Date(thisWeekStart)
                                  thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
                                  thisWeekEnd.setHours(23, 59, 59, 999)

                                  // Last week
                                  const lastWeekStart = new Date(thisWeekStart)
                                  lastWeekStart.setDate(thisWeekStart.getDate() - 7)
                                  const lastWeekEnd = new Date(thisWeekEnd)
                                  lastWeekEnd.setDate(thisWeekEnd.getDate() - 7)

                                  // This month
                                  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
                                  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

                                  // Last month
                                  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                                  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)

                                  return {
                                    today,
                                    last7DaysStart,
                                    last30DaysStart,
                                    thisWeekStart,
                                    thisWeekEnd,
                                    lastWeekStart,
                                    lastWeekEnd,
                                    thisMonthStart,
                                    thisMonthEnd,
                                    lastMonthStart,
                                    lastMonthEnd
                                  }
                                }

                                const formatDateForDisplay = (date) => {
                                  const day = date.getDate()
                                  const month = date.toLocaleString('en-US', { month: 'short' })
                                  const year = date.getFullYear().toString().slice(-2)
                                  return `${day} ${month}'${year}`
                                }

                                const formatDateRange = (start, end) => {
                                  return `${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`
                                }

                                const ranges = getDateRanges()
                                const dateOptions = [
                                  {
                                    label: "Last 7 days",
                                    range: formatDateRange(ranges.last7DaysStart, ranges.today),
                                    startDate: ranges.last7DaysStart,
                                    endDate: ranges.today
                                  },
                                  {
                                    label: "Last 30 days",
                                    range: formatDateRange(ranges.last30DaysStart, ranges.today),
                                    startDate: ranges.last30DaysStart,
                                    endDate: ranges.today
                                  },
                                  {
                                    label: "This week",
                                    range: formatDateRange(ranges.thisWeekStart, ranges.thisWeekEnd),
                                    startDate: ranges.thisWeekStart,
                                    endDate: ranges.thisWeekEnd
                                  },
                                  {
                                    label: "Last week",
                                    range: formatDateRange(ranges.lastWeekStart, ranges.lastWeekEnd),
                                    startDate: ranges.lastWeekStart,
                                    endDate: ranges.lastWeekEnd
                                  },
                                  {
                                    label: "This month",
                                    range: formatDateRange(ranges.thisMonthStart, ranges.thisMonthEnd),
                                    startDate: ranges.thisMonthStart,
                                    endDate: ranges.thisMonthEnd
                                  },
                                  {
                                    label: "Last month",
                                    range: formatDateRange(ranges.lastMonthStart, ranges.lastMonthEnd),
                                    startDate: ranges.lastMonthStart,
                                    endDate: ranges.lastMonthEnd
                                  }
                                ]

                                return dateOptions.map((option, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setOrdersPage(1)
                                      setSelectedDateRange(option.range)
                                      setShowDateRangePicker(false)
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm"
                                  >
                                    <div className="font-medium text-gray-900">{option.label}</div>
                                    <div className="text-xs text-gray-500">{option.range}</div>
                                  </button>
                                ))
                              })()}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative" ref={downloadMenuRef}>
                    <button
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      className="text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2 transition-colors md:rounded-xl md:!bg-[#141820] md:!shadow-[0_12px_24px_-16px_rgba(20,24,32,0.55)] md:hover:!bg-[#1e2633]"
                      style={{
                        background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 37,99,235), 0.9), var(--module-theme-color, #2563EB))",
                        boxShadow: "0 10px 22px rgba(var(--module-theme-rgb, 37,99,235), 0.28)",
                      }}
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-medium">Get report</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {showDownloadMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[180px]"
                        >
                          <button
                            onClick={downloadPDF}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-red-600" />
                            </div>
                            <span>Download PDF</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {loadingPastCycles ? (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">Loading order history...</p>
                  </div>
                ) : (
                  <>
                    {/* Show past cycles orders if available */}
                    {pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length > 0 ? (
                      <div className="bg-white rounded-lg p-4 space-y-3 md:bg-transparent md:p-0 md:rounded-none">
                        {pastCyclesData.orders.map((order, index) => (
                          <FinanceOrderRow key={order.orderId || index} order={order} />
                        ))}
                        <OrdersPagination
                          pagination={pastCyclesData.pagination}
                          onPageChange={setOrdersPage}
                        />
                      </div>
                    ) : (pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length === 0) ? (
                      <div className="bg-white rounded-lg p-8 text-center border border-dashed border-gray-300 md:bg-[#f5f7fa] md:border-[#d6dce4]">
                        <p className="text-sm text-gray-500 italic">No completed orders found for this selected range.</p>
                      </div>
                    ) : null}

                    {/* Show lifetime orders when no date filter is active */}
                    {(!pastCyclesData || !pastCyclesData.orders) && !loadingPastCycles && walletSummary?.orders && walletSummary.orders.length > 0 && (
                      <div className="bg-white rounded-lg p-4 space-y-3 md:bg-transparent md:p-0 md:rounded-none">
                        {walletSummary.orders.map((order, index) => (
                          <FinanceOrderRow key={order.orderId || index} order={order} />
                        ))}
                        <OrdersPagination
                          pagination={walletSummary.pagination}
                          onPageChange={setOrdersPage}
                        />
                      </div>
                    )}

                    {(!pastCyclesData || (!pastCyclesData.orders || pastCyclesData.orders.length === 0)) &&
                      (!walletSummary?.orders || walletSummary.orders.length === 0) &&
                      !loadingPastCycles && !loading && (
                        <div className="bg-white rounded-lg p-12 text-center border border-gray-200 md:bg-[#f5f7fa] md:border-[#d6dce4]">
                          <p className="text-gray-400 mb-2">No transaction history available</p>
                          <p className="text-xs text-gray-500">Your earnings and order payouts will appear here.</p>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* Subscription billing timeline */}
            <div className="md:col-start-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900 md:text-lg md:tracking-tight">Subscription billing</h2>
                <button
                  onClick={() => navigate('/food/restaurant/subscription')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 md:text-[#4f6f9a]"
                >
                  View all
                </button>
              </div>
              <div className="bg-white rounded-lg p-4 md:rounded-2xl md:border md:border-[#d6dce4] md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
                {loadingSubscriptionHistory ? (
                  <div className="py-6 text-center text-sm text-gray-500">Loading subscription billing...</div>
                ) : subscriptionHistory.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">No subscription billing activity yet.</div>
                ) : (
                  <div className="space-y-3">
                    {subscriptionHistory.map((item, idx) => (
                      <div key={item?._id || idx} className="border border-gray-200 rounded-lg p-3 md:rounded-xl md:border-[#e2e7ed] md:bg-[#f5f7fa]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 capitalize">
                            {String(item?.type || "").replaceAll("_", " ")}
                          </p>
                          <p className="text-sm font-bold text-gray-900">
                            ₹{Number(item?.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {item?.billingMonthLabel || item?.billingMonth || "-"} • Remaining due: ₹{Number(item?.outstandingAfter || 0).toLocaleString("en-IN")}
                        </p>
                        {item?.remarks ? (
                          <p className="text-xs text-gray-500 mt-1">{item.remarks}</p>
                        ) : null}
                        <p className="text-xs text-gray-500 mt-1">
                          {item?.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-4 md:space-y-6">
            <div className="hidden md:flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-[#141820] text-[#a8bdda] flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-[#141820]">Invoices & Taxes</h2>
                <p className="text-sm text-[#5c6775]">Period totals and per-order tax ledger</p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 md:rounded-2xl md:border-[#d6dce4] md:p-6 md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 md:text-base">Invoices & Taxes Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-md bg-gray-50 p-3 md:rounded-2xl md:bg-[#f5f7fa] md:border md:border-[#e2e7ed]">
                  <p className="text-xs text-gray-600">Orders</p>
                  <p className="text-base font-semibold text-gray-900 md:text-xl md:font-black tabular-nums">{invoiceSummary.count}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3 md:rounded-2xl md:bg-[#f5f7fa] md:border md:border-[#e2e7ed]">
                  <p className="text-xs text-gray-600">Earnings</p>
                  <p className="text-base font-semibold text-gray-900 md:text-xl md:font-black tabular-nums">₹{invoiceSummary.earnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3 md:rounded-2xl md:bg-[#f5f7fa] md:border md:border-[#e2e7ed]">
                  <p className="text-xs text-gray-600">Commission</p>
                  <p className="text-base font-semibold text-gray-900 md:text-xl md:font-black tabular-nums">₹{invoiceSummary.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3 md:rounded-2xl md:bg-[#141820] md:border md:border-[#141820]">
                  <p className="text-xs text-gray-600 md:text-[#8b98a8]">Gross amount</p>
                  <p className="text-base font-semibold text-gray-900 md:text-xl md:font-black md:text-white tabular-nums">₹{invoiceSummary.gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200 md:rounded-2xl md:border-[#d6dce4] md:p-6 md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 md:text-base">Order invoice details</h3>
              {loading ? (
                <p className="text-sm text-gray-500">Loading invoice data...</p>
              ) : invoiceOrders.length === 0 ? (
                <p className="text-sm text-gray-500">No invoice data available for selected range.</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-[#5c6775] border-b border-[#e2e7ed]">
                          <th className="pb-3 font-bold">Order</th>
                          <th className="pb-3 font-bold">Payment</th>
                          <th className="pb-3 font-bold">Status</th>
                          <th className="pb-3 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceOrders.map((order, index) => (
                          <tr key={`${order.orderId || index}-invoice-row`} className="border-b border-[#f0f3f1] last:border-0">
                            <td className="py-3 font-semibold text-[#141820]">{order.orderId || "N/A"}</td>
                            <td className="py-3 text-[#5c6775]">{order.paymentMethod || "N/A"}</td>
                            <td className="py-3 text-[#5c6775]">{order.orderStatus || "N/A"}</td>
                            <td className="py-3 text-right font-bold tabular-nums text-[#141820]">
                              ₹{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile list */}
                  <div className="space-y-2 md:hidden">
                    {invoiceOrders.map((order, index) => (
                      <div key={`${order.orderId || index}-invoice`} className="border border-gray-100 rounded-md p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">Order: {order.orderId || "N/A"}</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {order.paymentMethod || "N/A"} | {order.orderStatus || "N/A"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              ₹{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-gray-500">Total</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawalModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowWithdrawalModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Withdraw Amount</h2>
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="mb-4">
                  <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 mb-3">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <p className="text-sm text-gray-500">Total Wallet Balance</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ₹{walletAvailableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {isRestaurantSubscriptionEnabled && subscriptionDueAmount > 0 && (
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <p className="text-sm text-amber-700 font-medium">Subscription Due (Locked)</p>
                          {subscriptionLockedMonths ? (
                            <p className="text-[10px] text-amber-600">{subscriptionLockedMonths}</p>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-amber-700">
                          − ₹{subscriptionDueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-b-xl">
                      <p className="text-sm text-gray-900 font-bold">Available for Withdrawal</p>
                      <p className="text-sm font-bold text-gray-900">
                        ₹{walletNetAvailable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {isRestaurantSubscriptionEnabled && subscriptionDueAmount > 0 && (
                    <div className="px-3 py-2.5 bg-amber-50/50 border border-amber-100 rounded-xl mb-4">
                      <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                        <span className="font-bold">Why is part of my balance locked?</span>{" "}
                        {lockedReasonText}
                      </p>
                    </div>
                  )}
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Amount to Withdraw
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max={walletNetAvailable}
                    step="0.01"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    style={{ "--tw-ring-color": "rgba(var(--module-theme-rgb, 37,99,235), 0.25)" }}
                  />
                  {withdrawalAmount && parseFloat(withdrawalAmount) > walletNetAvailable && (
                    <p className="text-sm text-red-600 mt-1">Amount exceeds your withdrawable limit</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowWithdrawalModal(false)
                      setWithdrawalAmount('')
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const amount = parseFloat(withdrawalAmount)
                      if (!amount || amount <= 0) return
                      if (amount > walletNetAvailable) return

                      try {
                        setSubmittingWithdrawal(true)
                        const response = await restaurantAPI.createWithdrawalRequest(amount)
                        if (response.data?.success) {
                          // Professional success toast or similar would go here
                          setShowWithdrawalModal(false)
                          setWithdrawalAmount('')
                          // Refresh finance data
                          const financeResponse = await restaurantAPI.getFinance()
                          if (financeResponse.data?.success && financeResponse.data?.data) {
                            setFinanceData(financeResponse.data.data)
                          }
                          const withdrawalResponse = await restaurantAPI.getWithdrawalHistory()
                          const withdrawalPayload = withdrawalResponse?.data?.data
                          const withdrawalList = Array.isArray(withdrawalPayload)
                            ? withdrawalPayload
                            : Array.isArray(withdrawalPayload?.withdrawals)
                              ? withdrawalPayload.withdrawals
                              : []
                          setWithdrawalRequests(withdrawalList)
                        } else {
                          // Handle dues-related error professionally
                          if (response.data?.message?.toLowerCase().includes('subscription due')) {
                            setShowWithdrawalModal(false);
                            setShowRestrictionModal(true);
                          } else {
                            console.error('Submission failed:', response.data?.message);
                          }
                        }
                      } catch (error) {
                        debugError('Error submitting withdrawal request:', error)
                        const message = error.response?.data?.message || '';
                        if (message.toLowerCase().includes('subscription due') || message.toLowerCase().includes('outstanding')) {
                          setShowWithdrawalModal(false);
                          setShowRestrictionModal(true);
                        } else if (error.response?.status !== 401) {
                          console.error('Withdrawal error:', message);
                        }
                      } finally {
                        setSubmittingWithdrawal(false)
                      }
                    }}
                    disabled={submittingWithdrawal || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0 || parseFloat(withdrawalAmount) > walletNetAvailable}
                    className="flex-1 px-4 py-3 text-white rounded-lg font-medium transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 37,99,235), 0.9), var(--module-theme-color, #2563EB))",
                    }}
                  >
                    {submittingWithdrawal ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {!showRestrictionModal && !showWithdrawalModal && <BottomNavOrders />}
    </div>
  )
}
