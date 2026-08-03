/**
 * Grocery-delivery artwork for the admin auth screens.
 *
 * Drawn inline rather than loaded as a photo: a hotlinked stock image adds a
 * third-party request to the login page, breaks when the host rotates it, and
 * cannot pick up the tenant's theme colour. This scales to any viewport, loads
 * with the bundle, and recolours itself.
 */
export default function QuickCommerceArt({ accent = "#22C55E", className = "" }) {
  return (
    <svg
      viewBox="0 0 340 300"
      fill="none"
      className={className}
      role="img"
      aria-label="A grocery bag filled with fresh produce, delivered at speed"
    >
      <defs>
        <linearGradient id="qc-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C98A4B" />
          <stop offset="100%" stopColor="#A96F36" />
        </linearGradient>
        <linearGradient id="qc-bagfold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E0A264" />
          <stop offset="100%" stopColor="#C98A4B" />
        </linearGradient>
        <linearGradient id="qc-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Halo behind the bag */}
      <circle cx="186" cy="150" r="118" fill="url(#qc-glow)" />

      {/* Speed lines — the whole promise of the product in three strokes */}
      <g stroke={accent} strokeLinecap="round" opacity="0.85">
        <path d="M14 132h54" strokeWidth="7" opacity="0.9" />
        <path d="M30 158h40" strokeWidth="7" opacity="0.55" />
        <path d="M44 184h26" strokeWidth="7" opacity="0.3" />
      </g>

      {/* Leafy greens */}
      <g>
        <path d="M150 96c-14-16-34-18-44-10 6 14 24 24 42 20z" fill="#3FA45B" />
        <path d="M152 98c-4-22 8-38 22-40 6 16 0 36-18 44z" fill="#4FBE6C" />
        <path d="M156 100c10-14 28-16 38-10-6 12-22 20-36 16z" fill="#3FA45B" />
        <path d="M154 100v22" stroke="#2F7D45" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* Bottle */}
      <g>
        <rect x="196" y="70" width="16" height="12" rx="3" fill="#8FB8D9" />
        <path d="M195 82h18l5 16v30h-28V98z" fill="#A8CDE8" />
        <rect x="192" y="106" width="26" height="14" rx="2" fill="#EAF3FA" opacity="0.9" />
      </g>

      {/* Baguette */}
      <g transform="rotate(18 236 108)">
        <rect x="222" y="74" width="20" height="62" rx="10" fill="#D9A566" />
        <g stroke="#B9863F" strokeWidth="3" strokeLinecap="round">
          <path d="M228 88l8-5M228 100l8-5M228 112l8-5" />
        </g>
      </g>

      {/* Bag body */}
      <path d="M104 118h164l-11 150a14 14 0 0 1-14 13H129a14 14 0 0 1-14-13z" fill="url(#qc-bag)" />
      {/* Bag fold */}
      <path d="M100 112h172a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H100a6 6 0 0 1-6-6v-22a6 6 0 0 1 6-6z" fill="url(#qc-bagfold)" />
      {/* Handles */}
      <g stroke="#8A5A2B" strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M138 112c0-26 14-40 32-40s32 14 32 40" />
      </g>

      {/* Fruit resting in front of the bag */}
      <circle cx="146" cy="196" r="26" fill="#E2574C" />
      <path d="M146 172c4-8 12-10 16-8-2 8-8 12-16 10z" fill="#4FBE6C" />
      <circle cx="200" cy="204" r="21" fill="#EE9B3A" />
      <circle cx="238" cy="196" r="16" fill="#8E5FBF" />

      {/* Speed badge */}
      <g transform="translate(232 232)">
        <rect x="0" y="0" width="86" height="34" rx="17" fill={accent} />
        <circle cx="21" cy="17" r="9" fill="none" stroke="#08120C" strokeWidth="2.5" />
        <path d="M21 12v5l3 3" stroke="#08120C" strokeWidth="2.5" strokeLinecap="round" />
        <text
          x="38"
          y="22"
          fill="#08120C"
          fontSize="14"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          10 min
        </text>
      </g>
    </svg>
  )
}
