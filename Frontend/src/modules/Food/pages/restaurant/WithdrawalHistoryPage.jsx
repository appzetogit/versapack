import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Wallet,
  Clock3,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  History,
  Banknote,
} from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"

const debugError = (...args) => {}

const TABS = [
  { id: "pending", label: "Pending", shortLabel: "Pending", icon: Clock3 },
  { id: "successful", label: "Successful", shortLabel: "Paid", icon: CheckCircle2 },
  { id: "rejected", label: "Rejected", shortLabel: "Rejected", icon: XCircle },
]

function normalizeStatus(statusRaw) {
  const status = String(statusRaw || "").trim().toLowerCase()
  if (status === "approved" || status === "processed") return status === "processed" ? "Processed" : "Approved"
  if (status === "rejected") return "Rejected"
  return "Pending"
}

function formatAmount(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(dateValue) {
  if (!dateValue) return "N/A"
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function statusBadgeClass(status) {
  if (status === "Approved" || status === "Processed") return "bg-[#dce8f5] text-[#2f5280]"
  if (status === "Rejected") return "bg-rose-100 text-rose-700"
  return "bg-amber-100 text-amber-800"
}

function matchesTab(request, tab) {
  if (tab === "pending") return request.status === "Pending"
  if (tab === "successful") return request.status === "Approved" || request.status === "Processed"
  return request.status === "Rejected"
}

function EmptyState({ tab }) {
  const copy = {
    pending: {
      title: "No pending withdrawals",
      body: "New withdrawal requests will show up here until they are processed.",
      icon: Clock3,
    },
    successful: {
      title: "No successful withdrawals yet",
      body: "Once a payout clears, it will land in this ledger.",
      icon: CheckCircle2,
    },
    rejected: {
      title: "No rejected requests",
      body: "Rejected withdrawal attempts will appear here with reasons when available.",
      icon: XCircle,
    },
  }[tab]

  const Icon = copy.icon

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 md:py-20">
      <div className="w-16 h-16 rounded-2xl bg-[#edf1f5] border border-[#d6dce4] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#5c6775]" />
      </div>
      <p className="text-base font-bold text-[#141820]">{copy.title}</p>
      <p className="mt-1.5 text-sm text-[#5c6775] max-w-sm">{copy.body}</p>
    </div>
  )
}

function WithdrawalCard({ request, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.24) }}
      className="relative overflow-hidden rounded-2xl border border-[#d6dce4] bg-white p-4 shadow-[0_14px_30px_-28px_rgba(20,24,32,0.45)] md:p-5"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4f6f9a]/80" />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5c6775]">
            Withdrawal
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight tabular-nums text-[#141820]">
            {formatAmount(request.amount)}
          </p>
          <div className="mt-3 space-y-1">
            <p className="text-xs text-[#5c6775]">
              Requested · {formatDateTime(request.requestedAt)}
            </p>
            {(request.status === "Approved" || request.status === "Processed" || request.status === "Rejected") && (
              <p className="text-xs text-[#5c6775]">
                {request.status === "Rejected" ? "Reviewed" : "Processed"} · {formatDateTime(request.processedAt)}
              </p>
            )}
            {request.rejectionReason ? (
              <p className="text-xs text-rose-600 mt-1.5 leading-relaxed">{request.rejectionReason}</p>
            ) : null}
          </div>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${statusBadgeClass(request.status)}`}>
          {request.status}
        </span>
      </div>
    </motion.div>
  )
}

export default function WithdrawalHistoryPage() {
  const navigate = useNavigate()
  const [withdrawalHistoryTab, setWithdrawalHistoryTab] = useState("pending")
  const [withdrawalRequests, setWithdrawalRequests] = useState([])
  const [loadingWithdrawalRequests, setLoadingWithdrawalRequests] = useState(false)

  useEffect(() => {
    const fetchWithdrawalRequests = async () => {
      try {
        setLoadingWithdrawalRequests(true)
        const response = await restaurantAPI.getWithdrawalHistory()
        const history = response?.data?.data || []

        const mapped = history.map((h) => ({
          id: h._id,
          amount: h.amount,
          status: normalizeStatus(h.status),
          requestedAt: h.createdAt || h.requestedAt,
          processedAt: h.processedAt,
          rejectionReason: h.rejectionReason || h.reason || "",
        }))

        setWithdrawalRequests(mapped)
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError("Error fetching withdrawal requests:", error)
        }
      } finally {
        setLoadingWithdrawalRequests(false)
      }
    }

    fetchWithdrawalRequests()
  }, [])

  const stats = useMemo(() => {
    const pending = withdrawalRequests.filter((r) => r.status === "Pending")
    const successful = withdrawalRequests.filter((r) => r.status === "Approved" || r.status === "Processed")
    const rejected = withdrawalRequests.filter((r) => r.status === "Rejected")
    const sum = (list) => list.reduce((acc, r) => acc + Number(r.amount || 0), 0)

    return {
      pendingCount: pending.length,
      pendingTotal: sum(pending),
      paidCount: successful.length,
      paidTotal: sum(successful),
      rejectedCount: rejected.length,
      rejectedTotal: sum(rejected),
      allCount: withdrawalRequests.length,
    }
  }, [withdrawalRequests])

  const filteredRequests = useMemo(
    () => withdrawalRequests.filter((req) => matchesTab(req, withdrawalHistoryTab)),
    [withdrawalRequests, withdrawalHistoryTab]
  )

  return (
    <div className="min-h-screen bg-[#e9edf2] flex flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="sticky top-0 z-40 px-4 py-3 border-b border-[#d5dbe3] bg-[#f2f4f7]/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/food/restaurant/hub-finance")}
            className="p-1.5 hover:bg-white/80 rounded-xl transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-[#141820]" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6775]">Finance</p>
            <h1 className="text-lg font-black tracking-tight text-[#141820]">Withdrawals</h1>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#141820] text-[#a8bdda] flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Desktop ink-ledger header */}
      <div className="hidden md:flex shrink-0 items-end justify-between gap-6 px-8 pt-7 pb-5 border-b border-[#d5dbe3] bg-[#f2f4f7]/90 backdrop-blur">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => navigate("/food/restaurant/hub-finance")}
            className="mt-1 p-2 rounded-xl border border-[#c8d0da] bg-white text-[#141820] hover:bg-[#eef1f5] transition-colors"
            aria-label="Back to payouts"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5c6775]">Restaurant finance</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[#141820]">Withdrawal ledger</h1>
            <p className="mt-1 text-sm text-[#5c6775]">
              Track every rupee requested, paid out, or sent back
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/food/restaurant/hub-finance")}
          className="inline-flex items-center gap-2 rounded-full border border-[#c8d0da] bg-white px-4 py-2.5 text-sm font-semibold text-[#141820] hover:bg-[#eef1f5] transition-colors"
        >
          <Wallet className="w-4 h-4" />
          Back to payouts
        </button>
      </div>

      {/* Summary strip */}
      <div className="px-4 pt-4 md:px-8 md:pt-6">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="rounded-2xl border border-[#d6dce4] bg-[#141820] p-3 text-white md:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b98a8] md:text-[11px]">Pending</p>
              <Clock3 className="w-3.5 h-3.5 text-[#a8bdda] md:w-4 md:h-4" />
            </div>
            <p className="mt-2 text-lg font-black tabular-nums md:text-2xl">{stats.pendingCount}</p>
            <p className="mt-0.5 text-[11px] text-[#9aa7b6] truncate md:text-sm">{formatAmount(stats.pendingTotal)}</p>
          </div>
          <div className="rounded-2xl border border-[#d6dce4] bg-white p-3 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6775] md:text-[11px]">Paid out</p>
              <Banknote className="w-3.5 h-3.5 text-[#4f6f9a] md:w-4 md:h-4" />
            </div>
            <p className="mt-2 text-lg font-black tabular-nums text-[#141820] md:text-2xl">{stats.paidCount}</p>
            <p className="mt-0.5 text-[11px] text-[#5c6775] truncate md:text-sm">{formatAmount(stats.paidTotal)}</p>
          </div>
          <div className="rounded-2xl border border-[#d6dce4] bg-white p-3 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6775] md:text-[11px]">Rejected</p>
              <XCircle className="w-3.5 h-3.5 text-rose-500 md:w-4 md:h-4" />
            </div>
            <p className="mt-2 text-lg font-black tabular-nums text-[#141820] md:text-2xl">{stats.rejectedCount}</p>
            <p className="mt-0.5 text-[11px] text-[#5c6775] truncate md:text-sm">{formatAmount(stats.rejectedTotal)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-4 md:px-8 md:pt-5">
        <div className="inline-flex w-full md:w-auto rounded-full bg-[#141820] p-1 shadow-sm">
          {TABS.map((tab) => {
            const active = withdrawalHistoryTab === tab.id
            const Icon = tab.icon
            const count =
              tab.id === "pending"
                ? stats.pendingCount
                : tab.id === "successful"
                  ? stats.paidCount
                  : stats.rejectedCount
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWithdrawalHistoryTab(tab.id)}
                className={`flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 md:px-5 rounded-full text-sm font-semibold transition-colors ${
                  active ? "bg-[#4f6f9a] text-white" : "text-[#b8c2cf] hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 hidden sm:block" />
                <span className="md:hidden">{tab.shortLabel}</span>
                <span className="hidden md:inline">{tab.label}</span>
                <span
                  className={`ml-0.5 min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-white/10 text-[#9aa7b6]"
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 md:px-8 md:pt-5 md:pb-8 md:min-h-0">
        {loadingWithdrawalRequests ? (
          <div className="rounded-2xl border border-[#d6dce4] bg-white py-16 text-center text-sm text-[#5c6775]">
            Loading withdrawal history...
          </div>
        ) : (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_280px] md:gap-6 md:items-start">
            <div className="rounded-2xl border border-[#d6dce4] bg-white/80 p-3 md:p-5 md:shadow-[0_18px_40px_-34px_rgba(20,24,32,0.35)]">
              {filteredRequests.length === 0 ? (
                <EmptyState tab={withdrawalHistoryTab} />
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-3 md:hidden">
                    <AnimatePresence mode="wait">
                      {filteredRequests.map((request, index) => (
                        <WithdrawalCard key={request.id} request={request} index={index} />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Desktop table / dense list */}
                  <div className="hidden md:block">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-black tracking-tight text-[#141820]">
                          {TABS.find((t) => t.id === withdrawalHistoryTab)?.label} requests
                        </h2>
                        <p className="text-sm text-[#5c6775]">
                          {filteredRequests.length} record{filteredRequests.length === 1 ? "" : "s"} in this view
                        </p>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-[#e2e7ed]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#f5f7fa] text-left text-[11px] uppercase tracking-wider text-[#5c6775]">
                            <th className="px-4 py-3 font-bold">Amount</th>
                            <th className="px-4 py-3 font-bold">Requested</th>
                            <th className="px-4 py-3 font-bold">Processed</th>
                            <th className="px-4 py-3 font-bold text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRequests.map((request, index) => (
                            <tr
                              key={request.id}
                              className="border-t border-[#eef1f5] hover:bg-[#f5f7fa]/80 transition-colors"
                            >
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="w-8 h-8 rounded-xl bg-[#edf1f5] text-[#4f6f9a] flex items-center justify-center">
                                    <ArrowUpRight className="w-4 h-4" />
                                  </span>
                                  <div>
                                    <p className="font-bold tabular-nums text-[#141820]">
                                      {formatAmount(request.amount)}
                                    </p>
                                    <p className="text-[11px] text-[#5c6775]">#{String(request.id || "").slice(-6) || index + 1}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-[#5c6775]">{formatDateTime(request.requestedAt)}</td>
                              <td className="px-4 py-4 text-[#5c6775]">
                                {request.status === "Pending" ? "—" : formatDateTime(request.processedAt)}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${statusBadgeClass(request.status)}`}>
                                  {request.status}
                                </span>
                                {request.rejectionReason ? (
                                  <p className="mt-1 text-[11px] text-rose-600 max-w-[220px] ml-auto text-right leading-snug">
                                    {request.rejectionReason}
                                  </p>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Desktop side rail */}
            <aside className="hidden md:block sticky top-0 space-y-4">
              <div className="relative overflow-hidden rounded-[28px] bg-[#141820] text-white p-6 shadow-[0_30px_60px_-36px_rgba(20,24,32,0.65)]">
                <div className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-[#4f6f9a]/25 blur-3xl" />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8b98a8]">Ledger snapshot</p>
                <p className="mt-3 text-3xl font-black tracking-tight tabular-nums">{stats.allCount}</p>
                <p className="mt-1 text-sm text-[#9aa7b6]">Total withdrawal records</p>
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#8b98a8]">In flight</span>
                    <span className="font-semibold tabular-nums">{formatAmount(stats.pendingTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#8b98a8]">Settled</span>
                    <span className="font-semibold tabular-nums text-[#a8bdda]">{formatAmount(stats.paidTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#8b98a8]">Returned</span>
                    <span className="font-semibold tabular-nums">{formatAmount(stats.rejectedTotal)}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[#d6dce4] bg-white p-5">
                <p className="text-sm font-bold text-[#141820]">Need to withdraw again?</p>
                <p className="mt-1 text-xs text-[#5c6775] leading-relaxed">
                  Open Payouts to check your available balance and submit a new request.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/food/restaurant/hub-finance")}
                  className="mt-4 w-full rounded-2xl bg-[#4f6f9a] py-3 text-sm font-bold text-white hover:bg-[#3f5a80] transition-colors"
                >
                  Go to payouts
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}
