import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useActiveOrderTracking from "@food/hooks/useActiveOrderTracking";
import OrderTrackingRow from "./OrderTrackingRow";

function OrderTrackingCardInner({ hasBottomNav = true }) {
  const { activeOrder, timeRemaining, dismissOrder } = useActiveOrderTracking();

  if (!activeOrder) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`fixed ${hasBottomNav ? "bottom-20" : "bottom-6"} left-4 right-4 z-[9999]`}
      >
        <OrderTrackingRow
          order={activeOrder}
          timeRemaining={timeRemaining}
          onDismiss={dismissOrder}
        />
      </motion.div>
    </AnimatePresence>
  );
}

const OrderTrackingCard = memo(OrderTrackingCardInner);
export default OrderTrackingCard;
