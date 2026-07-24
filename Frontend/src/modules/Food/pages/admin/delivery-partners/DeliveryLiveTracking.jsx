import { useEffect, useMemo, useRef, useState } from "react"
import { Bike, Clock, Loader2, MapPin, RefreshCw, Search, Wifi, WifiOff } from "lucide-react"
import { Loader } from "@googlemaps/js-api-loader"
import { adminAPI } from "@food/api"
import { subscribeAllDeliveryLocations } from "@food/realtimeTracking"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"

const debugError = () => {}

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }

const toFiniteNumber = (value) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const getDeliveryId = (deliveryman) =>
  String(deliveryman?._id || deliveryman?.id || deliveryman?.deliveryId || deliveryman?.fullData?._id || "")

const getDeliveryName = (deliveryman) =>
  deliveryman?.name ||
  deliveryman?.fullName ||
  deliveryman?.fullData?.name ||
  deliveryman?.fullData?.fullName ||
  "Delivery Partner"

const getDeliveryPhone = (deliveryman) =>
  deliveryman?.phone || deliveryman?.mobile || deliveryman?.fullData?.phone || "N/A"

const isDeliveryOnlineFromDb = (deliveryman) => {
  const status = String(deliveryman?.availabilityStatus || deliveryman?.fullData?.availabilityStatus || "").toLowerCase()
  if (status === "online") return true
  if (status === "offline") return false
  return deliveryman?.isOnline === true || deliveryman?.fullData?.isOnline === true
}

const formatLastSeen = (timestamp) => {
  if (!timestamp) return "No live update yet"
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) return "No live update yet"
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

const getLocationFromPayload = (payload) => {
  const location = payload?.location || payload || {}
  const lat = toFiniteNumber(location.lat ?? location.latitude)
  const lng = toFiniteNumber(location.lng ?? location.longitude)
  const timestamp = toFiniteNumber(location.timestamp ?? location.last_updated ?? location.lastUpdate)
  const status = String(location.status || "").toLowerCase()

  return {
    lat,
    lng,
    heading: toFiniteNumber(location.heading ?? location.bearing) || 0,
    speed: toFiniteNumber(location.speed) || 0,
    accuracy: toFiniteNumber(location.accuracy),
    timestamp,
    isOnline:
      Boolean(location.isOnline) ||
      status === "online" ||
      status === "busy",
  }
}

const getDbLocationFromDeliveryman = (deliveryman) => {
  const source = deliveryman?.lastLocation || deliveryman?.fullData?.lastLocation || {}
  const coordinates = Array.isArray(source?.coordinates)
    ? source.coordinates
    : Array.isArray(deliveryman?.lastLocation?.coordinates)
      ? deliveryman.lastLocation.coordinates
      : []
  const lat = toFiniteNumber(
    source?.lat ??
    source?.latitude ??
    deliveryman?.lastLat ??
    deliveryman?.fullData?.lastLat ??
    coordinates[1],
  )
  const lng = toFiniteNumber(
    source?.lng ??
    source?.longitude ??
    deliveryman?.lastLng ??
    deliveryman?.fullData?.lastLng ??
    coordinates[0],
  )
  const timestamp =
    toFiniteNumber(source?.timestamp) ||
    toFiniteNumber(new Date(deliveryman?.lastLocationAt || deliveryman?.fullData?.lastLocationAt || "").getTime())

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    heading: toFiniteNumber(source?.heading ?? source?.bearing) || 0,
    speed: toFiniteNumber(source?.speed) || 0,
    accuracy: toFiniteNumber(source?.accuracy),
    timestamp,
    isOnline: true,
  }
}

const getFreshestLocation = (liveLocation, dbLocation) => {
  const hasLiveCoordinates = Number.isFinite(liveLocation?.lat) && Number.isFinite(liveLocation?.lng)
  const hasDbCoordinates = Number.isFinite(dbLocation?.lat) && Number.isFinite(dbLocation?.lng)
  if (!hasLiveCoordinates) return hasDbCoordinates ? dbLocation : null
  if (!hasDbCoordinates) return liveLocation

  const liveTimestamp = toFiniteNumber(liveLocation?.timestamp) || 0
  const dbTimestamp = toFiniteNumber(dbLocation?.timestamp) || 0
  return dbTimestamp >= liveTimestamp - 5000 ? dbLocation : liveLocation
}

export default function DeliveryLiveTracking() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const infoWindowRef = useRef(null)
  const geocoderRef = useRef(null)

  const [deliverymen, setDeliverymen] = useState([])
  const [locationsById, setLocationsById] = useState({})
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState("")
  const [listError, setListError] = useState("")
  const [selectedAddress, setSelectedAddress] = useState("")

  const fetchDeliverymen = async () => {
    try {
      setLoading(true)
      setListError("")
      const response = await adminAPI.getDeliveryPartners({
        page: 1,
        limit: 1000,
        status: "approved",
        isActive: true,
      })
      const rows = response?.data?.data?.deliveryPartners || []
      setDeliverymen(Array.isArray(rows) ? rows : [])
    } catch (error) {
      debugError("Failed to load delivery partners:", error)
      setListError(error?.response?.data?.message || "Failed to load delivery partners.")
      setDeliverymen([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeliverymen()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeAllDeliveryLocations(
      (deliveryNode) => {
        const nextLocations = Object.entries(deliveryNode || {}).reduce((acc, [deliveryId, payload]) => {
          acc[String(deliveryId)] = getLocationFromPayload(payload)
          return acc
        }, {})
        setLocationsById(nextLocations)
      },
      (error) => {
        debugError("Delivery location listener failed:", error)
      },
    )

    return () => {
      if (typeof unsubscribe === "function") unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadMap = async () => {
      try {
        setMapLoading(true)
        setMapError("")

        let apiKey = ""
        try {
          apiKey = await getGoogleMapsApiKey()
        } catch (error) {
          debugError("Failed to read Google Maps API key:", error)
        }

        if (!apiKey && !window.google?.maps) {
          setMapError("Google Maps API key not found. Please set VITE_GOOGLE_MAPS_API_KEY.")
          return
        }

        if (cancelled || !mapContainerRef.current) return

        const google = window.google?.maps
          ? window.google
          : await new Loader({
              apiKey,
              version: "weekly",
              libraries: ["places"],
            }).load()

        if (cancelled || !mapContainerRef.current) return

        mapRef.current = new google.maps.Map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        })
        infoWindowRef.current = new google.maps.InfoWindow()
        geocoderRef.current = new google.maps.Geocoder()
        setTimeout(() => {
          if (mapRef.current) google.maps.event.trigger(mapRef.current, "resize")
        }, 100)
      } catch (error) {
        debugError("Failed to load Google Maps:", error)
        setMapError("Failed to load Google Maps. Please verify the API key, billing, and domain restrictions.")
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    }

    loadMap()

    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current.clear()
      if (mapRef.current) {
        mapRef.current = null
      }
    }
  }, [])

  const deliveryRows = useMemo(() => {
    return deliverymen.map((deliveryman) => {
      const deliveryId = getDeliveryId(deliveryman)
      const liveLocation = locationsById[deliveryId]
      const dbLocation = getDbLocationFromDeliveryman(deliveryman)
      const freshestLocation = getFreshestLocation(liveLocation, dbLocation)
      const hasCoordinates = Number.isFinite(freshestLocation?.lat) && Number.isFinite(freshestLocation?.lng)
      const isOnline = isDeliveryOnlineFromDb(deliveryman)

      return {
        id: deliveryId,
        name: getDeliveryName(deliveryman),
        phone: getDeliveryPhone(deliveryman),
        zone: deliveryman?.zone?.name || deliveryman?.zoneName || deliveryman?.serviceZone || "N/A",
        isOnline,
        location: isOnline && hasCoordinates ? freshestLocation : null,
        lastSeen: freshestLocation?.timestamp || deliveryman?.lastLocationAt || null,
      }
    }).filter((deliveryman) => deliveryman.id)
  }, [deliverymen, locationsById])

  const filteredDeliveryRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    return deliveryRows.filter((deliveryman) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && deliveryman.isOnline) ||
        (statusFilter === "offline" && !deliveryman.isOnline)
      const matchesSearch =
        !normalizedSearch ||
        deliveryman.name.toLowerCase().includes(normalizedSearch) ||
        deliveryman.phone.toLowerCase().includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [deliveryRows, searchQuery, statusFilter])

  const selectedDeliveryman = useMemo(
    () => deliveryRows.find((deliveryman) => deliveryman.id === selectedDeliveryId) || null,
    [deliveryRows, selectedDeliveryId],
  )

  const onlineCount = deliveryRows.filter((deliveryman) => deliveryman.isOnline).length
  const offlineCount = Math.max(deliveryRows.length - onlineCount, 0)

  useEffect(() => {
    const google = window.google
    const map = mapRef.current
    if (!google?.maps || !map || mapLoading) return

    const onlineRows = deliveryRows.filter((deliveryman) => deliveryman.isOnline && deliveryman.location)
    const activeIds = new Set(onlineRows.map((deliveryman) => deliveryman.id))

    markersRef.current.forEach((marker, deliveryId) => {
      if (!activeIds.has(deliveryId)) {
        marker.setMap(null)
        markersRef.current.delete(deliveryId)
      }
    })

    const bounds = new google.maps.LatLngBounds()

    onlineRows.forEach((deliveryman) => {
      const position = {
        lat: deliveryman.location.lat,
        lng: deliveryman.location.lng,
      }
      bounds.extend(position)

      let marker = markersRef.current.get(deliveryman.id)
      if (!marker) {
        marker = new google.maps.Marker({
          map,
          position,
          title: deliveryman.name,
          label: {
            text: "D",
            color: "#ffffff",
            fontWeight: "700",
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#16a34a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
            scale: 12,
          },
        })
        marker.addListener("click", () => {
          setSelectedDeliveryId(deliveryman.id)
        })
        markersRef.current.set(deliveryman.id, marker)
      }

      marker.setPosition(position)
      marker.setTitle(deliveryman.name)

      marker.deliveryInfoContent = `
        <div style="min-width:190px;padding:4px;">
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${deliveryman.name}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:4px;">${deliveryman.phone}</div>
          <div style="font-size:12px;color:#16a34a;font-weight:700;">Online</div>
        </div>
      `
    })

    if (selectedDeliveryman?.isOnline && selectedDeliveryman.location) {
      map.panTo({
        lat: selectedDeliveryman.location.lat,
        lng: selectedDeliveryman.location.lng,
      })
      map.setZoom(Math.max(map.getZoom() || 14, 14))
    } else if (onlineRows.length > 0 && !selectedDeliveryId) {
      map.fitBounds(bounds, { top: 32, right: 32, bottom: 32, left: 32 })
    }
  }, [deliveryRows, selectedDeliveryId, selectedDeliveryman, mapLoading])

  useEffect(() => {
    const map = mapRef.current
    const infoWindow = infoWindowRef.current
    const marker = markersRef.current.get(selectedDeliveryId)

    if (!map || !infoWindow || !selectedDeliveryman?.isOnline || !selectedDeliveryman.location || !marker) {
      return
    }

    infoWindow.setContent(marker.deliveryInfoContent || selectedDeliveryman.name)
    infoWindow.open(map, marker)
  }, [selectedDeliveryId, selectedDeliveryman])

  useEffect(() => {
    let cancelled = false
    setSelectedAddress("")

    if (!selectedDeliveryman?.isOnline || !selectedDeliveryman.location || !geocoderRef.current) return

    const loadAddress = async () => {
      const lat = selectedDeliveryman.location.lat.toFixed(6)
      const lng = selectedDeliveryman.location.lng.toFixed(6)
      try {
        const results = await geocoderRef.current.geocode({
          location: {
            lat: Number(lat),
            lng: Number(lng),
          },
        })
        if (!cancelled) {
          setSelectedAddress(results?.results?.[0]?.formatted_address || `${lat}, ${lng}`)
        }
      } catch (error) {
        debugError("Google reverse geocode failed:", error)
        if (!cancelled) setSelectedAddress(`${lat}, ${lng}`)
      }
    }

    loadAddress()

    return () => {
      cancelled = true
    }
  }, [selectedDeliveryman])

  return (
    <div className="min-h-screen bg-slate-50 p-3 lg:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Delivery Live Tracking</h1>
              <p className="text-sm text-slate-600">Monitor online and offline delivery partners with live map locations.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchDeliverymen}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh List
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[380px_1fr] lg:items-stretch">
        <section className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-214px)]">
          <div className="border-b border-slate-100 p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-xs text-slate-500">All</p>
                <p className="text-lg font-bold text-slate-900">{deliveryRows.length}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2.5">
                <p className="text-xs text-emerald-700">Online</p>
                <p className="text-lg font-bold text-emerald-700">{onlineCount}</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-2.5">
                <p className="text-xs text-slate-600">Offline</p>
                <p className="text-lg font-bold text-slate-700">{offlineCount}</p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {["all", "online", "offline"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                    statusFilter === filter
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search delivery partner..."
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading delivery partners...
              </div>
            )}

            {!loading && listError && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{listError}</div>
            )}

            {!loading && !listError && filteredDeliveryRows.length === 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No delivery partners found for this filter.
              </div>
            )}

            {!loading && !listError && filteredDeliveryRows.map((deliveryman) => (
              <button
                key={deliveryman.id}
                type="button"
                onClick={() => setSelectedDeliveryId(deliveryman.id)}
                className={`mb-2.5 w-full rounded-xl border p-3 text-left transition ${
                  selectedDeliveryId === deliveryman.id
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{deliveryman.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{deliveryman.phone}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                    deliveryman.isOnline
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {deliveryman.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {deliveryman.isOnline ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {formatLastSeen(deliveryman.lastSeen)}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-214px)]">
          <div className="border-b border-slate-100 p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Online Delivery Map</h2>
                <p className="text-xs text-slate-500">Google Maps shows online delivery partners only.</p>
              </div>
              {selectedDeliveryman && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-900">{selectedDeliveryman.name}</p>
                  <p className="text-slate-500">
                    {selectedDeliveryman.isOnline ? "Selected online location" : "Selected partner is offline"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,4fr)_112px] gap-3 p-3">
            <div className="relative min-h-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
              <div ref={mapContainerRef} className="h-full w-full" />

              {(mapLoading || mapError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                  <div className="p-6 text-center">
                    {mapLoading ? (
                      <>
                        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-600" />
                        <p className="text-sm text-slate-600">Loading Google Map...</p>
                      </>
                    ) : (
                      <>
                        <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-700">{mapError}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <aside className="min-h-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2">
              {selectedDeliveryman?.isOnline && selectedDeliveryman.location ? (
                <div className="grid h-full min-h-0 gap-2 md:grid-cols-2">
                  <div className="min-h-0 overflow-hidden rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Written Location</p>
                    <p className="mt-1 max-h-[58px] overflow-y-auto pr-1 text-sm font-semibold leading-snug text-slate-900">
                      {selectedAddress || "Finding address..."}
                    </p>
                  </div>
                  <div className="min-h-0 overflow-hidden rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last Updated</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatLastSeen(selectedDeliveryman.lastSeen)}</p>
                    <p className="mt-1 truncate text-xs text-slate-500" title={`${selectedDeliveryman.name} · ${selectedDeliveryman.location.lat.toFixed(5)}, ${selectedDeliveryman.location.lng.toFixed(5)}`}>
                      {selectedDeliveryman.name} · {selectedDeliveryman.location.lat.toFixed(5)}, {selectedDeliveryman.location.lng.toFixed(5)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
                  Select an online delivery partner to view written location and last update.
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </div>
  )
}
