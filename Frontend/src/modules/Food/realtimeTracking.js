import { onValue, ref, set, update } from 'firebase/database';
import { firebaseRealtimeDb, ensureFirebaseInitialized } from '@food/firebase';

function sanitizeRealtimeKey(value) {
  return String(value || '').trim().replace(/[.#$/[\]]/g, '_');
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDeliveryLocationPath(deliveryId) {
  return `delivery_boys/${sanitizeRealtimeKey(deliveryId)}`;
}

function getRestaurantLocationPath(restaurantId) {
  return `restaurant/${sanitizeRealtimeKey(restaurantId)}/location`;
}

function getOrderTrackingPath(orderId) {
  return `active_orders/${sanitizeRealtimeKey(orderId)}`;
}

function normalizeDeliveryLocationPayload(payload = {}) {
  const source = payload?.location && typeof payload.location === 'object' ? payload.location : payload;
  const lat = toFiniteNumber(source?.lat ?? source?.latitude);
  const lng = toFiniteNumber(source?.lng ?? source?.longitude);
  const timestamp = toFiniteNumber(source?.timestamp ?? source?.last_updated ?? source?.lastUpdate);
  const status = String(source?.status || '').trim().toLowerCase();

  return {
    ...source,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    heading: toFiniteNumber(source?.heading ?? source?.bearing) || 0,
    speed: toFiniteNumber(source?.speed) || 0,
    accuracy: toFiniteNumber(source?.accuracy),
    timestamp: timestamp || null,
    last_updated: toFiniteNumber(source?.last_updated) || timestamp || null,
    isOnline:
      source?.isOnline === true ||
      status === 'online' ||
      status === 'busy',
    status: status || (source?.isOnline === true ? 'online' : 'offline'),
  };
}

function normalizeDeliveryNode(node = {}) {
  return Object.entries(node || {}).reduce((acc, [deliveryId, payload]) => {
    const location = normalizeDeliveryLocationPayload(payload);
    acc[deliveryId] = {
      ...(payload && typeof payload === 'object' ? payload : {}),
      location,
    };
    return acc;
  }, {});
}

export function subscribeOrderTracking(orderId, onChange, onError) {
  if (!orderId || typeof onChange !== 'function') return () => {};
  // Enable Auth so RTDB security rules can work (existing session),
  // but do NOT enable GoogleAuthProvider to avoid identitytoolkit calls
  // on pages that don't need sign-in.
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const path = getOrderTrackingPath(orderId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeDeliveryLocation(deliveryId, onChange, onError) {
  if (!deliveryId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const path = getDeliveryLocationPath(deliveryId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeAllDeliveryLocations(onChange, onError) {
  if (typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const nodes = {
    delivery: {},
    delivery_boys: {},
  };
  const emit = () => {
    onChange(
      {
        ...normalizeDeliveryNode(nodes.delivery),
        ...normalizeDeliveryNode(nodes.delivery_boys),
      },
      'delivery_boys',
    );
  };
  const unsubscribers = ['delivery', 'delivery_boys'].map((path) =>
    onValue(
      ref(firebaseRealtimeDb, path),
      (snapshot) => {
        nodes[path] = snapshot.val() || {};
        emit();
      },
      (error) => {
        if (typeof onError === 'function') onError(error, path);
      },
    ),
  );
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function subscribeRestaurantLocation(restaurantId, onChange, onError) {
  if (!restaurantId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const path = getRestaurantLocationPath(restaurantId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export async function writeDeliveryLocation({
  deliveryId,
  lat,
  lng,
  heading = 0,
  speed = 0,
  isOnline = true,
  activeOrderId = null,
  accuracy = null,
  timestamp = Date.now(),
}) {
  if (!deliveryId) return false;
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const payload = {
    lat: toFiniteNumber(lat),
    lng: toFiniteNumber(lng),
    heading: toFiniteNumber(heading) || 0,
    speed: toFiniteNumber(speed) || 0,
    accuracy: toFiniteNumber(accuracy),
    timestamp: toFiniteNumber(timestamp) || Date.now(),
    last_updated: Date.now(),
    isOnline: Boolean(isOnline),
    activeOrderId: activeOrderId ? String(activeOrderId) : null,
  };
  await set(ref(firebaseRealtimeDb, getDeliveryLocationPath(deliveryId)), payload);
  return true;
}

/**
 * Write order tracking data to Firebase at orders/{orderId}/tracking.
 * Used by the delivery app to publish rider location; user tracking page reads from the same path.
 * Payload should include: lat, lng, heading (or bearing), and optionally speed, polyline, route_coordinates.
 */
export async function writeOrderTracking(orderId, payload = {}) {
  if (!orderId) return false;
  ensureFirebaseInitialized({ enableAuth: true, enableGoogleProvider: false, enableRealtimeDb: true });
  const toWrite = {
    ...payload,
    lat: toFiniteNumber(payload.lat),
    lng: toFiniteNumber(payload.lng),
    heading: toFiniteNumber(payload.heading ?? payload.bearing) || 0,
    last_updated: Date.now(),
  };
  if (payload.timestamp != null) {
    toWrite.timestamp = toFiniteNumber(payload.timestamp) || Date.now();
  }
  await update(ref(firebaseRealtimeDb, getOrderTrackingPath(orderId)), toWrite);
  return true;
}
