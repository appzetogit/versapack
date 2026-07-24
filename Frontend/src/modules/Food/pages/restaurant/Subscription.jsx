import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  Lock,
  ReceiptText,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  CircleAlert,
} from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"

const debugError = (...args) => {}

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  partially_settled: "bg-blue-50 text-blue-700 border-blue-200",
  settled: "bg-green-50 text-green-700 border-green-200",
  waived: "bg-purple-50 text-purple-700 border-purple-200",
}

const STATUS_LABELS = {
  pending: "Due",
  partially_settled: "Partially Settled",
  settled: "Settled",
  waived: "Waived",
}

const TRANSACTION_LABELS = {
  invoice_generated: "Invoice generated",
  wallet_deduction: "Deducted from wallet",
  manual_payment: "Payment recorded",
  waiver: "Due waived",
  adjustment: "Adjustment",
  legacy_carryforward: "Balance carried forward",
}

function StatusPill({ status }) {
  const key = String(status || "pending").toLowerCase()
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[key] || STATUS_STYLES.pending}`}>
      {STATUS_LABELS[key] || key}
    </span>
  )
}

function InvoiceCard({ invoice }) {
  const [expanded, setExpanded] = useState(false)
  const [transactions, setTransactions] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && transactions === null) {
      try {
        setLoadingDetail(true)
        const response = await restaurantAPI.getSubscriptionInvoice(invoice._id)
        const list = Array.isArray(response?.data?.data?.transactions)
          ? response.data.data.transactions
          : []
        setTransactions(list)
      } catch (error) {
        debugError("Error fetching invoice detail:", error)
        setTransactions([])
      } finally {
        setLoadingDetail(false)
      }
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden md:border-slate-200 md:shadow-sm">
      <button onClick={toggle} className="w-full text-left p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">
              {invoice.billingMonthLabel || invoice.billingMonth}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 capitalize">
              {invoice.planName} plan{invoice.gmv > 0 ? ` • GMV ${formatMoney(invoice.gmv)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={invoice.status} />
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-500">
            Invoice: <span className="font-semibold text-gray-800">{formatMoney(invoice.totalAmount)}</span>
            {invoice.gstAmount > 0 ? (
              <span className="text-[10px] text-gray-400"> (incl. GST {formatMoney(invoice.gstAmount)})</span>
            ) : null}
          </p>
          <p className={`text-xs font-bold ${invoice.outstandingAmount > 0 ? "text-amber-700" : "text-green-700"}`}>
            {invoice.outstandingAmount > 0 ? `Due ${formatMoney(invoice.outstandingAmount)}` : "Cleared"}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <p className="text-gray-500">Plan amount</p>
              <p className="font-bold text-gray-900">{formatMoney(invoice.planAmount)}</p>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <p className="text-gray-500">GST (18%)</p>
              <p className="font-bold text-gray-900">{formatMoney(invoice.gstAmount)}</p>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <p className="text-gray-500">Paid</p>
              <p className="font-bold text-green-700">{formatMoney(invoice.paidAmount)}</p>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <p className="text-gray-500">Waived</p>
              <p className="font-bold text-purple-700">{formatMoney(invoice.waivedAmount)}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-gray-700 mb-2">Activity</p>
            {loadingDetail ? (
              <p className="text-xs text-gray-500 py-2">Loading activity...</p>
            ) : !transactions || transactions.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx._id} className="bg-white rounded-lg p-2.5 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-900">
                        {TRANSACTION_LABELS[tx.type] || tx.type}
                      </p>
                      <p className="text-xs font-bold text-gray-900">{formatMoney(tx.amount)}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-gray-500">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ""}
                        {tx.processedBy?.role === "ADMIN" ? " • by Admin" : ""}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Remaining: {formatMoney(tx.outstandingAfter)}
                      </p>
                    </div>
                    {tx.remarks ? (
                      <p className="text-[10px] text-gray-500 mt-1 italic">{tx.remarks}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Subscription() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("invoices")

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true)
        const [overviewRes, invoicesRes, timelineRes] = await Promise.allSettled([
          restaurantAPI.getSubscriptionOverview(),
          restaurantAPI.getSubscriptionInvoices({ limit: 50 }),
          restaurantAPI.getSubscriptionTransactions({ limit: 50 }),
        ])
        if (overviewRes.status === "fulfilled") {
          setOverview(overviewRes.value?.data?.data || null)
        }
        if (invoicesRes.status === "fulfilled") {
          setInvoices(
            Array.isArray(invoicesRes.value?.data?.data?.invoices)
              ? invoicesRes.value.data.data.invoices
              : []
          )
        }
        if (timelineRes.status === "fulfilled") {
          setTimeline(
            Array.isArray(timelineRes.value?.data?.data?.transactions)
              ? timelineRes.value.data.data.transactions
              : []
          )
        }
      } catch (error) {
        if (error?.response?.status !== 401) {
          debugError("Error fetching subscription data:", error)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const currentMonth = overview?.currentMonth || {}
  const outstanding = overview?.outstanding || {}
  const wallet = overview?.wallet || {}
  const lockedAmount = Number(outstanding.lockedAmount || 0)
  const totalBalance = Number(wallet.totalBalance || 0)
  const netAvailable = Number(wallet.netAvailable || 0)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:min-h-full md:h-full md:overflow-hidden md:bg-slate-50">
      {/* Header */}
      <div className="sticky bg-white/95 backdrop-blur top-0 z-40 px-4 py-3 border-b border-gray-200 shrink-0 md:border-slate-200">
        <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto md:px-4 md:py-2">
          <button
            onClick={() => navigate("/food/restaurant/hub-finance")}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 md:text-2xl">Subscription</h1>
            <p className="text-[11px] text-gray-500 md:text-sm">
              Monthly GMV-based billing • Pay after the month ends
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28 space-y-5 md:min-h-0 md:max-w-5xl md:mx-auto md:px-8 md:py-8 md:pb-8 md:w-full md:space-y-6">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading subscription details...</div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
            {/* Current month card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm md:shadow-md md:border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-gray-900 md:text-base">
                  Current Month — {currentMonth.label || ""}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3 md:bg-slate-50">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">GMV so far</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{formatMoney(currentMonth.gmv)}</p>
                  <p className="text-[10px] text-gray-400">{currentMonth.orderCount || 0} delivered orders</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 md:bg-slate-50">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Estimated plan</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5 capitalize">
                    {currentMonth.estimatedPlanLabel || "—"}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {currentMonth.estimatedTotal > 0
                      ? `Est. fee ${formatMoney(currentMonth.estimatedTotal)} (incl. GST)`
                      : "No fee if no delivered orders"}
                  </p>
                </div>
              </div>
              {Array.isArray(currentMonth.planCatalog) && currentMonth.planCatalog.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Plan slabs (monthly GMV)</p>
                  <div className="space-y-1.5">
                    {currentMonth.planCatalog.map((plan) => (
                      <div
                        key={plan.id}
                        className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 gap-2 ${
                          currentMonth.estimatedPlan === plan.id ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
                        }`}
                      >
                        <span className="font-semibold text-gray-800 shrink-0">{plan.label}</span>
                        <span className="text-gray-500 truncate text-right">
                          {plan.gmvMax != null
                            ? `₹${Number(plan.gmvMin).toLocaleString("en-IN")} – ₹${Number(plan.gmvMax).toLocaleString("en-IN")}`
                            : `Above ₹${Number(plan.gmvMin).toLocaleString("en-IN")}`}
                        </span>
                        <span className="font-bold text-gray-900 shrink-0">₹{Number(plan.basePrice).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dues & wallet card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm md:shadow-md md:border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-gray-900 md:text-base">Dues & Wallet</h2>
              </div>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-sm text-gray-500">Total Wallet Balance</p>
                  <p className="text-sm font-semibold text-gray-900">{formatMoney(totalBalance)}</p>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <div>
                      <p className="text-sm text-amber-700 font-medium">Locked (Subscription Due)</p>
                      {outstanding.lockedMonths ? (
                        <p className="text-[10px] text-amber-600">{outstanding.lockedMonths}</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-amber-700">{formatMoney(lockedAmount)}</p>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-b-xl">
                  <p className="text-sm font-bold text-gray-900">Available for Withdrawal</p>
                  <p className="text-sm font-bold text-gray-900">{formatMoney(netAvailable)}</p>
                </div>
              </div>
              {lockedAmount > 0 ? (
                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50/60 border border-amber-100 rounded-xl">
                  <CircleAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    The locked amount stays in your wallet but cannot be withdrawn until the subscription due is
                    settled by the admin (wallet deduction or manual payment) or waived.
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-100 rounded-xl">
                  <BadgeCheck className="w-4 h-4 text-green-600" />
                  <p className="text-[11px] text-green-800">No outstanding subscription dues. Your full balance is withdrawable.</p>
                </div>
              )}
            </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 md:inline-flex md:rounded-full md:bg-slate-900/95 md:p-1 md:shadow-sm">
              <button
                onClick={() => setActiveTab("invoices")}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors md:flex-none md:rounded-full md:px-6 ${
                  activeTab === "invoices"
                    ? "bg-black text-white md:bg-white md:text-slate-900"
                    : "bg-white text-gray-600 border border-gray-200 md:bg-transparent md:border-0 md:text-slate-300 hover:md:text-white"
                }`}
              >
                Monthly Invoices
              </button>
              <button
                onClick={() => setActiveTab("timeline")}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors md:flex-none md:rounded-full md:px-6 ${
                  activeTab === "timeline"
                    ? "bg-black text-white md:bg-white md:text-slate-900"
                    : "bg-white text-gray-600 border border-gray-200 md:bg-transparent md:border-0 md:text-slate-300 hover:md:text-white"
                }`}
              >
                Billing Timeline
              </button>
            </div>

            {activeTab === "invoices" && (
              <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 md:col-span-2 md:border-slate-200">
                    <ReceiptText className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No invoices yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Your first invoice will be generated at the end of the month based on your GMV.
                    </p>
                  </div>
                ) : (
                  invoices.map((invoice) => <InvoiceCard key={invoice._id} invoice={invoice} />)
                )}
              </div>
            )}

            {activeTab === "timeline" && (
              <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {timeline.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 md:col-span-2 md:border-slate-200">
                    <ReceiptText className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No billing activity yet</p>
                  </div>
                ) : (
                  timeline.map((tx) => (
                    <div key={tx._id} className="bg-white border border-gray-200 rounded-xl p-3.5 md:border-slate-200 md:shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {TRANSACTION_LABELS[tx.type] || tx.type}
                        </p>
                        <p className="text-sm font-bold text-gray-900">{formatMoney(tx.amount)}</p>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {tx.billingMonthLabel || tx.billingMonth} • Remaining due: {formatMoney(tx.outstandingAfter)}
                      </p>
                      {tx.remarks ? <p className="text-xs text-gray-500 mt-1 italic">{tx.remarks}</p> : null}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ""}
                        {tx.processedBy?.role === "ADMIN" ? " • by Admin" : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="md:hidden">
        <BottomNavOrders />
      </div>
    </div>
  )
}
