import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { Label } from "@food/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Award, BadgeCheck, Wallet, Info, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { restaurantAPI, zoneAPI, uploadAPI, api } from "@food/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "@food/utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { clearModuleAuth } from "@food/utils/auth"
import { logoutRestaurantSession } from "@food/utils/restaurantLogout"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { resolveMediaUrl } from "@food/utils/common"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { getCompanyNameAsync, loadBusinessSettings, getModuleLogoUrl } from "@food/utils/businessSettings"
import RestaurantOnboardingShell from "@food/components/restaurant/RestaurantOnboardingShell"
import {
  ONBOARDING_SECTION_FULL,
  ONBOARDING_SECTION_TITLE,
  ONBOARDING_SECTION_DESC,
  ONBOARDING_LABEL,
  ONBOARDING_HINT,
  ONBOARDING_INPUT,
  ONBOARDING_UPLOAD_BOX,
  ONBOARDING_UPLOAD_BTN,
  ONBOARDING_INFO_BOX,
  ONBOARDING_PLAN_CARD,
  ONBOARDING_DOC_PREVIEW,
  ONBOARDING_DAY_ACTIVE,
  ONBOARDING_DAY_INACTIVE,
  chipClass,
} from "@food/components/restaurant/onboardingStyles"

const RESTAURANT_THEME = "#FA0272"

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_CODE_REGEX = /^[A-Z0-9]{11}$/
const OWNER_NAME_REGEX = /^[A-Za-z ]+$/
const ACCOUNT_HOLDER_NAME_REGEX = /^[A-Za-z ]+$/
const GST_LEGAL_NAME_REGEX = /^[A-Za-z ]+$/
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/
const EMAIL_REGEX = /^(?!.*\.\.)([A-Za-z0-9]+[._%+-]?)*[A-Za-z0-9]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/
const LOCAL_IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif"
const GALLERY_IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
let onboardingFileCache = {
  step2: {
    menuImages: [],
    profileImage: null,
  },
  step3: {
    panImage: null,
    gstImage: null,
    fssaiImage: null,
  },
}

// IndexedDB helpers for persistent file storage
const ONBOARDING_FILES_DB = "RestaurantOnboardingFiles"
const FILES_STORE = "files"

const openOnboardingFilesDB = () => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(ONBOARDING_FILES_DB, 1)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE)
        }
      }
      request.onsuccess = (e) => resolve(e.target.result)
      request.onerror = (e) => reject(e.target.error)
    } catch (err) {
      reject(err)
    }
  })
}

const saveFileToDB = async (key, file) => {
  if (!file || !isUploadableFile(file)) return
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.objectStore(FILES_STORE).put(file, key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write transaction failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write transaction aborted"))
    })
  } catch (err) {
    debugError("IndexedDB save failed:", err)
  }
}

const getFileFromDB = async (key) => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(FILES_STORE, "readonly")
    const request = tx.objectStore(FILES_STORE).get(key)
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  } catch (err) {
    debugError("IndexedDB load failed:", err)
    return null
  }
}

const deleteFileFromDB = async (key) => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.objectStore(FILES_STORE).delete(key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete transaction failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB delete transaction aborted"))
    })
  } catch (err) {
    debugError("IndexedDB delete failed:", err)
  }
}

const clearAllFilesFromDB = async () => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.objectStore(FILES_STORE).clear()
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB clear transaction failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB clear transaction aborted"))
    })
  } catch (err) {
    debugError("IndexedDB clear failed:", err)
  }
}

const getUploadableMenuFiles = (menuImages = []) =>
  (Array.isArray(menuImages) ? menuImages : [])
    .filter((img) => isUploadableFile(img))
    .slice(0, 10)

const persistMenuImagesToDB = async (menuImages = []) => {
  const uploadableMenuFiles = getUploadableMenuFiles(menuImages)
  for (let i = 0; i < 10; i++) {
    const file = uploadableMenuFiles[i]
    if (file) {
      await saveFileToDB(`menuImage_${i}`, file)
    } else {
      await deleteFileFromDB(`menuImage_${i}`)
    }
  }
}

const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false

  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true

  return (
    typeof value.size === "number" &&
    (typeof value.slice === "function" || typeof value.arrayBuffer === "function")
  )
}

const normalizePhoneDigits = (value) => {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

const getVerifiedPhoneFromStoredRestaurant = () => {
  try {
    const pending = localStorage.getItem("restaurant_pendingPhone")
    if (pending && pending.trim()) {
      return pending.trim()
    }

    const storedUser = localStorage.getItem("restaurant_user")
    if (!storedUser) return ""
    const user = JSON.parse(storedUser)
    const candidates = [
      user?.ownerPhone,
      user?.primaryContactNumber,
      user?.phone,
      user?.phoneNumber,
      user?.mobile,
      user?.contactNumber,
      user?.contact?.phone,
      user?.owner?.phone,
      user?.restaurant?.phone,
    ]
    const phone = candidates.find((value) => typeof value === "string" && value.trim())
    return phone ? phone.trim() : ""
  } catch {
    return ""
  }
}

const normalizeAccountTypeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "saving" || normalized === "savings") return "Saving"
  if (normalized === "current") return "Current"
  return ""
}

const getTodayLocalYMD = () => formatDateToLocalYMD(new Date())

const hasSuspiciousEmailTld = (emailValue) => {
  const email = String(emailValue || "").trim().toLowerCase()
  const domain = email.split("@")[1] || ""
  const tld = domain.split(".").pop() || ""
  if (!tld) return true
  // Reject typo endings like ".comm", ".commm", etc.
  if (/^com+$/i.test(tld) && tld !== "com") return true
  // Reject obvious fake endings like ".commmm", ".innnn", etc.
  if (/(.)\1{2,}/.test(tld)) return true
  return false
}

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, currentStep, step4State) => {
  try {
    // Persist only stable URL-based values. File/Blob objects are not serializable and
    // restoring metadata-only placeholders breaks preview/upload flows.
    const serializableStep2 = {
      ...step2,
      menuImages: (step2.menuImages || []).filter(
        (img) => !isUploadableFile(img) && (img?.url || (typeof img === "string" && img.trim()))
      ),
      profileImage:
        !isUploadableFile(step2.profileImage) &&
        (step2.profileImage?.url || (typeof step2.profileImage === "string" && step2.profileImage.trim()))
          ? step2.profileImage
          : null,
    }

    const serializableStep3 = {
      ...step3,
      panImage:
        !isUploadableFile(step3.panImage) &&
        (step3.panImage?.url || (typeof step3.panImage === "string" && step3.panImage.trim()))
          ? step3.panImage
          : null,
      gstImage:
        !isUploadableFile(step3.gstImage) &&
        (step3.gstImage?.url || (typeof step3.gstImage === "string" && step3.gstImage.trim()))
          ? step3.gstImage
          : null,
      fssaiImage:
        !isUploadableFile(step3.fssaiImage) &&
        (step3.fssaiImage?.url || (typeof step3.fssaiImage === "string" && step3.fssaiImage.trim()))
          ? step3.fssaiImage
          : null,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4State,
      currentStep,
      timestamp: Date.now(),
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (error) {
    debugError("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    debugError("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch (error) {
    debugError("Failed to clear onboarding data from localStorage:", error)
  }
}

const syncOnboardingFileCache = (step2, step3) => {
  onboardingFileCache = {
    step2: {
      menuImages: (step2?.menuImages || []).filter((img) => isUploadableFile(img)),
      profileImage: isUploadableFile(step2?.profileImage) ? step2.profileImage : null,
    },
    step3: {
      panImage: isUploadableFile(step3?.panImage) ? step3.panImage : null,
      gstImage: isUploadableFile(step3?.gstImage) ? step3.gstImage : null,
      fssaiImage: isUploadableFile(step3?.fssaiImage) ? step3.fssaiImage : null,
    },
  }
}

const clearOnboardingFileCache = () => {
  onboardingFileCache = {
    step2: {
      menuImages: [],
      profileImage: null,
    },
    step3: {
      panImage: null,
      gstImage: null,
      fssaiImage: null,
    },
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) {
    return null
  }
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const normalizeTimeValue = (value) => {
  if (!value) return ""

  const raw = String(value).trim()
  if (!raw) return ""

  const to24Hour = (h, m, period) => {
    let hours = Number(h)
    const minutes = Number(m)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ""
    if (minutes < 0 || minutes > 59) return ""
    const p = String(period || "").toUpperCase()
    if (p === "AM") {
      if (hours === 12) hours = 0
    } else if (p === "PM") {
      if (hours !== 12) hours += 12
    }
    if (hours < 0 || hours > 23) return ""
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }

  // Already in HH:mm format
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return ""
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  // Handle H:mm by zero-padding hour
  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return to24Hour(h, m, "")
  }

  // Handle 12-hour format (e.g. "10:00 AM", "9:30pm")
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (ampm) {
    return to24Hour(ampm[1], ampm[2], ampm[3])
  }

  // Fallback for ISO / Date-like strings
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }

  return ""
}

const timeStringToMinutes = (value) => {
  const normalized = normalizeTimeValue(value)
  if (!normalized || !/^\d{2}:\d{2}$/.test(normalized)) return null
  const [hours, minutes] = normalized.split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

const formatTime12Hour = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) return "--:-- --"
  const [h, m] = timeStr.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

const formatDateToLocalYMD = (date) => {
  if (!date || Number.isNaN(date.getTime?.())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalYMDDate = (value) => {
  if (!value || typeof value !== "string") return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function TimeSelector({ label, value, onChange }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (!newValue) {
      onChange("")
      return
    }
    const timeString = timeToString(newValue)
    onChange(timeString)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-[#FA0272]" />
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      <MobileTimePicker ampm={true}
        value={timeValue}
        onChange={handleTimeChange}
        onAccept={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "12px",
                backgroundColor: "white",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#000",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 12px",
                fontSize: "12px",
              },
            },
            onBlur: (event) => {
              const normalized = normalizeTimeValue(event?.target?.value)
              if (normalized) {
                onChange(normalized)
              }
            },
          },
        }}
        format="hh:mm a"
      />
    </div>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const [logoUrl, setLogoUrl] = useState(() => getModuleLogoUrl("restaurant"))
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)

  useEffect(() => {
    const s = parseInt(searchParams.get('step'))
    if (s >= 1 && s <= 4 && s !== step) {
      setStep(s)
    }
  }, [searchParams, step])

  useEffect(() => {
    const loadLogo = async () => {
      try {
        await loadBusinessSettings()
        const logo = getModuleLogoUrl("restaurant")
        if (logo) setLogoUrl(logo)
      } catch {
        // keep fallback
      }
    }
    loadLogo()
  }, [])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [error, setError] = useState("")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [step4State, setStep4State] = useState({
    onboardingFeePaid: false,
    onboardingFeeAmount: 0,
    razorpayOrderId: "",
    razorpayPaymentId: "",
    razorpaySignature: "",
    paymentType: "razorpay",
    errors: [],
  })
  const [subscriptionSettings, setSubscriptionSettings] = useState(null)
  const [loadingSubscriptionSettings, setLoadingSubscriptionSettings] = useState(true)
  const [registrationProcessing, setRegistrationProcessing] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState({})

  const goToStep = (targetStep) => {
    const n = Math.min(4, Math.max(1, targetStep))
    setStep(n)
    navigate(`?step=${n}`, { replace: false })
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const planCatalog = subscriptionSettings?.planCatalog?.plans || []
  const gstRate = Number(subscriptionSettings?.gstRate ?? 0.18)
  const onboardingFeeAmount = Math.max(0, Number(subscriptionSettings?.onboardingFee) || 0)
  const onboardingFeeGst =
    onboardingFeeAmount > 0 ? Math.round(onboardingFeeAmount * gstRate * 100) / 100 : 0
  const onboardingFeeTotal = onboardingFeeAmount + onboardingFeeGst
  const requiresOnboardingFee = onboardingFeeAmount > 0

  useEffect(() => {
    let cancelled = false
    const loadSubscriptionSettings = async () => {
      try {
        setLoadingSubscriptionSettings(true)
        const res = await restaurantAPI.getSubscriptionSettings()
        const data = res?.data?.data || res?.data || null
        if (!cancelled && data) {
          setSubscriptionSettings(data)
        }
      } catch (err) {
        debugWarn("Failed to load subscription settings:", err)
      } finally {
        if (!cancelled) setLoadingSubscriptionSettings(false)
      }
    }
    loadSubscriptionSettings()
    return () => {
      cancelled = true
    }
  }, [])


  const triggerBackgroundUpload = async (file, folder, fieldName, isArray = false, arrayIndex = -1) => {
    if (!file || !isUploadableFile(file)) return;

    const trackingKey = isArray && arrayIndex >= 0 ? `${fieldName}_${arrayIndex}` : fieldName;
    setUploadingAttachments(prev => ({ ...prev, [trackingKey]: true }))
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      
      const res = await restaurantAPI.uploadAttachment(formData)
      const url = res.data?.data?.url

      if (url) {
        if (fieldName === 'profileImage') {
           setStep2(prev => ({ ...prev, profileImage: url }))
        } else if (fieldName === 'panImage') {
           setStep3(prev => ({ ...prev, panImage: url }))
        } else if (fieldName === 'gstImage') {
           setStep3(prev => ({ ...prev, gstImage: url }))
        } else if (fieldName === 'fssaiImage') {
           setStep3(prev => ({ ...prev, fssaiImage: url }))
        } else if (fieldName === 'menuImages' && isArray && arrayIndex >= 0) {
           setStep2(prev => {
             const next = [...prev.menuImages]
             next[arrayIndex] = url
             return { ...prev, menuImages: next }
           })
        }
      }
    } catch (error) {
      console.error(`Failed to upload ${fieldName}:`, error)
      toast.error(`Image upload failed. Please re-select or retry.`)
    } finally {
      setUploadingAttachments(prev => ({ ...prev, [trackingKey]: false }))
    }
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutRestaurantSession({ clearAllModules: true, navigate })
      // Clear onboarding drafts/files after auth + FCM cleanup
      clearOnboardingFromLocalStorage()
      await clearAllFilesFromDB()
    } catch (error) {
      debugError("Logout failed:", error)
      clearModuleAuth("restaurant")
      navigate("/food/restaurant/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState("")
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [isEditing, setIsEditing] = useState(true)
  const [hasExistingRestaurantProfile, setHasExistingRestaurantProfile] = useState(false)
  const [isFssaiCalendarOpen, setIsFssaiCalendarOpen] = useState(false)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isOnboardingHydrated, setIsOnboardingHydrated] = useState(false)
  const isRestoringOnboardingRef = useRef(true)

  const [step1, setStep1] = useState({
    restaurantName: "",
    pureVegRestaurant: null,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    zoneId: "",
    location: {
      formattedAddress: "",
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      latitude: "",
      longitude: "",
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    estimatedDeliveryTime: "",
    openingTime: "",
    closingTime: "",
    openDays: [],
  })

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const previewUrlCacheRef = useRef(new Map())
  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const placesAutocompleteServiceRef = useRef(null)
  const placesDetailsServiceRef = useRef(null)
  const placesSessionTokenRef = useRef(null)
  const suppressSuggestionFetchRef = useRef(false)
  const mapsScriptLoadedRef = useRef(false)
  const menuImagesInputRef = useRef(null)
  const profileImageInputRef = useRef(null)
  const panImageInputRef = useRef(null)
  const gstImageInputRef = useRef(null)
  const fssaiImageInputRef = useRef(null)
  const [sourcePicker, setSourcePicker] = useState({
    isOpen: false,
    title: "",
    onSelectFile: null,
    fileNamePrefix: "camera-image",
    fallbackInputRef: null,
  })

  // Manual search states for fallback
  const [locationSearchValue, setLocationSearchValue] = useState("")
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isSearchingLocation, setIsSearchingLocation] = useState(false)
  const [isAutoFilledLocationLocked, setIsAutoFilledLocationLocked] = useState(false)
  const [zoneDetectionState, setZoneDetectionState] = useState({
    status: "idle", // idle | detecting | matched | out_of_zone | failed
    message: "",
    zoneName: "",
  })
  const normalizeLocationQuery = (value) => String(value || "").replace(/\s+/g, " ").trim()

  const detectAndSetZoneForLocation = async (lat, lng) => {
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setZoneDetectionState({
        status: "failed",
        message: "Unable to detect zone because location coordinates are missing.",
        zoneName: "",
      })
      return
    }

    try {
      setZoneDetectionState({
        status: "detecting",
        message: "Detecting service zone for this location...",
        zoneName: "",
      })
      const res = await zoneAPI.detectZone(latitude, longitude)
      const payload = res?.data?.data
      const isInService = payload?.status === "IN_SERVICE" && !!payload?.zoneId
      const detectedZoneId = String(payload?.zoneId || "")
      const detectedZone =
        zones.find((z) => String(z?._id || z?.id || "") === detectedZoneId) || payload?.zone
      const detectedZoneName =
        detectedZone?.name || detectedZone?.zoneName || detectedZone?.serviceLocation || ""

      if (isInService) {
        setStep1((prev) => ({ ...prev, zoneId: detectedZoneId }))
        setZoneDetectionState({
          status: "matched",
          message: detectedZoneName
            ? `Zone auto-detected: ${detectedZoneName}`
            : "Zone auto-detected for this location.",
          zoneName: detectedZoneName,
        })
        return
      }

      setStep1((prev) => ({ ...prev, zoneId: "" }))
      setZoneDetectionState({
        status: "out_of_zone",
        message: "No active zone found at this location.",
        zoneName: "",
      })
    } catch (err) {
      debugError("Failed to detect zone for onboarding location:", err)
      setZoneDetectionState({
        status: "failed",
        message: "Could not verify zone right now. Please reselect the location.",
        zoneName: "",
      })
    }
  }

  const getPreviewImageUrl = (value) => {
    if (!value) return null
    if (typeof value === "string") return resolveMediaUrl(value)
    if (value?.url && typeof value.url === "string") return resolveMediaUrl(value.url)

    if (isUploadableFile(value)) {
      const cache = previewUrlCacheRef.current
      const cached = cache.get(value)
      if (cached) return cached
      try {
        const objectUrl = URL.createObjectURL(value)
        cache.set(value, objectUrl)
        return objectUrl
      } catch {
        return null
      }
    }

    return null
  }

  const openImageSourcePicker = ({ title, onSelectFile, fileNamePrefix, fallbackInputRef }) => {
    setSourcePicker({
      isOpen: true,
      title: title || "Select image source",
      onSelectFile,
      fileNamePrefix: fileNamePrefix || "camera-image",
      fallbackInputRef: fallbackInputRef || null,
    })
  }

  const closeImageSourcePicker = () => {
    setSourcePicker((prev) => ({ ...prev, isOpen: false }))
  }

  const handleMenuImagesSelected = (files = []) => {
    if (!files.length) return
    const currentCount = (step2.menuImages || []).length
    const nextMenuImages = [...(step2.menuImages || []), ...files]
    setStep2((prev) => ({
      ...prev,
      menuImages: nextMenuImages,
    }))
    void persistMenuImagesToDB(nextMenuImages)

    // Trigger background uploads for new images
    files.forEach((img, idx) => {
      void triggerBackgroundUpload(img, 'menu', 'menuImages', true, currentCount + idx)
    })
  }

  const handleProfileImageSelected = (file) => {
    if (!file) return
    setStep2((prev) => ({
      ...prev,
      profileImage: file,
    }))
    void saveFileToDB("profileImage", file)
    void triggerBackgroundUpload(file, 'profile', 'profileImage')
  }

  const handlePanImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, panImage: file }))
    void triggerBackgroundUpload(file, 'pan', 'panImage')
  }

  const handleGstImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, gstImage: file }))
    void triggerBackgroundUpload(file, 'gst', 'gstImage')
  }

  const handleFssaiImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, fssaiImage: file }))
    void triggerBackgroundUpload(file, 'fssai', 'fssaiImage')
  }

  const isPersistedImageValue = (value) =>
    !isUploadableFile(value) &&
    ((typeof value === "string" && value.trim()) ||
      (value?.url && typeof value.url === "string"))

  const getPersistedImagePayload = (value) => {
    if (typeof value === "string" && value.trim()) {
      return { url: value.trim(), publicId: null }
    }

    if (value?.url && typeof value.url === "string" && value.url.trim()) {
      return {
        url: value.url.trim(),
        publicId: value.publicId || null,
      }
    }

    return null
  }

  const toPersistedMenuImagesPayload = (menuImages = []) =>
    (Array.isArray(menuImages) ? menuImages : [])
      .filter((img) => isPersistedImageValue(img))
      .map((img) =>
        typeof img === "string"
          ? img
          : {
              url: img.url,
              publicId: img.publicId || null,
            },
      )

  const handleRemoveMenuImage = async (indexToRemove) => {
    const currentMenuImages = step2.menuImages || []
    const imageToRemove = currentMenuImages[indexToRemove]
    const nextMenuImages = currentMenuImages.filter((_, i) => i !== indexToRemove)

    setStep2((prev) => ({
      ...prev,
      menuImages: nextMenuImages,
    }))
    await persistMenuImagesToDB(nextMenuImages)

    if (!isPersistedImageValue(imageToRemove)) {
      return
    }

    if (!hasExistingRestaurantProfile) {
      return
    }

    try {
      await restaurantAPI.updateProfile({
        menuImages: toPersistedMenuImagesPayload(nextMenuImages),
      })
      toast.success("Menu image removed")
    } catch (error) {
      setStep2((prev) => ({
        ...prev,
        menuImages: currentMenuImages,
      }))
      await persistMenuImagesToDB(currentMenuImages)
      toast.error(error?.response?.data?.message || "Failed to remove menu image")
    }
  }

  const handleRemoveProfileImage = async () => {
    const currentProfileImage = step2.profileImage
    setStep2((prev) => ({
      ...prev,
      profileImage: null,
    }))

    if (!isPersistedImageValue(currentProfileImage)) {
      return
    }

    if (!hasExistingRestaurantProfile) {
      return
    }

    try {
      await restaurantAPI.updateProfile({ profileImage: "" })
      toast.success("Profile image removed")
    } catch (error) {
      setStep2((prev) => ({
        ...prev,
        profileImage: currentProfileImage,
      }))
      toast.error(error?.response?.data?.message || "Failed to remove profile image")
    }
  }

  const resolveImageForProfileUpdate = async (value, folder) => {
    if (!value) return null

    if (isUploadableFile(value)) {
      const uploaded = await handleUpload(value, folder)
      return uploaded || null
    }

    return getPersistedImagePayload(value)
  }

  const resolveMenuImagesForProfileUpdate = async (menuImages = []) => {
    const items = Array.isArray(menuImages) ? menuImages : []
    const resolved = await Promise.all(
      items.map(async (image) => {
        if (isUploadableFile(image)) {
          return handleUpload(image, "food/restaurants/menu")
        }

        return getPersistedImagePayload(image)
      }),
    )

    return resolved.filter((image) => image?.url)
  }


  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    isRestoringOnboardingRef.current = true
    setVerifiedPhoneNumber(getVerifiedPhoneFromStoredRestaurant())

    // Check if step is specified in URL (from OTP login redirect)
    const stepParam = searchParams.get("step")
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10)
      if (stepNum >= 1 && stepNum <= 3) {
        setStep(stepNum)
      }
    }

    const loadData = async () => {
      try {
        const currentPhone = getVerifiedPhoneFromStoredRestaurant()
        const localData = loadOnboardingFromLocalStorage()
        
        if (localData) {
          // SECURITY CHECK: If the saved data's phone number doesn't match current login, clear it.
          // This prevents data leakage when logging in with a different account on the same device.
          const savedPhone = normalizePhoneDigits(localData.step1?.ownerPhone || "")
          const normalizedCurrent = normalizePhoneDigits(currentPhone)
          
          if (savedPhone && normalizedCurrent && savedPhone !== normalizedCurrent) {
             debugLog("? Phone mismatch, data belongs to different user. Clearing.")
             // Be a bit more lenient: only clear if they are substantially different
             if (savedPhone.slice(-10) !== normalizedCurrent.slice(-10)) {
               clearOnboardingFromLocalStorage()
               await clearAllFilesFromDB()
               return
             }
          }

          if (localData.step1) {
            setStep1((prev) => ({
              ...prev,
              restaurantName: localData.step1.restaurantName || "",
              pureVegRestaurant:
                typeof localData.step1.pureVegRestaurant === "boolean"
                  ? localData.step1.pureVegRestaurant
                  : null,
              ownerName: localData.step1.ownerName || "",
              ownerEmail: localData.step1.ownerEmail || "",
              ownerPhone: localData.step1.ownerPhone || "",
              primaryContactNumber: localData.step1.primaryContactNumber || "",
              zoneId: localData.step1.zoneId || "",
              location: {
                formattedAddress: localData.step1.location?.formattedAddress || "",
                addressLine1: localData.step1.location?.addressLine1 || "",
                addressLine2: localData.step1.location?.addressLine2 || "",
                area: localData.step1.location?.area || "",
                city: localData.step1.location?.city || "",
                state: localData.step1.location?.state || "",
                pincode: localData.step1.location?.pincode || "",
                landmark: localData.step1.location?.landmark || "",
                latitude: localData.step1.location?.latitude ?? "",
                longitude: localData.step1.location?.longitude ?? "",
              },
            }))
          }

          // Restore Images from IndexedDB
          const restoredProfileImage = await getFileFromDB("profileImage")
          const restoredPanImage = await getFileFromDB("panImage")
          const restoredGstImage = await getFileFromDB("gstImage")
          const restoredFssaiImage = await getFileFromDB("fssaiImage")
          
          const restoredMenuImages = []
          for (let i = 0; i < 10; i++) {
            const img = await getFileFromDB(`menuImage_${i}`)
            if (img) restoredMenuImages.push(img)
          }

          if (localData.step2) {
            const urlMenuImages = (localData.step2.menuImages || []).filter(
              (img) => img?.url || typeof img === "string"
            )
            
            setStep2((prev) => ({
              ...prev,
              menuImages: [...urlMenuImages, ...restoredMenuImages],
              profileImage:
                restoredProfileImage ||
                (typeof localData.step2.profileImage === "string" || localData.step2.profileImage?.url
                  ? localData.step2.profileImage
                  : null),
              cuisines: localData.step2.cuisines || [],
              estimatedDeliveryTime: localData.step2.estimatedDeliveryTime || "",
              openingTime: normalizeTimeValue(localData.step2.openingTime),
              closingTime: normalizeTimeValue(localData.step2.closingTime),
              openDays: localData.step2.openDays || [],
            }))
          }

          if (localData.step3) {
            setStep3((prev) => ({
              ...prev,
              panNumber: localData.step3.panNumber || "",
              nameOnPan: localData.step3.nameOnPan || "",
              panImage: restoredPanImage || localData.step3.panImage || null,
              gstRegistered: localData.step3.gstRegistered || false,
              gstNumber: localData.step3.gstNumber || "",
              gstLegalName: localData.step3.gstLegalName || "",
              gstAddress: localData.step3.gstAddress || "",
              gstImage: restoredGstImage || localData.step3.gstImage || null,
              fssaiNumber: localData.step3.fssaiNumber || "",
              fssaiExpiry: localData.step3.fssaiExpiry || "",
              fssaiImage: restoredFssaiImage || localData.step3.fssaiImage || null,
              accountNumber: localData.step3.accountNumber || "",
              confirmAccountNumber: localData.step3.confirmAccountNumber || "",
              ifscCode: (localData.step3.ifscCode || "").toUpperCase(),
              accountHolderName: localData.step3.accountHolderName || "",
              accountType: normalizeAccountTypeValue(localData.step3.accountType || ""),
            }))
          }

          if (localData.step4) {
            setStep4State((prev) => ({
              ...prev,
              ...localData.step4,
              errors: [] // Clear previous errors
            }))
          }

          // Only set step from localStorage if URL doesn't have a step parameter
          if (localData.currentStep && !stepParam) {
            const restoredStep = Number(localData.currentStep) || 1
            setStep(Math.min(4, Math.max(1, restoredStep)))
          }
        }
      } finally {
        // Prevent save effect from writing default/empty state before restored data settles.
        isRestoringOnboardingRef.current = false
        setIsOnboardingHydrated(true)
      }
    }

    loadData()
  }, [searchParams])

  useEffect(() => {
    if (!verifiedPhoneNumber) return
    setStep1((prev) => ({
      ...prev,
      ownerPhone: normalizePhoneDigits(verifiedPhoneNumber),
    }))
  }, [verifiedPhoneNumber])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateInset = () => {
      const vv = window.visualViewport
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height))
      setKeyboardInset(inset > 120 ? inset : 0)
    }

    updateInset()
    window.visualViewport.addEventListener("resize", updateInset)
    window.visualViewport.addEventListener("scroll", updateInset)
    return () => {
      window.visualViewport.removeEventListener("resize", updateInset)
      window.visualViewport.removeEventListener("scroll", updateInset)
    }
  }, [])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    if (!isOnboardingHydrated) return
    if (isRestoringOnboardingRef.current) return
    saveOnboardingToLocalStorage(step1, step2, step3, step, step4State)
    
    // Save images to IndexedDB
    const saveFiles = async () => {
      if (step2.profileImage && isUploadableFile(step2.profileImage)) {
        await saveFileToDB("profileImage", step2.profileImage)
      } else if (!step2.profileImage) {
        await deleteFileFromDB("profileImage")
      }
      if (step3.panImage && isUploadableFile(step3.panImage)) {
        await saveFileToDB("panImage", step3.panImage)
      }
      if (step3.gstImage && isUploadableFile(step3.gstImage)) {
        await saveFileToDB("gstImage", step3.gstImage)
      }
      if (step3.fssaiImage && isUploadableFile(step3.fssaiImage)) {
        await saveFileToDB("fssaiImage", step3.fssaiImage)
      }
      
      await persistMenuImagesToDB(step2.menuImages || [])
    }
    saveFiles()
  }, [isOnboardingHydrated, step1, step2, step3, step, step4State])

  useEffect(() => {
    syncOnboardingFileCache(step2, step3)
  }, [step2, step3])

  useEffect(() => {
    return () => {
      previewUrlCacheRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Ignore revoke errors
        }
      })
      previewUrlCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Use restaurantAPI.getCurrentRestaurant() to fetch real data
        const res = await restaurantAPI.getCurrentRestaurant()
        const data = res?.data?.data?.restaurant || res?.data?.restaurant
        
          if (data) {
            setHasExistingRestaurantProfile(true)
            const onboardingData = data.onboarding || {}
            const step1Data = onboardingData.step1 || {}
            const step2Data = onboardingData.step2 || {}
            const step3Data = onboardingData.step3 || {}
            const panData = step3Data.pan || {}
            const gstData = step3Data.gst || {}
            const fssaiData = step3Data.fssai || {}
            const bankData = step3Data.bank || {}
            const locationData = step1Data.location || data.location || {}
            const deliveryTimings = step2Data.deliveryTimings || data.deliveryTimings || {}

            setIsEditing(true)
            // Map Step 1 (Merging with local state - prioritize local edits)
            setStep1((prev) => ({
              ...prev,
              restaurantName: prev.restaurantName || step1Data.restaurantName || data.name || data.restaurantName || "",
              pureVegRestaurant:
                typeof prev.pureVegRestaurant === "boolean"
                  ? prev.pureVegRestaurant
                  : typeof step1Data.pureVegRestaurant === "boolean"
                  ? step1Data.pureVegRestaurant
                  : typeof data.pureVegRestaurant === "boolean"
                  ? data.pureVegRestaurant
                  : null,
              ownerName: prev.ownerName || step1Data.ownerName || data.ownerName || "",
              ownerEmail: prev.ownerEmail || step1Data.ownerEmail || data.ownerEmail || data.email || "",
              ownerPhone: prev.ownerPhone || step1Data.ownerPhone || data.ownerPhone || data.phone || "",
              zoneId: prev.zoneId || step1Data.zoneId || data.zoneId || "",
              primaryContactNumber:
                prev.primaryContactNumber ||
                step1Data.primaryContactNumber ||
                data.primaryContactNumber ||
                data.ownerPhone ||
                data.phone ||
                "",
              location: {
                ...prev.location,
                formattedAddress:
                  locationData.formattedAddress ||
                  locationData.address ||
                  data.address ||
                  prev.location?.formattedAddress ||
                  "",
                addressLine1: locationData.addressLine1 || data.addressLine1 || prev.location?.addressLine1 || "",
                addressLine2: locationData.addressLine2 || data.addressLine2 || prev.location?.addressLine2 || "",
                area: locationData.area || data.area || prev.location?.area || "",
                city: locationData.city || data.city || prev.location?.city || "",
                state: locationData.state || data.state || prev.location?.state || "",
                pincode: locationData.pincode || data.pincode || prev.location?.pincode || "",
                landmark: locationData.landmark || data.landmark || prev.location?.landmark || "",
                latitude: locationData.latitude ?? prev.location?.latitude ?? "",
                longitude: locationData.longitude ?? prev.location?.longitude ?? "",
              },
            }))

            // Map Step 2
            setStep2((prev) => ({
              ...prev,
              menuImages:
                (step2Data.menuImageUrls && step2Data.menuImageUrls.length > 0)
                  ? step2Data.menuImageUrls
                  : (data.menuImages && data.menuImages.length > 0)
                  ? data.menuImages
                  : prev.menuImages,
              profileImage: step2Data.profileImageUrl || data.profileImage || prev.profileImage,
              cuisines:
                (step2Data.cuisines && step2Data.cuisines.length > 0)
                  ? step2Data.cuisines
                  : (data.cuisines && data.cuisines.length > 0)
                  ? data.cuisines
                  : prev.cuisines,
              estimatedDeliveryTime:
                step2Data.estimatedDeliveryTime ||
                data.estimatedDeliveryTime ||
                prev.estimatedDeliveryTime ||
                "",
              openingTime: normalizeTimeValue(deliveryTimings.openingTime || data.openingTime) || prev.openingTime,
              closingTime: normalizeTimeValue(deliveryTimings.closingTime || data.closingTime) || prev.closingTime,
              openDays:
                (step2Data.openDays && step2Data.openDays.length > 0)
                  ? step2Data.openDays
                  : (data.openDays && data.openDays.length > 0)
                  ? data.openDays
                  : prev.openDays,
            }))

            // Map Step 3
            setStep3((prev) => ({
              ...prev,
              panNumber: panData.panNumber || data.panNumber || prev.panNumber || "",
              nameOnPan: panData.nameOnPan || data.nameOnPan || prev.nameOnPan || "",
              panImage: panData.image || data.panImage || prev.panImage || null,
              gstRegistered:
                typeof gstData.isRegistered === "boolean"
                  ? gstData.isRegistered
                  : typeof data.gstRegistered === "boolean"
                  ? data.gstRegistered
                  : (prev.gstRegistered || false),
              gstNumber: gstData.gstNumber || data.gstNumber || prev.gstNumber || "",
              gstLegalName: gstData.legalName || data.gstLegalName || prev.gstLegalName || "",
              gstAddress: gstData.address || data.gstAddress || prev.gstAddress || "",
              gstImage: gstData.image || data.gstImage || prev.gstImage || null,
              fssaiNumber: fssaiData.registrationNumber || data.fssaiNumber || prev.fssaiNumber || "",
              fssaiExpiry:
                fssaiData.expiryDate
                  ? String(fssaiData.expiryDate).split("T")[0]
                  : data.fssaiExpiry
                  ? String(data.fssaiExpiry).split("T")[0]
                  : prev.fssaiExpiry,
              fssaiImage: fssaiData.image || data.fssaiImage || prev.fssaiImage || null,
              accountNumber: bankData.accountNumber || data.accountNumber || prev.accountNumber || "",
              confirmAccountNumber:
                bankData.accountNumber || data.accountNumber || prev.confirmAccountNumber || "",
              ifscCode: (bankData.ifscCode || data.ifscCode || prev.ifscCode || "").toUpperCase(),
              accountHolderName:
                bankData.accountHolderName || data.accountHolderName || prev.accountHolderName || "",
              accountType: normalizeAccountTypeValue(bankData.accountType || data.accountType || prev.accountType || ""),
            }))

          // Only determine step automatically if not specified in URL
          const stepParam = searchParams.get("step")
          if (!stepParam) {
            // If already registered/pending, stay on step 1 for editing
            if (data.status === "approved" || data.status === "pending") {
               setStep(1)
            } else {
               const stepToShow = determineStepToShow({ step1: data, step2: data, step3: data })
               // Map null (all steps complete) to final step for this flow
               const targetStep = stepToShow === null ? 3 : stepToShow
               
               // Only update if backend says we are further along than current local step
               // This prevents "downgrading" the step on reload if backend is out of sync
               setStep(prevStep => {
                 if (targetStep > prevStep) {
                   return targetStep
                 }
                 return prevStep
               })
            }
          }
        } else {
          setIsEditing(true)
          setHasExistingRestaurantProfile(false)
        }
      } catch (err) {
        setIsEditing(true)
        setHasExistingRestaurantProfile(false)
        if (err?.response?.status === 401) {
          debugError("Authentication error fetching onboarding:", err)
        } else {
          debugError("Error fetching onboarding data:", err)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [searchParams])

  const handleUpload = async (file, folder) => {
    try {
      if (!isUploadableFile(file)) {
        throw new Error("Invalid image file")
      }

      const response = await uploadAPI.uploadMedia(file, { folder })
      const uploadedImage = response?.data?.data

      if (!uploadedImage?.url) {
        throw new Error("Uploaded image URL was not returned")
      }

      return uploadedImage
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      debugError("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push("Restaurant name is required")
    }
    if (typeof step1.pureVegRestaurant !== "boolean") {
      errors.push("Please select whether your restaurant is pure veg")
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    } else if (!OWNER_NAME_REGEX.test(step1.ownerName.trim())) {
      errors.push("Owner name must contain only letters")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!EMAIL_REGEX.test(step1.ownerEmail.trim()) || step1.ownerEmail.includes('..') || hasSuspiciousEmailTld(step1.ownerEmail)) {
      errors.push("Please enter a valid email address")
    } else {
      const emailParts = step1.ownerEmail.trim().toLowerCase().split('@')[1]?.split('.') || []
      if (emailParts.length >= 2 && emailParts[emailParts.length - 1] === emailParts[emailParts.length - 2]) {
        errors.push("Please enter a valid email address (avoid repeated domain parts like .com.com)")
      }
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    } else if (!INDIAN_PHONE_REGEX.test(step1.ownerPhone.trim())) {
      errors.push("Please enter a valid 10-digit Indian phone number for owner")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!INDIAN_PHONE_REGEX.test(step1.primaryContactNumber.trim())) {
      errors.push("Please enter a valid 10-digit Indian phone number for restaurant")
    }
    if (!step1.zoneId?.trim()) {
      errors.push("Service zone is required")
    }
    if (zoneDetectionState.status === "out_of_zone") {
      errors.push("No active zone found at this location")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    }

    return errors
  }

  const validateStep2 = () => {
    const errors = []

    // Check menu images - must have at least one File or existing URL
    const hasMenuImages = step2.menuImages && step2.menuImages.length > 0
    if (!hasMenuImages) {
      errors.push("At least one menu image is required")
    } else {
      // Verify that menu images are either File objects or have valid URLs
      const validMenuImages = step2.menuImages.filter(img => {
        if (isUploadableFile(img)) return true
        if (img?.url && typeof img.url === 'string') return true
        if (typeof img === 'string' && img.trim()) return true
        return false
      })
      if (validMenuImages.length === 0) {
        errors.push("Please upload at least one valid menu image")
      }
    }

    // Check profile image - must be a File or existing URL
    if (!step2.profileImage) {
      errors.push("Restaurant profile image is required")
    } else {
      // Verify profile image is either a File or has a valid URL
      const isValidProfileImage =
        isUploadableFile(step2.profileImage) ||
        (step2.profileImage?.url && typeof step2.profileImage.url === 'string') ||
        (typeof step2.profileImage === 'string' && step2.profileImage.trim())
      if (!isValidProfileImage) {
        errors.push("Please upload a valid restaurant profile image")
      }
    }

    if (!step2.openingTime?.trim()) {
      errors.push("Opening time is required")
    }
    if (!step2.closingTime?.trim()) {
      errors.push("Closing time is required")
    }
    const openingMinutes = timeStringToMinutes(step2.openingTime)
    const closingMinutes = timeStringToMinutes(step2.closingTime)
    if (openingMinutes !== null && closingMinutes !== null) {
      if (openingMinutes === closingMinutes) {
        errors.push("Opening time and closing time cannot be same")
      } else if (closingMinutes < openingMinutes) {
        errors.push("Closing time cannot be less than opening time")
      }
    }
    if (!step2.openDays || step2.openDays.length === 0) {
      errors.push("Please select at least one open day")
    }
    if (!step2.estimatedDeliveryTime?.trim()) {
      errors.push("Estimated delivery time is required")
    }

    return errors
  }

  const validateStep3 = () => {
    const errors = []

    if (!step3.panNumber?.trim()) {
      errors.push("PAN number is required")
    } else if (!PAN_NUMBER_REGEX.test(step3.panNumber.trim().toUpperCase())) {
      errors.push("PAN number must be valid (e.g., ABCDE1234F)")
    }
    if (!step3.nameOnPan?.trim()) {
      errors.push("Name on PAN is required")
    }
    // Validate PAN image - must be a File or existing URL
    if (!step3.panImage) {
      errors.push("PAN image is required")
    } else {
      const isValidPanImage =
        isUploadableFile(step3.panImage) ||
        (step3.panImage?.url && typeof step3.panImage.url === 'string') ||
        (typeof step3.panImage === 'string' && step3.panImage.trim())
      if (!isValidPanImage) {
        errors.push("Please upload a valid PAN image")
      }
    }

    if (!step3.fssaiNumber?.trim()) {
      errors.push("FSSAI number is required")
    } else if (!FSSAI_NUMBER_REGEX.test(step3.fssaiNumber.trim())) {
      errors.push("FSSAI number must contain exactly 14 digits")
    }
    if (!step3.fssaiExpiry?.trim()) {
      errors.push("FSSAI expiry date is required")
    } else if (step3.fssaiExpiry < getTodayLocalYMD()) {
      errors.push("FSSAI expiry date cannot be in the past")
    }
    // Validate FSSAI image - must be a File or existing URL
    if (!step3.fssaiImage) {
      errors.push("FSSAI image is required")
    } else {
      const isValidFssaiImage =
        isUploadableFile(step3.fssaiImage) ||
        (step3.fssaiImage?.url && typeof step3.fssaiImage.url === 'string') ||
        (typeof step3.fssaiImage === 'string' && step3.fssaiImage.trim())
      if (!isValidFssaiImage) {
        errors.push("Please upload a valid FSSAI image")
      }
    }

    // Validate GST details if GST registered
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) {
        errors.push("GST number is required when GST registered")
      } else if (!GST_NUMBER_REGEX.test(step3.gstNumber.trim().toUpperCase())) {
        errors.push("GST number must be a valid 15-character GSTIN")
      }
      if (!step3.gstLegalName?.trim()) {
        errors.push("GST legal name is required when GST registered")
      } else if (!GST_LEGAL_NAME_REGEX.test(step3.gstLegalName.trim())) {
        errors.push("GST legal name must contain only letters")
      }
      if (!step3.gstAddress?.trim()) {
        errors.push("GST registered address is required when GST registered")
      }
      // Validate GST image if GST registered
      if (!step3.gstImage) {
        errors.push("GST image is required when GST registered")
      } else {
        const isValidGstImage =
          isUploadableFile(step3.gstImage) ||
          (step3.gstImage?.url && typeof step3.gstImage.url === 'string') ||
          (typeof step3.gstImage === 'string' && step3.gstImage.trim())
        if (!isValidGstImage) {
          errors.push("Please upload a valid GST image")
        }
      }
    }

    if (!step3.accountNumber?.trim()) {
      errors.push("Account number is required")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) {
      errors.push("Account number must contain 9 to 18 digits only")
    }
    if (!step3.confirmAccountNumber?.trim()) {
      errors.push("Please confirm your account number")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.confirmAccountNumber.trim())) {
      errors.push("Confirm account number must contain 9 to 18 digits only")
    }
    if (step3.accountNumber && step3.confirmAccountNumber && step3.accountNumber !== step3.confirmAccountNumber) {
      errors.push("Account number and confirmation do not match")
    }
    if (!step3.ifscCode?.trim()) {
      errors.push("IFSC code is required")
    } else if (!IFSC_CODE_REGEX.test(step3.ifscCode.trim().toUpperCase())) {
      errors.push("IFSC code must contain exactly 11 alphanumeric characters")
    }
    if (!step3.accountHolderName?.trim()) {
      errors.push("Account holder name is required")
    } else if (!ACCOUNT_HOLDER_NAME_REGEX.test(step3.accountHolderName.trim())) {
      errors.push("Account holder name must contain only letters")
    }
    if (!step3.accountType?.trim()) {
      errors.push("Account type is required")
    } else if (!["Saving", "Current"].includes(step3.accountType.trim())) {
      errors.push("Account type must be either Saving or Current")
    }

    return errors
  }

  // Fill dummy data for testing (development mode only)




  const handleFinalSubmit = async () => {
    if (requiresOnboardingFee && !step4State.onboardingFeePaid) {
      throw new Error("Please pay the onboarding fee before submitting")
    }

    const formData = new FormData()
    formData.append('restaurantName', step1.restaurantName || '')
    formData.append('pureVegRestaurant', step1.pureVegRestaurant === true ? 'true' : 'false')
    formData.append('ownerName', step1.ownerName || '')
    formData.append('ownerEmail', (step1.ownerEmail || '').trim())
    formData.append('ownerPhone', normalizePhoneDigits(step1.ownerPhone))
    formData.append('primaryContactNumber', normalizePhoneDigits(step1.primaryContactNumber))
    formData.append('zoneId', step1.zoneId || '')
    formData.append('addressLine1', step1.location?.addressLine1 || '')
    formData.append('addressLine2', step1.location?.addressLine2 || '')
    formData.append('area', step1.location?.area || '')
    formData.append('city', step1.location?.city || '')
    formData.append('state', step1.location?.state || '')
    formData.append('pincode', step1.location?.pincode || '')
    formData.append('landmark', step1.location?.landmark || '')
    formData.append('formattedAddress', step1.location?.formattedAddress || '')
    formData.append('latitude', String(step1.location?.latitude || ''))
    formData.append('longitude', String(step1.location?.longitude || ''))
    formData.append('cuisines', (step2.cuisines || []).join(','))
    formData.append('estimatedDeliveryTime', (step2.estimatedDeliveryTime || '').trim())
    formData.append('openingTime', normalizeTimeValue(step2.openingTime) || '')
    formData.append('closingTime', normalizeTimeValue(step2.closingTime) || '')
    formData.append('openDays', (step2.openDays || []).join(','))

    const menuImages = step2.menuImages || []
    const menuFiles = menuImages.filter((f) => isUploadableFile(f))
    const menuUrls = menuImages.map((f) => (typeof f === 'string' ? f : (f?.url || null))).filter(Boolean)
    if (menuFiles.length === 0 && menuUrls.length === 0) {
      throw new Error('At least one menu image must be uploaded')
    }
    menuFiles.forEach((file) => formData.append('menuImages', file))
    if (menuUrls.length > 0) {
      formData.append('menuImages', JSON.stringify(menuUrls))
    }

    if (!step2.profileImage) throw new Error('Restaurant profile image is required')
    if (isUploadableFile(step2.profileImage)) formData.append('profileImage', step2.profileImage)
    else formData.append('profileImage', typeof step2.profileImage === 'string' ? step2.profileImage : step2.profileImage.url)

    formData.append('panNumber', step3.panNumber || '')
    formData.append('nameOnPan', step3.nameOnPan || '')
    if (!step3.panImage) throw new Error('PAN image is required')
    if (isUploadableFile(step3.panImage)) formData.append('panImage', step3.panImage)
    else formData.append('panImage', typeof step3.panImage === 'string' ? step3.panImage : step3.panImage.url)

    formData.append('gstRegistered', step3.gstRegistered ? 'true' : 'false')
    if (step3.gstRegistered) {
      formData.append('gstNumber', step3.gstNumber || '')
      formData.append('gstLegalName', step3.gstLegalName || '')
      formData.append('gstAddress', step3.gstAddress || '')
      if (!step3.gstImage) throw new Error('GST image is required when GST registered')
      if (isUploadableFile(step3.gstImage)) formData.append('gstImage', step3.gstImage)
      else formData.append('gstImage', typeof step3.gstImage === 'string' ? step3.gstImage : step3.gstImage.url)
    }

    formData.append('fssaiNumber', step3.fssaiNumber || '')
    formData.append('fssaiExpiry', step3.fssaiExpiry || '')
    if (!step3.fssaiImage) throw new Error('FSSAI image is required')
    if (isUploadableFile(step3.fssaiImage)) formData.append('fssaiImage', step3.fssaiImage)
    else formData.append('fssaiImage', typeof step3.fssaiImage === 'string' ? step3.fssaiImage : step3.fssaiImage.url)

    formData.append('accountNumber', step3.accountNumber || '')
    formData.append('ifscCode', (step3.ifscCode || '').toUpperCase())
    formData.append('accountHolderName', step3.accountHolderName || '')
    formData.append('accountType', step3.accountType || '')
    formData.append('subscriptionPlan', 'starter')

    if (requiresOnboardingFee) {
      formData.append('onboardingFeeAmount', String(step4State.onboardingFeeAmount || onboardingFeeTotal))
      formData.append('onboardingFeePaid', 'true')
      formData.append('paymentType', step4State.paymentType || 'razorpay')
      formData.append('razorpayOrderId', step4State.razorpayOrderId || '')
      formData.append('razorpayPaymentId', step4State.razorpayPaymentId || '')
      formData.append('razorpaySignature', step4State.razorpaySignature || '')
    }

    setRegistrationProcessing(true)
    const loadingToast = toast.loading('Submitting onboarding request...')
    try {
      await restaurantAPI.register(formData)
      toast.dismiss(loadingToast)
      clearOnboardingFromLocalStorage()
      clearOnboardingFileCache()
      try {
        localStorage.setItem('restaurant_pendingPhone', normalizePhoneDigits(step1.ownerPhone))
      } catch {}
      toast.success('Registration submitted for admin approval.', { duration: 4000 })
      navigate('/food/restaurant/pending-verification', {
        replace: true,
        state: { phone: normalizePhoneDigits(step1.ownerPhone) },
      })
    } finally {
      setRegistrationProcessing(false)
    }
  }

  const handlePayOnboardingFee = async () => {
    if (!requiresOnboardingFee || step4State.onboardingFeePaid) return

    const phone = normalizePhoneDigits(step1.ownerPhone)
    if (!phone) {
      toast.error("Owner phone is required for payment")
      return
    }

    setPaymentProcessing(true)
    try {
      const orderResponse = await restaurantAPI.createOnboardingFeeOrder(phone)
      const payload = orderResponse?.data?.data || orderResponse?.data || {}
      const razorpay = payload?.razorpay
      const feeTotal =
        Number(payload?.onboardingFeeTotal) ||
        Number(payload?.onboardingFeeAmount ?? onboardingFeeTotal) ||
        onboardingFeeTotal

      if (!razorpay?.orderId || !razorpay?.key) {
        throw new Error("Failed to initialize payment gateway")
      }

      const company = await getCompanyNameAsync()

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: company || companyName,
        description: "Restaurant onboarding fee",
        prefill: {
          name: step1.ownerName || "",
          email: (step1.ownerEmail || "").trim(),
          contact: phone,
        },
        handler: (response) => {
          setStep4State((prev) => ({
            ...prev,
            onboardingFeePaid: true,
            onboardingFeeAmount: feeTotal,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
            paymentType: "razorpay",
          }))
          toast.success("Onboarding fee paid successfully")
        },
        onClose: () => {
          toast.info("Payment cancelled")
        },
        onError: (err) => {
          toast.error(err?.message || "Payment failed")
        },
      })
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to start onboarding fee payment"
      toast.error(msg)
    } finally {
      setPaymentProcessing(false)
    }
  }

  const handleNext = async () => {
    setError("")

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      if (requiresOnboardingFee && !step4State.onboardingFeePaid) {
        validationErrors = ["Please pay the onboarding fee to complete onboarding"]
      }
    }

    if (validationErrors.length > 0) {
      // Surface only the first error so validation proceeds top-to-bottom.
      toast.error(validationErrors[0], {
        duration: 4000,
      })
      debugLog('? Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        goToStep(2)
      } else if (step === 2) {
        goToStep(3)
      } else if (step === 3) {
        goToStep(4)
      } else if (step === 4) {
        await handleFinalSubmit()
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }



  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={`${ONBOARDING_SECTION_TITLE} mb-4`}>Restaurant information</h2>
        <div className="space-y-3">
          <div>
            <Label className={ONBOARDING_LABEL}>Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              className={ONBOARDING_INPUT}
              placeholder="Customers will see this name"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>Pure veg restaurant?*</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: true })}
                className={chipClass(step1.pureVegRestaurant === true, !isEditing)}
              >
                Yes, Pure Veg
              </button>
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: false })}
                className={chipClass(step1.pureVegRestaurant === false, !isEditing)}
              >
                No, Mixed Menu
              </button>
            </div>
            <p className={ONBOARDING_HINT}>
              This helps users filter restaurants by dietary preference.
            </p>
          </div>
        </div>
      </section>

      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={`${ONBOARDING_SECTION_TITLE} mb-4`}>Owner details</h2>
        <p className={`${ONBOARDING_SECTION_DESC} mb-4`}>
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className={ONBOARDING_LABEL}>Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) =>
                setStep1({
                  ...step1,
                  ownerName: e.target.value.replace(/[^A-Za-z ]/g, ""),
                })
              }
              className={ONBOARDING_INPUT}
              placeholder="Owner full name"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })}
              className={ONBOARDING_INPUT}
              placeholder="owner@example.com"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>Phone number*</Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "")
                const val = raw.startsWith("91") && raw.length > 10 ? raw.slice(2) : raw
                setStep1({ ...step1, ownerPhone: val.slice(0, 10) })
              }}
              onKeyDown={(e) => {
                const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
                if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
                if (/^\d$/.test(e.key) && (step1.ownerPhone || "").length >= 10) e.preventDefault()
              }}
              onPaste={(e) => {
                e.preventDefault()
                const raw = e.clipboardData.getData("text").replace(/\D/g, "")
                const val = raw.startsWith("91") && raw.length > 10 ? raw.slice(2) : raw
                setStep1({ ...step1, ownerPhone: val.slice(0, 10) })
              }}
              readOnly={Boolean(verifiedPhoneNumber)}
              inputMode="numeric"
              className={ONBOARDING_INPUT}
              placeholder="98XXXXXX"
              disabled={!isEditing}
            />
          </div>
        </div>
      </section>

      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>Restaurant contact & location</h2>
        <div>
          <Label className={ONBOARDING_LABEL}>Primary contact number*</Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "")
              const val = raw.startsWith("91") && raw.length > 10 ? raw.slice(2) : raw
              setStep1({ ...step1, primaryContactNumber: val.slice(0, 10) })
            }}
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step1.primaryContactNumber || "").length >= 10) e.preventDefault()
            }}
            onPaste={(e) => {
              e.preventDefault()
              const raw = e.clipboardData.getData("text").replace(/\D/g, "")
              const val = raw.startsWith("91") && raw.length > 10 ? raw.slice(2) : raw
              setStep1({ ...step1, primaryContactNumber: val.slice(0, 10) })
            }}
            inputMode="numeric"
            className={ONBOARDING_INPUT}
            placeholder="Restaurant's primary contact number"
            disabled={!isEditing}
          />
          <p className={ONBOARDING_HINT}>
            Customers, delivery partners and {companyName} may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <div className="relative">
            <Label className={ONBOARDING_LABEL}>Search location</Label>
            <p className="text-[12px] text-gray-600 mt-1">
              Zone will be auto detected according to the selected location.
            </p>
            <div className="relative">
              <Input
                ref={locationSearchInputRef}
                value={locationSearchValue}
                onChange={(e) => {
                  setLocationSearchValue(e.target.value)
                  setZoneDetectionState((prev) =>
                    prev.status === "idle" ? prev : { status: "idle", message: "", zoneName: "" }
                  )
                }}
                className={ONBOARDING_INPUT}
                placeholder="Start typing your restaurant address..."
              />
              {isSearchingLocation && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                   <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#FA0272] border-t-transparent" />
                </div>
              )}
            </div>

            {/* Fallback suggestions dropdown */}
            {locationSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-xl z-[999999] overflow-hidden max-h-60 overflow-y-auto">
                {locationSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={async () => {
                      if (s.source === "google" && s.placeId && placesDetailsServiceRef.current && window.google?.maps?.places?.PlacesServiceStatus) {
                        try {
                          const place = await new Promise((resolve, reject) => {
                            placesDetailsServiceRef.current.getDetails(
                              {
                                placeId: s.placeId,
                                fields: ["formatted_address", "address_components", "geometry"],
                                sessionToken: placesSessionTokenRef.current || undefined,
                              },
                              (result, status) => {
                                if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
                                  resolve(result)
                                  return
                                }
                                reject(new Error(String(status || "Failed to fetch place details")))
                              }
                            )
                          })

                          const comps = Array.isArray(place?.address_components) ? place.address_components : []
                          const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
                          const formattedAddress = place?.formatted_address || s.display || ""
                          const area = get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"])
                          const city = get(["locality"]) || get(["administrative_area_level_2"])
                          const state = get(["administrative_area_level_1"]) || get(["administrative_area_level_2"])
                          const pincode = get(["postal_code"])
                          const lat = place?.geometry?.location?.lat?.()
                          const lng = place?.geometry?.location?.lng?.()

                          setStep1((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              formattedAddress,
                              addressLine1: formattedAddress,
                              area: area || prev.location.area,
                              city: city || prev.location.city,
                              state: state || prev.location.state,
                              pincode: pincode || prev.location.pincode,
                              latitude: typeof lat === "number" ? Number(lat.toFixed(6)) : prev.location.latitude,
                              longitude: typeof lng === "number" ? Number(lng.toFixed(6)) : prev.location.longitude,
                            },
                          }))
                          setIsAutoFilledLocationLocked(true)
                          suppressSuggestionFetchRef.current = true
                          setLocationSearchValue(formattedAddress)
                          setLocationSuggestions([])
                          locationSearchInputRef.current?.blur()
                          if (window.google?.maps?.places?.AutocompleteSessionToken) {
                            placesSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
                          }
                          await detectAndSetZoneForLocation(lat, lng)
                          return
                        } catch (err) {
                          debugWarn("Google place details failed, falling back to manual suggestion mapping:", err)
                        }
                      }

                      const { lat, lng, display, addr = {} } = s
                      const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.locality || ""
                      const city = addr.city || addr.town || addr.village || ""
                      const state = addr.state || ""
                      const pincode = addr.postcode || ""

                      setStep1((prev) => ({
                        ...prev,
                        location: {
                          ...prev.location,
                          formattedAddress: display,
                          addressLine1: display,
                          area: area || prev.location.area,
                          city: city || prev.location.city,
                          state: state || prev.location.state,
                          pincode: pincode || prev.location.pincode,
                          latitude: Number.isFinite(lat) ? lat : prev.location.latitude,
                          longitude: Number.isFinite(lng) ? lng : prev.location.longitude,
                        },
                      }))
                      setIsAutoFilledLocationLocked(true)
                      suppressSuggestionFetchRef.current = true
                      setLocationSearchValue(display)
                      setLocationSuggestions([])
                      locationSearchInputRef.current?.blur()
                      await detectAndSetZoneForLocation(lat, lng)
                    }}
                    className="w-full px-4 py-2 text-left text-[13px] hover:bg-orange-50 border-b border-gray-100 last:border-none font-medium text-gray-700"
                  >
                    <span className="block truncate">{s.mainText || s.display}</span>
                    {s.secondaryText && (
                      <span className="block truncate text-[11px] text-gray-500">{s.secondaryText}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            
            <p className={ONBOARDING_HINT}>
              Select a suggestion to auto-fill area/city/state/pincode and coordinates.
            </p>
            {zoneDetectionState.status === "detecting" && (
              <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                Detecting service zone...
              </p>
            )}
            {zoneDetectionState.status === "matched" && (
              <p className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                {zoneDetectionState.message}
              </p>
            )}
            {zoneDetectionState.status === "out_of_zone" && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                No active zone found at this location.
              </p>
            )}
            {zoneDetectionState.status === "failed" && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {zoneDetectionState.message}
              </p>
            )}
          </div>
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine1: e.target.value },
              })
            }
            readOnly={isAutoFilledLocationLocked}
            className="bg-white text-sm"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine2: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, landmark: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
          <Input
            value={step1.location?.area || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, area: e.target.value },
              })
            }
            readOnly={isAutoFilledLocationLocked}
            className="bg-white text-sm"
            placeholder="Area / Sector / Locality*"
          />
          <Input
            value={step1.location?.city || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, city: e.target.value },
              })
            }
            readOnly={isAutoFilledLocationLocked}
            className="bg-white text-sm"
            placeholder="City"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={step1.location?.state || ""}
              onChange={(e) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, state: e.target.value },
                })
              }
              readOnly={isAutoFilledLocationLocked}
              className={ONBOARDING_INPUT}
              placeholder="State"
            />
            <Input
              value={step1.location?.pincode || ""}
              onChange={(e) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, pincode: e.target.value },
                })
              }
              readOnly={isAutoFilledLocationLocked}
              className={ONBOARDING_INPUT}
              placeholder="Pincode"
            />
          </div>
          <p className={ONBOARDING_HINT}>
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>
  )


  // Initialize Google Places Autocomplete for Step 1 location search.
  useEffect(() => {
    if (step !== 1) return

    let cancelled = false
    let autocomplete = null

    const init = async () => {
      // Wait for the input ref to be attached
      let inputElement = null
      for (let i = 0; i < 50; i++) {
        if (locationSearchInputRef.current) {
          inputElement = locationSearchInputRef.current
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }

      if (!inputElement || cancelled) return

      const loadMaps = async () => {
        // 1. If already available with places, return true
        if (window.google?.maps?.places?.Autocomplete) {
          mapsScriptLoadedRef.current = true
          return true
        }

        // 2. Load API Key
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) {
          debugError("Google Maps API Key missing or invalid")
          return false
        }

        // 3. Handle Auth Failure
        window.gm_authFailure = () => {
          debugError("Google Maps authentication failed.")
          // Don't show toast here as we have Nominatim fallback
        }

        // 4. Check for existing script and force libraries=places if needed
        const scripts = Array.from(document.getElementsByTagName("script"))
        const mapsScript = scripts.find(s => s.src?.includes("maps.googleapis.com/maps/api/js"))
        
        if (mapsScript && !mapsScript.src.includes("libraries=places")) {
          debugLog("Found maps script without places, removing to reload properly.")
          mapsScript.remove()
        } else if (mapsScript && mapsScript.src.includes("libraries=places")) {
           // Wait if it's still loading
           for (let i = 0; i < 60; i++) {
             if (window.google?.maps?.places?.Autocomplete) return true
             if (cancelled) return false
             await new Promise(r => setTimeout(r, 100))
           }
        }

        // 5. Create and append new script
        return new Promise((resolve) => {
          const script = document.createElement("script")
          script.id = "google-maps-sdk"
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
          script.async = true
          script.defer = true
          script.onload = () => {
            setTimeout(() => {
              const ok = !!window.google?.maps?.places?.Autocomplete
              mapsScriptLoadedRef.current = ok
              resolve(ok)
            }, 200)
          }
          script.onerror = () => resolve(false)
          document.head.appendChild(script)
        })
      }

      const parsePlace = (place) => {
        const formattedAddress = place?.formatted_address || ""
        const comps = Array.isArray(place?.address_components) ? place.address_components : []
        const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""

        const area = get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"])
        const city = get(["locality"]) || get(["administrative_area_level_2"])
        const state = get(["administrative_area_level_1"]) || get(["administrative_area_level_2"])
        const pincode = get(["postal_code"])
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()

        return {
          formattedAddress,
          area,
          city,
          state,
          pincode,
          latitude: typeof lat === "number" ? Number(lat.toFixed(6)) : "",
          longitude: typeof lng === "number" ? Number(lng.toFixed(6)) : "",
        }
      }

      const ok = await loadMaps()
      if (!ok || cancelled || !inputElement) return

      if (inputElement.hasAttribute("data-google-places-initialized")) return

      try {
        if (!placesAutocompleteServiceRef.current && window.google?.maps?.places?.AutocompleteService) {
          placesAutocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
        }
        if (!placesDetailsServiceRef.current && window.google?.maps?.places?.PlacesService) {
          const detailsHost = document.createElement("div")
          placesDetailsServiceRef.current = new window.google.maps.places.PlacesService(detailsHost)
        }
        if (!placesSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
          placesSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        }

        autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
          fields: ["formatted_address", "address_components", "geometry"],
          componentRestrictions: { country: "in" }
        })

        inputElement.setAttribute("data-google-places-initialized", "true")
        placesAutocompleteRef.current = autocomplete

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace()
          if (!place?.geometry) return

          const parsed = parsePlace(place)
          setStep1((prev) => ({
            ...prev,
            location: {
              ...prev.location,
              formattedAddress: parsed.formattedAddress || prev.location.formattedAddress,
              addressLine1: parsed.formattedAddress || prev.location.addressLine1 || "",
              area: parsed.area || prev.location.area,
              city: parsed.city || prev.location.city,
              state: parsed.state || prev.location.state,
              pincode: parsed.pincode || prev.location.pincode,
              latitude: parsed.latitude !== "" ? parsed.latitude : prev.location.latitude,
              longitude: parsed.longitude !== "" ? parsed.longitude : prev.location.longitude,
            },
          }))
          setIsAutoFilledLocationLocked(true)
          
          setLocationSearchValue(parsed.formattedAddress)
          inputElement.blur()
          void detectAndSetZoneForLocation(parsed.latitude, parsed.longitude)
        })

        const pacContainerFix = () => {
          const applyFix = () => {
            const containers = document.querySelectorAll(".pac-container")
            if (containers.length > 0) {
              containers.forEach((container) => {
                container.style.zIndex = "999999"
                container.style.pointerEvents = "auto"
                container.style.visibility = "visible"
                container.style.display = "block"
              })
            }
          }
          applyFix()
          setTimeout(applyFix, 100)
          setTimeout(applyFix, 300)
        }

        inputElement.addEventListener("focus", pacContainerFix)
        inputElement.addEventListener("input", pacContainerFix)
      } catch (e) {
        debugError("Autocomplete error:", e)
      }
    }

    init().catch(() => {})

    return () => {
      cancelled = true
      if (autocomplete) {
        try { window.google?.maps?.event?.clearInstanceListeners(autocomplete) } catch {}
      }
      if (locationSearchInputRef.current) {
        locationSearchInputRef.current.removeAttribute("data-google-places-initialized")
      }
      placesAutocompleteRef.current = null
    }
  }, [step])

  // Hybrid Search: Google predictions first, Nominatim fallback
  useEffect(() => {
    if (step !== 1) return
    if (suppressSuggestionFetchRef.current) {
      suppressSuggestionFetchRef.current = false
      return
    }
    const q = normalizeLocationQuery(locationSearchValue)
    if (q.length < 3) {
      setLocationSuggestions([])
      setIsSearchingLocation(false)
      if (window.google?.maps?.places?.AutocompleteSessionToken) {
        placesSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
      }
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsSearchingLocation(true)
        const hasGoogleAutocompleteService =
          !!placesAutocompleteServiceRef.current && !!window.google?.maps?.places?.PlacesServiceStatus

        if (hasGoogleAutocompleteService) {
          if (!placesSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
            placesSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
          }

          const predictions = await new Promise((resolve) => {
            placesAutocompleteServiceRef.current.getPlacePredictions(
              {
                input: q,
                componentRestrictions: { country: "in" },
                sessionToken: placesSessionTokenRef.current || undefined,
              },
              (items, status) => {
                const ok = status === window.google.maps.places.PlacesServiceStatus.OK
                resolve(ok && Array.isArray(items) ? items : [])
              }
            )
          })

          if (predictions.length > 0) {
            const mappedGoogle = predictions.slice(0, 6).map((p) => ({
              id: p.place_id,
              placeId: p.place_id,
              display: p.description || "",
              mainText: p.structured_formatting?.main_text || "",
              secondaryText: p.structured_formatting?.secondary_text || "",
              source: "google",
            }))
            setLocationSuggestions(mappedGoogle)
            return
          }
        }

        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}&countrycodes=in`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mappedFallback = (Array.isArray(json) ? json : []).map((r) => ({
          id: `n-${r.place_id}`,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          addr: r.address || {},
          source: "nominatim",
        }))
        setLocationSuggestions(mappedFallback)
      } catch (e) {
        debugError("Location prediction search failed:", e)
        setLocationSuggestions([])
      } finally {
        setIsSearchingLocation(false)
      }
    }, 400)

    return () => clearTimeout(t)
  }, [locationSearchValue, step])

  // Load zones for onboarding dropdown (public endpoint).
  useEffect(() => {
    if (step !== 1) return
    let cancelled = false
    setZonesLoading(true)
    zoneAPI.getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })
    return () => { cancelled = true }
  }, [step])


  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>Menu & photos</h2>
        <p className={ONBOARDING_SECTION_DESC}>
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className={ONBOARDING_LABEL}>Menu images</Label>
          <div className={`${ONBOARDING_UPLOAD_BOX} flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP ? You can select multiple files
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className={`w-full sm:w-auto ${ONBOARDING_UPLOAD_BTN}`}
              onClick={() =>
                openImageSourcePicker({
                  title: "Add menu image",
                  fileNamePrefix: "menu-image",
                  fallbackInputRef: menuImagesInputRef,
                  onSelectFile: (file) => handleMenuImagesSelected(file ? [file] : []),
                })
              }
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept={LOCAL_IMAGE_FILE_ACCEPT}
              className="hidden"
              ref={menuImagesInputRef}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                debugLog('?? Menu images selected:', files.length, 'files')
                handleMenuImagesSelected(files)
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          </div>

          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (isUploadableFile(file)) {
                  imageUrl = getPreviewImageUrl(file)
                  imageName = file.name || imageName
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-4/5 rounded-xl overflow-hidden bg-gray-100"
                  >
                    <div className="absolute top-1 right-1 z-30">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await handleRemoveMenuImage(idx)
                        }}
                        className="bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {uploadingAttachments[`menuImages_${idx}`] && (
                      <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      </div>
                    )}
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className={ONBOARDING_LABEL}>Restaurant profile image</Label>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                {step2.profileImage ? (
                  (() => {
                    const imageSrc = getPreviewImageUrl(step2.profileImage)

                    return imageSrc ? (
                      <img
                        src={imageSrc}
                        alt="Restaurant profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-500" />
                    );
                  })()
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-500" />
                )}
                {uploadingAttachments.profileImage && (
                  <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  </div>
                )}
              </div>
              {step2.profileImage && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await handleRemoveProfileImage()
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 flex-col flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">Upload profile image</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page.
                </span>
              </div>

            </div>

          </div>
          <Button
            type="button"
            variant="outline"
            className={`w-full ${ONBOARDING_UPLOAD_BTN}`}
            onClick={() =>
              openImageSourcePicker({
                title: "Upload profile image",
                fileNamePrefix: "profile-image",
                fallbackInputRef: profileImageInputRef,
                onSelectFile: handleProfileImageSelected,
              })
            }
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Button>
          <input
            id="profileImageInput"
            type="file"
            accept={LOCAL_IMAGE_FILE_ACCEPT}
            className="hidden"
            ref={profileImageInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                debugLog('?? Profile image selected:', file.name)
                handleProfileImageSelected(file)
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Operational details */}
      <section className={ONBOARDING_SECTION_FULL}>
        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className={ONBOARDING_LABEL}>Outlet timings</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onChange={(val) => {
                const nextOpening = normalizeTimeValue(val) || ""
                const openingMinutes = timeStringToMinutes(nextOpening)
                const closingMinutes = timeStringToMinutes(step2.closingTime)
                if (openingMinutes !== null && closingMinutes !== null) {
                  if (openingMinutes === closingMinutes) {
                    toast.error("Opening time and closing time cannot be same")
                    return
                  }
                  if (closingMinutes < openingMinutes) {
                    toast.error("Closing time cannot be less than opening time")
                    return
                  }
                }
                setStep2((prev) => ({ ...prev, openingTime: nextOpening }))
              }}
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onChange={(val) => {
                const nextClosing = normalizeTimeValue(val) || ""
                const openingMinutes = timeStringToMinutes(step2.openingTime)
                const closingMinutes = timeStringToMinutes(nextClosing)
                if (openingMinutes !== null && closingMinutes !== null) {
                  if (openingMinutes === closingMinutes) {
                    toast.error("Opening time and closing time cannot be same")
                    return
                  }
                  if (closingMinutes < openingMinutes) {
                    toast.error("Closing time cannot be less than opening time")
                    return
                  }
                }
                setStep2((prev) => ({ ...prev, closingTime: nextClosing }))
              }}
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>Estimated delivery time*</Label>
            <Input
              value={step2.estimatedDeliveryTime || ""}
              onChange={(e) =>
                setStep2((prev) => ({ ...prev, estimatedDeliveryTime: e.target.value }))
              }
              className="mt-1 bg-white text-sm"
              placeholder="e.g., 25-30 mins"
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days</span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-xl border text-xs font-medium transition-all ${active ? ONBOARDING_DAY_ACTIVE : ONBOARDING_DAY_INACTIVE}`}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className={ONBOARDING_LABEL}>PAN number</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const normalized = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10)
                setStep3({ ...step3, panNumber: normalized })
              }}
              className={ONBOARDING_INPUT}
              placeholder="ABCDE1234F"
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>PAN Card Holder Name</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  nameOnPan: e.target.value.replace(/[^A-Za-z ]/g, ""),
                })
              }
              className={ONBOARDING_INPUT}
              placeholder="Name as on PAN card"
            />
          </div>
        </div>
        <div>
          <Label className={ONBOARDING_LABEL}>PAN image</Label>
          <Button
            type="button"
            variant="outline"
            className={`mt-2 w-full sm:w-auto ${ONBOARDING_UPLOAD_BTN}`}
            onClick={() =>
              openImageSourcePicker({
                title: "Upload PAN image",
                fileNamePrefix: "pan-image",
                fallbackInputRef: panImageInputRef,
                onSelectFile: handlePanImageSelected,
              })
            }
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Button>
          <input
            type="file"
            accept={GALLERY_IMAGE_ACCEPT}
            className="hidden"
            ref={panImageInputRef}
            onChange={(e) => {
              handlePanImageSelected(e.target.files?.[0] || null)
              e.target.value = ""
            }}
          />
          {step3.panImage && (
            <div className={ONBOARDING_DOC_PREVIEW}>
              {getPreviewImageUrl(step3.panImage) ? (
                <img
                  src={getPreviewImageUrl(step3.panImage)}
                  alt="PAN document"
                  className="h-full w-full object-contain bg-white"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  Preview unavailable
                </div>
              )}
              {uploadingAttachments.panImage && (
                <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent"></div>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setStep3((prev) => ({ ...prev, panImage: null }))
                }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={chipClass(step3.gstRegistered, false)}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={chipClass(!step3.gstRegistered, false)}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <Input
              value={step3.gstNumber || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  gstNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
                })
              }
              className={ONBOARDING_INPUT}
              placeholder="GST number (15 characters)"
            />
            <Input
              value={step3.gstLegalName || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  gstLegalName: e.target.value.replace(/[^A-Za-z ]/g, ""),
                })
              }
              className={ONBOARDING_INPUT}
              placeholder="Legal name"
            />
            <Input
              value={step3.gstAddress || ""}
              onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })}
              className={ONBOARDING_INPUT}
              placeholder="Registered address"
            />
            <Button
              type="button"
              variant="outline"
              className={`w-full sm:w-auto ${ONBOARDING_UPLOAD_BTN}`}
              onClick={() =>
                openImageSourcePicker({
                  title: "Upload GST image",
                  fileNamePrefix: "gst-image",
                  fallbackInputRef: gstImageInputRef,
                  onSelectFile: handleGstImageSelected,
                })
              }
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
            </Button>
            <input
              type="file"
              accept={GALLERY_IMAGE_ACCEPT}
              className="hidden"
              ref={gstImageInputRef}
              onChange={(e) => {
                handleGstImageSelected(e.target.files?.[0] || null)
                e.target.value = ""
              }}
            />
            {step3.gstImage && (
              <div className={ONBOARDING_DOC_PREVIEW}>
                {getPreviewImageUrl(step3.gstImage) ? (
                  <img
                    src={getPreviewImageUrl(step3.gstImage)}
                    alt="GST document"
                    className="h-full w-full object-contain bg-white"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    Preview unavailable
                  </div>
                )}
                {uploadingAttachments.gstImage && (
                  <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent"></div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setStep3((prev) => ({ ...prev, gstImage: null }))
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className={ONBOARDING_LABEL}>FSSAI number</Label>
            <Input
              value={step3.fssaiNumber || ""}
              onChange={(e) =>
                setStep3({ ...step3, fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14) })
              }
              className={ONBOARDING_INPUT}
              placeholder="14-digit FSSAI license number"
            />
          </div>
          <div>
            <Label className={ONBOARDING_LABEL}>FSSAI expiry date</Label>
            <Popover open={isFssaiCalendarOpen} onOpenChange={setIsFssaiCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsFssaiCalendarOpen(true)}
                  className="mt-2 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-colors hover:bg-gray-50"
                >
                  <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                    {step3.fssaiExpiry
                      ? parseLocalYMDDate(step3.fssaiExpiry)?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                      : "Select expiry date"}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-100" align="start">
                <div className="bg-white rounded-md shadow-lg border border-gray-200">
                  <Calendar
                    mode="single"
                    selected={parseLocalYMDDate(step3.fssaiExpiry)}
                    disabled={(date) => formatDateToLocalYMD(date) < getTodayLocalYMD()}
                    onSelect={(date) => {
                      if (date && formatDateToLocalYMD(date) >= getTodayLocalYMD()) {
                        const formattedDate = formatDateToLocalYMD(date)
                        setStep3({ ...step3, fssaiExpiry: formattedDate })
                        setIsFssaiCalendarOpen(false)
                      }
                    }}
                    initialFocus
                    classNames={{
                      today: "bg-transparent text-foreground border-none", // Remove today highlight
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className={`w-full ${ONBOARDING_UPLOAD_BTN}`}
          onClick={() =>
            openImageSourcePicker({
              title: "Upload FSSAI image",
              fileNamePrefix: "fssai-image",
              fallbackInputRef: fssaiImageInputRef,
              onSelectFile: handleFssaiImageSelected,
            })
          }
        >
          <Upload className="w-4 h-4 mr-1.5" />
          Upload
        </Button>
        <input
          type="file"
          accept={GALLERY_IMAGE_ACCEPT}
          className="hidden"
          ref={fssaiImageInputRef}
          onChange={(e) => {
            handleFssaiImageSelected(e.target.files?.[0] || null)
            e.target.value = ""
          }}
        />
        {step3.fssaiImage && (
          <div className={ONBOARDING_DOC_PREVIEW}>
            {getPreviewImageUrl(step3.fssaiImage) ? (
              <img
                src={getPreviewImageUrl(step3.fssaiImage)}
                alt="FSSAI document"
                className="h-full w-full object-contain bg-white"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                Preview unavailable
              </div>
            )}
            {uploadingAttachments.fssaiImage && (
              <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent"></div>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep3((prev) => ({ ...prev, fssaiImage: null }))
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      <section className={ONBOARDING_SECTION_FULL}>
        <h2 className={ONBOARDING_SECTION_TITLE}>Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            value={step3.accountNumber || ""}
            onChange={(e) =>
              setStep3({ ...step3, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })
            }
            className="bg-white text-sm"
            placeholder="Account number"
          />
          <Input
            value={step3.confirmAccountNumber || ""}
            onChange={(e) =>
              setStep3({
                ...step3,
                confirmAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18),
              })
            }
            className="bg-white text-sm"
            placeholder="Re-enter account number"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            value={step3.ifscCode || ""}
            onChange={(e) =>
              setStep3({
                ...step3,
                ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
              })
            }
            className="bg-white text-sm"
            placeholder="IFSC code"
          />
          <Select
            value={step3.accountType || ""}
            onValueChange={(value) => setStep3({ ...step3, accountType: value })}
          >
            <SelectTrigger className="bg-white text-sm">
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Saving">Saving</SelectItem>
              <SelectItem value="Current">Current</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          value={step3.accountHolderName || ""}
          onChange={(e) =>
            setStep3({
              ...step3,
              accountHolderName: e.target.value.replace(/[^A-Za-z ]/g, ""),
            })
          }
          className="bg-white text-sm"
          placeholder="Account holder name"
        />
      </section>

    </div>
  )

  const formatGmvRange = (plan) => {
    const min = Number(plan?.gmvMin ?? 0)
    const max = plan?.gmvMax
    if (max == null) return `≥ ${formatMoney(min)}`
    return `${formatMoney(min)} – ${formatMoney(max)}`
  }

  const renderStep4 = () => (
    <div className="space-y-5">
      <section className={ONBOARDING_INFO_BOX}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FA0272]/10">
            <Info className="h-5 w-5 text-[#FA0272]" />
          </div>
          <div>
            <h2 className={ONBOARDING_SECTION_TITLE}>How subscription billing works</h2>
            <p className={`${ONBOARDING_SECTION_DESC} mt-2`}>
              Your monthly plan is assigned automatically from your restaurant&apos;s calendar-month GMV
              (net earnings from delivered orders). Invoices are generated at month end with plan amount
              plus {(gstRate * 100).toFixed(0)}% GST. No upfront subscription purchase is required today.
            </p>
          </div>
        </div>
      </section>

      {loadingSubscriptionSettings ? (
        <section className={`${ONBOARDING_SECTION_FULL} text-sm text-gray-500`}>
          Loading subscription plans...
        </section>
      ) : (
        <section className={ONBOARDING_SECTION_FULL}>
          <div className="mb-5">
            <h3 className={ONBOARDING_SECTION_TITLE}>Monthly plans by GMV slab</h3>
            <p className={`${ONBOARDING_SECTION_DESC} mt-1`}>
              Your plan is assigned automatically based on your restaurant&apos;s monthly order volume.
            </p>
          </div>

          {planCatalog.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {planCatalog.map((plan) => {
                const gstAmount = Math.round(Number(plan.basePrice || 0) * gstRate * 100) / 100
                const totalWithGst = Number(plan.basePrice || 0) + gstAmount
                return (
                  <div key={plan.id} className={ONBOARDING_PLAN_CARD}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FA0272]/10">
                        <Award className="h-5 w-5 text-[#FA0272]" />
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">{formatMoney(plan.basePrice)}</p>
                        <p className="text-[11px] font-medium text-gray-500">/ month + GST</p>
                      </div>
                    </div>

                    <p className="mt-4 text-base font-semibold text-gray-900">{plan.label} Plan</p>

                    <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Monthly GMV slab
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-gray-800">{formatGmvRange(plan)}</p>
                    </div>

                    <div className="mt-auto border-t border-gray-100 pt-4">
                      <p className="text-xs text-gray-500">
                        Estimated invoice:{" "}
                        <span className="font-semibold text-gray-800">{formatMoney(totalWithGst)}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        Includes GST ({formatMoney(gstAmount)})
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              Subscription plan details are not available right now.
            </div>
          )}
        </section>
      )}

      {requiresOnboardingFee ? (
        <section className={`${ONBOARDING_SECTION_FULL} border-[#FA0272]/20`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FA0272]/10">
                <Wallet className="h-5 w-5 text-[#FA0272]" />
              </div>
              <div className="max-w-xl">
                <h3 className={ONBOARDING_SECTION_TITLE}>One-time onboarding fee</h3>
                <p className={`${ONBOARDING_SECTION_DESC} mt-1`}>
                  A one-time onboarding fee is required before your application can be submitted
                  for approval.
                </p>
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Onboarding fee</span>
                    <span className="font-medium text-gray-800">{formatMoney(onboardingFeeAmount)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-gray-600">
                    <span>GST ({(gstRate * 100).toFixed(0)}%)</span>
                    <span className="font-medium text-gray-800">{formatMoney(onboardingFeeGst)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-dashed border-gray-200 pt-2 font-semibold text-gray-900">
                    <span>Total payable</span>
                    <span>{formatMoney(onboardingFeeTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {step4State.onboardingFeePaid ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                <BadgeCheck className="h-4 w-4" />
                Paid
              </span>
            ) : null}
          </div>

          {!step4State.onboardingFeePaid ? (
            <Button
              type="button"
              onClick={handlePayOnboardingFee}
              disabled={paymentProcessing || !isEditing}
              className="mt-5 w-full rounded-xl text-white hover:opacity-90 sm:w-auto sm:min-w-[220px]"
              style={{ backgroundColor: RESTAURANT_THEME }}
            >
              {paymentProcessing ? "Processing payment..." : `Pay ${formatMoney(onboardingFeeTotal)}`}
            </Button>
          ) : (
            <p className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
              Payment received. You can now submit your onboarding application for approval.
            </p>
          )}
        </section>
      ) : null}
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    if (step === 4) return renderStep4()
    return renderStep1()
  }

  const isNextDisabled =
    saving ||
    paymentProcessing ||
    registrationProcessing ||
    ((step === 3 || step === 4) && !isEditing) ||
    Object.values(uploadingAttachments).some(Boolean) ||
    (step === 4 && requiresOnboardingFee && !step4State.onboardingFeePaid)

  const continueLabel = Object.values(uploadingAttachments).some(Boolean)
    ? "Uploading..."
    : step === 4
      ? saving || registrationProcessing
        ? "Submitting..."
        : "Submit for approval"
      : step === 3
        ? saving
          ? "Saving..."
          : "Continue"
        : saving
          ? "Saving..."
          : "Continue"

  const handleOnboardingBack = () => {
    if (step > 1) goToStep(step - 1)
    else navigate("/food/restaurant/explore")
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      {registrationProcessing && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm px-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-sm">
            <div
              className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${RESTAURANT_THEME} transparent transparent transparent` }}
            />
            <h3 className="text-xl font-bold text-gray-900">Processing Registration</h3>
            <p className="text-sm text-gray-600">
              We're uploading your documents & setting up your profile. This can take a minute for high resolution images.
            </p>
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div className="h-full w-1/2 animate-pulse rounded-full" style={{ backgroundColor: RESTAURANT_THEME }} />
            </div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-2">
              Please do not refresh or close
            </p>
          </div>
        </div>
      )}

      <RestaurantOnboardingShell
        step={step}
        companyName={companyName}
        logoUrl={logoUrl}
        loading={loading}
        saving={saving || paymentProcessing || registrationProcessing}
        error={error}
        keyboardInset={keyboardInset}
        isEditing={isEditing}
        isLoggingOut={isLoggingOut}
        nextDisabled={isNextDisabled}
        continueLabel={continueLabel}
        onBack={handleOnboardingBack}
        onLogout={handleLogout}
        onEnableEdit={() => setIsEditing(true)}
        onNext={handleNext}
      >
        {renderStep()}
      </RestaurantOnboardingShell>

      <ImageSourcePicker
        isOpen={sourcePicker.isOpen}
        onClose={closeImageSourcePicker}
        onFileSelect={sourcePicker.onSelectFile}
        title={sourcePicker.title}
        fileNamePrefix={sourcePicker.fileNamePrefix}
        galleryInputRef={sourcePicker.fallbackInputRef}
      />
    </LocalizationProvider>
  )
}
