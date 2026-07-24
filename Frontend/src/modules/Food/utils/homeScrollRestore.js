const STORAGE_KEY = "food_user_home_scroll_v1";
const MAX_AGE_MS = 30 * 60 * 1000;

/** In-memory pending restore — survives route effects better than storage alone. */
let memoryPending = null;

/**
 * Full restaurant list snapshot for SPA back-navigation.
 * Kept in memory only (too large for sessionStorage).
 */
let memorySnapshot = null;

export function isUserHomePath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return (
    normalized === "/food/user" ||
    normalized === "/user" ||
    normalized === "/food"
  );
}

function normalizeFilters(input) {
  if (!input || typeof input !== "object") return null;
  const activeFilters = Array.isArray(input.activeFilters)
    ? input.activeFilters.map(String).filter(Boolean)
    : [];
  return {
    activeFilters,
    sortBy: input.sortBy ?? null,
    selectedCuisine: input.selectedCuisine ?? null,
  };
}

function normalizeState(input = {}) {
  return {
    scrollY: Math.max(0, Math.round(Number(input.scrollY) || 0)),
    visibleCount: Math.max(0, Math.round(Number(input.visibleCount) || 0)),
    filters: normalizeFilters(input.filters),
    lock: Boolean(input.lock),
    ts: Number(input.ts) || Date.now(),
  };
}

function isUsable(state) {
  if (!state) return false;
  if (state.ts && Date.now() - state.ts > MAX_AGE_MS) return false;
  return state.scrollY > 0 || state.visibleCount > 0;
}

function readScrollY() {
  if (typeof window === "undefined") return 0;
  return (
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement?.scrollTop ||
    document.body?.scrollTop ||
    0
  );
}

/**
 * Prefer an existing locked/high-quality pending state over a worse overwrite
 * (e.g. Home unmount after ScrollToTop already zeroed the window).
 */
function mergeWithExisting(next) {
  const existing = memoryPending;
  if (!existing || !isUsable(existing)) return next;

  const ageMs = Math.abs((next.ts || Date.now()) - (existing.ts || 0));
  const withinWindow = ageMs < 15_000;

  if (existing.lock || withinWindow) {
    if (next.scrollY < existing.scrollY) {
      next.scrollY = existing.scrollY;
    }
    if (next.visibleCount < existing.visibleCount) {
      next.visibleCount = existing.visibleCount;
    }
    if (!next.filters && existing.filters) {
      next.filters = existing.filters;
    }
    if (existing.lock) {
      next.lock = true;
    }
  }

  return next;
}

export function saveHomeScrollState({
  scrollY = 0,
  visibleCount = 0,
  filters = null,
  lock = false,
} = {}) {
  if (typeof window === "undefined") return;

  let next = normalizeState({
    scrollY,
    visibleCount,
    filters,
    lock: lock || memoryPending?.lock,
    ts: Date.now(),
  });
  next = mergeWithExisting(next);

  if (!isUsable(next)) {
    // Don't wipe a locked pending restore with an empty payload.
    if (memoryPending?.lock && isUsable(memoryPending)) return;
    memoryPending = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }

  memoryPending = next;

  try {
    // Persist compact fields only (not the restaurant snapshot).
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scrollY: next.scrollY,
        visibleCount: next.visibleCount,
        filters: next.filters,
        lock: next.lock,
        ts: next.ts,
      }),
    );
  } catch {
    // Ignore quota / private mode errors — memory still holds it
  }
}

export function peekHomeScrollState() {
  if (memoryPending && isUsable(memoryPending)) {
    return { ...memoryPending, filters: memoryPending.filters };
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeState(JSON.parse(raw));
    if (!isUsable(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY);
      memoryPending = null;
      return null;
    }
    memoryPending = parsed;
    return { ...parsed, filters: parsed.filters };
  } catch {
    return null;
  }
}

export function stashHomePageSnapshot(snapshot = {}) {
  const restaurantsData = Array.isArray(snapshot.restaurantsData)
    ? snapshot.restaurantsData
    : null;
  if (!restaurantsData || restaurantsData.length === 0) return;
  memorySnapshot = {
    restaurantsData,
    ts: Date.now(),
  };
}

export function peekHomePageSnapshot() {
  if (!memorySnapshot) return null;
  if (Date.now() - (memorySnapshot.ts || 0) > MAX_AGE_MS) {
    memorySnapshot = null;
    return null;
  }
  return memorySnapshot;
}

export function clearHomeScrollState() {
  memoryPending = null;
  memorySnapshot = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function shouldSkipScrollResetForHome(pathname) {
  if (!isUserHomePath(pathname)) return false;
  const pending = peekHomeScrollState();
  // Only skip the global scroll-to-top when we have a real Y to restore.
  return Boolean(pending && pending.scrollY > 0);
}

/** Capture current window scroll for home before navigating away. */
export function captureHomeScrollBeforeLeave(
  visibleCount,
  { filters = null, lock = true } = {},
) {
  if (typeof window === "undefined") return;
  saveHomeScrollState({
    scrollY: readScrollY(),
    visibleCount: visibleCount || 0,
    filters,
    lock: lock !== false,
  });
}
