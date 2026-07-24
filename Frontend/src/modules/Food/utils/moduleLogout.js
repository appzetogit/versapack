/**
 * Safe module logout: detach this device's FCM token from DB, then clear local auth.
 * Always clears local session even if network/API calls fail.
 */

import { authAPI, restaurantAPI, deliveryAPI, userAPI } from "@food/api";
import { clearModuleAuth, clearAuthData } from "@food/utils/auth";
import { resolveDeviceFcmToken } from "@food/utils/firebaseMessaging";

const LOGIN_PATHS = {
  restaurant: "/food/restaurant/login",
  user: "/food/user/auth/login",
  delivery: "/food/delivery/login",
};

const AUTH_CHANGED_EVENTS = {
  restaurant: "restaurantAuthChanged",
  user: "userAuthChanged",
  delivery: "deliveryAuthChanged",
  admin: "adminAuthChanged",
};

const USER_SESSION_PREFERENCE_KEYS = ["userVegMode", "food-under-250-filters"];

async function signOutFirebaseAuthBestEffort() {
  try {
    const { firebaseAuth, ensureFirebaseInitialized } = await import("@food/firebase");
    ensureFirebaseInitialized({ enableAuth: true, enableRealtimeDb: false });
    const { signOut } = await import("firebase/auth");
    if (firebaseAuth?.currentUser) {
      await signOut(firebaseAuth);
    }
  } catch {
    // Continue local logout even if Firebase sign-out fails.
  }
}

async function removeModuleFcmToken(module, fcmToken, platform) {
  if (!fcmToken) return;
  if (module === "restaurant") {
    await restaurantAPI.removeFcmToken(fcmToken, platform);
    return;
  }
  if (module === "delivery") {
    await deliveryAPI.removeFcmToken(fcmToken, platform);
    return;
  }
  if (module === "user") {
    await userAPI.removeFcmToken(fcmToken, { platform });
  }
}

async function logoutModuleApi(module, fcmToken, platform) {
  if (module === "restaurant") {
    return restaurantAPI.logout(undefined, fcmToken, platform);
  }
  if (module === "delivery") {
    return deliveryAPI.logout(undefined, fcmToken, platform);
  }
  if (module === "user") {
    return authAPI.logout(undefined, fcmToken, platform);
  }
}

function clearModuleLocalExtras(module) {
  try {
    sessionStorage.removeItem(`${module}AuthData`);
  } catch {
    // ignore
  }

  if (module === "restaurant") {
    try {
      localStorage.removeItem("restaurant_onboarding");
    } catch {
      // ignore
    }
    return;
  }

  if (module === "user") {
    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      localStorage.removeItem("cart");
      USER_SESSION_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }
    return;
  }

  if (module === "delivery") {
    try {
      localStorage.removeItem("app:isOnline");
    } catch {
      // ignore
    }
  }
}

function dispatchAuthCleared(module, clearAllModules) {
  if (typeof window === "undefined") return;
  const primary = AUTH_CHANGED_EVENTS[module];
  if (primary) window.dispatchEvent(new Event(primary));
  if (clearAllModules) {
    Object.values(AUTH_CHANGED_EVENTS).forEach((eventName) => {
      if (eventName !== primary) window.dispatchEvent(new Event(eventName));
    });
  }
}

/**
 * @param {"user"|"restaurant"|"delivery"} module
 * @param {object} [options]
 * @param {boolean} [options.clearAllModules=false]
 * @param {(path: string, opts?: object) => void} [options.navigate]
 * @param {string} [options.loginPath]
 * @param {boolean} [options.signOutFirebase=true]
 * @returns {Promise<{ success: true }>}
 */
export async function logoutModuleSession(module, options = {}) {
  const normalizedModule = String(module || "").trim().toLowerCase();
  if (!["user", "restaurant", "delivery"].includes(normalizedModule)) {
    throw new Error(`Unsupported logout module: ${module}`);
  }

  const {
    clearAllModules = false,
    navigate = null,
    loginPath = LOGIN_PATHS[normalizedModule],
    signOutFirebase = true,
  } = options;

  // Resolve FCM *before* clearing localStorage (cache is needed for detach).
  let fcmToken = null;
  let platform = "web";
  try {
    const resolved = await resolveDeviceFcmToken(normalizedModule);
    fcmToken = resolved?.token || null;
    platform = resolved?.platform || "web";
  } catch {
    // Proceed without FCM detach if token cannot be resolved.
  }

  // Prefer dedicated remove endpoint while access token is still valid.
  if (fcmToken) {
    try {
      await removeModuleFcmToken(normalizedModule, fcmToken, platform);
    } catch {
      // Fallback: logout body may still detach if refresh token exists.
    }
  }

  try {
    await logoutModuleApi(normalizedModule, fcmToken, platform);
  } catch {
    // Continue with local cleanup on network/API failure.
  }

  if (signOutFirebase) {
    await signOutFirebaseAuthBestEffort();
  }

  if (clearAllModules) {
    clearAuthData();
    try {
      sessionStorage.removeItem("restaurantAuthData");
      sessionStorage.removeItem("adminAuthData");
      sessionStorage.removeItem("deliveryAuthData");
      sessionStorage.removeItem("userAuthData");
    } catch {
      // ignore
    }
    clearModuleLocalExtras("user");
    clearModuleLocalExtras("delivery");
    clearModuleLocalExtras("restaurant");
  } else {
    clearModuleAuth(normalizedModule);
    clearModuleLocalExtras(normalizedModule);
  }

  dispatchAuthCleared(normalizedModule, clearAllModules);

  if (typeof navigate === "function") {
    navigate(loginPath, { replace: true });
  }

  return { success: true };
}

export function logoutUserSession(options = {}) {
  return logoutModuleSession("user", options);
}

export function logoutDeliverySession(options = {}) {
  return logoutModuleSession("delivery", {
    signOutFirebase: false,
    ...options,
  });
}

export function logoutRestaurantSession(options = {}) {
  return logoutModuleSession("restaurant", options);
}
