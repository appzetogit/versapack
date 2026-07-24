import { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { restaurantAPI } from "@food/api";

const debugError = (...args) => {};

const getNotifiedPartnersCount = (response) => {
  const data = response?.data?.data || {};
  const candidates = [
    data.notifiedCount,
    data.notifiedPartnersCount,
    data.deliveryPartnersNotifiedCount,
    data.count,
    response?.data?.notifiedCount,
    response?.data?.count,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  if (Array.isArray(data.notifiedPartners)) return data.notifiedPartners.length;
  if (Array.isArray(data.notifiedDeliveryPartners)) return data.notifiedDeliveryPartners.length;
  if (Array.isArray(data.partners)) return data.partners.length;

  return null;
};

export default function ResendNotificationButton({ orderId, mongoId, onSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleResend = async (e) => {
    // Check if e exists before accessing stopPropagation
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation(); // Prevent card click
    }
    
    if (loading) return;

    try {
      setLoading(true);
      const id = mongoId || orderId;
      const response = await restaurantAPI.resendDeliveryNotification(id);

      if (response.data?.success) {
        const notifiedCount = getNotifiedPartnersCount(response);
        toast.success(
          notifiedCount === null
            ? "Notification resent to delivery partners"
            : `Notification sent to ${notifiedCount} delivery partners`,
        );
        // Refresh orders if onSuccess callback is provided
        if (onSuccess) {
           onSuccess();
        }
      } else {
        toast.error(response.data?.message || "Failed to send notification");
      }
    } catch (error) {
      debugError("Error resending notification:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to send notification. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Resend notification to delivery partners">
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Sending...</span>
        </>
      ) : (
        <>
          <Volume2 className="w-3 h-3" />
          <span>Resend</span>
        </>
      )}
    </button>
  );
}
