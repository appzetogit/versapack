import { FoodZone } from '../admin/models/zone.model.js';
import { getRedisClient } from '../../../config/redis.js';

/**
 * Which zone a point falls in.
 *
 * Zones are stored as plain lat/lng arrays rather than GeoJSON, so Mongo cannot
 * answer this and the polygon test runs here. Lifted out of the public detect
 * controller because the answer is now needed at order time too: the client
 * detects a zone and passes the id down, and nothing ever checked that the
 * address being delivered to is actually inside it.
 *
 * ponytail: linear scan over active zones, which is fine at the scale a
 * hand-drawn zone list implies. Store zones as GeoJSON with a 2dsphere index if
 * the list ever gets long enough to matter.
 */

const ACTIVE_ZONES_CACHE_KEY = 'zones:active:list:v1';
const ACTIVE_ZONES_CACHE_TTL_SECONDS = 120;

export const toFiniteNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

export const invalidateActiveZonesCache = async () => {
  const redis = getRedisClient();
  if (!redis || !redis.isReady) return;
  await redis.del(ACTIVE_ZONES_CACHE_KEY);
};

export const getActiveZones = async () => {
  const redis = getRedisClient();
  if (redis?.isReady) {
    const raw = await redis.get(ACTIVE_ZONES_CACHE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall through to a fresh read rather than failing on a poisoned key.
      }
    }
  }

  const zones = await FoodZone.find({ isActive: true }).lean();
  if (redis?.isReady) {
    await redis.set(ACTIVE_ZONES_CACHE_KEY, JSON.stringify(zones), {
      EX: ACTIVE_ZONES_CACHE_TTL_SECONDS,
    });
  }
  return zones;
};

/** Ray casting over a lat/lng ring. */
export const isPointInPolygon = (lat, lng, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** The first active zone containing the point, or null. */
export const findZoneForPoint = async (lat, lng) => {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  if (latitude === null || longitude === null) return null;

  const zones = await getActiveZones();
  for (const zone of zones) {
    const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
    if (coords.length < 3) continue;
    if (isPointInPolygon(latitude, longitude, coords)) return zone;
  }
  return null;
};

/** Pulls a lat/lng off any of the address shapes in circulation. */
export const readAddressPoint = (address) => {
  if (!address || typeof address !== 'object') return null;

  const coords = address.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const lng = toFiniteNumber(coords[0]);
    const lat = toFiniteNumber(coords[1]);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  const lat = toFiniteNumber(address.latitude ?? address.lat);
  const lng = toFiniteNumber(address.longitude ?? address.lng);
  if (lat !== null && lng !== null) return { lat, lng };

  return null;
};
