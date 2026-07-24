/**
 * Common utility functions for the Food module
 */

export {
  getBackendOrigin,
  getUploadBaseUrl,
  resolveMediaUrl,
  normalizeImageUrl,
  extractImages,
} from "../../../shared/utils/mediaUrl.js";

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula.
 * Prefer `getUserRestaurantDistance` / `calculateDistanceKm` from `@food/utils/geo`
 * when entities may have GeoJSON coordinates.
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const a = Number(lat1);
  const b = Number(lng1);
  const c = Number(lat2);
  const d = Number(lng2);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((c - a) * Math.PI) / 180;
  const dLng = ((d - b) * Math.PI) / 180;
  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a * Math.PI) / 180) *
      Math.cos((c * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return R * centralAngle;
};

/**
 * Formats distance for display
 */
export const formatDistance = (distanceInKm) => {
  if (distanceInKm === null || distanceInKm === undefined) return "1.2 km";
  if (distanceInKm >= 1) {
    return `${distanceInKm.toFixed(1)} km`;
  } else {
    return `${Math.round(distanceInKm * 1000)} m`;
  }
};

/**
 * Slugifies a string for use in URLs or as identifiers
 */
export const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
