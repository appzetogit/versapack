import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useOrders } from "@food/context/OrdersContext";
import { orderAPI } from "@food/api";

export const getOrderKey = (order) => order?.id || order?._id || order?.orderId || null;

export const getOrderStatus = (order) =>
  String(order?.orderStatus || order?.status || order?.deliveryState?.status || "").toLowerCase();

export const getOrderPhase = (order) =>
  String(order?.deliveryState?.currentPhase || "").toLowerCase();

const ACTIVE_PHASES = new Set([
  "created",
  "confirmed",
  "preparing",
  "accepted",
  "ready",
  "ready_for_pickup",
  "reached_pickup",
  "picked_up",
  "out_for_delivery",
  "en_route_to_delivery",
  "at_pickup",
  "at_drop",
]);

const TERMINAL_STATUSES = new Set([
  "delivered",
  "cancelled",
  "completed",
  "failed",
  "cancelled_by_user",
  "cancelled_by_restaurant",
  "cancelled_by_admin",
]);

export const isActiveOrder = (order) => {
  if (!order) return false;
  const status = getOrderStatus(order);
  const phase = getOrderPhase(order);
  if (TERMINAL_STATUSES.has(status)) return false;
  if (phase === "completed" || phase === "delivered") return false;
  if (!status && phase) return ACTIVE_PHASES.has(phase);
  if (!status) return false;
  return true;
};

export const getTimeRemaining = (order) => {
  if (!order) return null;

  const orderTime = new Date(
    order.createdAt || order.orderDate || order.created_at || order.date || Date.now(),
  );
  const estimatedMinutes =
    order.estimatedDeliveryTime ||
    order.estimatedTime ||
    order.estimated_delivery_time ||
    35;
  const deliveryTime = new Date(orderTime.getTime() + estimatedMinutes * 60000);
  return Math.max(0, Math.floor((deliveryTime - new Date()) / 60000));
};

function ordersFingerprint(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return "";
  return orders
    .map((o) => `${getOrderKey(o)}:${getOrderStatus(o)}`)
    .join("|");
}

export function getOrderStatusText(order) {
  const orderStatus = getOrderStatus(order) || "preparing";
  const orderPhase = getOrderPhase(order);
  const s = String(orderStatus);
  const p = String(orderPhase);

  if (s === "confirmed") return "Order confirmed";
  if (s === "preparing" || s === "created" || s === "pending") return "Preparing your order";
  if (s === "ready_for_pickup") return "Ready for pickup";
  if (s === "reached_pickup" || p === "at_pickup") return "Delivery partner reached restaurant";
  if (s === "picked_up" || p === "en_route_to_delivery") return "On the way";
  if (s === "reached_drop" || p === "at_drop") return "Arrived near you";
  if (s === "delivered" || p === "delivered" || p === "completed") return "Delivered";
  return "Preparing your order";
}

export default function useActiveOrderTracking() {
  const location = useLocation();
  const { orders: contextOrders } = useOrders();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [apiOrders, setApiOrders] = useState([]);
  const [hasFetchedApi, setHasFetchedApi] = useState(false);
  const [activeOrderOverride, setActiveOrderOverride] = useState(null);
  const [dismissedKey, setDismissedKey] = useState(null);
  const [invalidOrderIds, setInvalidOrderIds] = useState(new Set());
  const lastRefreshRef = useRef(0);
  const lastApiFingerprintRef = useRef("");
  const activeOrderKeyRef = useRef("");
  const activeOrderSnapshotRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await orderAPI.getOrders({ limit: 10, page: 1 });
      let nextOrders = [];

      if (response?.data?.success && response?.data?.data?.orders) {
        nextOrders = response.data.data.orders;
      } else if (response?.data?.orders) {
        nextOrders = response.data.orders;
      } else if (response?.data?.data?.data && Array.isArray(response.data.data.data)) {
        nextOrders = response.data.data.data;
      } else if (response?.data?.data?.docs && Array.isArray(response.data.data.docs)) {
        nextOrders = response.data.data.docs;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        nextOrders = response.data.data;
      }

      const list = Array.isArray(nextOrders) ? nextOrders : [];
      const fp = ordersFingerprint(list);
      if (fp !== lastApiFingerprintRef.current) {
        lastApiFingerprintRef.current = fp;
        setApiOrders(list);
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("user_accessToken");
        localStorage.removeItem("accessToken");
      }
      if (lastApiFingerprintRef.current !== "") {
        lastApiFingerprintRef.current = "";
        setApiOrders([]);
      }
    } finally {
      setHasFetchedApi(true);
    }
  }, []);

  useEffect(() => {
    const onOrdersListingPage =
      typeof location?.pathname === "string" &&
      location.pathname.startsWith("/food/user/orders") &&
      !/^\/food\/user\/orders\/[^/]+/.test(location.pathname);

    fetchOrders();
    if (onOrdersListingPage) return undefined;

    const pollOrders = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchOrders();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchOrders();
      }
    };

    const interval = setInterval(pollOrders, 30000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchOrders, location.pathname]);

  const uniqueOrders = useMemo(() => {
    const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));
    const serverKeys = new Set(
      (apiOrders || []).map((o) => String(getOrderKey(o) || "")).filter(Boolean),
    );
    const seen = new Set();

    return [...apiOrders, ...contextOrders].filter((order) => {
      const key = getOrderKey(order);
      if (!key || seen.has(key)) {
        return false;
      }
      if (invalidOrderIds.has(key)) {
        return false;
      }
      if (
        hasFetchedApi &&
        isMongoObjectId(key) &&
        !serverKeys.has(String(key))
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [contextOrders, apiOrders, invalidOrderIds, hasFetchedApi]);

  const activeOrder = useMemo(() => {
    const candidate = uniqueOrders.find((order) => isActiveOrder(order)) || null;
    if (!candidate) return null;
    const overrideKey = getOrderKey(activeOrderOverride);
    const candidateKey = getOrderKey(candidate);
    if (overrideKey && candidateKey && overrideKey === candidateKey) return activeOrderOverride;
    return candidate;
  }, [uniqueOrders, activeOrderOverride]);

  useEffect(() => {
    const key = String(getOrderKey(activeOrder) || "");
    activeOrderKeyRef.current = key;
    activeOrderSnapshotRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    const handleOrderStatusNotification = async (event) => {
      const detail = event?.detail || {};
      const incomingKey = String(detail?.orderMongoId || detail?.orderId || "").trim();
      const currentKey = activeOrderKeyRef.current;
      if (!incomingKey || !currentKey) return;
      if (incomingKey !== currentKey) return;

      const snap = activeOrderSnapshotRef.current;

      setActiveOrderOverride((prev) => ({
        ...(prev || snap || {}),
        orderStatus: detail?.orderStatus || prev?.orderStatus || snap?.orderStatus,
        deliveryState: detail?.deliveryState
          ? { ...(prev?.deliveryState || snap?.deliveryState || {}), ...detail.deliveryState }
          : prev?.deliveryState || snap?.deliveryState,
        status: detail?.status || prev?.status || snap?.status,
      }));

      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;

      try {
        const response = await orderAPI.getOrderDetails(incomingKey);
        const fresh = response?.data?.data?.order || response?.data?.order || response?.data?.data || null;
        if (fresh) setActiveOrderOverride(fresh);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(incomingKey);
            return next;
          });
        }
      }
    };

    const handleOrderPlaced = () => {
      fetchOrders();
    };

    window.addEventListener("orderStatusNotification", handleOrderStatusNotification);
    window.addEventListener("order-placed", handleOrderPlaced);

    return () => {
      window.removeEventListener("orderStatusNotification", handleOrderStatusNotification);
      window.removeEventListener("order-placed", handleOrderPlaced);
    };
  }, [fetchOrders]);

  useEffect(() => {
    if (!activeOrder) {
      setTimeRemaining((prev) => (prev !== null ? null : prev));
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const next = getTimeRemaining(activeOrder);
      setTimeRemaining((prev) => (prev === next ? prev : next));
    };

    tick();
    const interval = setInterval(tick, 60000);
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        const next = getTimeRemaining(activeOrder);
        setTimeRemaining((prev) => (prev === next ? prev : next));
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeOrder]);

  useEffect(() => {
    const key = getOrderKey(activeOrder);
    if (!key || invalidOrderIds.has(key)) return;

    const isRecentlyConfirmed = apiOrders.some((o) => getOrderKey(o) === key);
    if (isRecentlyConfirmed) return;

    const verifyOrderExists = async () => {
      try {
        await orderAPI.getOrderDetails(key);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }
      }
    };

    verifyOrderExists();
  }, [activeOrder, apiOrders, invalidOrderIds]);

  const visibleOrder = useMemo(() => {
    if (!activeOrder) return null;
    const currentOrderKey = getOrderKey(activeOrder);
    if (!currentOrderKey || dismissedKey === currentOrderKey) return null;

    const orderStatus = getOrderStatus(activeOrder);
    if (orderStatus === "delivered" || orderStatus === "completed") return null;

    return activeOrder;
  }, [activeOrder, dismissedKey]);

  const dismissOrder = useCallback(() => {
    const key = getOrderKey(activeOrder);
    if (key) setDismissedKey(key);
  }, [activeOrder]);

  return {
    activeOrder: visibleOrder,
    timeRemaining,
    dismissOrder,
  };
}
