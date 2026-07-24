/**
 * Centralized public app configuration — banners, business settings, fees, features.
 * Loaded once per session (15 min TTL) and shared across all routes/components.
 */

import {
  publicConfigGetOnce,
  invalidatePublicConfigCache,
} from "@food/api";
import { API_ENDPOINTS } from "@food/api/config";

export const PUBLIC_CONFIG_URLS = {
  BUSINESS: API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS_PUBLIC,
  POWER_SCANNING: "/food/admin/power-scanning/public",
  FEATURE: "/food/admin/feature-settings/public",
  FEE: "/food/admin/fee-settings/public",
  TOP_BANNERS: "/food/top-banners/public",
  HERO_BANNERS: "/food/hero-banners/public",
  EXPLORE_ICONS: "/food/explore-icons/public",
  LANDING: "/food/landing/settings/public",
};

const CONFIG_TTL_MS = 15 * 60 * 1000;

const emptyStore = () => ({
  businessSettings: null,
  powerScanning: null,
  featureSettings: null,
  feeSettings: null,
  topBanners: null,
  heroBanners: null,
  exploreIcons: null,
  landingByZone: new Map(),
  loadedAt: 0,
});

let store = emptyStore();
let coreLoadPromise = null;
let userContentLoadPromise = null;

const isFresh = () =>
  store.loadedAt > 0 && Date.now() - store.loadedAt < CONFIG_TTL_MS;

const parseBusinessSettings = (response) =>
  response?.data?.data || response?.data || null;

const parsePowerScanning = (response) =>
  response?.data?.data || response?.data || null;

const parseFeatureSettings = (response) => {
  const rows = response?.data?.data;
  return Array.isArray(rows) ? rows : [];
};

const parseFeeSettings = (response) =>
  response?.data?.data?.feeSettings || null;

const parseTopBanners = (response) => {
  const banners = response?.data?.data?.banners;
  return Array.isArray(banners) ? banners : [];
};

const parseHeroBanners = (response) => {
  const data = response?.data?.data;
  const list = Array.isArray(data?.banners)
    ? data.banners
    : Array.isArray(data)
      ? data
      : [];
  return list;
};

const parseExploreIcons = (response) => {
  const exploreData = response?.data?.data;
  const items = Array.isArray(exploreData?.items)
    ? exploreData.items
    : Array.isArray(exploreData)
      ? exploreData
      : [];
  return items.map((it) => ({
    ...it,
    imageUrl: it.imageUrl || it.iconUrl,
    label: it.label || it.name,
  }));
};

const parseLandingSettings = (response) => {
  const settings = response?.data?.data || {};
  return {
    exploreMoreHeading: settings.exploreMoreHeading || "Explore More",
    recommendedRestaurantIds: settings.recommendedRestaurantIds || [],
    recommendedRestaurants: settings.recommendedRestaurants || [],
  };
};

export const getPublicAppConfigSnapshot = () => ({
  ...store,
  landingByZone: new Map(store.landingByZone),
});

export const invalidatePublicAppConfig = () => {
  invalidatePublicConfigCache();
  store = emptyStore();
  coreLoadPromise = null;
  userContentLoadPromise = null;
};

/**
 * Core config used app-wide: business, theme, fees, feature flags.
 */
export const loadCorePublicAppConfig = async ({ force = false } = {}) => {
  if (!force && isFresh() && store.businessSettings) {
    return getPublicAppConfigSnapshot();
  }

  if (coreLoadPromise && !force) {
    return coreLoadPromise;
  }

  coreLoadPromise = (async () => {
    const [businessRes, powerRes, featureRes, feeRes] = await Promise.all([
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.BUSINESS, force ? { noCache: true } : {}),
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.POWER_SCANNING, force ? { noCache: true } : {})
        .catch(() => null),
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.FEATURE, force ? { noCache: true } : {}),
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.FEE, force ? { noCache: true } : {}),
    ]);

    const businessSettings = parseBusinessSettings(businessRes);
    const powerScanning = parsePowerScanning(powerRes);
    const featureSettings = parseFeatureSettings(featureRes);
    const feeSettings = parseFeeSettings(feeRes);

    if (businessSettings) {
      store.businessSettings = powerScanning
        ? { ...businessSettings, powerScanning }
        : businessSettings;
    } else if (powerScanning) {
      store.businessSettings = {
        ...(store.businessSettings || {}),
        powerScanning,
      };
    }

    store.powerScanning = powerScanning;
    store.featureSettings = featureSettings;
    store.feeSettings = feeSettings;
    store.loadedAt = Date.now();

    return getPublicAppConfigSnapshot();
  })();

  try {
    return await coreLoadPromise;
  } finally {
    coreLoadPromise = null;
  }
};

/**
 * User-home content: banners + explore icons (not zone-specific).
 */
export const loadUserHomePublicConfig = async ({ force = false } = {}) => {
  await loadCorePublicAppConfig({ force });

  if (!force && store.topBanners && store.heroBanners && store.exploreIcons) {
    return getPublicAppConfigSnapshot();
  }

  if (userContentLoadPromise && !force) {
    return userContentLoadPromise;
  }

  userContentLoadPromise = (async () => {
    const [topRes, heroRes, exploreRes] = await Promise.all([
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.TOP_BANNERS, force ? { noCache: true } : {}),
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.HERO_BANNERS, force ? { noCache: true } : {}),
      publicConfigGetOnce(PUBLIC_CONFIG_URLS.EXPLORE_ICONS, force ? { noCache: true } : {})
        .catch(() => null),
    ]);

    store.topBanners = parseTopBanners(topRes);
    store.heroBanners = parseHeroBanners(heroRes);
    store.exploreIcons = parseExploreIcons(exploreRes);
    store.loadedAt = Date.now();

    return getPublicAppConfigSnapshot();
  })();

  try {
    return await userContentLoadPromise;
  } finally {
    userContentLoadPromise = null;
  }
};

export const loadLandingSettingsForZone = async (zoneId, { force = false } = {}) => {
  const zoneKey = String(zoneId || "global");

  if (!force && store.landingByZone.has(zoneKey)) {
    return store.landingByZone.get(zoneKey);
  }

  const params = zoneId ? { zoneId: String(zoneId) } : {};
  const response = await publicConfigGetOnce(PUBLIC_CONFIG_URLS.LANDING, {
    params,
    ...(force ? { noCache: true } : {}),
  });

  const landing = parseLandingSettings(response);
  store.landingByZone.set(zoneKey, landing);
  return landing;
};

export const getCachedBusinessSettings = () => store.businessSettings;

export const getCachedFeatureSettings = () => store.featureSettings;

export const getCachedFeeSettings = () => store.feeSettings;

export const getCachedTopBanners = () => store.topBanners;

export const getCachedHeroBanners = () => store.heroBanners;

export const getCachedExploreIcons = () => store.exploreIcons;

export const getCachedLandingSettings = (zoneId) => {
  const zoneKey = String(zoneId || "global");
  return store.landingByZone.get(zoneKey) || null;
};

export const getFeatureSettingByKey = (key, fallback = null) => {
  const rows = store.featureSettings || [];
  const feature = rows.find((row) => row.key === key);
  if (!feature) return fallback;
  return feature;
};

export const isFeatureEnabled = (key, fallback = true) => {
  const feature = getFeatureSettingByKey(key, null);
  if (!feature) return fallback;
  const value = feature.isEnabled;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
};
