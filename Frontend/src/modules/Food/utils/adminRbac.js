import { getCurrentUser } from "@food/utils/auth";

export const ADMIN_ACTIONS = ["view", "create", "edit", "delete", "export"];

export const ADMIN_PERMISSION_SECTIONS = [
  "dashboard",
  "point_of_sale",
  "food_management",
  "restaurant_management",
  "order_management",
  "promotions_management",
  "referral_rewards",
  "customer_management",
  "delivery_management",
  "support_management",
  "report_management",
  "transaction_management",
  "banner_management",
  "pages_social_media",
];

const PATH_PREFIX_TO_SECTION = [
  { prefix: "/admin/store/point-of-sale", section: "point_of_sale" },
  { prefix: "/admin/store/fee-settings", section: "delivery_management" },
  { prefix: "/admin/store/delivery-cash-limit", section: "delivery_management" },
  { prefix: "/admin/store/cash-limit-settlement", section: "delivery_management" },
  { prefix: "/admin/store/delivery-withdrawal", section: "delivery_management" },
  { prefix: "/admin/store/delivery-boy-wallet", section: "delivery_management" },
  { prefix: "/admin/store/delivery-emergency-help", section: "delivery_management" },
  { prefix: "/admin/store/delivery-support-tickets", section: "delivery_management" },
  { prefix: "/admin/store/delivery-order-reassignment-requests", section: "delivery_management" },
  { prefix: "/admin/store/food-approval", section: "food_management" },
  { prefix: "/admin/store/products", section: "food_management" },
  // Legacy twins of the routes above. The router still serves them so old
  // bookmarks resolve, and without a prefix here those visits would match no
  // section and be refused for someone who is allowed in.
  { prefix: "/admin/store/foods", section: "food_management" },
  { prefix: "/admin/store/addons", section: "food_management" },
  { prefix: "/admin/store/categories", section: "food_management" },
  { prefix: "/admin/store/zone-setup", section: "restaurant_management" },
  { prefix: "/admin/store/sellers", section: "restaurant_management" },
  { prefix: "/admin/store/restaurants", section: "restaurant_management" },
  { prefix: "/admin/store/orders", section: "order_management" },
  { prefix: "/admin/store/order-detect-delivery", section: "order_management" },
  { prefix: "/admin/store/coupons", section: "promotions_management" },
  { prefix: "/admin/store/referral-settings", section: "referral_rewards" },
  { prefix: "/admin/store/customers", section: "customer_management" },
  { prefix: "/admin/store/support-tickets", section: "customer_management" },
  { prefix: "/admin/store/delivery", section: "delivery_management" },
  { prefix: "/admin/store/delivery-partners", section: "delivery_management" },
  { prefix: "/admin/store/contact-messages", section: "support_management" },
  { prefix: "/admin/store/safety-emergency-reports", section: "support_management" },
  { prefix: "/admin/store/transaction-report", section: "report_management" },
  { prefix: "/admin/store/order-report", section: "report_management" },
  { prefix: "/admin/store/tax-report", section: "report_management" },
  { prefix: "/admin/store/restaurant-report", section: "report_management" },
  { prefix: "/admin/store/customer-report", section: "report_management" },
  { prefix: "/admin/store/restaurant-withdraws", section: "transaction_management" },
  { prefix: "/admin/store/hero-banner-management", section: "banner_management" },
  { prefix: "/admin/store/promotional-banner", section: "banner_management" },
  { prefix: "/admin/store/feature-settings", section: "system_settings" },
  { prefix: "/admin/store/power-scanning", section: "system_settings" },
  { prefix: "/admin/store/business-setup", section: "system_settings" },
  { prefix: "/admin/store/broadcast-notification", section: "system_settings" },
  { prefix: "/admin/store/pages-social-media", section: "pages_social_media" },
  { prefix: "/admin/store/employees", section: "sub_admin_management" },
  { prefix: "/admin/store/employee-role", section: "sub_admin_management" },
];

const ALWAYS_ALLOWED_FOR_SUB_ADMIN = new Set([
  "/admin/store/profile",
  "/admin/store/settings",
]);

export function isSuperAdmin(adminUser) {
  const type = String(adminUser?.adminType || "").trim().toLowerCase();
  return type === "super_admin";
}

export function getAdminPermissions(adminUser) {
  return adminUser?.effectivePermissions || adminUser?.permissions || {};
}

export function canAdminAccess(adminUser, section, action = "view") {
  if (!section) return true;
  if (isSuperAdmin(adminUser)) return true;
  const permissions = getAdminPermissions(adminUser);
  const actions = Array.isArray(permissions?.[section]) ? permissions[section] : [];
  return actions.includes(action);
}

export function resolvePermissionSectionByPath(pathname = "") {
  if (pathname === "/admin/store" || pathname === "/admin/store/") return "dashboard";
  const match = PATH_PREFIX_TO_SECTION.find((item) => pathname.startsWith(item.prefix));
  return match?.section || null;
}

export function canAccessAdminPath(pathname, action = "view") {
  const adminUser = getCurrentUser("admin");
  const section = resolvePermissionSectionByPath(pathname);
  if (!section) {
    if (isSuperAdmin(adminUser)) return true;
    const normalized = String(pathname || "").replace(/\/+$/, "") || "/";
    return ALWAYS_ALLOWED_FOR_SUB_ADMIN.has(normalized);
  }
  return canAdminAccess(adminUser, section, action);
}

export function canCurrentAdminAction(action = "view", pathname = "") {
  const adminUser = getCurrentUser("admin");
  const currentPath =
    pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  const section = resolvePermissionSectionByPath(currentPath);
  if (!section) {
    return isSuperAdmin(adminUser);
  }
  return canAdminAccess(adminUser, section, action);
}

export function findFirstAllowedAdminPath(adminUser) {
  const sectionHomePath = {
    dashboard: "/admin/store",
    point_of_sale: "/admin/store/point-of-sale",
    food_management: "/admin/store/food-approval",
    restaurant_management: "/admin/store/sellers",
    order_management: "/admin/store/orders/all",
    promotions_management: "/admin/store/coupons",
    referral_rewards: "/admin/store/referral-settings",
    customer_management: "/admin/store/customers",
    delivery_management: "/admin/store/delivery-partners",
    support_management: "/admin/store/contact-messages",
    report_management: "/admin/store/transaction-report",
    transaction_management: "/admin/store/restaurant-withdraws",
    banner_management: "/admin/store/hero-banner-management",
    pages_social_media: "/admin/store/pages-social-media/about",
  };

  if (isSuperAdmin(adminUser)) {
    return "/admin/store";
  }

  for (const section of ADMIN_PERMISSION_SECTIONS) {
    if (canAdminAccess(adminUser, section, "view")) {
      return sectionHomePath[section] || "/admin/store/profile";
    }
  }

  return "/admin/store/profile";
}
