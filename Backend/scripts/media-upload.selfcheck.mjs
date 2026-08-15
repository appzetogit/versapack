/**
 * Guards banner media handling.
 *
 * The risk here is not a broken banner, it is hosting active content on our own
 * origin: the mimetype on a multipart upload is chosen by the client, so a file
 * is only video because its bytes say so. These uploads are written under the
 * same domain the app is served from.
 *
 *   node scripts/media-upload.selfcheck.mjs
 */
import assert from 'node:assert/strict';

// Mirrors looksLikeDeclaredVideo in storage.service.js.
const looksLikeDeclaredVideo = (buffer, mimeType) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    if (mimeType === 'video/webm') {
        return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    }
    return buffer.toString('ascii', 4, 8) === 'ftyp';
};

const mp4 = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypmp42', 'ascii'),
    Buffer.alloc(8),
]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);

// Genuine files pass.
assert.equal(looksLikeDeclaredVideo(mp4, 'video/mp4'), true);
assert.equal(looksLikeDeclaredVideo(webm, 'video/webm'), true);

// HTML claiming to be video must not be written to our own origin — this is the
// case the check exists for.
const html = Buffer.from('<html><script>alert(document.cookie)</script></html>', 'utf8');
assert.equal(looksLikeDeclaredVideo(html, 'video/mp4'), false);
assert.equal(looksLikeDeclaredVideo(html, 'video/webm'), false);

// Neither may an SVG, which browsers execute script inside.
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>', 'utf8');
assert.equal(looksLikeDeclaredVideo(svg, 'video/mp4'), false);

// Truncated or empty input must be rejected, not crash on a short read.
assert.equal(looksLikeDeclaredVideo(Buffer.alloc(0), 'video/mp4'), false);
assert.equal(looksLikeDeclaredVideo(Buffer.from('ftyp'), 'video/mp4'), false);
assert.equal(looksLikeDeclaredVideo(null, 'video/mp4'), false);
assert.equal(looksLikeDeclaredVideo(undefined, 'video/webm'), false);

// A real MP4 must not pass as WebM: the extension written to disk comes from
// the declared type, so a mismatch would produce a file browsers cannot play.
assert.equal(looksLikeDeclaredVideo(mp4, 'video/webm'), false);
assert.equal(looksLikeDeclaredVideo(webm, 'video/mp4'), false);

// Render-side type detection, mirroring the frontend helper. Existing banners
// carry no type field, so the stored URL extension is the only signal.
const isVideoUrl = (url) => /\.(mp4|webm)(\?|#|$)/i.test(String(url || ''));
assert.equal(isVideoUrl('/uploads/banners/123-abc.mp4'), true);
assert.equal(isVideoUrl('https://quick.appzeto.com/uploads/b/1.webm?v=2'), true);
assert.equal(isVideoUrl('/uploads/banners/123-abc.gif'), false, 'a GIF is an image and must render in <img>');
assert.equal(isVideoUrl('/uploads/banners/123-abc.webp'), false);
assert.equal(isVideoUrl(''), false);
assert.equal(isVideoUrl(null), false);
// Not fooled by a filename that merely mentions a video extension.
assert.equal(isVideoUrl('/uploads/banners/mp4-promo.webp'), false);

console.log('media upload selfcheck: PASS');
