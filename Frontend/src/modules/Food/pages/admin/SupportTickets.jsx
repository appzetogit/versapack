import { useCallback, useEffect, useMemo, useState } from "react"
import {
  MessageSquare,
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
} from "lucide-react"
import { supportAPI } from "@food/api"
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

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "user", label: "User App" },
  { value: "restaurant", label: "Restaurant Panel" },
]

const USER_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "order", label: "Order" },
  { value: "restaurant", label: "Restaurant" },
  { value: "other", label: "Other" },
]

const RESTAURANT_CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments" },
  { value: "menu", label: "Menu" },
  { value: "restaurant", label: "Restaurant" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
]

function buildQueryParams(filters, page, search) {
  const params = { page, limit: PAGE_SIZE }
  if (filters.source && filters.source !== "all") params.source = filters.source
  if (filters.status) params.status = filters.status
  if (search.trim()) params.search = search.trim()
  if (filters.source === "restaurant") {
    if (filters.category) params.category = filters.category
  } else if (filters.type) {
    params.type = filters.type
  }
  return params
}

function getStatusStyles(status) {
  switch (status) {
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
  if (status === "in-progress") return "In Progress"
  if (!status) return "Unknown"
  return status.charAt(0).toUpperCase() + status.slice(1)
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

export default function SupportTickets() {
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState({
    status: "",
    type: "",
    category: "",
    source: "all",
  })
  const [selectedTicket, setSelectedTicket] = useState(null)
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
    if (filters.source && filters.source !== "all") params.source = filters.source
    if (filters.source === "restaurant") {
      if (filters.category) params.category = filters.category
    } else if (filters.type) {
      params.type = filters.type
    }
    return params
  }, [filters.source, filters.type, filters.category])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const getUserLabel = (ticket) => {
    if (ticket.source === "restaurant") return "Restaurant Panel"
    const user = ticket.user || {}
    const name = user.name || ticket.userName || ""
    const phone = user.phone || ticket.userPhone || ""
    if (name && phone) return `${name} (${phone})`
    if (name) return name
    if (phone) return phone
    const id = ticket.userId ? String(ticket.userId).slice(-6) : ""
    return id ? `#${id}` : "-"
  }

  const getRestaurantLabel = (ticket) => {
    const restaurant = ticket.restaurant || {}
    const name = restaurant.name || ticket.restaurantName || ""
    const city = restaurant.city || ""
    if (name && city) return `${name} (${city})`
    if (name) return name
    return "-"
  }

  const getTypeLabel = (ticket) => {
    if (ticket.source === "restaurant") return ticket.category || "other"
    return ticket.type || "other"
  }

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await supportAPI.getFoodSupportTicketStats(statsParams)
      const data = res?.data?.data || res?.data || null
      setStats(data)
    } catch {
      toast.error("Failed to load ticket stats")
    } finally {
      setStatsLoading(false)
    }
  }, [statsParams])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await supportAPI.getSupportTicketsAdmin(queryParams)
      const payload = res?.data?.data || res?.data || {}
      setTickets(Array.isArray(payload.tickets) ? payload.tickets : [])
      setTotal(Number(payload.total) || 0)
    } catch {
      toast.error("Failed to load tickets")
      setTickets([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  const handleFilterChange = (key, value) => {
    setPage(1)
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      if (key === "source") {
        if (value === "restaurant") next.type = ""
        if (value === "user") next.category = ""
      }
      return next
    })
  }

  const handleSearch = () => {
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  const updateTicket = async (id, patch) => {
    const ticket = tickets.find((t) => String(t._id) === String(id))
    try {
      setUpdating(true)
      await supportAPI.updateSupportTicketAdmin(id, {
        ...patch,
        source: ticket?.source || "user",
      })
      toast.success("Ticket updated")
      await Promise.all([loadTickets(), loadStats()])
    } catch {
      toast.error("Failed to update ticket")
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (ticketId, newStatus) => {
    await updateTicket(ticketId, { status: newStatus })
  }

  const handleSaveResponse = async () => {
    if (!selectedTicket) return
    await updateTicket(selectedTicket._id, { adminResponse: responseText.trim() })
    setIsResponseOpen(false)
    setResponseText("")
    setSelectedTicket(null)
  }

  const openView = (ticket) => {
    setSelectedTicket(ticket)
    setIsViewOpen(true)
  }

  const openResponse = (ticket) => {
    setSelectedTicket(ticket)
    setResponseText(ticket.adminResponse || "")
    setIsResponseOpen(true)
  }

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
              <p className="text-sm text-slate-600 mt-1">
                Review and respond to user and restaurant support requests.
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
                <p className="text-xs text-slate-600 mt-1">Total Tickets</p>
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
                placeholder="Search by issue, description, user, restaurant, or ticket ID..."
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
              value={filters.source}
              onChange={(e) => handleFilterChange("source", e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            {filters.source === "restaurant" ? (
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange("category", e.target.value)}
                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {RESTAURANT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange("type", e.target.value)}
                className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
                disabled={filters.source === "restaurant"}
              >
                {USER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 text-sm text-slate-600">
            <p>
              Showing <span className="font-semibold text-slate-900">{showingFrom}-{showingTo}</span> of{" "}
              <span className="font-semibold text-slate-900">{total}</span> tickets
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
          ) : tickets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
              <p className="text-slate-600">No tickets match your filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={`${ticket.source}-${ticket._id}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">
                          #{String(ticket._id).slice(-6)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(
                            ticket.status,
                          )}`}
                        >
                          {ticket.status === "open" ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : ticket.status === "resolved" ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          {formatStatusLabel(ticket.status)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {ticket.source === "restaurant" ? (
                            <Store className="w-3.5 h-3.5" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                          {ticket.source || "user"}
                        </span>
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 capitalize">
                          {getTypeLabel(ticket)}
                        </span>
                        {ticket.priority ? (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 capitalize">
                            {ticket.priority} priority
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{ticket.issueType}</h3>
                        {ticket.subject ? (
                          <p className="text-sm text-slate-600 mt-1">Subject: {ticket.subject}</p>
                        ) : null}
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2">
                          {ticket.description || "No description provided."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">User</p>
                          <p className="text-slate-700 mt-1">{getUserLabel(ticket)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Restaurant</p>
                          <p className="text-slate-700 mt-1">{getRestaurantLabel(ticket)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Created</p>
                          <p className="text-slate-700 mt-1">{formatDateTime(ticket.createdAt)}</p>
                        </div>
                      </div>

                      {ticket.orderRef ? (
                        <p className="text-xs text-slate-500">Order ref: {ticket.orderRef}</p>
                      ) : null}

                      {ticket.adminResponse ? (
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900">
                          <span className="font-medium">Admin response:</span> {ticket.adminResponse}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                      <select
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(ticket._id, e.target.value)}
                        disabled={updating}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[140px]"
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openView(ticket)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => openResponse(ticket)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        <Edit className="w-4 h-4" />
                        Respond
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="flex w-[calc(100%-2rem)] max-w-[640px] max-h-[85vh] flex-col overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14 text-left">
            <DialogTitle className="text-xl font-semibold text-slate-900">Ticket Details</DialogTitle>
            <p className="text-sm text-slate-600 mt-1">
              Complete information about this support request
            </p>
          </DialogHeader>

          {selectedTicket ? (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-blue-500 rounded" />
                    <h3 className="text-base font-semibold text-slate-900">Ticket Information</h3>
                  </div>
                  <div className="pl-4 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Ticket ID</p>
                      <div className="bg-slate-100 text-slate-800 px-4 py-2.5 rounded-lg inline-block">
                        <p className="text-base font-mono font-semibold">
                          #{String(selectedTicket._id).slice(-6)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Status</p>
                        <span
                          className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusStyles(
                            selectedTicket.status,
                          )}`}
                        >
                          {formatStatusLabel(selectedTicket.status)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Source</p>
                        <p className="text-sm text-slate-900 font-semibold capitalize">
                          {selectedTicket.source || "user"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Type</p>
                        <p className="text-sm text-slate-900 font-semibold capitalize">
                          {getTypeLabel(selectedTicket)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Issue</p>
                      <p className="text-base text-slate-900 font-semibold">{selectedTicket.issueType}</p>
                    </div>

                    {selectedTicket.subject ? (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Subject</p>
                        <p className="text-sm text-slate-900">{selectedTicket.subject}</p>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Description</p>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 max-h-56 overflow-y-auto">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {selectedTicket.description || "No description provided."}
                        </p>
                      </div>
                    </div>

                    {selectedTicket.orderRef ? (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Order Reference</p>
                        <p className="text-sm text-slate-900 font-medium">{selectedTicket.orderRef}</p>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-slate-900">{formatDateTime(selectedTicket.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-violet-500 rounded" />
                    <h3 className="text-base font-semibold text-slate-900">
                      {selectedTicket.source === "restaurant" ? "Restaurant" : "Customer"}
                    </h3>
                  </div>
                  <div className="pl-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">User</p>
                      <p className="text-sm text-slate-900 font-semibold">{getUserLabel(selectedTicket)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Restaurant</p>
                      <p className="text-sm text-slate-900 font-semibold">{getRestaurantLabel(selectedTicket)}</p>
                    </div>
                  </div>
                </div>

                {selectedTicket.adminResponse ? (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-1 h-6 bg-emerald-500 rounded" />
                      <h3 className="text-base font-semibold text-slate-900">Admin Response</h3>
                    </div>
                    <div className="pl-4">
                      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {selectedTicket.adminResponse}
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
                      openResponse(selectedTicket)
                    }}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
                  >
                    {selectedTicket.adminResponse ? "Edit Response" : "Send Response"}
                  </button>
                  {selectedTicket.status !== "resolved" ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleStatusChange(selectedTicket._id, "resolved")
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
            <DialogTitle className="text-xl font-semibold text-slate-900">Respond to Ticket</DialogTitle>
            {selectedTicket ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  #{String(selectedTicket._id).slice(-6)} · {selectedTicket.issueType}
                </p>
                <p className="text-sm text-slate-500 line-clamp-2">
                  {selectedTicket.subject || selectedTicket.description || "Send an update the customer can see."}
                </p>
              </div>
            ) : null}
          </DialogHeader>

          <div className="px-6 py-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">Response</label>
            <Textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Write your response to the customer or restaurant..."
              rows={6}
              className="min-h-[180px] resize-y rounded-xl border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              This message will be visible in the support ticket for the user or restaurant.
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
