/**
 * Placeholders for a store that has not uploaded an image yet.
 *
 * These replace hot-linked stock photographs of a burger and a pizza. Two
 * things were wrong with those: a grocery seller is not a takeaway, and a
 * photograph in the frame reads as *this store's* photograph — a seller with no
 * cover image appeared to have one, so nobody uploaded a real one.
 *
 * Inline SVG rather than a file: no network request, nothing to 404, and it
 * renders identically offline.
 */

const svg = (markup) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(markup.replace(/\s+/g, ' ').trim())}`;

/** Wide banner for the top of a store profile. */
export const STORE_COVER_PLACEHOLDER = svg(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F1F5F9"/>
        <stop offset="100%" stop-color="#E2E8F0"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#g)"/>
    <g transform="translate(400 140)" fill="none" stroke="#94A3B8" stroke-width="6"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M-46 -18 h92 l-8 66 a10 10 0 0 1 -10 9 h-56 a10 10 0 0 1 -10 -9 z"/>
      <path d="M-24 -18 c0 -18 10 -28 24 -28 s24 10 24 28"/>
    </g>
    <text x="400" y="232" text-anchor="middle" fill="#94A3B8"
          font-family="system-ui, -apple-system, sans-serif" font-size="19">
      Add a photo of your store
    </text>
  </svg>
`);

/** Square avatar for the store's logo or shopfront. */
export const STORE_AVATAR_PLACEHOLDER = svg(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" rx="16" fill="#F1F5F9"/>
    <g transform="translate(100 96)" fill="none" stroke="#94A3B8" stroke-width="7"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M-38 -14 h76 l-7 56 a9 9 0 0 1 -9 8 h-45 a9 9 0 0 1 -9 -8 z"/>
      <path d="M-20 -14 c0 -15 9 -24 20 -24 s20 9 20 24"/>
    </g>
  </svg>
`);
