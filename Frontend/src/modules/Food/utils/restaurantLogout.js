/**
 * Safe restaurant logout — thin wrapper around shared module logout.
 * Keeps existing `@food/utils/restaurantLogout` imports working.
 */

export { logoutRestaurantSession } from "@food/utils/moduleLogout";
