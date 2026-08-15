import multer from 'multer';

const storage = multer.memoryStorage();

/**
 * Per-file upload ceiling.
 *
 * There was no limit here at all, so the only thing stopping a huge upload was
 * nginx's client_max_body_size — which rejects at the proxy with a bare 413 and
 * an HTML body, giving the panel nothing it can show the admin. A limit here
 * fails inside the app, as JSON, with a message that names the actual cap.
 *
 * 50MB, raised from 25 when banners started carrying video. nginx's
 * client_max_body_size is set to match — the smaller of the two is the real
 * limit, and when nginx is the one that rejects, it does so at the proxy with
 * a bare 413 and an HTML body the panel cannot show the admin.
 *
 * Files are buffered in memory (memoryStorage), so this is also the
 * per-request memory cost: MAX_UPLOAD_BYTES x MAX_UPLOAD_FILES is what a
 * single request can hold. That product is the number to check before raising
 * either — this runs on a box with a few GB free, shared with other services.
 */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 50 * 1024 * 1024;

/**
 * Files per request.
 *
 * multer's fileSize limit is per file, so without this a caller could attach
 * an unbounded number of them and buffer the lot in memory at once. The banner
 * pickers send at most 5.
 */
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES) || 5;

export const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
});

export const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

