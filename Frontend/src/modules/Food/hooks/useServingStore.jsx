import { useState, useEffect, useCallback, useRef } from "react"
import { storeAPI } from "@food/api"

/**
 * Which dark store serves the customer, resolved from their location.
 *
 * The quick-commerce counterpart to useZone, and deliberately shaped like it. A zone
 * says whether we deliver here at all; this says which shelf the customer is actually
 * shopping from, because ten-minute delivery only exists within about 2.5 km and the
 * customer never picks the store themselves.
 *
 * Shares useZone's caching approach for the same reason: several screens ask for this
 * on mount, and without a shared cache they each fire the same request for the same
 * coordinates.
 */

const STORE_CACHE_TTL_MS = 60 * 1000
const storeCache = new Map()
const storeInFlight = new Map()

const LAST_STORE_KEY = "servingStore"

const roundCoord = (value, digits = 5) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const p = 10 ** digits
  return Math.round(n * p) / p
}

const cacheKey = (lat, lng) => {
  const rLat = roundCoord(lat, 4)
  const rLng = roundCoord(lng, 4)
  if (rLat === null || rLng === null) return null
  return `${rLat},${rLng}`
}

export function useServingStore(location) {
  const [store, setStore] = useState(null)
  const [serviceable, setServiceable] = useState(null)
  const [promiseMinutes, setPromiseMinutes] = useState(null)
  const [distanceKm, setDistanceKm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })
  const debounceRef = useRef(null)

  const apply = useCallback((data) => {
    if (data?.serviceable && data.store) {
      setStore(data.store)
      setServiceable(true)
      setPromiseMinutes(data.promiseMinutes ?? null)
      setDistanceKm(data.distanceKm ?? null)
      try {
        localStorage.setItem(LAST_STORE_KEY, JSON.stringify(data.store))
      } catch {
        // Private browsing and blocked site data both throw here. The store is
        // only cached to soften a later network failure, so losing it is harmless.
      }
      return
    }
    // Not serviceable is a real answer, not a failure: clear the store so the app
    // shows "we don't deliver here yet" rather than a stale catalogue.
    setStore(null)
    setServiceable(false)
    setPromiseMinutes(null)
    setDistanceKm(null)
    try {
      localStorage.removeItem(LAST_STORE_KEY)
    } catch { /* see above */ }
  }, [])

  const resolveStore = useCallback(
    async (lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setServiceable(null)
        setStore(null)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const key = cacheKey(lat, lng)
        const now = Date.now()
        if (key) {
          const cached = storeCache.get(key)
          if (cached && now - cached.ts < STORE_CACHE_TTL_MS) {
            apply(cached.payload)
            return
          }
        }

        const request = (() => {
          if (key && storeInFlight.has(key)) return storeInFlight.get(key)
          const promise = storeAPI
            .getServingStore(lat, lng)
            .then((response) => response?.data?.data)
            .finally(() => {
              if (key) storeInFlight.delete(key)
            })
          if (key) storeInFlight.set(key, promise)
          return promise
        })()

        const data = await request
        if (key) storeCache.set(key, { ts: now, payload: data })
        apply(data)
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Could not find a store")
        // A network failure is not the same as "we do not deliver here", and
        // rendering the out-of-service screen for one would be wrong. The last
        // known store is reused so browsing keeps working; checkout re-checks
        // serviceability server-side regardless.
        try {
          const cached = localStorage.getItem(LAST_STORE_KEY)
          if (cached) {
            setStore(JSON.parse(cached))
            setServiceable(true)
            return
          }
        } catch { /* fall through to unknown */ }
        setServiceable(null)
      } finally {
        setLoading(false)
      }
    },
    [apply],
  )

  useEffect(() => {
    const lat = roundCoord(location?.latitude, 6)
    const lng = roundCoord(location?.longitude, 6)

    // ~10 m, matching useZone. Below that the answer cannot change, and re-asking
    // on every GPS jitter would put a request behind every small movement.
    const threshold = 0.0001
    const changed =
      !prevCoordsRef.current.latitude ||
      !prevCoordsRef.current.longitude ||
      Math.abs(prevCoordsRef.current.latitude - (lat || 0)) > threshold ||
      Math.abs(prevCoordsRef.current.longitude - (lng || 0)) > threshold

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (changed) {
        prevCoordsRef.current = { latitude: lat, longitude: lng }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => resolveStore(lat, lng), 350)
      }
    } else {
      setServiceable(null)
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [location?.latitude, location?.longitude, resolveStore])

  const refreshServingStore = useCallback(() => {
    const lat = Number(location?.latitude)
    const lng = Number(location?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    // Drop the cached answer first, or a manual refresh returns the same one.
    const key = cacheKey(lat, lng)
    if (key) storeCache.delete(key)
    resolveStore(lat, lng)
  }, [location?.latitude, location?.longitude, resolveStore])

  return {
    store,
    storeId: store?._id ? String(store._id) : null,
    /** true / false / null, where null means "not resolved yet". */
    serviceable,
    promiseMinutes,
    distanceKm,
    loading,
    error,
    refreshServingStore,
  }
}
