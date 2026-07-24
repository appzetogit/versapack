import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Fetches driving route metrics from Google Directions API.
 * Call sparingly (e.g. once per order) — billed per request.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<{ polyline: string, distanceMeters: number|null, durationSeconds: number|null, distanceKm: number|null }>}
 */
export async function fetchDrivingRoute(origin, destination) {
  const empty = {
    polyline: '',
    distanceMeters: null,
    durationSeconds: null,
    distanceKm: null,
  };

  const apiKey = config.googleMapsApiKey;
  if (!apiKey) {
    logger.warn('Google Maps API key missing. Driving route fetch skipped.');
    return empty;
  }

  if (
    !origin ||
    !destination ||
    !Number.isFinite(Number(origin.lat)) ||
    !Number.isFinite(Number(origin.lng)) ||
    !Number.isFinite(Number(destination.lat)) ||
    !Number.isFinite(Number(destination.lng))
  ) {
    return empty;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=driving&key=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.status === 'OK' && data.routes?.length > 0) {
      const route = data.routes[0];
      const legs = route.legs || [];
      let distanceMeters = 0;
      let durationSeconds = 0;
      for (const leg of legs) {
        distanceMeters += leg.distance?.value || 0;
        durationSeconds += leg.duration?.value || 0;
      }

      return {
        polyline: route.overview_polyline?.points || '',
        distanceMeters: distanceMeters > 0 ? distanceMeters : null,
        durationSeconds: durationSeconds > 0 ? durationSeconds : null,
        distanceKm:
          distanceMeters > 0 ? Number((distanceMeters / 1000).toFixed(2)) : null,
      };
    }

    logger.warn(
      `Google Directions API returned status: ${data.status}. Message: ${data.error_message || 'No routes found'}`,
    );
  } catch (err) {
    logger.error(`Error fetching driving route from Google: ${err.message}`);
  }

  return empty;
}

/**
 * Fetches an encoded polyline from Google Directions API.
 * This should be called ONLY ONCE per order assignment to save costs.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<string>} - Encoded polyline points
 */
export async function fetchPolyline(origin, destination) {
  const { polyline } = await fetchDrivingRoute(origin, destination);
  return polyline;
}
