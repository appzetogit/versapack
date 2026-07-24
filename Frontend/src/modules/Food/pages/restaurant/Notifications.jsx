import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, RefreshCw, X } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const DISMISSED_KEY = "restaurant_dismissed_notifications"

const getStatusLabel = (status = "") => {
  const normalized = String(status).toLowerCase()
  if (normalized === "confirmed") return "New order received"
  if (normalized === "preparing") return "Order is preparing"
  if (normalized === "ready") return "Order is ready for pickup"
  if (normalized === "out_for_delivery") return "Order out for delivery"
  if (normalized === "delivered") return "Order delivered"
  if (normalized === "cancelled") return "Order cancelled"
  if (normalized === "rejected") return "Order rejected"
  return "Order update"
}

const getStatusBadge = (message = "") => {
  const normalized = String(message).toLowerCase()
  if (normalized.includes("delivered")) {
    return { label: "Delivered", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
  }
  if (normalized.includes("cancelled") || normalized.includes("rejected")) {
    return { label: "Issue", className: "bg-red-50 text-red-700 border-red-200" }
  }
  if (normalized.includes("preparing") || normalized.includes("ready")) {
    return { label: "Kitchen", className: "bg-amber-50 text-amber-700 border-amber-200" }
  }
  if (normalized.includes("new order")) {
    return { label: "New", className: "bg-blue-50 text-blue-700 border-blue-200" }
  }
  return { label: "Update", className: "bg-slate-100 text-slate-700 border-slate-200" }
}

export default function Notifications() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const {
    items: broadcastNotifications,
    loading: broadcastLoading,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcastNotification,
    dismissAll: dismissAllBroadcastNotifications,
    refresh: refreshBroadcastNotifications,
  } = useNotificationInbox("restaurant", { limit: 100, pollMs: 5 * 60 * 1000 })

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getOrders({ page: 1, limit: 30 })
      const rows = response?.data?.data?.orders || response?.data?.data?.data?.orders || []
      setOrders(rows)
    } catch (error) {
      if (error.response?.status !== 401) {
        debugError("Error fetching notifications:", error)
      }
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds))
  }, [dismissedIds])

  const notifications = useMemo(() => {
    const orderNotifications = (orders || [])
      .map((order) => {
        const id = order._id || order.orderId
        const timestamp = order.updatedAt || order.createdAt
        return {
          id,
          orderId: order.orderId || "N/A",
          message: getStatusLabel(order.orderStatus || order.status),
          timeValue: timestamp ? new Date(timestamp).getTime() : 0,
          time: timestamp
            ? new Date(timestamp).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "N/A",
        }
      })
      .filter((item) => item.id && !dismissedIds.includes(item.id))
    const broadcastRows = (broadcastNotifications || []).map((item) => ({
      id: item.id,
      message: item.title || "Broadcast notification",
      detail: item.message || "",
      source: "broadcast",
      read: item.read,
      timeValue: item.createdAt ? new Date(item.createdAt).getTime() : 0,
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "N/A",
    }))

    return [...broadcastRows, ...orderNotifications].sort((a, b) => b.timeValue - a.timeValue)
  }, [broadcastNotifications, dismissedIds, orders])

  const removeNotification = (id, source = "order") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id)
      return
    }
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const clearAll = () => {
    dismissAllBroadcastNotifications()
    const ids = notifications
      .filter((item) => item.source !== "broadcast")
      .map((n) => n.id)
      .filter(Boolean)
    setDismissedIds((prev) => [...new Set([...prev, ...ids])])
  }

  const handleRefresh = async () => {
    await Promise.all([fetchNotifications(), refreshBroadcastNotifications()])
  }

  const unreadBroadcastCount = notifications.filter((item) => item.source === "broadcast" && !item.read).length

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white flex flex-col">
      <div className="px-4 pt-4 pb-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant")}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-900" />
          </button>
          <h1 className="text-base font-semibold text-slate-900 flex-1">Notifications</h1>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-slate-700" />
          </button>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-200">Inbox</p>
              <p className="text-lg font-semibold leading-tight">{notifications.length} Notifications</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-full bg-white/15 border border-white/20">
                Unread: {unreadBroadcastCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 pb-28">
        {!loading && notifications.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={clearAll}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
        )}

        {loading || broadcastLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Bell className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No notifications yet</p>
            <p className="text-xs text-slate-500 mt-1">New order and broadcast updates will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              (() => {
                const badge = item.source === "broadcast"
                  ? { label: "Broadcast", className: "bg-indigo-50 text-indigo-700 border-indigo-200" }
                  : getStatusBadge(item.message)
                return (
                  <div
                    key={item.id}
                    onClick={() => item.source === "broadcast" ? markBroadcastAsRead(item.id) : undefined}
                    className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-all ${item.source === "broadcast" && !item.read ? "border-blue-200 bg-blue-50 shadow-sm cursor-pointer" : "border-slate-300 bg-slate-50/95 shadow-sm hover:bg-white hover:border-slate-400"}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {item.source === "broadcast" && <Bell className="w-4 h-4 text-blue-600" />}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 leading-5">{item.message}</p>
                      {item.source === "broadcast" ? (
                        <p className="text-xs text-slate-600 mt-1">{item.detail || "Admin notification"}</p>
                      ) : (
                        <p className="text-xs text-slate-600 mt-1">Order ID: {item.orderId}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-1.5">{item.time}</p>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        removeNotification(item.id, item.source)
                      }}
                      className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                      aria-label="Remove notification"
                    >
                      <X className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                )
              })()
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
