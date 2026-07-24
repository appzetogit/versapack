import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Clock, Trash2 } from "lucide-react";
import {
  getDeliveryNotifications,
  saveDeliveryNotifications,
  markDeliveryNotificationAsRead,
} from "@food/utils/deliveryNotifications";
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const toTimeLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const normalizeNotifications = (items = []) =>
  (Array.isArray(items) ? items : []).map((item, index) => ({
    id: String(item?.id || item?._id || `delivery-notification-${index}`),
    title: String(item?.title || "Notification").trim(),
    message: String(item?.message || item?.body || "").trim(),
    read: Boolean(item?.read),
    createdAt: item?.createdAt || item?.timestamp || Date.now(),
  }));

export default function NotificationsV2() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(() =>
    normalizeNotifications(getDeliveryNotifications())
  );
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    loading: broadcastLoading,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcastNotification,
    dismissAll: dismissAllBroadcastNotifications,
  } = useNotificationInbox("delivery", { limit: 100 });

  useEffect(() => {
    const syncNotifications = () => {
      setNotifications(normalizeNotifications(getDeliveryNotifications()));
    };

    window.addEventListener("deliveryNotificationsUpdated", syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener("deliveryNotificationsUpdated", syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  const mergedNotifications = [
    ...(broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
    })),
    ...(notifications || []).map((item) => ({
      ...item,
      source: "local",
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const unreadCount = notifications.filter((item) => !item.read).length + broadcastUnreadCount;

  const handleMarkAsRead = (id, source = "local") => {
    if (source === "broadcast") {
      markBroadcastAsRead(id);
      return;
    }
    markDeliveryNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, read: true } : item
      )
    );
    window.dispatchEvent(new CustomEvent("deliveryNotificationsUpdated"));
  };

  const handleDismissAll = () => {
    setNotifications([]);
    saveDeliveryNotifications([]);
    dismissAllBroadcastNotifications();
    window.dispatchEvent(new CustomEvent("deliveryNotificationsUpdated"));
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-poppins">
      <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-between pb-2 pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/food/delivery/profile")}
            className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-[8px] bg-orange-500 text-white text-[10px] font-black tracking-widest">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
        {mergedNotifications.length > 0 && (
          <button
            onClick={handleDismissAll}
            className="inline-flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors"
            aria-label="Clear all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 pt-24 px-5 pb-28 max-w-lg mx-auto w-full">
        {broadcastLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
             <div className="w-8 h-8 animate-spin rounded-full border-4 border-gray-200 border-t-orange-500" />
             <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Loading notifications...</p>
          </div>
        ) : mergedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
             <div className="w-16 h-16 rounded-[24px] bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-4 text-gray-300">
               <Bell className="w-6 h-6" />
             </div>
             <p className="text-gray-900 text-lg font-black mb-2 tracking-tight">No Notifications</p>
             <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-[250px] mx-auto">
               You are all caught up! New alerts will appear here.
             </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mergedNotifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMarkAsRead(item.id, item.source)}
                className={`rounded-[24px] p-5 flex items-start gap-4 cursor-pointer transition-all active:scale-[0.98] ${
                  item.read ? "bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]" : "bg-orange-50/50 border border-orange-100 shadow-[0_4px_20px_rgba(255,129,0,0.05)]"
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${item.read ? "bg-gray-200" : "bg-orange-500 shadow-[0_0_8px_rgba(255,129,0,0.5)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm tracking-tight leading-snug mb-1 ${item.read ? 'font-bold text-gray-800' : 'font-black text-gray-900'}`}>{item.title}</p>
                  <p className={`text-xs mb-2 leading-relaxed ${item.read ? 'font-medium text-gray-500' : 'font-bold text-gray-600'}`}>{item.message || "Delivery notification"}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {toTimeLabel(item.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
