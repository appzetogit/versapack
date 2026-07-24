import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ChevronUp, ChevronDown, Clock } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

const debugLog = (...args) => {}
const debugError = (...args) => {}

const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return new Date(2000, 0, 1, 9, 0)
  }
  const [hours, minutes] = timeString.split(":").map(Number)
  const validHours = Math.max(0, Math.min(23, isNaN(hours) ? 9 : hours))
  const validMinutes = Math.max(0, Math.min(59, isNaN(minutes) ? 0 : minutes))
  return new Date(2000, 0, 1, validHours, validMinutes)
}

const timeToString = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "09:00"
  }
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const formatTime12Hour = (time24) => {
  if (!time24) return "09:00 AM"
  const [hours, minutes] = time24.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  const hours12 = hours % 12 || 12
  const minutesStr = minutes.toString().padStart(2, "0")
  return `${hours12}:${minutesStr} ${period}`
}

const getDefaultDays = () => ({
  Monday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Tuesday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Wednesday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Thursday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Friday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Saturday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Sunday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
})

const timePickerSx = {
  "& .MuiOutlinedInput-root": {
    height: "36px",
    fontSize: "12px",
    backgroundColor: "white",
    "& fieldset": { borderColor: "#e5e7eb" },
    "&:hover fieldset": { borderColor: "#d1d5db" },
    "&.Mui-focused fieldset": { borderColor: "#000" },
  },
  "& .MuiInputBase-input": {
    padding: "8px 12px",
    fontSize: "12px",
  },
}

function DayTimePicker({ value, onChange, placeholder }) {
  return (
    <MobileTimePicker
      value={stringToTime(value)}
      onChange={(newValue) => {
        if (newValue) onChange(newValue)
      }}
      onAccept={(newValue) => {
        if (newValue) onChange(newValue)
      }}
      slotProps={{
        textField: {
          variant: "outlined",
          size: "small",
          placeholder,
          sx: timePickerSx,
        },
      }}
      format="hh:mm a"
    />
  )
}

export default function OutletTimings() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [expandedDay, setExpandedDay] = useState("Monday")
  const isInternalUpdate = useRef(false)
  const [days, setDays] = useState(getDefaultDays)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getOutletTimings()
        const outletTimings = res?.data?.data?.outletTimings || res?.data?.outletTimings
        if (mounted && outletTimings && typeof outletTimings === "object") {
          setDays({ ...getDefaultDays(), ...outletTimings })
        }
      } catch (error) {
        debugError("Error loading outlet timings from backend:", error)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (loading) return
    setHasUnsavedChanges(true)
  }, [days, loading])

  const toggleDay = (day) => {
    setExpandedDay(expandedDay === day ? null : day)
  }

  const toggleDayOpen = (day) => {
    isInternalUpdate.current = true
    setDays((prev) => {
      const newOpen = !prev[day].isOpen
      return {
        ...prev,
        [day]: {
          ...prev[day],
          isOpen: newOpen,
          openingTime: newOpen ? (prev[day].openingTime || "09:00") : "",
          closingTime: newOpen ? (prev[day].closingTime || "22:00") : "",
        },
      }
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await restaurantAPI.saveOutletTimings(days)
      window.dispatchEvent(new Event("outletTimingsUpdated"))
      setHasUnsavedChanges(false)
      toast.success("Outlet timings saved successfully!")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save timings. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleTimeChange = (day, timeType, newTime) => {
    if (!newTime) {
      return
    }

    isInternalUpdate.current = true
    const timeString = timeToString(newTime)

    if (!timeString || !timeString.includes(":")) {
      return
    }

    debugLog(`Time changed for ${day} - ${timeType}: ${timeString}`)

    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [timeType]: timeString,
      },
    }))
  }

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center md:min-h-full md:bg-slate-50">
        <div className="text-sm text-gray-600">Loading outlet timings...</div>
      </div>
    )
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-white overflow-x-hidden md:min-h-full md:h-full md:overflow-y-auto md:bg-slate-50 md:pb-10">
        {/* Header */}
        <div className="bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 sticky top-0 z-50 md:border-slate-200">
          <div className="flex items-center justify-between md:max-w-4xl md:mx-auto md:px-8 md:py-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate("/food/restaurant/explore")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
                aria-label="Go back"
              >
                <ArrowLeft className="w-6 h-6 text-gray-900" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 md:text-2xl">Outlet timings</h1>
                <p className="hidden md:block text-sm text-slate-500 mt-0.5">
                  Set weekly opening and closing hours for delivery
                </p>
              </div>
            </div>
            {hasUnsavedChanges && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
                  boxShadow: "0 8px 20px rgba(var(--module-theme-rgb,37,99,235),0.28)",
                }}
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 py-6 md:max-w-4xl md:mx-auto md:px-8 md:py-8">
          <div className="mb-6 md:mb-8">
            <div className="text-center mb-2 md:text-left">
              <h2
                className="text-base font-semibold md:text-lg"
                style={{ color: "var(--module-theme-color, #2563EB)" }}
              >
                {companyName} delivery
              </h2>
              <p className="hidden md:block text-sm text-slate-500 mt-1">
                {hasUnsavedChanges ? "You have unsaved changes" : "All changes are saved"}
              </p>
            </div>
            <div
              className="h-0.5 md:max-w-xs"
              style={{ backgroundColor: "var(--module-theme-color, #2563EB)" }}
            />
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="grid grid-cols-[140px_100px_1fr_1fr] gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Day</span>
              <span>Status</span>
              <span>Opening</span>
              <span>Closing</span>
            </div>
            {dayNames.map((day) => {
              const dayData = days[day] || { isOpen: true, openingTime: "09:00", closingTime: "22:00" }
              return (
                <div
                  key={`desktop-${day}`}
                  className="grid grid-cols-[140px_100px_1fr_1fr] gap-4 px-6 py-5 border-b border-slate-100 items-start last:border-b-0"
                >
                  <span className="text-sm font-semibold text-gray-900 pt-2">{day}</span>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs font-medium text-gray-600">
                      {dayData.isOpen ? "Open" : "Closed"}
                    </span>
                    <Switch
                      checked={dayData.isOpen}
                      onCheckedChange={() => toggleDayOpen(day)}
                      className="data-[state=checked]:bg-[color:var(--module-theme-color)] data-[state=unchecked]:bg-gray-300"
                    />
                  </div>
                  <div className="min-w-0">
                    {dayData.isOpen ? (
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50/60 max-w-[200px]">
                        <DayTimePicker
                          value={dayData.openingTime}
                          onChange={(value) => handleTimeChange(day, "openingTime", value)}
                          placeholder="Opening time"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 pt-2 block">—</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    {dayData.isOpen ? (
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50/60 max-w-[200px]">
                        <DayTimePicker
                          value={dayData.closingTime}
                          onChange={(value) => handleTimeChange(day, "closingTime", value)}
                          placeholder="Closing time"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 pt-2 block">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile accordion */}
          <div className="space-y-2 md:hidden">
            {dayNames.map((day, index) => {
              const dayData = days[day] || { isOpen: true, openingTime: "09:00", closingTime: "22:00" }
              const isExpanded = expandedDay === day

              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  className="bg-white border border-gray-200 rounded-sm overflow-hidden"
                >
                  <div
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-all ${
                      isExpanded ? "bg-gray-100" : ""
                    }`}
                  >
                    <button
                      onClick={() => toggleDay(day)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-700" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-700" />
                      )}
                      <span className="text-base font-medium text-gray-900">{day}</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-700">{dayData.isOpen ? "Open" : "Close"}</span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={dayData.isOpen}
                          onCheckedChange={() => toggleDayOpen(day)}
                          className="data-[state=checked]:bg-[color:var(--module-theme-color)] data-[state=unchecked]:bg-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 space-y-4 border-t border-gray-100">
                          {dayData.isOpen ? (
                            <>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Opening time
                                </label>
                                <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
                                  <DayTimePicker
                                    value={dayData.openingTime}
                                    onChange={(value) => handleTimeChange(day, "openingTime", value)}
                                    placeholder="Select opening time"
                                  />
                                </div>
                                <p className="text-xs text-gray-500">
                                  Current: {formatTime12Hour(dayData.openingTime)}
                                </p>
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Closing time
                                </label>
                                <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
                                  <DayTimePicker
                                    value={dayData.closingTime}
                                    onChange={(value) => handleTimeChange(day, "closingTime", value)}
                                    placeholder="Select closing time"
                                  />
                                </div>
                                <p className="text-xs text-gray-500">
                                  Current: {formatTime12Hour(dayData.closingTime)}
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-gray-500 pl-6">This day is closed</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {hasUnsavedChanges && (
            <div className="mt-6 pb-6 md:pb-0 md:mt-8">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full md:w-auto md:min-w-[220px] flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-lg transition-colors text-sm shadow-lg shadow-gray-200"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save All Changes"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </LocalizationProvider>
  )
}
