/**
 * Road (driving) distances via Google Maps JS.
 * User home / restaurant details must match delivery new-order Rest→User,
 * which is road distance (~7.7) not Haversine straight-line (~6.9).
 */

import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { parseGeoPoint } from "@food/utils/geo"

let mapsLoadPromise = null

export function formatDistanceLabel(km) {
  if (km == null || !Number.isFinite(Number(km))) return null
  const value = Number(km)
  if (value >= 1) return `${value.toFixed(1)} km`
  return `${Math.round(value * 1000)} m`
}

export function toLatLngLiteral(entity) {
  const point = parseGeoPoint(entity)
  if (!point) return null
  return { lat: point.lat, lng: point.lng }
}

export async function ensureGoogleMapsLoaded() {
  if (typeof window === "undefined") return false
  if (window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService) {
    return true
  }

  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = (async () => {
    const apiKey = await getGoogleMapsApiKey()
    if (!apiKey) return false

    const existing = Array.from(document.getElementsByTagName("script")).find((s) =>
      s.src?.includes("maps.googleapis.com/maps/api/js"),
    )
    if (existing) {
      if (window.google?.maps) return true
      await new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("maps script failed")), {
          once: true,
        })
      }).catch(() => false)
      return Boolean(window.google?.maps?.DirectionsService)
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("maps script failed"))
      document.head.appendChild(script)
    }).catch(() => null)

    return Boolean(window.google?.maps?.DirectionsService)
  })()

  const ok = await mapsLoadPromise
  if (!ok) mapsLoadPromise = null
  return ok
}

/**
 * Single origin → destination driving distance (km).
 */
export async function fetchDrivingDistanceKm(originEntity, destinationEntity) {
  const origin = toLatLngLiteral(originEntity)
  const destination = toLatLngLiteral(destinationEntity)
  if (!origin || !destination) return null

  const loaded = await ensureGoogleMapsLoaded()
  if (!loaded || !window.google?.maps?.DirectionsService) return null

  return new Promise((resolve) => {
    const service = new window.google.maps.DirectionsService()
    service.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK" || !result?.routes?.[0]?.legs?.length) {
          resolve(null)
          return
        }
        let meters = 0
        for (const leg of result.routes[0].legs) {
          meters += leg.distance?.value || 0
        }
        if (meters <= 0) {
          resolve(null)
          return
        }
        resolve(Number((meters / 1000).toFixed(2)))
      },
    )
  })
}

/**
 * One origin → many destinations driving distances (km).
 * Returns array aligned with destinations (null when element failed).
 */
export async function fetchDrivingDistancesMatrix(originEntity, destinationEntities = []) {
  const origin = toLatLngLiteral(originEntity)
  if (!origin || !Array.isArray(destinationEntities) || destinationEntities.length === 0) {
    return []
  }

  const destinations = destinationEntities.map((entity) => toLatLngLiteral(entity))
  const loaded = await ensureGoogleMapsLoaded()
  if (!loaded || !window.google?.maps?.DistanceMatrixService) {
    // Fallback: sequential Directions (slower, still better than Haversine-only).
    const results = []
    for (const dest of destinationEntities) {
      results.push(await fetchDrivingDistanceKm(originEntity, dest))
    }
    return results
  }

  const service = new window.google.maps.DistanceMatrixService()
  const chunkSize = 25
  const out = new Array(destinations.length).fill(null)

  for (let start = 0; start < destinations.length; start += chunkSize) {
    const slice = destinations.slice(start, start + chunkSize)
    const validIndexes = []
    const validDests = []
    slice.forEach((dest, i) => {
      if (dest) {
        validIndexes.push(start + i)
        validDests.push(dest)
      }
    })
    if (validDests.length === 0) continue

    // eslint-disable-next-line no-await-in-loop
    const chunkResults = await new Promise((resolve) => {
      service.getDistanceMatrix(
        {
          origins: [origin],
          destinations: validDests,
          travelMode: window.google.maps.TravelMode.DRIVING,
          unitSystem: window.google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          if (status !== "OK" || !response?.rows?.[0]?.elements) {
            resolve(validDests.map(() => null))
            return
          }
          const elements = response.rows[0].elements
          resolve(
            elements.map((el) => {
              if (el?.status !== "OK" || !el.distance?.value) return null
              return Number((el.distance.value / 1000).toFixed(2))
            }),
          )
        },
      )
    })

    chunkResults.forEach((km, i) => {
      out[validIndexes[i]] = km
    })
  }

  return out
}
