import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { ValidationError } from '../core/auth/errors.js';

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
]);

/**
 * Video formats accepted for banners.
 *
 * Only the two every browser can play natively. Deliberately not .mov/.avi/.mkv:
 * nothing here transcodes, so a format the browser cannot decode would upload
 * cleanly, store fine, and then show an admin a blank banner with no error to
 * explain it.
 */
const VIDEO_MIME_TYPES = new Map([
    ['video/mp4', '.mp4'],
    ['video/webm', '.webm']
]);

/**
 * Confirms the bytes match the declared type.
 *
 * The mimetype on a multipart upload is supplied by the client and is not
 * evidence of anything. These files are written under the same origin the app
 * is served from, so accepting an arbitrary buffer because its header claimed
 * video/mp4 would be a way to host active content on our own domain.
 */
const looksLikeDeclaredVideo = (buffer, mimeType) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

    if (mimeType === 'video/webm') {
        // EBML header, shared with Matroska.
        return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    }

    // ISO base media: a size field, then the literal 'ftyp' at offset 4.
    return buffer.toString('ascii', 4, 8) === 'ftyp';
};

const WEBP_MIME = 'image/webp';
const GIF_MIME = 'image/gif';
const FOLDER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;

export const sanitizeUploadFolder = (folder) => {
    const normalized = String(folder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized) {
        throw new ValidationError('Folder is required');
    }
    if (normalized.includes('..') || normalized.startsWith('.')) {
        throw new ValidationError('Invalid folder path');
    }
    if (!FOLDER_PATTERN.test(normalized)) {
        throw new ValidationError('Folder may only contain letters, numbers, /, _, and -');
    }
    return normalized;
};

const buildFilename = (extension) => {
    const stamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${stamp}-${random}${extension}`;
};

export const fixMediaUrlProtocol = (url) => String(url || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(https?):\/(?!\/)/i, '$1://')
    .replace(/^(https?:\/\/)(https?:\/\/)+/i, '$1');

export const buildPublicUrl = (relativePath) => {
    const cleanPath = String(relativePath || '').replace(/^\/+/, '');
    const base = fixMediaUrlProtocol(String(config.uploadBaseUrl || '').replace(/\/+$/, ''));

    // Never persist localhost URLs — frontend/nginx resolve /uploads/... per environment
    if (
        !base
        || base === '/uploads'
        || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/uploads)?$/i.test(base)
    ) {
        return `/uploads/${cleanPath}`;
    }

    return `${base}/${cleanPath}`;
};

/**
 * Normalize any media URL before saving to MongoDB.
 * Strips localhost origins; fixes protocol typos (https:/ → https://).
 */
export const normalizeMediaUrlForStorage = (url) => {
    const trimmed = fixMediaUrlProtocol(url);
    if (!trimmed) return '';

    if (trimmed.startsWith('/uploads/')) {
        return trimmed;
    }

    try {
        const parsed = new URL(trimmed);
        if (/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname) && parsed.pathname.startsWith('/uploads/')) {
            return parsed.pathname;
        }
        if (parsed.pathname.startsWith('/uploads/')) {
            return fixMediaUrlProtocol(parsed.toString());
        }
    } catch {
        /* not a full URL */
    }

    return trimmed;
};

const getAbsolutePath = (relativePath) => {
    const root = path.resolve(config.uploadStorageRoot);
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
        throw new ValidationError('Invalid file path');
    }
    return absolute;
};

const getWebpQuality = () => {
    const raw = Number(config.uploadWebpQuality);
    if (!Number.isFinite(raw)) return 90;
    return Math.min(100, Math.max(1, Math.round(raw)));
};

const getWebpMaxWidth = () => {
    const raw = Number(config.uploadWebpMaxWidth);
    if (!Number.isFinite(raw) || raw < 1) return 2560;
    return Math.round(raw);
};

/**
 * Convert JPEG/PNG/WebP to optimized WebP for storage.
 * GIF is kept as-is (animation). PNG with alpha uses lossless WebP.
 */
export const optimizeImageForStorage = async (inputBuffer, mimeType) => {
    const normalizedMime = String(mimeType || '').toLowerCase();

    if (normalizedMime === GIF_MIME) {
        return {
            buffer: inputBuffer,
            mimeType: GIF_MIME,
            extension: '.gif'
        };
    }

    if (!['image/jpeg', 'image/jpg', 'image/png', WEBP_MIME].includes(normalizedMime)) {
        throw new ValidationError('Unsupported image type');
    }

    const maxWidth = getWebpMaxWidth();
    const quality = getWebpQuality();

    const metadata = await sharp(inputBuffer, { failOn: 'none' }).metadata();
    const needsResize = Boolean(metadata.width && metadata.width > maxWidth);

    if (normalizedMime === WEBP_MIME && !needsResize) {
        return {
            buffer: inputBuffer,
            mimeType: WEBP_MIME,
            extension: '.webp'
        };
    }

    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();

    if (needsResize) {
        pipeline = pipeline.resize({
            width: maxWidth,
            withoutEnlargement: true
        });
    }

    const hasAlpha = Boolean(metadata.hasAlpha);
    const webpOptions = hasAlpha
        ? { lossless: true, effort: 4 }
        : { quality, effort: 4, smartSubsample: true };

    const outputBuffer = await pipeline.webp(webpOptions).toBuffer();

    return {
        buffer: outputBuffer,
        mimeType: WEBP_MIME,
        extension: '.webp'
    };
};

/** Create upload root (and optional subfolder) if missing. */
export const ensureUploadStorageReady = async (folder = '') => {
    const root = path.resolve(config.uploadStorageRoot);
    await fs.mkdir(root, { recursive: true });

    if (folder) {
        const safeFolder = sanitizeUploadFolder(folder);
        await fs.mkdir(getAbsolutePath(safeFolder), { recursive: true });
    }

    return root;
};

export const saveImageFile = async (file, folder) => {
    if (!file?.buffer?.length) {
        throw new ValidationError('File is required');
    }

    const mimeType = String(file.mimetype || '').toLowerCase();

    // Video is stored byte-for-byte: sharp cannot read it, and there is no
    // transcoding step here. The size ceiling in the upload middleware is what
    // keeps this reasonable.
    if (VIDEO_MIME_TYPES.has(mimeType)) {
        if (!looksLikeDeclaredVideo(file.buffer, mimeType)) {
            throw new ValidationError('That file is not a valid MP4 or WebM video');
        }

        const safeVideoFolder = sanitizeUploadFolder(folder);
        const videoFilename = buildFilename(VIDEO_MIME_TYPES.get(mimeType));
        const videoRelativePath = path.posix.join(safeVideoFolder, videoFilename);

        await ensureUploadStorageReady(safeVideoFolder);
        await fs.writeFile(getAbsolutePath(videoRelativePath), file.buffer);

        return {
            url: buildPublicUrl(videoRelativePath),
            path: videoRelativePath,
            filename: videoFilename,
            mimeType,
            size: file.buffer.length
        };
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError('Only JPEG, PNG, WebP, GIF, MP4 and WebM files are allowed');
    }

    const safeFolder = sanitizeUploadFolder(folder);
    const optimized = await optimizeImageForStorage(file.buffer, mimeType);
    const filename = buildFilename(optimized.extension);
    const relativePath = path.posix.join(safeFolder, filename);
    const absolutePath = getAbsolutePath(relativePath);

    await ensureUploadStorageReady(safeFolder);
    await fs.writeFile(absolutePath, optimized.buffer);

    return {
        url: buildPublicUrl(relativePath),
        path: relativePath,
        filename,
        mimeType: optimized.mimeType,
        size: optimized.buffer.length
    };
};

export const saveImageBuffer = async (buffer, folder, options = {}) => {
    return saveImageFile(
        {
            buffer,
            mimetype: options.mimeType || 'image/jpeg',
            originalname: options.originalname || 'upload.jpg'
        },
        folder
    );
};

export const deleteStoredFile = async (relativePath) => {
    const safePath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safePath) return false;

    const absolutePath = getAbsolutePath(safePath);
    try {
        await fs.unlink(absolutePath);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
};

const inferMimeFromUrl = (url) => {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    };
    return map[ext] || 'image/jpeg';
};

export const isHostedUploadUrl = (url) => {
    const normalized = String(url || '').trim();
    if (!normalized) return false;
    const base = String(config.uploadBaseUrl || '').replace(/\/+$/, '');
    if (base && normalized.startsWith(base)) return true;
    return /\/uploads\//i.test(normalized);
};

export const saveImageFromUrl = async (imageUrl, folder) => {
    const url = String(imageUrl || '').trim();
    if (!url) {
        throw new ValidationError('Image URL is required');
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: config.uploadMaxFileSizeBytes,
        maxBodyLength: config.uploadMaxFileSizeBytes
    });

    const buffer = Buffer.from(response.data);
    const mimeType = String(response.headers['content-type'] || inferMimeFromUrl(url)).split(';')[0].trim().toLowerCase();

    return saveImageBuffer(buffer, folder, {
        mimeType,
        originalname: path.basename(new URL(url).pathname) || 'remote.jpg'
    });
};
