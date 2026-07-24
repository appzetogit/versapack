import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Search,
  Clock,
  CheckCircle,
  Loader2,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  User,
  Store,
  Package,
} from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@food/components/ui/dialog"
import { Textarea } from "@food/components/ui/textarea"

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
]

const COMPLAINT_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "food_quality", label: "Food Quality" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "missing_item", label: "Missing Item" },
  { value: "delivery_issue", label: "Delivery Issue" },
  { value: "packaging", label: "Packaging" },
  { value: "pricing", label: "Pricing" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
]

function buildQueryParams(filters, page, search) {
  const params = { page, limit: PAGE_SIZE }
  if (filters.status) params.status = filters.status
  if (filters.complaintType) params.complaintType = filters.complaintType
  if (search.trim()) params.search = search.trim()
  return params
}

function normalizeStatus(status) {
  const raw = String(status || "open").trim().toLowerCase()
  if (raw === "pending") return "open"
  if (raw === "in_progress") return "in-progress"
  return raw
}

function getStatusStyles(status) {
  const normalized = normalizeStatus(status)
  switch (normalized) {
    case "open":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "in-progress":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "resolved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    default:
      return "bg-slate-50 text-slate-700 border-slate-200"
  }
}

function formatStatusLabel(status) {
  const normalized = normalizeStatus(status)
  if (normalized === "in-progress") return "In Progress"
  if (!normalized) return "Unknown"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatIssueType(value) {
  if (!value) return "Other"
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDateTime(value) {
  if (!value) return "N/A"
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function RestaurantComplaints() {
  const [complaints, setComplaints] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState({
    status: "",
    complaintType: "",
  })
  const [selectedComplaint, setSelectedComplaint] = useState(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isResponseOpen, setIsResponseOpen] = useState(false)
  const [responseText, setResponseText] = useState("")
  const [updating, setUpdating] = useState(false)

  const queryParams = useMemo(
    () => buildQueryParams(filters, page, searchQuery),
    [filters, page, searchQuery],
  )

  const statsParams = useMemo(() => {
    const params = {}
    if (filters.complaintType) params.complaintType = filters.complaintType
    return params
  }, [filters.complaintType])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, total)

  const getCustomerLabel = (complaint) => {
    const user = complaint.userId || {}
    const name = user.name || ""
    const phone = user.phone || ""
    if (name && phone) return `${name} (${phone})`
    if (name) return name
    if (phone) return phone
    return "-"
  }

  const getRestaurantLabel = (complaint) => {
    const restaurant = complaint.restaurantId || {}
    const name = restaurant.restaurantName || ""
    const city = restaurant.city || restaurant.area || ""
    if (name && city) return `${name} (${city})`
    if (name) return name
    return "-"
  }

  const getOrderLabel = (complaint) => {
    const order = complaint.orderId || {}
    if (order.orderId) return `#${order.orderId}`
    if (order._id) return `#${String(order._id).slice(-6)}`
    return "-"
  }

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await adminAPI.getRestaurantComplaintStats(statsParams)
      const data = res?.data?.data || res?.data || null
      setStats(data)
    } catch {
      toast.error("Failed to load complaint stats")
    } finally {
      setStatsLoading(false)
    }
  }, [statsParams])

  const loadComplaints = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getRestaurantComplaints(queryParams)
      const payload = res?.data?.data || res?.data || {}
      setComplaints(Array.isArray(payload.complaints) ? payload.complaints : [])
      setTotal(Number(payload.total) || 0)
    } catch {
      toast.error("Failed to load complaints")
      setComplaints([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadComplaints()
  }, [loadComplaints])

  useEffect(() => {
    if (!loading && page > totalPages) {
      setPage(totalPages)
    }
  }, [loading, page, totalPages])

  const handleFilterChange = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSearch = () => {
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  const updateComplaint = async (id, patch) => {
    try {
      setUpdating(true)
      await adminAPI.updateRestaurantComplaint(id, patch)
      toast.success("Complaint updated")
      await Promise.all([loadComplaints(), loadStats()])
    } catch {
      toast.error("Failed to update complaint")
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (complaintId, newStatus) => {
    await updateComplaint(complaintId, { status: newStatus })
  }

  const handleSaveResponse = async () => {
    if (!selectedComplaint) return
    await updateComplaint(selectedComplaint._id, { adminResponse: responseText.trim() })
    setIsResponseOpen(false)
    setResponseText("")
    setSelectedComplaint(null)
  }

  const openView = (complaint) => {
    setSelectedComplaint(complaint)
    setIsViewOpen(true)
  }

  const openResponse = (complaint) => {
    setSelectedComplaint(complaint)
    setResponseText(complaint.adminResponse || "")
    setIsResponseOpen(true)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Restaurant Complaints</h1>
              <p className="text-sm text-slate-600 mt-1">
                Review and resolve customer complaints related to restaurant orders.
              </p>
            </div>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <button
                type="button"
                onClick={() => handleFilterChange("status", "")}
                className={`rounded-lg p-4 text-left border transition-colors ${
                  filters.status === ""
                    ? "border-slate-400 bg-slate-100"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-600 mt-1">Total Complaints</p>
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange("status", "open")}
                className={`rounded-lg p-4 text-left border transition-colors ${
                  filters.status === "open"
                    ? "border-amber-400 bg-amber-100"
                    : "border-amber-200 bg-amber-50 hover:bg-amber-100"
                }`}
              >
                <p className="text-2xl font-bold text-amber-700">{stats.open}</p>
                <p className="text-xs text-amber-600 mt-1">Open</p>
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange("status", "in-progress")}
                className={`rounded-lg p-4 text-left border transition-colors ${
                  filters.status === "in-progress"
                    ? "border-blue-400 bg-blue-100"
                    : "border-blue-200 bg-blue-50 hover:bg-blue-100"
                }`}
              >
                <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
                <p className="text-xs text-blue-600 mt-1">In Progress</p>
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange("status", "resolved")}
                className={`rounded-lg p-4 text-left border transition-colors ${
                  filters.status === "resolved"
                    ? "border-emerald-400 bg-emerald-100"
                    : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                }`}
              >
                <p className="text-2xl font-bold text-emerald-700">{stats.resolved}</p>
                <p className="text-xs text-emerald-600 mt-1">Resolved</p>
              </button>
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by order, customer, restaurant, or description..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Search
            </button>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.complaintType}
              onChange={(e) => handleFilterChange("complaintType", e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {COMPLAINT_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 text-sm text-slate-600">
            <p>
              Showing <span className="font-semibold text-slate-900">{showingFrom}-{showingTo}</span> of{" "}
              <span className="font-semibold text-slate-900">{total}</span> complaints
              {filters.status ? (
                <span>
                  {" "}
                  with status <span className="font-semibold">{formatStatusLabel(filters.status)}</span>
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : complaints.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
              <p className="text-slate-600">No complaints match your filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {complaints.map((complaint) => {
                const status = normalizeStatus(complaint.status)
                return (
                  <div
                    key={complaint._id}
                    className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">
                            #{String(complaint._id).slice(-6)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(
                              status,
                            )}`}
                          >
                            {status === "resolved" ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {formatStatusLabel(status)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                            {formatIssueType(complaint.issueType)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            <Package className="w-3.5 h-3.5" />
                            Order complaint
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-semibold text-slate-900">
                            {formatIssueType(complaint.issueType)}
                          </h3>
                          <p className="text-sm text-slate-500 mt-2 line-clamp-2">
                            {complaint.description || "No description provided."}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Order</p>
                            <p className="text-slate-700 mt-1">{getOrderLabel(complaint)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Customer</p>
                            <p className="text-slate-700 mt-1 flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {getCustomerLabel(complaint)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Restaurant</p>
                            <p className="text-slate-700 mt-1 flex items-center gap-1">
                              <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {getRestaurantLabel(complaint)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Created</p>
                            <p className="text-slate-700 mt-1">{formatDateTime(complaint.createdAt)}</p>
                          </div>
                        </div>

                        {complaint.restaurantResponse ? (
                          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                            <span className="font-medium">Restaurant response:</span> {complaint.restaurantResponse}
                          </div>
                        ) : null}

                        {complaint.adminResponse ? (
                          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900">
                            <span className="font-medium">Admin response:</span> {complaint.adminResponse}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                        <select
                          value={status}
                          onChange={(e) => handleStatusChange(complaint._id, e.target.value)}
                          disabled={updating}
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[140px]"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => openView(complaint)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openResponse(complaint)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                        >
                          <Edit className="w-4 h-4" />
                          Respond
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="flex w-[calc(100%-2rem)] max-w-[640px] max-h-[85vh] flex-col overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14 text-left">
            <DialogTitle className="text-xl font-semibold text-slate-900">Complaint Details</DialogTitle>
            <p className="text-sm text-slate-600 mt-1">
              Complete information about this order complaint
            </p>
          </DialogHeader>

          {selectedComplaint ? (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-blue-500 rounded" />
                    <h3 className="text-base font-semibold text-slate-900">Complaint Information</h3>
                  </div>
                  <div className="pl-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Complaint ID</p>
                      <div className="bg-slate-100 text-slate-800 px-4 py-2.5 rounded-lg inline-block">
                        <p className="text-base font-mono font-semibold">
                          #{String(selectedComplaint._id).slice(-6)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Status</p>
                        <span
                          className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusStyles(
                            selectedComplaint.status,
                          )}`}
                        >
                          {formatStatusLabel(selectedComplaint.status)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Type</p>
                        <p className="text-sm text-slate-900 font-semibold">
                          {formatIssueType(selectedComplaint.issueType)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Order</p>
                        <p className="text-sm text-slate-900 font-semibold">
                          {getOrderLabel(selectedComplaint)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Description</p>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 max-h-56 overflow-y-auto">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {selectedComplaint.description || "No description provided."}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-slate-900">{formatDateTime(selectedComplaint.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-violet-500 rounded" />
                    <h3 className="text-base font-semibold text-slate-900">Parties Involved</h3>
                  </div>
                  <div className="pl-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Customer</p>
                      <p className="text-sm text-slate-900 font-semibold">{getCustomerLabel(selectedComplaint)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Restaurant</p>
                      <p className="text-sm text-slate-900 font-semibold">{getRestaurantLabel(selectedComplaint)}</p>
                    </div>
                  </div>
                </div>

                {selectedComplaint.restaurantResponse ? (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1 h-6 bg-amber-500 rounded" />
                      <h3 className="text-base font-semibold text-slate-900">Restaurant Response</h3>
                    </div>
                    <div className="pl-4">
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {selectedComplaint.restaurantResponse}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedComplaint.adminResponse ? (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1 h-6 bg-emerald-500 rounded" />
                      <h3 className="text-base font-semibold text-slate-900">Admin Response</h3>
                    </div>
                    <div className="pl-4">
                      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {selectedComplaint.adminResponse}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsViewOpen(false)
                      openResponse(selectedComplaint)
                    }}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
                  >
                    {selectedComplaint.adminResponse ? "Edit Response" : "Send Response"}
                  </button>
                  {normalizeStatus(selectedComplaint.status) !== "resolved" ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleStatusChange(selectedComplaint._id, "resolved")
                        setIsViewOpen(false)
                      }}
                      className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm"
                    >
                      Mark Resolved
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isResponseOpen} onOpenChange={setIsResponseOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[560px] overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14 text-left">
            <DialogTitle className="text-xl font-semibold text-slate-900">Respond to Complaint</DialogTitle>
            {selectedComplaint ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  #{String(selectedComplaint._id).slice(-6)} · {formatIssueType(selectedComplaint.issueType)}
                </p>
                <p className="text-sm text-slate-500 line-clamp-2">
                  {selectedComplaint.description || "Send an update the customer can see."}
                </p>
              </div>
            ) : null}
          </DialogHeader>

          <div className="px-6 py-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">Response</label>
            <Textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Write your response to the customer..."
              rows={6}
              className="min-h-[180px] resize-y rounded-xl border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              This message will be visible to the customer regarding their complaint.
            </p>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setIsResponseOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveResponse}
              disabled={updating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {updating ? "Saving..." : "Save Response"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
