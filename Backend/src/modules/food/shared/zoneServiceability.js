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

/** Haversine distance in meters between two lat/lng points. */
export const calculateHaversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

// Matches SellerZone.radiusM's own max (schema-enforced), so the bounding box below
// can never be drawn smaller than the largest zone that could possibly match.
const MAX_SELLER_ZONE_RADIUS_METERS = 50000;
const METERS_PER_DEGREE_LATITUDE = 111320;

/**
 * Every active seller zone within Haversine range of a point, cheapest match first.
 *
 * SellerZone has no geo index -- centerLat/centerLng are plain numbers -- so a true
 * DB-level radius query ($geoWithin/$centerSphere) isn't available without a schema
 * migration. Instead this narrows candidates with an indexed bounding-box range query
 * (cheap, no migration) sized to the largest radius any zone could have, then runs
 * exact Haversine only on that narrowed set. Matches this file's existing tolerance
 * for a linear scan "at the scale a hand-drawn zone list implies" (see findZoneForPoint).
 */
export const findInRangeSellerZones = async (userLat, userLng) => {
  const lat = toFiniteNumber(userLat);
  const lng = toFiniteNumber(userLng);
  if (lat === null || lng === null) return [];

  const latDelta = MAX_SELLER_ZONE_RADIUS_METERS / METERS_PER_DEGREE_LATITUDE;
  // Longitude degrees shrink toward the poles; guard div-by-zero at exactly +/-90.
  const metersPerDegreeLng = METERS_PER_DEGREE_LATITUDE * Math.cos((lat * Math.PI) / 180) || METERS_PER_DEGREE_LATITUDE;
  const lngDelta = MAX_SELLER_ZONE_RADIUS_METERS / metersPerDegreeLng;

  const { SellerZone } = await import('../restaurant/models/sellerZone.model.js');
  const candidates = await SellerZone.find({
    isActive: true,
    centerLat: { $gte: lat - latDelta, $lte: lat + latDelta },
    centerLng: { $gte: lng - lngDelta, $lte: lng + lngDelta },
  })
    .select('sellerId centerLat centerLng radiusM')
    .lean();

  // One active zone per seller is enforced at write time (activating one deactivates
  // the rest), but this defends the read side too: if that ever isn't true, the
  // closest match wins rather than whichever happened to sort last.
  const bestBySeller = new Map();
  for (const zone of candidates) {
    const distanceMeters = calculateHaversineDistanceMeters(lat, lng, zone.centerLat, zone.centerLng);
    if (distanceMeters > zone.radiusM) continue; // <=, not <: exact boundary counts as in range
    const key = String(zone.sellerId);
    const existing = bestBySeller.get(key);
    if (!existing || distanceMeters < existing.distanceMeters) {
      bestBySeller.set(key, { sellerId: key, distanceMeters });
    }
  }
  return [...bestBySeller.values()];
};

/**
 * Check if user lat/lng is inside seller's active circular delivery zone.
 */
export const checkSellerServiceabilityForUser = async (sellerId, userLat, userLng) => {
  const latitude = toFiniteNumber(userLat);
  const longitude = toFiniteNumber(userLng);
  if (!sellerId || latitude === null || longitude === null) {
    return { isServiceable: false, distanceMeters: null, activeZone: null };
  }

  const { SellerZone } = await import('../restaurant/models/sellerZone.model.js');
  const activeZone = await SellerZone.findOne({ sellerId, isActive: true }).lean();

  if (!activeZone) {
    return { isServiceable: false, distanceMeters: null, activeZone: null };
  }

  const distanceMeters = calculateHaversineDistanceMeters(
    latitude,
    longitude,
    activeZone.centerLat,
    activeZone.centerLng
  );

  const isServiceable = distanceMeters <= activeZone.radiusM;

  return {
    isServiceable,
    distanceMeters,
    activeZone: {
      id: activeZone._id.toString(),
      name: activeZone.name,
      center_lat: activeZone.centerLat,
      center_lng: activeZone.centerLng,
      radius_m: activeZone.radiusM,
      is_active: activeZone.isActive
    }
  };
};

