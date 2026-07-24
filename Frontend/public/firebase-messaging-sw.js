/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const normalizeNotificationText = (value = "") => {
  const raw = String(value || "");
  if (!raw) return "";
  const repairMojibake = (input) => {
    const text = String(input || "");
    if (!text) return "";
    if (!/[ðÃÂâ]/.test(text)) return text;
    try {
      const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (decoded && !/�/.test(decoded)) return decoded;
      return decoded || text;
    } catch {
      return text;
    }
  };

  const repaired = repairMojibake(raw);

  const withoutModulePrefix = repaired
    .replace(/^\s*(?:[\uD800-\uDBFF][\uDC00-\uDFFF]\s*)*\[(user|shop|restaurant|delivery|admin)\]\s*/i, "")
    .trim();

  const cleaned = withoutModulePrefix
    .replace(/�[A-Za-z0-9{}[\]\\/_.:-]*/g, " ")
    .replace(/[ÂÃâð][^\s]{0,3}/g, " ")
    .replace(/[^\x20-\x7E\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(notification|new notification|on notification)$/i.test(cleaned)) {
    return "";
  }

  return cleaned;
};
const toReadableStatus = (value = "") =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const inferNotificationBodyFromEvent = (payload = {}) => {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const eventType = String(
    data.eventType ||
      data.event ||
      data.type ||
      data.action ||
      data.category ||
      "",
  ).toLowerCase();
  const orderId = String(data.orderId || data.order_id || data.orderMongoId || "").trim();
  const status = toReadableStatus(data.orderStatus || data.status || data.deliveryStatus || "");
  const amount = String(data.amount || data.total || data.walletAmount || "").trim();

  if (eventType.includes("order")) {
    if (status && orderId) return `Order #${orderId} is now ${status}.`;
    if (status) return `Your order is now ${status}.`;
    if (orderId) return `Order #${orderId} has a new update.`;
    return "Your order has a new update.";
  }
  if (eventType.includes("delivery")) {
    if (status) return `Delivery status updated to ${status}.`;
    return "Delivery update available.";
  }
  if (
    eventType.includes("wallet") ||
    eventType.includes("payment") ||
    eventType.includes("refund")
  ) {
    if (amount) return `Wallet/payment update for ₹${amount}.`;
    return "Wallet/payment update available.";
  }
  if (eventType.includes("approve") || eventType.includes("reject")) {
    if (status) return `Approval status updated: ${status}.`;
    return "Approval status has been updated.";
  }

  if (status && orderId) return `Order #${orderId} is now ${status}.`;
  if (status) return `Status updated to ${status}.`;
  if (orderId) return `Order #${orderId} has a new update.`;
  return "";
};
const PUSH_DEBUG_PREFIX = "[push-sw]";
const pushDebugLog = () => {};
const getNotificationKey = (payload) =>
  payload?.data?.notificationId ||
  payload?.data?.messageId ||
  payload?.messageId ||
  [
    normalizeNotificationText(payload?.data?.title || payload?.notification?.title || ""),
    normalizeNotificationText(payload?.data?.body || payload?.notification?.body || ""),
    payload?.data?.orderId || "",
    payload?.data?.targetUrl || payload?.data?.link || "",
  ].join("::");

function buildSanitizedNotificationPayload(payload = {}) {
  const titleCandidate = normalizeNotificationText(payload?.data?.title || payload?.notification?.title || "");
  const bodyCandidate = normalizeNotificationText(payload?.data?.body || payload?.notification?.body || "");
  const inferredBody = normalizeNotificationText(inferNotificationBodyFromEvent(payload));
  const title = titleCandidate || bodyCandidate || "New update";
  const body = titleCandidate ? (bodyCandidate || inferredBody) : "";
  return { title, body };
}

function hasSdkNotificationPayload(payload = {}) {
  return Boolean(
    payload?.notification?.title ||
      payload?.notification?.body ||
      payload?.notification?.image,
  );
}

function shouldUseManualSanitizedNotification(payload = {}, normalizedTitle = "", normalizedBody = "") {
  const rawTitle = String(payload?.data?.title || payload?.notification?.title || "");
  const rawBody = String(payload?.data?.body || payload?.notification?.body || "");

  // Force manual rendering when raw values differ from normalized output.
  // This catches mojibake/prefix garbage like "ðŸŽ‰" or "[Shop]".
  if (rawTitle.trim() !== String(normalizedTitle || "").trim()) return true;
  if (rawBody.trim() !== String(normalizedBody || "").trim()) return true;

  return false;
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

// Check if there's a visible, focused client for the target module
async function hasFocusedClientForTarget(payload = {}) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const targetPath = getTargetPathFromPayload(payload);
  const targetRoot = `/${String(targetPath).split("/").filter(Boolean)[0] || ""}`;

  // Find a visible and focused client that matches the target module
  const focusedClient = windowClients.find((client) => {
    try {
      const clientUrl = new URL(client.url);
      // Client must be visible AND focused
      const isVisibleAndFocused = client.visibilityState === "visible" && client.focused;
      if (!isVisibleAndFocused) return false;
      // Check if client URL matches target module
      if (targetRoot === "/" || !targetRoot) return true;
      return clientUrl.pathname.startsWith(targetRoot);
    } catch {
      return false;
    }
  });

  pushDebugLog(PUSH_DEBUG_PREFIX, "Focused client check", {
    count: windowClients.length,
    targetPath,
    targetRoot,
    hasFocusedClient: Boolean(focusedClient),
    clients: windowClients.map((client) => ({
      url: client.url,
      visibilityState: client.visibilityState,
      focused: client.focused,
    })),
  });

  return Boolean(focusedClient);
}

// Only notify clients if we have a FOCUSED window (app is in foreground)
async function notifyFocusedClients(payload) {
  const focusedClient = await hasFocusedClientForTarget(payload);
  // Only relay to page if there's a focused client (user is actively using the app)
  if (focusedClient) {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Relaying notification to focused client", { payload });
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    windowClients.forEach((client) => {
      // Only send to visible, focused clients
      if (client.visibilityState === "visible" && client.focused) {
        client.postMessage({
          type: "push-notification-received",
          payload,
        });
      }
    });
  }
}

let messaging = null;
let firebaseSwInitialized = false;

function isValidFirebaseConfig(config = {}) {
  return Boolean(config?.apiKey && config?.projectId && config?.appId && config?.messagingSenderId);
}

function initializeFirebaseInServiceWorker(config = {}) {
  if (firebaseSwInitialized || !isValidFirebaseConfig(config)) return;
  firebase.initializeApp(config);
  messaging = firebase.messaging();
  firebaseSwInitialized = true;
  pushDebugLog(PUSH_DEBUG_PREFIX, "Firebase messaging service worker initialized");

  messaging.onBackgroundMessage(async (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase background message", { payload });

    const focusedClient = await hasFocusedClientForTarget(payload);

    // Extract notification content from data.data first, then notification object
    // This fixes content not showing issue when backend sends in different formats
    const { title, body } = buildSanitizedNotificationPayload(payload);
    const image =
      payload?.data?.image ||
      payload?.data?.imageUrl ||
      payload?.notification?.image ||
      undefined;
    const notificationKey = getNotificationKey(payload);

    // If app is in foreground (focused window exists): relay to page for in-app display
    // If app is closed/background (no focused window): show system notification
    if (focusedClient) {
      pushDebugLog(PUSH_DEBUG_PREFIX, "App is in foreground - relaying to page", { title, body });
      // Only relay, don't show system notification - page will handle display
      await notifyFocusedClients(payload);
    } else {
      // FCM auto-displays notifications when payload contains the "notification" block.
      // Avoid manual showNotification in that case to prevent duplicate system pushes.
      const forceManualSanitized = shouldUseManualSanitizedNotification(payload, title, body);
      if (hasSdkNotificationPayload(payload) && !forceManualSanitized) {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Skipping manual showNotification to avoid duplicate SDK notification", {
          title,
          body,
          notificationKey,
        });
        return;
      }

      // App is in background or closed - show system notification
      pushDebugLog(PUSH_DEBUG_PREFIX, "App is in background/closed - showing system notification", {
        title,
        body,
        image,
        notificationKey,
      });

      if (!title && !body) return;
      self.registration.showNotification(title, {
        body,
        icon: "/favicon.ico",
        image,
        tag: notificationKey,
        renotify: true,
        silent: false,
        requireInteraction: false,
        vibrate: [200, 100, 200, 100, 300],
        data: payload?.data || {},
      });
    }
  });
}

self.addEventListener("message", (event) => {
  const data = event?.data || {};
  if (data?.type !== "INIT_FIREBASE_CONFIG") return;
  initializeFirebaseInServiceWorker(data?.config || {});
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received raw push event", { payload });
    const { title, body } = buildSanitizedNotificationPayload(payload);
    const isDirtyRawPayload = shouldUseManualSanitizedNotification(payload, title, body);

    // Some notification-only messages may be auto-rendered by SDK with raw text.
    // For dirty raw payloads, short-circuit and render sanitized notification ourselves.
    if (isDirtyRawPayload && (title || body)) {
      event.stopImmediatePropagation();
      event.waitUntil(
        self.registration.showNotification(title || "New update", {
          body: body || "",
          icon: "/favicon.ico",
          tag: getNotificationKey(payload),
          renotify: true,
          silent: false,
          requireInteraction: false,
          vibrate: [200, 100, 200, 100, 300],
          data: payload?.data || {},
        }),
      );
      return;
    }

    // No client relay here. onBackgroundMessage handles delivery, and relaying in both
    // places can produce duplicate notifications in web clients.
    event.waitUntil(Promise.resolve());
  } catch {
    // Ignore malformed payloads.
  }
});

self.addEventListener("notificationclick", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Notification click received", {
    data: event?.notification?.data || {},
  });
  event.notification.close();
  const rawLink =
    event?.notification?.data?.link ||
    event?.notification?.data?.click_action ||
    event?.notification?.data?.targetUrl ||
    "/";
  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        return client.navigate(targetUrl);
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
