/**
 * Whether a stored media URL points at a video rather than an image.
 *
 * Derived from the URL rather than a field on the record, deliberately: banners
 * created before video was supported carry no type of any kind, and the stored
 * filename already ends in the extension the backend chose. That means no
 * migration and no risk of a record whose type field disagrees with its file.
 *
 * A GIF is intentionally NOT a video here — it is an image, animates inside an
 * <img>, and putting one in a <video> element would render nothing at all.
 */
const VIDEO_EXTENSIONS = /\.(mp4|webm)(\?|#|$)/i;

export const isVideoUrl = (url) => VIDEO_EXTENSIONS.test(String(url || ""));

/** File types the media pickers should offer. Mirrors the backend's allowlist. */
export const BANNER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
