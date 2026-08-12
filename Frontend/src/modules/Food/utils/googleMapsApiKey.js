import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings";

/**
 * The Google Maps browser key, from business settings.
 *
 * It used to come from the build's environment, which meant rotating it needed
 * a code change and a redeploy of every surface that draws a map. It is now
 * typed once in the admin panel and read from there, so a rotation takes effect
 * on the next page load.
 *
 * Serving it publicly is correct and unavoidable: a Maps browser key is read by
 * the browser and cannot be hidden. What protects it is an HTTP-referrer
 * restriction in the Google Cloud console, not secrecy.
 */

let cachedApiKey = null;

function sanitizeApiKey(value) {
  if (!value) return "";
  // Keys pasted from a console or an .env line often arrive wrapped in quotes.
  return String(value).trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Reads the key without waiting on the network.
 *
 * For code that has to decide synchronously whether a map can render at all.
 * Returns "" until settings have loaded once.
 */
export function getGoogleMapsApiKeySync() {
  if (cachedApiKey) return cachedApiKey;
  const fromSettings = sanitizeApiKey(getCachedSettings()?.googleMapsApiKey);
  if (fromSettings) {
    cachedApiKey = fromSettings;
    return cachedApiKey;
  }
  // The env var stays as a fallback so a local dev setup and any deployment
  // that has not had a key entered yet keep working.
  return sanitizeApiKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

/** The key, loading business settings if they are not cached yet. */
export async function getGoogleMapsApiKey() {
  if (cachedApiKey) return cachedApiKey;

  const cached = sanitizeApiKey(getCachedSettings()?.googleMapsApiKey);
  if (cached) {
    cachedApiKey = cached;
    return cachedApiKey;
  }

  try {
    const settings = await loadBusinessSettings();
    const fromServer = sanitizeApiKey(settings?.googleMapsApiKey);
    if (fromServer) {
      cachedApiKey = fromServer;
      return cachedApiKey;
    }
  } catch {
    // A settings outage must not take the maps down as well; fall through to
    // whatever the build was given.
  }

  cachedApiKey = sanitizeApiKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  return cachedApiKey;
}

/** Call after saving a new key in the admin panel. */
export function clearGoogleMapsApiKeyCache() {
  cachedApiKey = null;
}
