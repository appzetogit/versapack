import { API_BASE_URL } from "../../services/api/config.js";

const SIGNED_URL_PATTERN =
  /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i;

/** API origin without /api/v1 — used for relative /uploads paths. */
export const getBackendOrigin = () => {
  const fromApi = String(API_BASE_URL || "").trim();
  if (fromApi) {
    return fromApi
      .replace(/\/api\/v\d+\/?$/i, "")
      .replace(/\/api\/?$/i, "")
      .replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
};

/**
 * Base URL for uploaded files.
 * Dev default: http://localhost:5000/uploads
 * Prod CDN: set VITE_UPLOAD_BASE_URL=https://cdn.yourdomain.com/uploads
 */
export const getUploadBaseUrl = () => {
  const explicit =
    typeof import.meta !== "undefined"
      ? String(import.meta.env?.VITE_UPLOAD_BASE_URL || "").trim().replace(/\/$/, "")
      : "";
  if (explicit) return explicit;

  // Dev: Vite proxies /uploads → backend (same browser origin, no CORP block)
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return "/uploads";
  }

  const origin = getBackendOrigin();
  return origin ? `${origin}/uploads` : "/uploads";
};

const extractUrlString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(
      value.url ||
        value.secure_url ||
        value.imageUrl ||
        value.image ||
        value.src ||
        value.path ||
        "",
    ).trim();
  }
  return "";
};

const isLocalhostHost = (hostname) => /^(localhost|127\.0\.0\.1)$/i.test(String(hostname || ""));

/** Origin used when rewriting bad localhost media URLs in production. */
const getMediaRewriteOrigin = () => {
  const uploadBase = getUploadBaseUrl();
  if (/^https?:\/\//i.test(uploadBase)) {
    try {
      return new URL(uploadBase).origin;
    } catch {
      /* fall through */
    }
  }

  const backendOrigin = getBackendOrigin();
  if (backendOrigin && !isLocalhostHost(new URL(backendOrigin).hostname)) {
    return backendOrigin;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
};

const finalizeAbsoluteUrl = (url) => {
  const appProtocol = typeof window !== "undefined" ? window.location?.protocol : "";
  const appHost = typeof window !== "undefined" ? window.location?.hostname : "";
  const isProdBuild = typeof import.meta !== "undefined" && Boolean(import.meta.env?.PROD);

  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);

    const shouldRewriteLocalhost =
      isLocalhostHost(parsed.hostname)
      && (
        (appHost && !isLocalhostHost(appHost))
        || isProdBuild
      );

    if (shouldRewriteLocalhost) {
      const rewriteOrigin = getMediaRewriteOrigin();
      if (rewriteOrigin) {
        const rewrite = new URL(rewriteOrigin);
        parsed.protocol = rewrite.protocol;
        parsed.hostname = rewrite.hostname;
        parsed.port = rewrite.port;
      }
    }

    if (appProtocol === "https:" && parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }

    const finalUrl = parsed.toString();
    return SIGNED_URL_PATTERN.test(finalUrl) ? finalUrl : encodeURI(finalUrl);
  } catch {
    return url;
  }
};

/**
 * Turn backend media values into a browser-loadable URL.
 * Handles: /uploads/..., full https URLs, Cloudinary, objects with .url
 */
export const resolveMediaUrl = (value, backendOrigin = getBackendOrigin()) => {
  const trimmed = extractUrlString(value);
  if (!trimmed || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed;
  }

  const appProtocol = typeof window !== "undefined" ? window.location?.protocol : "";

  let normalized = trimmed
    .replace(/\\/g, "/")
    .replace(/^(https?):\/(?!\/)/i, "$1://")
    .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");

  if (/^\/\//.test(normalized)) {
    normalized = `${appProtocol || "https:"}${normalized}`;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return finalizeAbsoluteUrl(normalized);
  }

  if (normalized.startsWith("/uploads/")) {
    const uploadBase = getUploadBaseUrl().replace(/\/$/, "");
    const suffix = normalized.slice("/uploads".length);
    return finalizeAbsoluteUrl(`${uploadBase}${suffix}`);
  }

  const origin = backendOrigin || getBackendOrigin();
  if (!origin) return normalized;

  const absolute = normalized.startsWith("/")
    ? `${origin}${normalized}`
    : `${origin}/${normalized.replace(/^\.?\/*/, "")}`;

  return finalizeAbsoluteUrl(absolute);
};

export const normalizeImageUrl = (imageUrl, backendOrigin) =>
  resolveMediaUrl(imageUrl, backendOrigin ?? getBackendOrigin());

export const extractImages = (source, backendOrigin) => {
  const origin = backendOrigin ?? getBackendOrigin();
  if (!source) return [];
  const items = Array.isArray(source) ? source : [source];
  return items.map((item) => resolveMediaUrl(item, origin)).filter(Boolean);
};
