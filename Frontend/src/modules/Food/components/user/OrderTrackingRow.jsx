import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { motion } from "framer-motion";
import { getOrderKey, getOrderStatusText } from "@food/hooks/useActiveOrderTracking";

const CookingAnimation = memo(() => (
  <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-orange-50 border border-orange-100 overflow-visible shadow-[0_4px_12px_rgba(235,89,14,0.12)] shrink-0">
    <div className="absolute -top-2.5 flex gap-1">
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -6, -10], scale: [0.8, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0, ease: "easeOut" }} className="w-1 h-2.5 bg-orange-400/60 rounded-full blur-[1px]" />
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -8, -12], scale: [0.8, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5, ease: "easeOut" }} className="w-1 h-2.5 bg-orange-400/60 rounded-full blur-[1px]" />
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -6, -10], scale: [0.8, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 1, ease: "easeOut" }} className="w-1 h-2.5 bg-orange-400/60 rounded-full blur-[1px]" />
    </div>
    <motion.div animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} className="relative z-10 mt-0.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
        <path d="M6 10h12v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-6z" />
        <rect x="5" y="8" width="14" height="2" rx="1" />
        <path d="M12 8V5" />
        <path d="M11 5h2v2h-2z" fill="currentColor" />
        <path d="M19 9l3-1v2l-3 1" fill="currentColor" strokeWidth="1" />
        <path d="M5 10H3v2h2" />
      </svg>
    </motion.div>
    <motion.div animate={{ opacity: [0.4, 0.8, 0.4], scaleX: [0.8, 1.2, 0.8] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 w-full flex justify-center z-0">
      <div className="w-3.5 h-0.5 bg-orange-500 blur-[2px] rounded-full" />
    </motion.div>
  </div>
));

function OrderTrackingRowInner({ order, timeRemaining, onDismiss, compact = false }) {
  const navigate = useNavigate();

  if (!order) return null;

  const orderId = getOrderKey(order);
  const restaurantName = order.restaurant || order.restaurantName || "Restaurant";
  const statusText = getOrderStatusText(order);
  const themeColor = "var(--module-theme-color, #EB590E)";

  return (
    <motion.button
      type="button"
      layout
      onClick={() => navigate(`/food/user/orders/${orderId}`)}
      className={`relative w-full text-left bg-white/95 backdrop-blur-xl rounded-2xl border overflow-hidden cursor-pointer group active:scale-[0.99] transition-transform ${
        compact ? "p-3" : "p-4"
      }`}
      style={{
        boxShadow: "0 8px 24px rgba(var(--module-theme-rgb, 235,89,14), 0.14)",
        borderColor: "rgba(var(--module-theme-rgb, 235,89,14), 0.2)",
      }}
    >
      <div
        className="absolute inset-0 opacity-50 pointer-events-none rounded-2xl"
        style={{
          background: "linear-gradient(to right, rgba(var(--module-theme-rgb, 235,89,14), 0.1), rgba(255,255,255,0.5))",
        }}
      />

      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onDismiss?.();
          }
        }}
        className="absolute top-2 right-2 p-1 rounded-full transition-colors z-20"
        style={{
          backgroundColor: "rgba(var(--module-theme-rgb, 235,89,14), 0.15)",
          color: themeColor,
        }}
      >
        <X className="w-3 h-3 pointer-events-none" />
      </span>

      <div className="flex items-center gap-3 relative z-10 w-full pr-6">
        <CookingAnimation />

        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-sm truncate tracking-tight">{restaurantName}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-gray-500 font-medium text-xs truncate">{statusText}</p>
            <ChevronRight className="w-3 h-3 shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: themeColor }} />
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-1.5 shrink-0 flex flex-col items-center justify-center border"
          style={{
            background: "linear-gradient(135deg, var(--module-theme-color, #EB590E), rgba(var(--module-theme-rgb, 235,89,14), 0.84))",
            boxShadow: "0 6px 14px rgba(var(--module-theme-rgb, 235,89,14), 0.22)",
            borderColor: "rgba(var(--module-theme-rgb, 235,89,14), 0.3)",
          }}
        >
          <p className="text-orange-50 text-[9px] font-bold uppercase tracking-wider opacity-95 leading-tight">
            ETA
          </p>
          <p className="text-white text-sm font-black leading-tight">
            {timeRemaining !== null ? `${Math.max(1, timeRemaining)}m` : "--"}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

const OrderTrackingRow = memo(OrderTrackingRowInner);
export default OrderTrackingRow;
