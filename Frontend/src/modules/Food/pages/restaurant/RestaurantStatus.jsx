import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import Lenis from "lenis"
import { ArrowLeft, Settings, ChevronRight } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
import {
  getRestaurantOperationalStatus,
  broadcastRestaurantOperationalStatus,
} from "@food/utils/restaurantOperationalStatus"
const debugLog = (...args) => {}
const debugError = (...args) => {}

const buildRestaurantForAvailability = (restaurant, outletTimings, isAcceptingOrders) => ({
  ...(restaurant || {}),
  isAcceptingOrders: Boolean(isAcceptingOrders),
  outsideHoursOverride: false,
  outletTimings: outletTimings || restaurant?.outletTimings || null,
})

const syncEffectiveOnlineStatus = (restaurant, outletTimings, isAcceptingOrders) => {
  const operational = getRestaurantOperationalStatus(
    buildRestaurantForAvailability(restaurant, outletTimings, isAcceptingOrders),
  )
  broadcastRestaurantOperationalStatus(operational)
  return operational
}

export default function RestaurantStatus() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isWithinTimings, setIsWithinTimings] = useState(null) // null = not calculated yet
  const [isDayClosed, setIsDayClosed] = useState(false)
  const [outletTimings, setOutletTimings] = useState(null)

  // Update current date/time every minute
  useEffect(() => {
    const tickDateTime = () => {
      if (typeof document !== "undefined" && document.hidden) return
      setCurrentDateTime(new Date())
    }
    const interval = setInterval(tickDateTime, 60000) // Update every minute
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        setCurrentDateTime(new Date())
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
          if (data.outletTimings) setOutletTimings(data.outletTimings)
          const isAccepting =
            data?.isAcceptingOrders !== undefined
              ? Boolean(data.isAcceptingOrders)
              : false
          setDeliveryStatus(isAccepting)
          if (data.operationalStatus) {
            broadcastRestaurantOperationalStatus(data.operationalStatus)
          } else {
            syncEffectiveOnlineStatus(data, data.outletTimings, isAccepting)
          }
        } else {
          setDeliveryStatus(false)
          broadcastRestaurantOperationalStatus({
            isEffectivelyOnline: false,
            isAcceptingOrders: false,
          })
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error)
        }
        setDeliveryStatus(false)
        broadcastRestaurantOperationalStatus({
          isEffectivelyOnline: false,
          isAcceptingOrders: false,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [])

  // Load outlet timings from backend (DB)
  useEffect(() => {
    const loadOutletTimings = () => {
      restaurantAPI
        .getOutletTimings()
        .then((res) => {
          const data = res?.data?.data?.outletTimings || res?.data?.outletTimings
          if (data) setOutletTimings(data)
        })
        .catch((error) => {
          debugError("Error loading outlet timings:", error)
        })
    }

    loadOutletTimings()

    // Listen for outlet timings updates
    window.addEventListener("outletTimingsUpdated", loadOutletTimings)
    
    return () => {
      window.removeEventListener("outletTimingsUpdated", loadOutletTimings)
    }
  }, [])

  // Keep header Online/Offline in sync with toggle + outlet timings
  useEffect(() => {
    if (!restaurantData) return
    syncEffectiveOnlineStatus(restaurantData, outletTimings, deliveryStatus)
  }, [restaurantData, outletTimings, deliveryStatus, currentDateTime])

  // Check if restaurant is currently open based on outlet timings only
  useEffect(() => {
    const checkIfOpen = () => {
      if (typeof document !== "undefined" && document.hidden) return
      const now = new Date()
      const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      const outletTimingsData = outletTimings

      if (!outletTimingsData || !outletTimingsData[currentDayFull]) {
        // No outlet timings configured for today yet
        setIsDayClosed(false)
        setIsWithinTimings(true)
        return
      }

      const dayData = outletTimingsData[currentDayFull]
      if (dayData.isOpen === false) {
        setIsDayClosed(true)
        setIsWithinTimings(false)
        return
      }

      if (!dayData.openingTime || !dayData.closingTime) {
        setIsDayClosed(false)
        setIsWithinTimings(true)
        return
      }

      const [openHour, openMinute] = dayData.openingTime.split(':').map(Number)
      const [closeHour, closeMinute] = dayData.closingTime.split(':').map(Number)
      
      const openingTimeInMinutes = openHour * 60 + openMinute
      const closingTimeInMinutes = closeHour * 60 + closeMinute

      let isWithin = false
      if (closingTimeInMinutes > openingTimeInMinutes) {
        isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
      } else {
        isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
      }

      setIsDayClosed(false)
      setIsWithinTimings(isWithin)
    }

    checkIfOpen()
    // Recheck every minute
    const interval = setInterval(checkIfOpen, 60000)
    
    // Listen for outlet timings updates
    const handleOutletTimingsUpdate = () => {
      checkIfOpen()
    }
    window.addEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        checkIfOpen()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [currentDateTime, outletTimings])

  // Toggle = manual offline override only.
  // Offline forces closed. Online clears override and resumes outlet timing logic.
  const handleDeliveryStatusChange = async (checked) => {
    setDeliveryStatus(checked)
    try {
      try {
        const response = await restaurantAPI.updateAcceptingOrders(checked)
        const updated =
          response?.data?.data?.restaurant || response?.data?.restaurant || null
        if (updated) {
          setRestaurantData(updated)
          if (updated.outletTimings) setOutletTimings(updated.outletTimings)
          if (updated.operationalStatus) {
            broadcastRestaurantOperationalStatus(updated.operationalStatus)
          } else {
            syncEffectiveOnlineStatus(
              updated,
              updated.outletTimings || outletTimings,
              checked,
            )
          }
        } else {
          syncEffectiveOnlineStatus(restaurantData, outletTimings, checked)
        }
        debugLog('Delivery status updated in backend:', checked)
      } catch (apiError) {
        debugError('Error updating delivery status in backend:', apiError)
        // Revert local toggle if backend fails.
        setDeliveryStatus((prev) => !prev)
        syncEffectiveOnlineStatus(restaurantData, outletTimings, !checked)
        return
      }
    } catch (error) {
      debugError("Error saving delivery status:", error)
    }
  }

  // Format time from 24-hour to 12-hour format
  const formatTime12Hour = (time24) => {
    if (!time24) return ""
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const hours12 = hours % 12 || 12
    const minutesStr = minutes.toString().padStart(2, '0')
    return `${hours12}:${minutesStr} ${period}`
  }

  // Get delivery timings for current day (outlet timings only)
  const getCurrentDayTimings = () => {
    const now = new Date()
    const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
    
    // Single source of truth: outlet timings
    if (outletTimings && outletTimings[currentDayFull]) {
      const dayData = outletTimings[currentDayFull]
      if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
        return {
          openingTime: formatTime12Hour(dayData.openingTime),
          closingTime: formatTime12Hour(dayData.closingTime)
        }
      }
    }

    return null
  }

  // Format address
  const formatAddress = (location) => {
    if (!location) return ""
    const parts = []
    if (location.area) parts.push(location.area.trim())
    if (location.city) parts.push(location.city.trim())
    return parts.join(", ") || ""
  }

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={goBack}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Restaurant status</h1>
            <p className="text-sm text-gray-500 mt-0.5">You are mapped to 1 restaurant</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Restaurant Information Card */}
        <Card className="bg-gray-50 border-none py-0 shadow-sm rounded-b-none rounded-t-lg">
          <CardContent className="p-4 gap-6 flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  {loading ? "Loading..." : (restaurantData?.name || "Restaurant")}
                </h2>
                <p className="text-sm text-gray-500">
                  {loading ? "Loading..." : (
                    <>
                      {restaurantData?.id ? `ID: ${String(restaurantData.id).slice(-5)}` : ""}
                      {restaurantData?.location && formatAddress(restaurantData.location) ? (
                        <> | {formatAddress(restaurantData.location)}</>
                      ) : ""}
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  // Navigate to restaurant settings
                  navigate("/restaurant/explore")
                }}
                className="ml-3 p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors shrink-0"
                aria-label="Explore more"
              >
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900 mb-1.5">Delivery status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${deliveryStatus ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                <p className="text-sm text-gray-500">
                  {deliveryStatus ? 'Receiving orders' : 'Not receiving orders'}
                </p>
              </div>
            </div>
            <Switch
              checked={deliveryStatus}
              onCheckedChange={handleDeliveryStatusChange}
              className="ml-4 data-[state=unchecked]:bg-gray-300 data-[state=checked]:bg-green-600"
            />
          </div>

          <p className="text-sm text-gray-700 mb-2">Current delivery slot</p>
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-gray-900">
              {loading ? "Loading..." : (
                (() => {
                  // If current day is closed, show "Today is Off"
                  if (isDayClosed) {
                    return "Today is Off"
                  }
                  const timings = getCurrentDayTimings()
                  if (timings) {
                    const dateStr = currentDateTime.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                    return `${dateStr}, ${timings.openingTime} - ${timings.closingTime}`
                  }
                  return "Not configured"
                })()
              )}
            </p>
            {!isDayClosed && (
              <button
                onClick={() => navigate("/restaurant/outlet-timings")}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Details
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          

          </CardContent>
        </Card>

  {/* Warning Message - Only show if outside timings AND day is not closed */}
  {!isWithinTimings && restaurantData && !isDayClosed && (
        <div className="bg-pink-50 rounded-b-lg rounded-t-none p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <p className="text-sm text-gray-700 flex-1">
            You are currently outside your scheduled delivery timings.
          </p>
        </div>
      )}
      
      </div>
    </div>
  )
}
