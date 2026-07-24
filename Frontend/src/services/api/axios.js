/**
 * Central API client for backend (auth and future APIs).
 * - baseURL from VITE_API_BASE_URL (e.g. http://localhost:5000/api/v1)
 * - When baseURL ends with /api/v1, request paths must NOT include /v1 (use /food/..., /auth/...)
 * - Attaches Bearer token (user or admin based on request URL)
 * - On 401: attempts refresh, retries once; on refresh failure logs out
 */

import axios from "axios";

// Prefer explicit env. If not set, use same-origin (works with a Vite proxy).
// This avoids hardcoding ports like 5000 that may conflict with local setups.
const baseURL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "";

const apiClient = axios.create({
  baseURL: baseURL || undefined,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

const ADMIN_PERMISSION_PATH_MAP = [
  { prefix: "/food/admin/sub-admins", section: "sub_admin_management" },
  { prefix: "/food/admin/customers", section: "customer_management" },
  { prefix: "/food/admin/support-tickets", section: "customer_management" },
  { prefix: "/food/admin/restaurants", section: "restaurant_management" },
  { prefix: "/food/admin/restaurant-settings", section: "restaurant_management" },
  { prefix: "/food/admin/restaurant-subscription-settings", section: "restaurant_management" },
  { prefix: "/food/admin/restaurant-subscriptions", section: "restaurant_management" },
  { prefix: "/food/admin/zones", section: "restaurant_management" },
  { prefix: "/food/admin/categories", section: "food_management" },
  { prefix: "/food/admin/addons", section: "food_management" },
  { prefix: "/food/admin/foods", section: "food_management" },
  { prefix: "/food/admin/offers", section: "promotions_management" },
  { prefix: "/food/admin/orders", section: "order_management" },
  { prefix: "/food/admin/order-detect-delivery", section: "order_management" },
  { prefix: "/food/admin/sidebar-badges", section: "dashboard" },
  { prefix: "/food/admin/dashboard-stats", section: "dashboard" },
  { prefix: "/food/admin/referral-settings", section: "referral_rewards" },
  { prefix: "/food/admin/delivery", section: "delivery_management" },
  { prefix: "/food/admin/fee-settings", section: "delivery_management" },
  { prefix: "/food/admin/delivery-cash-limit", section: "delivery_management" },
  { prefix: "/food/admin/cash-limit-settlements", section: "delivery_management" },
  { prefix: "/food/admin/cash-limit-settlement", section: "delivery_management" },
  { prefix: "/food/admin/withdrawals", section: "transaction_management" },
  { prefix: "/food/admin/reports", section: "report_management" },
  { prefix: "/food/admin/feedback-experiences", section: "report_management" },
  { prefix: "/food/hero-banners", section: "banner_management" },
  { prefix: "/food/admin/contact-messages", section: "support_management" },
  { prefix: "/food/admin/safety-emergency-reports", section: "support_management" },
  { prefix: "/food/admin/feature-settings", section: "system_settings" },
  { prefix: "/food/admin/business-settings", section: "system_settings" },
  { prefix: "/food/admin/power-scanning", section: "system_settings" },
  { prefix: "/food/admin/notifications", section: "system_settings" },
  { prefix: "/food/admin/pages-social-media", section: "pages_social_media" },
];

const normalizePath = (url) => {
  const raw = String(url || "");
  const noQuery = raw.split("?")[0].split("#")[0];
  if (noQuery.startsWith("http://") || noQuery.startsWith("https://")) {
    try {
      const parsed = new URL(noQuery);
      return parsed.pathname || "/";
    } catch {
      return noQuery;
    }
  }
  return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
};

const resolveAdminSectionByApiPath = (url, method = "GET") => {
  const path = normalizePath(url).toLowerCase();
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (path === "/food/admin/zones" && normalizedMethod === "GET") {
    return "restaurant_management";
  }
  const match = ADMIN_PERMISSION_PATH_MAP.find((item) => path.startsWith(item.prefix));
  return match?.section || null;
};

const resolveActionByMethod = (method) => {
  const normalized = String(method || "get").toUpperCase();
  if (normalized === "GET") return "view";
  if (normalized === "POST") return "create";
  if (normalized === "DELETE") return "delete";
  if (normalized === "PATCH" || normalized === "PUT") return "edit";
  return "view";
};

const getAdminUser = () => {
  try {
    const raw = localStorage.getItem("admin_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const isAdminAllowedForAction = (section, action) => {
  const adminUser = getAdminUser();
  const adminType = String(adminUser?.adminType || "").trim().toLowerCase();
  if (adminType === "super_admin") return true;
  if (!section) return false;
  const permissions = adminUser?.effectivePermissions || adminUser?.permissions || {};
  const actions = Array.isArray(permissions?.[section]) ? permissions[section] : [];
  return actions.includes(action);
};

const hasAdminAction = (adminUser, section, action = "view") => {
  const permissions = adminUser?.effectivePermissions || adminUser?.permissions || {};
  const actions = Array.isArray(permissions?.[section]) ? permissions[section] : [];
  return actions.includes(action);
};

function getModuleFromUrl(url = "") {
  const u = typeof url === "string" ? url : (url?.url || "");
  if (!u) return "user";
  
  const normalized = u.toLowerCase();
  
  // Admin detection
  if (
    normalized.includes("/admin/") || 
    normalized.includes("/food/admin/") || 
    normalized.includes("/food/auth/admin") || 
    normalized.includes("/auth/admin") || 
    normalized.includes("admin/login")
  ) return "admin";
  
  // Delivery detection - Catch all delivery-specific functional and auth routes
  if (
    normalized.includes("/food/delivery") || 
    normalized.includes("/auth/delivery") || 
    normalized.includes("/delivery/")
  ) return "delivery";
  
  // Restaurant detection - Catch all restaurant-specific functional and auth routes
  if (
    normalized.includes("/food/restaurant/") || 
    normalized.includes("/auth/restaurant") || 
    normalized.includes("/restaurant/")
  ) {
    // Exception: /food/restaurants (plural) is usually a public user app route
    if (normalized.includes("/food/restaurants") && !normalized.includes("/food/restaurant/")) {
       return "user";
    }
    return "restaurant";
  }
  
  return "user";
}

function getModuleFromConfig(config) {
  if (config?.contextModule) return config.contextModule;
  return getModuleFromUrl(config?.url);
}

function getAccessToken(config) {
  const module = getModuleFromConfig(config);
  const key = `${module}_accessToken`;
  try {
    // 1. Try module-specific token first
    const moduleToken = localStorage.getItem(key);
    if (moduleToken) return moduleToken;
    
    // 2. Fallback to generic token only for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("accessToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function getRefreshToken(module) {
  try {
    // 1. Try module-specific refresh token
    const moduleRefreshToken = localStorage.getItem(`${module}_refreshToken`);
    if (moduleRefreshToken) return moduleRefreshToken;
    
    // 2. Fallback to generic refresh token only for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("refreshToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function clearModuleAuth(module) {
  try {
    localStorage.removeItem(`${module}_accessToken`);
    localStorage.removeItem(`${module}_refreshToken`);
    localStorage.removeItem(`${module}_authenticated`);
    localStorage.removeItem(`${module}_user`);
  } catch (_) {}
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeToRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken, module) {
  refreshSubscribers.forEach((cb) => cb(newToken, module));
  refreshSubscribers = [];
}

function onRefreshFailed(module) {
  clearModuleAuth(module);
  // Fail any queued requests that were waiting for this refresh
  refreshSubscribers.forEach((cb) => cb(null, module));
  refreshSubscribers = [];
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("authRefreshFailed", { detail: { module } }));
  }
}

apiClient.interceptors.request.use(
  (config) => {
    config.contextModule = getModuleFromConfig(config);

    // Client-side RBAC safety net for sub-admins across all admin APIs.
    if (config.contextModule === "admin") {
      const path = normalizePath(config?.url);
      const normalizedPath = String(path || "").toLowerCase();
      const isPublicAdminEndpoint =
        normalizedPath.startsWith("/food/admin/") &&
        normalizedPath.endsWith("/public");
      const isAuthEndpoint =
        path.includes("/food/auth/admin/login") ||
        path.includes("/food/auth/me") ||
        path.includes("/food/auth/refresh-token") ||
        path.includes("/food/auth/logout");

      if (!isAuthEndpoint && !isPublicAdminEndpoint) {
        const action = resolveActionByMethod(config?.method);
        const isRestaurantListRead = normalizedPath === "/food/admin/restaurants" && action === "view";
        const isRestaurantDetailRead =
          /^\/food\/admin\/restaurants\/[^/]+$/.test(normalizedPath) && action === "view";
        const isRestaurantAnalyticsRead =
          /^\/food\/admin\/restaurants\/[^/]+\/analytics$/.test(normalizedPath) && action === "view";
        const isOrdersRead = normalizedPath === "/food/admin/orders" && action === "view";
        const isCustomersRead = normalizedPath === "/food/admin/customers" && action === "view";
        const isZonesRead = normalizedPath === "/food/admin/zones" && action === "view";
        const isZoneDetailRead =
          /^\/food\/admin\/zones\/[^/]+$/.test(normalizedPath) && action === "view";

        // POS dropdown needs restaurant list read access.
        if (isRestaurantListRead || isRestaurantDetailRead || isRestaurantAnalyticsRead) {
          const adminUser = getAdminUser();
          const adminType = String(adminUser?.adminType || "").trim().toLowerCase();
          const isAllowed =
            adminType === "super_admin" ||
            hasAdminAction(adminUser, "restaurant_management", "view") ||
            hasAdminAction(adminUser, "point_of_sale", "view") ||
            hasAdminAction(adminUser, "report_management", "view") ||
            hasAdminAction(adminUser, "banner_management", "view");
          if (!isAllowed) {
            const error = new Error("Insufficient permissions for this action");
            error.response = {
              status: 403,
              data: { message: "Insufficient permissions for this action" },
            };
            return Promise.reject(error);
          }
        } else if (isZonesRead || isZoneDetailRead) {
          const adminUser = getAdminUser();
          const adminType = String(adminUser?.adminType || "").trim().toLowerCase();
          const isAllowed =
            adminType === "super_admin" ||
            hasAdminAction(adminUser, "dashboard", "view") ||
            hasAdminAction(adminUser, "restaurant_management", "view") ||
            hasAdminAction(adminUser, "point_of_sale", "view") ||
            hasAdminAction(adminUser, "food_management", "view") ||
            hasAdminAction(adminUser, "delivery_management", "view") ||
            hasAdminAction(adminUser, "report_management", "view");
          if (!isAllowed) {
            const error = new Error("Insufficient permissions for this action");
            error.response = {
              status: 403,
              data: { message: "Insufficient permissions for this action" },
            };
            return Promise.reject(error);
          }
        } else if (isOrdersRead) {
          const adminUser = getAdminUser();
          const adminType = String(adminUser?.adminType || "").trim().toLowerCase();
          const isAllowed =
            adminType === "super_admin" ||
            hasAdminAction(adminUser, "order_management", "view") ||
            hasAdminAction(adminUser, "report_management", "view");
          if (!isAllowed) {
            const error = new Error("Insufficient permissions for this action");
            error.response = {
              status: 403,
              data: { message: "Insufficient permissions for this action" },
            };
            return Promise.reject(error);
          }
        } else if (isCustomersRead) {
          const adminUser = getAdminUser();
          const adminType = String(adminUser?.adminType || "").trim().toLowerCase();
          const isAllowed =
            adminType === "super_admin" ||
            hasAdminAction(adminUser, "customer_management", "view") ||
            hasAdminAction(adminUser, "report_management", "view");
          if (!isAllowed) {
            const error = new Error("Insufficient permissions for this action");
            error.response = {
              status: 403,
              data: { message: "Insufficient permissions for this action" },
            };
            return Promise.reject(error);
          }
        } else {
          const section = resolveAdminSectionByApiPath(path, config?.method);
          if (!isAdminAllowedForAction(section, action)) {
            const error = new Error("Insufficient permissions for this action");
            error.response = {
              status: 403,
              data: { message: "Insufficient permissions for this action" },
            };
            return Promise.reject(error);
          }
        }
      }
    }

    // If sending FormData, let the browser set proper multipart boundary.
    if (config.data instanceof FormData) {
      if (config.headers && config.headers["Content-Type"]) {
        delete config.headers["Content-Type"];
      }
    }

    const token = getAccessToken(config);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (err) => {
    const original = err?.config;
    if (err?.response?.status === 429) {
      const retryAfter = err?.response?.data?.retryAfterSeconds;
      const message =
        err?.response?.data?.message ||
        "Too many requests. Please wait and try again.";
      err.rateLimitMessage = retryAfter
        ? `${message} (retry in ~${retryAfter}s)`
        : message;
      return Promise.reject(err);
    }
    if (err?.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(err);
    }
    const module = original.contextModule || getModuleFromUrl(original.url);
    const refreshToken = getRefreshToken(module);
    if (!refreshToken) {
      clearModuleAuth(module);
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(original));
          } else {
            reject(err);
          }
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Use relative URL so this works both with an explicit baseURL and with a dev proxy.
      // Use plain axios to avoid interceptor recursion.
      const refreshUrl = baseURL ? `${baseURL}/food/auth/refresh-token` : "/api/v1/food/auth/refresh-token";
      const { data } = await axios.post(refreshUrl, { refreshToken }, { timeout: 10000 });
      const newAccessToken = data?.data?.accessToken || data?.accessToken;
      if (newAccessToken) {
        try {
          localStorage.setItem(`${module}_accessToken`, newAccessToken);
          // Dispatch a custom event specifically for the module that refreshed
          window.dispatchEvent(new CustomEvent("authRefreshed", { 
            detail: { module, token: newAccessToken } 
          }));
        } catch (_) {}
        onRefreshed(newAccessToken, module);
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }
    } catch (_) {
      onRefreshFailed(module);
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }

    onRefreshFailed(module);
    return Promise.reject(err);
  }
);

export default apiClient;
