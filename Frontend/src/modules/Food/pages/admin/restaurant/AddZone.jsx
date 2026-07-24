import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, ArrowLeft, Save, X, Shapes, Search } from "lucide-react"
import { adminAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function AddZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = !!id && !window.location.pathname.includes('/view/')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)
  const pathMarkersRef = useRef([])
  const draftPolylineRef = useRef(null)
  const mapClickListenerRef = useRef(null)
  const polygonListenersRef = useRef([])
  const isDrawingRef = useRef(false)
  const coordinatesRef = useRef([])
  
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    country: "India",
    zoneName: "",
    unit: "kilometer",
  })
  
  const [coordinates, setCoordinates] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [existingZones, setExistingZones] = useState([])
  const autocompleteInputRef = useRef(null)
  const autocompleteServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const suggestionsDebounceRef = useRef(null)
  const existingZonesPolygonsRef = useRef([])

  useEffect(() => {
    coordinatesRef.current = coordinates
  }, [coordinates])

  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  useEffect(() => {
    return () => {
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current)
        suggestionsDebounceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    fetchExistingZones()
    loadGoogleMaps()
    if (isEditMode && id) {
      fetchZone()
    }
  }, [id, isEditMode])

  // Center map on India when country is selected
  useEffect(() => {
    if (formData.country === "India" && mapInstanceRef.current) {
      const indiaCenter = { lat: 20.5937, lng: 78.9629 }
      mapInstanceRef.current.setCenter(indiaCenter)
      mapInstanceRef.current.setZoom(5)
    }
  }, [formData.country])

  // Initialize Places Autocomplete when map is loaded
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && autocompleteInputRef.current && window.google?.maps?.places) {
      if (!autocompleteServiceRef.current && window.google.maps.places.AutocompleteService) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
      }
      if (!placesServiceRef.current && window.google.maps.places.PlacesService) {
        placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current)
      }
    }
  }, [mapLoading])

  // Draw existing polygon when in edit mode and coordinates are loaded
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      debugLog("Drawing existing polygon in edit mode, coordinates:", coordinates.length)
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          setIsDrawing(false)
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }, [isEditMode, coordinates.length, mapLoading])


  const fetchExistingZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 })
      if (response.data?.success && response.data.data?.zones) {
        // Filter out the current zone if in edit mode
        const zones = isEditMode && id 
          ? response.data.data.zones.filter(zone => zone._id !== id)
          : response.data.data.zones
        setExistingZones(zones)
      }
    } catch (error) {
      debugError("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZoneById(id)
      if (response.data?.success && response.data.data?.zone) {
        const zoneData = response.data.data.zone
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
        })
        
        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
        }
      }
    } catch (error) {
      debugError("Error fetching zone:", error)
      alert("Failed to load zone")
      navigate("/admin/food/zone-setup")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey || "loaded")
      
      // Wait for Google Maps to be loaded from main.jsx if it's loading
      let retries = 0
      const maxRetries = 50 // Wait up to 5 seconds (50 * 100ms)
      
      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      // If Google Maps is already loaded, make sure Places is available too.
      if (window.google && window.google.maps) {
        if (!window.google.maps.places?.Autocomplete) {
          if (typeof window.google.maps.importLibrary === "function") {
            await window.google.maps.importLibrary("places")
          } else {
            const scripts = Array.from(document.getElementsByTagName("script"))
            const mapsScript = scripts.find((s) => s.src?.includes("maps.googleapis.com/maps/api/js"))
            if (mapsScript && !mapsScript.src.includes("libraries=places")) {
              mapsScript.remove()
              delete window.google
            }
          }
        }
      }

      if (window.google && window.google.maps) {
        initializeMap(window.google)
        return
      }

      // If Google Maps is not loaded yet and we have an API key, use Loader as fallback
      if (apiKey) {
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "geometry"]
        })

        const google = await loader.load()
        initializeMap(google)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    // Initial location (India center)
    const initialLocation = { lat: 20.5937, lng: 78.9629 }

    // Create map
    const map = new google.maps.Map(mapRef.current, {
      center: initialLocation,
      zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true, // Enable mouse wheel zoom
      gestureHandling: 'greedy', // Allow zoom with mouse wheel and touch gestures
      disableDoubleClickZoom: false, // Allow double-click zoom
    })

    mapInstanceRef.current = map

    mapClickListenerRef.current?.remove?.()
    mapClickListenerRef.current = map.addListener('click', (event) => {
      if (!isDrawingRef.current) return

      const nextCoords = [
        ...coordinatesRef.current,
        {
          latitude: parseFloat(event.latLng.lat().toFixed(6)),
          longitude: parseFloat(event.latLng.lng().toFixed(6))
        }
      ]

      setCoordinates(nextCoords)
      updateDraftPath(google, map, nextCoords)
    })

    setMapLoading(false)

    // Existing zones will be drawn by useEffect when data is ready

    // If in edit mode and coordinates are already loaded, draw the polygon
    if (isEditMode && coordinates.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500) // Small delay to ensure map is fully loaded
    }
  }

  // Draw existing zones on the map
  const drawExistingZonesOnMap = (google, map) => {
    if (!existingZones || existingZones.length === 0) return

    // Clear previous existing zone polygons
    existingZonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    existingZonesPolygonsRef.current = []

    existingZones.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      // Convert coordinates to LatLng array
      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      // Create polygon for existing zone with different color (gray/blue)
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6", // Blue color for existing zones
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15, // Lighter opacity so new zone stands out
        editable: false, // Not editable
        draggable: false,
        clickable: true,
        zIndex: 0 // Lower z-index so new zone appears on top
      })

      polygon.setMap(map)
      existingZonesPolygonsRef.current.push(polygon)

      // Add info window on click
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>${zone.name || zone.zoneName || 'Unnamed Zone'}</strong><br/>
            <small>Country: ${zone.country || 'N/A'}</small>
          </div>
        `
      })

      polygon.addListener('click', () => {
        infoWindow.setPosition(polygon.getPath().getAt(0))
        infoWindow.open(map)
      })
    })
  }

  // Redraw existing zones when zones data changes or map is ready
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current)
    }
  }, [existingZones, mapLoading])

  useEffect(() => {
    return () => {
      mapClickListenerRef.current?.remove?.()
      clearPolygonListeners()
    }
  }, [])

  const clearPathMarkers = () => {
    if (pathMarkersRef.current.length > 0) {
      pathMarkersRef.current.forEach(marker => marker.setMap(null))
      pathMarkersRef.current = []
    }
  }

  const clearDraftPath = () => {
    if (draftPolylineRef.current) {
      draftPolylineRef.current.setMap(null)
      draftPolylineRef.current = null
    }
  }

  const clearPolygonListeners = () => {
    if (polygonListenersRef.current.length > 0) {
      polygonListenersRef.current.forEach(listener => listener?.remove?.())
      polygonListenersRef.current = []
    }
  }

  const createVertexMarker = (google, map, position, index) => (
    new google.maps.Marker({
      position,
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#9333ea",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      },
      zIndex: 1000,
      title: `Point ${index + 1}`
    })
  )

  const renderPathMarkers = (google, map, coords) => {
    clearPathMarkers()

    pathMarkersRef.current = coords
      .map((coord, index) => {
        const lat = typeof coord === 'object' ? (coord.latitude ?? coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude ?? coord.lng) : null
        if (lat === null || lng === null) return null
        return createVertexMarker(google, map, { lat, lng }, index)
      })
      .filter(Boolean)
  }

  const extractCoordinatesFromPath = (path) => {
    const nextCoords = []

    for (let i = 0; i < path.getLength(); i++) {
      const latLng = path.getAt(i)
      nextCoords.push({
        latitude: parseFloat(latLng.lat().toFixed(6)),
        longitude: parseFloat(latLng.lng().toFixed(6))
      })
    }

    return nextCoords
  }

  const updateDraftPath = (google, map, coords) => {
    clearPathMarkers()
    clearDraftPath()

    if (!coords || coords.length === 0) return

    renderPathMarkers(google, map, coords)

    if (coords.length < 2) return

    const path = coords.map(coord => ({
      lat: coord.latitude ?? coord.lat,
      lng: coord.longitude ?? coord.lng
    }))

    draftPolylineRef.current = new google.maps.Polyline({
      path,
      map,
      strokeColor: "#9333ea",
      strokeOpacity: 0.9,
      strokeWeight: 3,
      clickable: false
    })
  }

  const attachPolygonEditListeners = (google, map, polygon) => {
    clearPolygonListeners()

    const handlePolygonEdit = () => {
      const nextCoords = extractCoordinatesFromPath(polygon.getPath())
      setCoordinates(nextCoords)
      renderPathMarkers(google, map, nextCoords)
    }

    const polygonPath = polygon.getPath()
    polygonListenersRef.current = [
      google.maps.event.addListener(polygonPath, 'set_at', handlePolygonEdit),
      google.maps.event.addListener(polygonPath, 'insert_at', handlePolygonEdit),
      google.maps.event.addListener(polygonPath, 'remove_at', handlePolygonEdit)
    ]
  }

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) {
      debugLog("drawExistingPolygon: Not enough coordinates", coords?.length)
      return
    }

    debugLog("drawExistingPolygon: Drawing polygon with", coords.length, "coordinates")

    // Clear existing polygon
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
    }

    clearPolygonListeners()
    clearPathMarkers()
    clearDraftPath()

    // Convert coordinates to LatLng array
    const path = coords.map(coord => {
      const lat = typeof coord === 'object' ? (coord.latitude ?? coord.lat) : null
      const lng = typeof coord === 'object' ? (coord.longitude ?? coord.lng) : null
      if (lat === null || lng === null) {
        debugError("Invalid coordinate in drawExistingPolygon:", coord)
        return null
      }
      return new google.maps.LatLng(lat, lng)
    }).filter(Boolean)

    if (path.length < 3) {
      debugError("Not enough valid coordinates after conversion")
      return
    }

    // Create polygon
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#9333ea",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: "#9333ea",
      fillOpacity: 0.35,
      editable: true,
      draggable: false,
      clickable: false
    })

    polygon.setMap(map)
    polygonRef.current = polygon
    
    // Ensure polygon is editable
    polygon.setEditable(true)
    polygon.setDraggable(false)
    debugLog("Polygon created and set to editable:", polygon.getEditable())

    // Fit map to polygon bounds
    const bounds = new google.maps.LatLngBounds()
    path.forEach(latLng => bounds.extend(latLng))
    map.fitBounds(bounds)
    debugLog("Map fitted to polygon bounds")

    renderPathMarkers(google, map, coords)
    debugLog("drawExistingPolygon: Polygon and markers created successfully")
    attachPolygonEditListeners(google, map, polygon)
    debugLog("Event listeners attached for polygon editing")
  }

  const toggleDrawingMode = () => {
    if (isDrawing) {
      setIsDrawing(false)
    } else {
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }
      clearPolygonListeners()
      clearDraftPath()
      setCoordinates([])
      setIsDrawing(true)
    }
  }

  const handleFinishDrawing = () => {
    if (!window.google || !mapInstanceRef.current || coordinatesRef.current.length < 3) return

    drawExistingPolygon(window.google, mapInstanceRef.current, coordinatesRef.current)
    setIsDrawing(false)
  }

  const handleUndoLastPoint = () => {
    if (!window.google || !mapInstanceRef.current || coordinatesRef.current.length === 0) return

    const nextCoords = coordinatesRef.current.slice(0, -1)
    setCoordinates(nextCoords)
    updateDraftPath(window.google, mapInstanceRef.current, nextCoords)
  }

  const clearDrawing = () => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    clearPolygonListeners()
    clearPathMarkers()
    clearDraftPath()
    setIsDrawing(false)
    setCoordinates([])
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleLocationSearchChange = (value) => {
    setLocationSearch(value)
    setShowSuggestions(true)

    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current)
      suggestionsDebounceRef.current = null
    }

    const query = String(value || "").trim()
    if (!query || !autocompleteServiceRef.current || !window.google?.maps?.places?.PlacesServiceStatus) {
      setSearchSuggestions([])
      return
    }

    suggestionsDebounceRef.current = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "in" },
          types: ["geocode"],
        },
        (predictions = [], status) => {
          const ok = status === window.google?.maps?.places?.PlacesServiceStatus?.OK
          setSearchSuggestions(ok ? predictions.slice(0, 6) : [])
        },
      )
    }, 180)
  }

  const handleSuggestionSelect = (suggestion) => {
    if (!suggestion?.place_id || !placesServiceRef.current) return

    placesServiceRef.current.getDetails(
      {
        placeId: suggestion.place_id,
        fields: ["geometry", "formatted_address", "name"],
      },
      (place, status) => {
        if (
          status === window.google?.maps?.places?.PlacesServiceStatus?.OK &&
          place?.geometry?.location &&
          mapInstanceRef.current
        ) {
          const location = place.geometry.location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(15)
          setLocationSearch(place.formatted_address || place.name || "")
          setSearchSuggestions([])
          setShowSuggestions(false)
        }
      },
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.zoneName) {
      alert("Please enter a zone name")
      return
    }

    if (!formData.country) {
      alert("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      alert("Please draw at least 3 points on the map to create a zone")
      return
    }

    try {
      setLoading(true)
      
      // Validate coordinates format
      if (!coordinates || coordinates.length < 3) {
        alert("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      // Ensure coordinates have correct format
      const validCoordinates = coordinates.map(coord => {
        if (typeof coord === 'object' && coord.latitude !== undefined && coord.longitude !== undefined) {
          return {
            latitude: parseFloat(coord.latitude),
            longitude: parseFloat(coord.longitude)
          }
        }
        return coord
      })

      const zoneData = {
        name: formData.zoneName,
        zoneName: formData.zoneName,
        country: formData.country,
        unit: formData.unit || "kilometer",
        coordinates: validCoordinates,
        isActive: true
      }

      debugLog("Sending zone data:", zoneData)

      if (isEditMode && id) {
        // Update existing zone
        const response = await adminAPI.updateZone(id, zoneData)
        debugLog("Zone updated successfully:", response)
        alert("Zone updated successfully!")
      } else {
        // Create new zone
        const response = await adminAPI.createZone(zoneData)
        debugLog("Zone created successfully:", response)
        alert("Zone created successfully!")
      }
      navigate("/admin/food/zone-setup")
    } catch (error) {
      debugError("Error creating zone:", error)
      
      // Handle different types of errors
      let errorMessage = "Failed to create zone. Please try again."
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        // Network error - backend not running or CORS issue
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
        debugError("Network error: Backend server might not be running")
      } else if (error.response) {
        // API error with response
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      error.message || 
                      `Server error: ${error.response.status}`
        debugError("API error:", error.response.data)
        debugError("Error status:", error.response.status)
      } else {
        // Other errors
        errorMessage = error.message || errorMessage
      }
      
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/admin/food/zone-setup")}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? "Edit Zone" : "Add New Zone"}
              </h1>
              <p className="text-sm text-slate-600">
                {isEditMode ? "Update delivery zone for customer" : "Create a delivery zone for customer"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-6 xl:h-[calc(100vh-220px)] xl:grid-rows-[2fr_3fr]">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900">Zone Details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add the zone information first, then create the delivery boundary below.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => handleInputChange("country", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="India">India</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Create Zone name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.zoneName}
                    onChange={(e) => handleInputChange("zoneName", e.target.value)}
                    placeholder="Enter zone name"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => handleInputChange("unit", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="kilometer">Kilometers (km)</option>
                    <option value="miles">Miles (mi)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:min-h-0 xl:grid-cols-[30%_70%]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</p>
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="inline-flex w-full items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={toggleDrawingMode}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          isDrawing
                            ? "bg-red-600 text-white shadow-sm hover:bg-red-700"
                            : "bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Shapes className="w-4 h-4" />
                        <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
                      </button>
                    </div>
                    {isDrawing && coordinates.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoLastPoint}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <span>Undo Point</span>
                      </button>
                    )}
                    {isDrawing && (
                      <button
                        type="button"
                        onClick={handleFinishDrawing}
                        disabled={coordinates.length < 3}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-50 disabled:shadow-none"
                      >
                        <span>Finish Shape</span>
                      </button>
                    )}
                    {coordinates.length > 0 && (
                      <button
                        type="button"
                        onClick={clearDrawing}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Editor Status</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[11px] font-medium text-slate-500">Points</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">{coordinates.length}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[11px] font-medium text-slate-500">Mode</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {isDrawing ? "Drawing" : coordinates.length >= 3 ? "Editable" : "Idle"}
                      </p>
                    </div>
                  </div>
                  <p className={`mt-4 text-sm font-medium ${coordinates.length < 3 ? "text-amber-700" : "text-emerald-700"}`}>
                    {coordinates.length < 3 ? "Minimum 3 points required" : "Polygon ready to save"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Editing Tips</p>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                    <p>Use Start Drawing to begin a new boundary.</p>
                    <p>Use Undo Point to remove the most recent click.</p>
                    <p>Finish the shape, then drag polygon vertices directly on the map.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 xl:min-h-0">
                <div className="flex flex-col gap-4 h-full">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Draw Zone on Map</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Search a location, place points, close the shape, then edit the polygon directly.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative w-full lg:max-w-[420px]">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        ref={autocompleteInputRef}
                        type="text"
                        placeholder="Search location on map..."
                        value={locationSearch}
                        onChange={(e) => handleLocationSearchChange(e.target.value)}
                        onFocus={() => {
                          if (searchSuggestions.length > 0) setShowSuggestions(true)
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowSuggestions(false), 150)
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {showSuggestions && searchSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] z-50 overflow-hidden">
                          {searchSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.place_id}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault()
                                handleSuggestionSelect(suggestion)
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                            >
                              <span className="flex items-start gap-3">
                                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-slate-900 truncate">
                                    {suggestion.structured_formatting?.main_text || suggestion.description}
                                  </span>
                                  <span className="block text-xs text-slate-500 truncate">
                                    {suggestion.structured_formatting?.secondary_text || suggestion.description}
                                  </span>
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={loading || coordinates.length < 3 || !formData.zoneName || !formData.country}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Zone</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 min-h-[520px] xl:min-h-0">
                    <div ref={mapRef} className="absolute inset-0 h-full w-full" />

                    {mapLoading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-100">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                          <p className="text-slate-600">Loading map...</p>
                        </div>
                      </div>
                    )}

                    {!googleMapsApiKey && !mapLoading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-100">
                        <div className="text-center p-6">
                          <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                          <p className="text-sm text-slate-600">Google Maps API key not found</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => navigate("/admin/food/zone-setup")}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
