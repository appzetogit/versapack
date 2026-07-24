/**
 * Business Settings Utility
 * Handles loading and updating business settings (favicon, title, logo)
 */

import apiClient from "@food/api/axios";
import { API_ENDPOINTS } from "@food/api/config";
import {
  getCachedBusinessSettings,
  loadCorePublicAppConfig,
  invalidatePublicAppConfig,
} from "@food/services/publicAppConfig";

const SETTINGS_KEY = 'food_business_settings';
const DEFAULT_MODULE_POWER_SCANNING = {
  user: { themeColor: "#FA0272", fontFamily: "Poppins" },
  restaurant: { themeColor: "#2563EB", fontFamily: "Poppins" },
  delivery: { themeColor: "#00B761", fontFamily: "Poppins" },
};

const FONT_STACKS = {
  "Poppins": "'Poppins', sans-serif",
  "Outfit": "'Outfit', sans-serif",
  "Inter": "'Inter', sans-serif",
  "Roboto": "'Roboto', sans-serif",
  "Montserrat": "'Montserrat', sans-serif",
  "Nunito": "'Nunito', sans-serif",
  "Open Sans": "'Open Sans', sans-serif",
  "Lato": "'Lato', sans-serif",
  "Manrope": "'Manrope', sans-serif",
  "Raleway": "'Raleway', sans-serif",
  "Merriweather": "'Merriweather', serif",
  "Playfair Display": "'Playfair Display', serif",
  "Ubuntu": "'Ubuntu', sans-serif",
  "Rubik": "'Rubik', sans-serif",
  "Work Sans": "'Work Sans', sans-serif",
};

const LEGACY_BRAND_HEXES = [
  "#FA0272",
  "#00B761",
  "#2563EB",
  "#DC2626",
  "#EB590E",
  "#D94F0C",
  "#C44409",
  "#FF8100",
];
const LEGACY_BRAND_TAILWIND_COLORS = [
  "emerald-50", "emerald-100", "emerald-200", "emerald-300", "emerald-400", "emerald-500", "emerald-600", "emerald-700", "emerald-800", "emerald-900",
  "green-50", "green-100", "green-200", "green-300", "green-400", "green-500", "green-600", "green-700", "green-800", "green-900",
  "teal-50", "teal-100", "teal-200", "teal-300", "teal-400", "teal-500", "teal-600", "teal-700", "teal-800", "teal-900",
];

const hexToRgbTuple = (hex) => {
  const raw = String(hex || "").trim();
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return "250,2,114";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r},${g},${b}`;
};

const buildThemeOverrideCss = () => {
  const OPACITY_STEPS = [
    { suffix: "5", alpha: 0.05 },
    { suffix: "10", alpha: 0.10 },
    { suffix: "15", alpha: 0.15 },
    { suffix: "20", alpha: 0.20 },
    { suffix: "25", alpha: 0.25 },
    { suffix: "30", alpha: 0.30 },
    { suffix: "40", alpha: 0.40 },
    { suffix: "50", alpha: 0.50 },
    { suffix: "60", alpha: 0.60 },
    { suffix: "70", alpha: 0.70 },
    { suffix: "80", alpha: 0.80 },
    { suffix: "90", alpha: 0.90 },
  ];

  const textSelectors = [];
  const bgSelectors = [];
  const borderSelectors = [];
  const fillSelectors = [];
  const strokeSelectors = [];
  const ringSelectors = [];
  const fromSelectors = [];
  const toSelectors = [];
  const viaSelectors = [];
  const hoverBgSelectors = [];
  const hoverTextSelectors = [];
  const hoverBorderSelectors = [];
  const focusRingSelectors = [];
  const twTextSelectors = [];
  const twBgSelectors = [];
  const twBorderSelectors = [];
  const twFillSelectors = [];
  const twStrokeSelectors = [];
  const twFromSelectors = [];
  const twToSelectors = [];
  const twViaSelectors = [];
  const twHoverTextSelectors = [];
  const twHoverBgSelectors = [];
  const twHoverBorderSelectors = [];

  const bgOpacityRules = {};
  const textOpacityRules = {};
  const borderOpacityRules = {};
  const fillOpacityRules = {};
  const strokeOpacityRules = {};
  const fromOpacityRules = {};
  const toOpacityRules = {};
  const viaOpacityRules = {};
  const hoverBgOpacityRules = {};
  const hoverTextOpacityRules = {};
  const hoverBorderOpacityRules = {};

  LEGACY_BRAND_HEXES.forEach((hex) => {
    const lower = hex.toLowerCase().replace("#", "");
    const upper = hex.toUpperCase().replace("#", "");
    textSelectors.push(`.text-\\[\\#${upper}\\]`, `.text-\\[\\#${lower}\\]`);
    bgSelectors.push(`.bg-\\[\\#${upper}\\]`, `.bg-\\[\\#${lower}\\]`);
    borderSelectors.push(`.border-\\[\\#${upper}\\]`, `.border-\\[\\#${lower}\\]`);
    fillSelectors.push(`.fill-\\[\\#${upper}\\]`, `.fill-\\[\\#${lower}\\]`);
    strokeSelectors.push(`.stroke-\\[\\#${upper}\\]`, `.stroke-\\[\\#${lower}\\]`);
    ringSelectors.push(`.ring-\\[\\#${upper}\\]`, `.ring-\\[\\#${lower}\\]`);
    fromSelectors.push(`.from-\\[\\#${upper}\\]`, `.from-\\[\\#${lower}\\]`);
    toSelectors.push(`.to-\\[\\#${upper}\\]`, `.to-\\[\\#${lower}\\]`);
    viaSelectors.push(`.via-\\[\\#${upper}\\]`, `.via-\\[\\#${lower}\\]`);
    hoverBgSelectors.push(`.hover\\:bg-\\[\\#${upper}\\]:hover`, `.hover\\:bg-\\[\\#${lower}\\]:hover`);
    hoverTextSelectors.push(`.hover\\:text-\\[\\#${upper}\\]:hover`, `.hover\\:text-\\[\\#${lower}\\]:hover`);
    hoverBorderSelectors.push(`.hover\\:border-\\[\\#${upper}\\]:hover`, `.hover\\:border-\\[\\#${lower}\\]:hover`);
    focusRingSelectors.push(`.focus\\:ring-\\[\\#${upper}\\]:focus`, `.focus\\:ring-\\[\\#${lower}\\]:focus`);

    OPACITY_STEPS.forEach(({ suffix, alpha }) => {
      const alphaValue = String(alpha);
      bgOpacityRules[alphaValue] = bgOpacityRules[alphaValue] || [];
      textOpacityRules[alphaValue] = textOpacityRules[alphaValue] || [];
      borderOpacityRules[alphaValue] = borderOpacityRules[alphaValue] || [];
      fillOpacityRules[alphaValue] = fillOpacityRules[alphaValue] || [];
      strokeOpacityRules[alphaValue] = strokeOpacityRules[alphaValue] || [];
      fromOpacityRules[alphaValue] = fromOpacityRules[alphaValue] || [];
      toOpacityRules[alphaValue] = toOpacityRules[alphaValue] || [];
      viaOpacityRules[alphaValue] = viaOpacityRules[alphaValue] || [];
      hoverBgOpacityRules[alphaValue] = hoverBgOpacityRules[alphaValue] || [];
      hoverTextOpacityRules[alphaValue] = hoverTextOpacityRules[alphaValue] || [];
      hoverBorderOpacityRules[alphaValue] = hoverBorderOpacityRules[alphaValue] || [];

      bgOpacityRules[alphaValue].push(`.bg-\\[\\#${upper}\\]\\\\/${suffix}`, `.bg-\\[\\#${lower}\\]\\\\/${suffix}`);
      textOpacityRules[alphaValue].push(`.text-\\[\\#${upper}\\]\\\\/${suffix}`, `.text-\\[\\#${lower}\\]\\\\/${suffix}`);
      borderOpacityRules[alphaValue].push(`.border-\\[\\#${upper}\\]\\\\/${suffix}`, `.border-\\[\\#${lower}\\]\\\\/${suffix}`);
      fillOpacityRules[alphaValue].push(`.fill-\\[\\#${upper}\\]\\\\/${suffix}`, `.fill-\\[\\#${lower}\\]\\\\/${suffix}`);
      strokeOpacityRules[alphaValue].push(`.stroke-\\[\\#${upper}\\]\\\\/${suffix}`, `.stroke-\\[\\#${lower}\\]\\\\/${suffix}`);
      fromOpacityRules[alphaValue].push(`.from-\\[\\#${upper}\\]\\\\/${suffix}`, `.from-\\[\\#${lower}\\]\\\\/${suffix}`);
      toOpacityRules[alphaValue].push(`.to-\\[\\#${upper}\\]\\\\/${suffix}`, `.to-\\[\\#${lower}\\]\\\\/${suffix}`);
      viaOpacityRules[alphaValue].push(`.via-\\[\\#${upper}\\]\\\\/${suffix}`, `.via-\\[\\#${lower}\\]\\\\/${suffix}`);
      hoverBgOpacityRules[alphaValue].push(`.hover\\:bg-\\[\\#${upper}\\]\\\\/${suffix}:hover`, `.hover\\:bg-\\[\\#${lower}\\]\\\\/${suffix}:hover`);
      hoverTextOpacityRules[alphaValue].push(`.hover\\:text-\\[\\#${upper}\\]\\\\/${suffix}:hover`, `.hover\\:text-\\[\\#${lower}\\]\\\\/${suffix}:hover`);
      hoverBorderOpacityRules[alphaValue].push(`.hover\\:border-\\[\\#${upper}\\]\\\\/${suffix}:hover`, `.hover\\:border-\\[\\#${lower}\\]\\\\/${suffix}:hover`);
    });
  });

  LEGACY_BRAND_TAILWIND_COLORS.forEach((colorToken) => {
    twTextSelectors.push(`.text-${colorToken}`);
    twBgSelectors.push(`.bg-${colorToken}`);
    twBorderSelectors.push(`.border-${colorToken}`);
    twFillSelectors.push(`.fill-${colorToken}`);
    twStrokeSelectors.push(`.stroke-${colorToken}`);
    twFromSelectors.push(`.from-${colorToken}`);
    twToSelectors.push(`.to-${colorToken}`);
    twViaSelectors.push(`.via-${colorToken}`);
    twHoverTextSelectors.push(`.hover\\:text-${colorToken}:hover`);
    twHoverBgSelectors.push(`.hover\\:bg-${colorToken}:hover`);
    twHoverBorderSelectors.push(`.hover\\:border-${colorToken}:hover`);
  });

  const makeOpacityRuleBlock = (selectorMap, propertyBuilder) =>
    Object.entries(selectorMap)
      .map(([alpha, selectors]) =>
        selectors.length
          ? `${selectors.join(", ")} { ${propertyBuilder(alpha)} }`
          : ""
      )
      .filter(Boolean)
      .join("\n");

  return `
    html, body, #root, #root * {
      font-family: var(--module-font-family, 'Poppins', sans-serif) !important;
    }
    .theme-text {
      color: var(--module-theme-color) !important;
    }
    .theme-bg {
      background-color: var(--module-theme-color) !important;
    }
    .theme-border {
      border-color: var(--module-theme-color) !important;
    }
    .theme-ring {
      --tw-ring-color: var(--module-theme-color) !important;
    }
    .theme-fill {
      fill: var(--module-theme-color) !important;
    }
    .theme-stroke {
      stroke: var(--module-theme-color) !important;
    }
    .theme-bg-soft {
      background-color: rgba(var(--module-theme-rgb), 0.10) !important;
    }
    .theme-bg-muted {
      background-color: rgba(var(--module-theme-rgb), 0.16) !important;
    }
    .theme-bg-strong {
      background-color: rgba(var(--module-theme-rgb), 0.22) !important;
    }
    .theme-gradient {
      --tw-gradient-from: var(--module-theme-color) var(--tw-gradient-from-position) !important;
      --tw-gradient-to: rgba(var(--module-theme-rgb), 0.82) var(--tw-gradient-to-position) !important;
      --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
    }
    .text-primary {
      color: var(--module-theme-color) !important;
    }
    .bg-primary {
      background-color: var(--module-theme-color) !important;
    }
    .border-primary {
      border-color: var(--module-theme-color) !important;
    }
    .ring-primary {
      --tw-ring-color: var(--module-theme-color) !important;
    }
    ${textSelectors.join(", ")}, ${hoverTextSelectors.join(", ")} {
      color: var(--module-theme-color) !important;
    }
    ${bgSelectors.join(", ")}, ${hoverBgSelectors.join(", ")} {
      background-color: var(--module-theme-color) !important;
    }
    ${borderSelectors.join(", ")} {
      border-color: var(--module-theme-color) !important;
    }
    ${fillSelectors.join(", ")} {
      fill: var(--module-theme-color) !important;
    }
    ${strokeSelectors.join(", ")} {
      stroke: var(--module-theme-color) !important;
    }
    ${ringSelectors.join(", ")}, ${focusRingSelectors.join(", ")} {
      --tw-ring-color: var(--module-theme-color) !important;
      box-shadow: 0 0 0 1px rgba(var(--module-theme-rgb), 0.25) !important;
    }
    ${fromSelectors.join(", ")} {
      --tw-gradient-from: var(--module-theme-color) var(--tw-gradient-from-position) !important;
      --tw-gradient-to: rgba(var(--module-theme-rgb), 0) var(--tw-gradient-to-position) !important;
      --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
    }
    ${toSelectors.join(", ")} {
      --tw-gradient-to: var(--module-theme-color) var(--tw-gradient-to-position) !important;
    }
    ${viaSelectors.join(", ")} {
      --tw-gradient-stops: var(--tw-gradient-from), var(--module-theme-color), var(--tw-gradient-to) !important;
    }
    ${hoverBorderSelectors.join(", ")} {
      border-color: var(--module-theme-color) !important;
    }
    ${twTextSelectors.join(", ")}, ${twHoverTextSelectors.join(", ")} {
      color: var(--module-theme-color) !important;
    }
    ${twBgSelectors.join(", ")}, ${twHoverBgSelectors.join(", ")} {
      background-color: rgba(var(--module-theme-rgb), 0.10) !important;
    }
    ${twBorderSelectors.join(", ")}, ${twHoverBorderSelectors.join(", ")} {
      border-color: rgba(var(--module-theme-rgb), 0.24) !important;
    }
    ${twFillSelectors.join(", ")} {
      fill: var(--module-theme-color) !important;
    }
    ${twStrokeSelectors.join(", ")} {
      stroke: var(--module-theme-color) !important;
    }
    ${twFromSelectors.join(", ")} {
      --tw-gradient-from: rgba(var(--module-theme-rgb), 0.28) var(--tw-gradient-from-position) !important;
      --tw-gradient-to: rgba(var(--module-theme-rgb), 0) var(--tw-gradient-to-position) !important;
      --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
    }
    ${twToSelectors.join(", ")} {
      --tw-gradient-to: rgba(var(--module-theme-rgb), 0.75) var(--tw-gradient-to-position) !important;
    }
    ${twViaSelectors.join(", ")} {
      --tw-gradient-stops: var(--tw-gradient-from), rgba(var(--module-theme-rgb), 0.52), var(--tw-gradient-to) !important;
    }

    ${makeOpacityRuleBlock(bgOpacityRules, (alpha) => `background-color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(textOpacityRules, (alpha) => `color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(borderOpacityRules, (alpha) => `border-color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(fillOpacityRules, (alpha) => `fill: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(strokeOpacityRules, (alpha) => `stroke: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(hoverBgOpacityRules, (alpha) => `background-color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(hoverTextOpacityRules, (alpha) => `color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}
    ${makeOpacityRuleBlock(hoverBorderOpacityRules, (alpha) => `border-color: rgba(var(--module-theme-rgb), ${alpha}) !important;`)}

    ${makeOpacityRuleBlock(fromOpacityRules, (alpha) =>
      `--tw-gradient-from: rgba(var(--module-theme-rgb), ${alpha}) var(--tw-gradient-from-position) !important;
       --tw-gradient-to: rgba(var(--module-theme-rgb), 0) var(--tw-gradient-to-position) !important;
       --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;`
    )}
    ${makeOpacityRuleBlock(toOpacityRules, (alpha) =>
      `--tw-gradient-to: rgba(var(--module-theme-rgb), ${alpha}) var(--tw-gradient-to-position) !important;`
    )}
    ${makeOpacityRuleBlock(viaOpacityRules, (alpha) =>
      `--tw-gradient-stops: var(--tw-gradient-from), rgba(var(--module-theme-rgb), ${alpha}), var(--tw-gradient-to) !important;`
    )}
  `;
};

// Initialize from localStorage immediately so it's available for components on mount
let cachedSettings = (() => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
})();

// Apply cached settings immediately on module load if they exist
if (cachedSettings) {
  setTimeout(() => {
    updateFavicon(cachedSettings.favicon?.url);
    updateTitle(cachedSettings.companyName);
  }, 0);
}

let inFlightSettingsPromise = null;

/**
 * Load business settings from backend (public endpoint - no auth required)
 */
export const loadBusinessSettings = async ({ force = false } = {}) => {
  try {
    const endpoint = API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS_PUBLIC;
    if (!endpoint || (typeof endpoint === "string" && !endpoint.trim())) {
      return cachedSettings;
    }

    if (!force && cachedSettings) {
      const fromService = getCachedBusinessSettings();
      if (fromService) return fromService;
      return cachedSettings;
    }

    if (inFlightSettingsPromise && !force) {
      return await inFlightSettingsPromise;
    }

    inFlightSettingsPromise = (async () => {
      const snapshot = await loadCorePublicAppConfig({ force });
      const mergedSettings = snapshot.businessSettings || cachedSettings;

      if (mergedSettings) {
        cachedSettings = mergedSettings;
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergedSettings));
        } catch (e) {}

        updateFavicon(mergedSettings.favicon?.url);
        updateTitle(mergedSettings.companyName);
        return mergedSettings;
      }
      return cachedSettings;
    })();

    return await inFlightSettingsPromise;
  } catch (error) {
    return cachedSettings;
  } finally {
    inFlightSettingsPromise = null;
  }
};

/**
 * Update favicon in document
 */
export const updateFavicon = (url) => {
  if (!url || typeof document === 'undefined') return;

  // Remove existing favicons
  const existingFavicons = document.querySelectorAll("link[rel*='icon']");
  existingFavicons.forEach(el => el.remove());

  // Add new favicon
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = url;
  // Prevent third-party cookie warning (Cloudinary)
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
};

const resolveLogoByModule = (settings, moduleName = "user") => {
  if (!settings || typeof settings !== "object") return "";
  const moduleKey = String(moduleName || "").trim().toLowerCase();
  if (moduleKey === "restaurant") {
    return settings.restaurantLogo?.url || settings.logo?.url || "";
  }
  if (moduleKey === "delivery") {
    return settings.deliveryLogo?.url || settings.logo?.url || "";
  }
  return settings.logo?.url || "";
};

const resolveFaviconByModule = (settings, moduleName = "user") => {
  if (!settings || typeof settings !== "object") return "";
  const moduleKey = String(moduleName || "").trim().toLowerCase();
  if (moduleKey === "restaurant") {
    return settings.restaurantFavicon?.url || settings.favicon?.url || "";
  }
  if (moduleKey === "delivery") {
    return settings.deliveryFavicon?.url || settings.favicon?.url || "";
  }
  return settings.favicon?.url || "";
};

/**
 * Update page title
 */
export const updateTitle = (companyName) => {
  if (companyName && typeof document !== 'undefined') {
    document.title = companyName;
  }
};

/**
 * Set cached settings manually (useful after update)
 */
export const setCachedSettings = (settings) => {
  if (settings) {
    cachedSettings = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
    
    updateFavicon(settings.favicon?.url);
    updateTitle(settings.companyName);
  }
};

export const getModuleLogoUrl = (moduleName = "user") => {
  return resolveLogoByModule(cachedSettings, moduleName);
};

export const getModuleFaviconUrl = (moduleName = "user") => {
  return resolveFaviconByModule(cachedSettings, moduleName);
};

export const applyModuleBranding = (moduleName = "user", settingsOverride = null) => {
  const settings = settingsOverride || cachedSettings;
  if (!settings) return;
  updateFavicon(resolveFaviconByModule(settings, moduleName));
  updateTitle(settings.companyName);
};

export const getModulePowerScanning = (moduleName = "user", settingsOverride = null) => {
  const settings = settingsOverride || cachedSettings || {};
  const moduleKey = String(moduleName || "user").trim().toLowerCase();
  const moduleConfig = settings?.powerScanning?.[moduleKey] || DEFAULT_MODULE_POWER_SCANNING[moduleKey] || DEFAULT_MODULE_POWER_SCANNING.user;

  const rawColor = String(moduleConfig?.themeColor || "").trim();
  const themeColor = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : DEFAULT_MODULE_POWER_SCANNING[moduleKey]?.themeColor || DEFAULT_MODULE_POWER_SCANNING.user.themeColor;
  const fontFamily = String(moduleConfig?.fontFamily || "").trim() || (DEFAULT_MODULE_POWER_SCANNING[moduleKey]?.fontFamily || DEFAULT_MODULE_POWER_SCANNING.user.fontFamily);
  return { themeColor, fontFamily };
};

export const applyModulePowerScanning = (moduleName = "user", settingsOverride = null) => {
  if (typeof document === "undefined") return;
  const { themeColor, fontFamily } = getModulePowerScanning(moduleName, settingsOverride);
  const fontStack = FONT_STACKS[fontFamily] || FONT_STACKS["Poppins"];
  const rgbTuple = hexToRgbTuple(themeColor);

  document.documentElement.style.setProperty("--module-theme-color", themeColor);
  document.documentElement.style.setProperty("--module-theme-rgb", rgbTuple);
  document.documentElement.style.setProperty("--color-primary-orange", themeColor);
  document.documentElement.style.setProperty("--ring", themeColor);
  document.documentElement.style.setProperty("--module-font-family", fontStack);
  document.documentElement.style.setProperty("--font-poppins", fontStack);
  document.documentElement.style.setProperty("--font-outfit", fontStack);
  document.documentElement.style.setProperty("--font-sans", fontStack);
  document.documentElement.style.fontFamily = fontStack;
  document.body.style.setProperty("font-family", fontStack, "important");
  document.body.style.fontFamily = fontStack;

  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.setAttribute("name", "theme-color");
    document.head.appendChild(themeMeta);
  }
  themeMeta.setAttribute("content", themeColor);

  let styleTag = document.getElementById("module-power-scanning-overrides");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "module-power-scanning-overrides";
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = buildThemeOverrideCss();
};

/**
 * Clear cached settings (call after updating settings)
 */
export const clearCache = () => {
  cachedSettings = null;
  invalidatePublicAppConfig();
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {}
};

/**
 * Get cached settings
 */
export const getCachedSettings = () => {
  return cachedSettings;
};

/**
 * Get company name from business settings with fallback
 * @returns {string} Company name or default "SwitchEats Food"
 */
export const getCompanyName = () => {
  const settings = getCachedSettings();
  return settings?.companyName || "SwitchEats";
};

/**
 * Get company name asynchronously (loads if not cached)
 * @returns {Promise<string>} Company name or default "SwitchEats Food"
 */
export const getCompanyNameAsync = async () => {
  try {
    const settings = await loadBusinessSettings();
    return settings?.companyName || "SwitchEats";
  } catch (error) {
    return "SwitchEats";
  }
};
