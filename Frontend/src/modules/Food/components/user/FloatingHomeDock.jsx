import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useCart } from "@food/context/CartContext";
import useActiveOrderTracking from "@food/hooks/useActiveOrderTracking";
import OrderTrackingRow from "./OrderTrackingRow";

const DOCK_BOTTOM_WITH_NAV = "calc(5.75rem + env(safe-area-inset-bottom, 0px))";
const DOCK_BOTTOM_NO_NAV = "calc(1.5rem + env(safe-area-inset-bottom, 0px))";

function FloatingHomeDockInner({
  hasBottomNav = true,
  showOrderTracking = true,
  linkTo = "/food/user/cart",
}) {
  const navigate = useNavigate();
  const { itemCount, total } = useCart();
  const { activeOrder, timeRemaining, dismissOrder } = useActiveOrderTracking();

  const showOrder = showOrderTracking && !!activeOrder;
  const showCart = itemCount > 0;

  if (!showOrder && !showCart) return null;

  const dockBottom = hasBottomNav ? DOCK_BOTTOM_WITH_NAV : DOCK_BOTTOM_NO_NAV;

  return (
    <LayoutGroup>
      <motion.div
        layout
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 280 }}
        className="fixed left-4 right-4 z-[55] md:left-auto md:right-6 md:max-w-md pointer-events-none"
        style={{ bottom: dockBottom }}
      >
        <div className="flex flex-col gap-2 pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {showOrder && (
              <motion.div
                key="order-row"
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
              >
                <OrderTrackingRow
                  order={activeOrder}
                  timeRemaining={timeRemaining}
                  onDismiss={dismissOrder}
                  compact
                />
              </motion.div>
            )}

            {showCart && (
              <motion.div
                key="cart-bar"
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
              >
                <button
                  type="button"
                  onClick={() => navigate(linkTo)}
                  className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-white shadow-[0_8px_18px_rgba(0,0,0,0.16)] border border-white/20 cursor-pointer hover:shadow-[0_10px_22px_rgba(0,0,0,0.2)] active:scale-[0.99] transition-all duration-200"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(var(--module-theme-rgb,250,2,114),0.94), rgba(var(--module-theme-rgb,250,2,114),0.78))",
                  }}
                >
                  <span className="text-sm font-semibold truncate">
                    {itemCount} {itemCount === 1 ? "Item" : "Items"} | ₹{Math.round(total || 0)}
                  </span>
                  <span className="flex items-center gap-2 text-sm font-semibold shrink-0">
                    View Cart
                    <ShoppingCart className="h-4 w-4" />
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}

const FloatingHomeDock = memo(FloatingHomeDockInner);
export default FloatingHomeDock;
