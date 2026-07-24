import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  ArrowLeft,
  Plus,
  Star,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { restaurantAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { resolveMediaUrl } from "@food/utils/common"

const debugLog = (...args) => {}
const debugError = (...args) => {}
const toDisplayImageUrl = (value) => resolveMediaUrl(value) || ""
const OUTLET_APPROVAL_STATUS_KEY = "restaurant_outlet_update_approval_status"
const OWNER_NAME_REGEX = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/
const EMAIL_REGEX = /^(?!.*\.\.)([A-Za-z0-9]+[._%+-]?)*[A-Za-z0-9]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_REGEX = /^\d{14}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/

const hasSuspiciousEmailTld = (emailValue) => {
  const email = String(emailValue || "").trim().toLowerCase()
  const domain = email.split("@")[1] || ""
  const tld = domain.split(".").pop() || ""
  if (!tld) return true
  if (/^com+$/i.test(tld) && tld !== "com") return true
  if (/(.)\1{2,}/.test(tld)) return true
  return false
}


export default function OutletInfo() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  
  // State management
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [restaurantName, setRestaurantName] = useState("")
  const [cuisineTags, setCuisineTags] = useState("")
  const [address, setAddress] = useState("")
  const [mainImage, setMainImage] = useState("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop")
  const [thumbnailImage, setThumbnailImage] = useState("https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop")
  const [coverImages, setCoverImages] = useState([]) // Array of cover images (separate from menu images)
  const [showEditNameDialog, setShowEditNameDialog] = useState(false)
  const [editNameValue, setEditNameValue] = useState("")
  const [showEditBasicDialog, setShowEditBasicDialog] = useState(false)
  const [basicForm, setBasicForm] = useState({
    ownerName: "",
    primaryContactNumber: "",
    ownerEmail: "",
    pureVegRestaurant: false,
  })
  const [savingBasic, setSavingBasic] = useState(false)
  const [showEditBankDialog, setShowEditBankDialog] = useState(false)
  const [bankForm, setBankForm] = useState({
    accountHolderName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    upiId: "",
    upiQrImage: "",
  })
  const [savingBank, setSavingBank] = useState(false)
  const [uploadingBankQr, setUploadingBankQr] = useState(false)
  const [showEditComplianceDialog, setShowEditComplianceDialog] = useState(false)
  const [complianceForm, setComplianceForm] = useState({
    panNumber: "",
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    fssaiNumber: "",
    fssaiExpiry: "",
  })
  const [savingCompliance, setSavingCompliance] = useState(false)
  const [restaurantId, setRestaurantId] = useState("")
  const [restaurantMongoId, setRestaurantMongoId] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageType, setImageType] = useState(null) // 'profile' or 'menu'
  const [uploadingCount, setUploadingCount] = useState(0) // Track how many images are being uploaded
  const [uploadingDocType, setUploadingDocType] = useState(null)
  const [localApprovalStatus, setLocalApprovalStatus] = useState({})
  const [ratingSnapshot, setRatingSnapshot] = useState({ average: null, total: null })
  const [previewImageUrl, setPreviewImageUrl] = useState("")
  
  const profileImageInputRef = useRef(null)
  const menuImageInputRef = useRef(null)
  const panDocInputRef = useRef(null)
  const gstDocInputRef = useRef(null)
  const fssaiDocInputRef = useRef(null)
  const [activePicker, setActivePicker] = useState(null) // { type: string, ref: any, title: string, multiple: boolean, onFileSelect?: fn, description?: string, fileNamePrefix?: string }
  const bankQrInputRef = useRef(null)
  const restaurantCacheRef = useRef({ data: null, fetchedAt: 0 })
  const restaurantPromiseRef = useRef(null)

  const getCurrentRestaurantCached = useCallback(async ({ force = false, maxAgeMs = 1500 } = {}) => {
    const now = Date.now()
    if (!force && restaurantCacheRef.current.data && now - restaurantCacheRef.current.fetchedAt <= maxAgeMs) {
      return restaurantCacheRef.current.data
    }
    if (!force && restaurantPromiseRef.current) {
      return restaurantPromiseRef.current
    }

    restaurantPromiseRef.current = restaurantAPI
      .getCurrentRestaurant()
      .then((response) => {
        const data = response?.data?.data?.restaurant || response?.data?.restaurant || null
        restaurantCacheRef.current = { data, fetchedAt: Date.now() }
        return data
      })
      .finally(() => {
        restaurantPromiseRef.current = null
      })

    return restaurantPromiseRef.current
  }, [])

  const normalizeApprovalStatus = (value) => {
    const raw = String(value || "").trim().toLowerCase()
    if (raw === "pending" || raw === "approved" || raw === "rejected") return raw
    if (raw === "active") return "approved"
    return ""
  }

  const getApprovalLabel = (status) => {
    if (status === "pending") return "Pending"
    if (status === "rejected") return "Rejected"
    return "Approved"
  }

  const getApprovalBadgeClass = (status) => {
    if (status === "pending") return "bg-amber-100 text-amber-700"
    if (status === "rejected") return "bg-rose-100 text-rose-700"
    return "bg-emerald-100 text-emerald-700"
  }

  const readSectionStatusFromBackend = (section) => {
    const statusMap = restaurantData?.profileUpdateApprovalStatus || restaurantData?.updateApprovalStatus || restaurantData?.approvalStatuses || {}
    const sectionStatus = normalizeApprovalStatus(statusMap?.[section])
    if (sectionStatus) return sectionStatus

    const globalCandidates = [
      restaurantData?.status,
      restaurantData?.profileUpdateStatus,
      restaurantData?.updateRequestStatus,
    ]
    for (const candidate of globalCandidates) {
      const normalized = normalizeApprovalStatus(candidate)
      if (normalized) return normalized
    }

    if (
      restaurantData?.pendingApproval === true ||
      restaurantData?.hasPendingProfileUpdate === true ||
      restaurantData?.hasPendingUpdateRequest === true
    ) {
      return "pending"
    }
    return ""
  }

  const hasAnyPendingFromBackend = () => {
    if (normalizeApprovalStatus(restaurantData?.status) === "pending") return true

    const statusMap = restaurantData?.profileUpdateApprovalStatus || restaurantData?.updateApprovalStatus || restaurantData?.approvalStatuses || {}
    const sectionKeys = ["name", "basic", "compliance", "bank"]
    const hasSectionPending = sectionKeys.some((key) => normalizeApprovalStatus(statusMap?.[key]) === "pending")
    if (hasSectionPending) return true

    const globalCandidates = [
      restaurantData?.status,
      restaurantData?.profileUpdateStatus,
      restaurantData?.updateRequestStatus,
    ]
    const hasGlobalPending = globalCandidates.some((candidate) => normalizeApprovalStatus(candidate) === "pending")
    if (hasGlobalPending) return true

    return (
      restaurantData?.pendingApproval === true ||
      restaurantData?.hasPendingProfileUpdate === true ||
      restaurantData?.hasPendingUpdateRequest === true
    )
  }

  const markSectionPending = (section) => {
    const pendingEntry = { status: "pending", markedAt: Date.now() }
    setLocalApprovalStatus((prev) => ({ ...prev, [section]: pendingEntry }))
    try {
      const raw = localStorage.getItem(OUTLET_APPROVAL_STATUS_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      const rid = String(restaurantData?._id || restaurantData?.id || restaurantMongoId || restaurantId || "default")
      const current = parsed?.[rid] || {}
      parsed[rid] = { ...current, [section]: pendingEntry }
      localStorage.setItem(OUTLET_APPROVAL_STATUS_KEY, JSON.stringify(parsed))
    } catch (error) {
      debugError("Failed to persist local approval status:", error)
    }
  }

  const getLocalStatusValue = (section) => {
    const entry = localApprovalStatus?.[section]
    if (entry && typeof entry === "object") {
      return normalizeApprovalStatus(entry.status)
    }
    return normalizeApprovalStatus(entry)
  }

  const getLocalMarkedAt = (section) => {
    const entry = localApprovalStatus?.[section]
    if (entry && typeof entry === "object" && Number.isFinite(Number(entry.markedAt))) {
      return Number(entry.markedAt)
    }
    return 0
  }

  // Format address from location object
  const formatAddress = (location) => {
    if (!location) return ""
    
    const parts = []
    if (location.addressLine1) parts.push(location.addressLine1.trim())
    if (location.addressLine2) parts.push(location.addressLine2.trim())
    if (location.area) parts.push(location.area.trim())
    if (location.city) {
      const city = location.city.trim()
      // Only add city if it's not already included in area
      if (!location.area || !location.area.includes(city)) {
        parts.push(city)
      }
    }
    if (location.landmark) parts.push(location.landmark.trim())
    
    return parts.join(", ") || ""
  }

  const refreshRestaurantData = useCallback(async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      if (!data) return

      setRestaurantData(data)
      setRestaurantName(data.name || "")
      setRestaurantId(data.restaurantId || data.id || "")
      setRestaurantMongoId(String(data.id || data._id || ""))
      setAddress(formatAddress(data.location))

      if (data.cuisines && Array.isArray(data.cuisines) && data.cuisines.length > 0) {
        setCuisineTags(data.cuisines.join(", "))
      }

      if (data.profileImage?.url) {
        setThumbnailImage(toDisplayImageUrl(data.profileImage.url))
      }

      if (data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0) {
        setCoverImages(data.coverImages.map((img) => ({
          url: toDisplayImageUrl(img.url || img),
          publicId: img.publicId
        })))
        setMainImage(toDisplayImageUrl(data.coverImages[0].url || data.coverImages[0]))
      } else if (data.menuImages && Array.isArray(data.menuImages) && data.menuImages.length > 0) {
        setCoverImages(data.menuImages.map((img) => ({
          url: toDisplayImageUrl(img.url),
          publicId: img.publicId
        })))
        setMainImage(toDisplayImageUrl(data.menuImages[0].url))
      } else {
        setCoverImages([])
      }
    } catch (error) {
      if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
        debugError("Error fetching restaurant data:", error)
      }
    }
  }, [])

  // Fetch restaurant data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        await refreshRestaurantData()
      } catch (error) {
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()

    // Listen for updates from edit pages
    const handleCuisinesUpdate = () => {
      fetchRestaurantData()
    }
    const handleAddressUpdate = () => {
      fetchRestaurantData()
    }

    window.addEventListener("cuisinesUpdated", handleCuisinesUpdate)
    window.addEventListener("addressUpdated", handleAddressUpdate)
    
    return () => {
      window.removeEventListener("cuisinesUpdated", handleCuisinesUpdate)
      window.removeEventListener("addressUpdated", handleAddressUpdate)
    }
  }, [refreshRestaurantData])

  // Keep approval status in sync without requiring logout/login.
  // Poll only while there is a pending update signal.
  useEffect(() => {
    if (!restaurantData) return
    const shouldPoll = hasAnyPendingFromBackend() || ["name", "basic", "compliance", "bank"].some((section) => getLocalStatusValue(section) === "pending")
    if (!shouldPoll) return

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      void refreshRestaurantData()
    }, 7000)

    const onFocus = () => {
      if (typeof document !== "undefined" && document.hidden) return
      void refreshRestaurantData()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [restaurantData, localApprovalStatus, refreshRestaurantData])

  useEffect(() => {
    setComplianceForm({
      panNumber: String(restaurantData?.panNumber || ""),
      gstRegistered: restaurantData?.gstRegistered === true,
      gstNumber: String(restaurantData?.gstNumber || ""),
      gstLegalName: String(restaurantData?.gstLegalName || ""),
      gstAddress: String(restaurantData?.gstAddress || ""),
      fssaiNumber: String(restaurantData?.fssaiNumber || ""),
      fssaiExpiry: restaurantData?.fssaiExpiry ? new Date(restaurantData.fssaiExpiry).toISOString().slice(0, 10) : "",
    })
  }, [restaurantData])

  useEffect(() => {
    setBasicForm({
      ownerName: String(restaurantData?.ownerName || ""),
      primaryContactNumber: String(restaurantData?.primaryContactNumber || ""),
      ownerEmail: String(restaurantData?.ownerEmail || ""),
      pureVegRestaurant: restaurantData?.pureVegRestaurant === true,
    })
  }, [restaurantData])

  useEffect(() => {
    const accountNumber = String(restaurantData?.accountNumber || "")
    const upiQrImage =
      typeof restaurantData?.upiQrImage === "string"
        ? restaurantData?.upiQrImage
        : String(restaurantData?.upiQrImage?.url || "")
    setBankForm({
      accountHolderName: String(restaurantData?.accountHolderName || ""),
      accountNumber,
      confirmAccountNumber: accountNumber,
      ifscCode: String(restaurantData?.ifscCode || "").toUpperCase(),
      upiId: String(restaurantData?.upiId || ""),
      upiQrImage,
    })
  }, [restaurantData])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OUTLET_APPROVAL_STATUS_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      const rid = String(restaurantData?._id || restaurantData?.id || restaurantMongoId || restaurantId || "default")
      setLocalApprovalStatus(parsed?.[rid] || {})
    } catch (error) {
      debugError("Failed to read local approval status:", error)
    }
  }, [restaurantData?._id, restaurantData?.id, restaurantMongoId, restaurantId])

  const prevGlobalStatusRef = useRef("")

  // Clear local "pending" badges only after admin resolves review (pending -> approved/rejected).
  useEffect(() => {
    if (!restaurantData) return

    const globalStatus = normalizeApprovalStatus(restaurantData?.status)
    const prevGlobal = prevGlobalStatusRef.current
    prevGlobalStatusRef.current = globalStatus

    if (prevGlobal !== "pending" || !["approved", "rejected"].includes(globalStatus)) {
      return
    }

    setLocalApprovalStatus((prev) => {
      const sections = ["name", "basic", "compliance", "bank"]
      const next = { ...prev }
      let changed = false

      sections.forEach((section) => {
        const entry = prev?.[section]
        const localStatus =
          entry && typeof entry === "object"
            ? normalizeApprovalStatus(entry.status)
            : normalizeApprovalStatus(entry)
        if (localStatus === "pending") {
          next[section] = { status: globalStatus, markedAt: Date.now() }
          changed = true
        }
      })

      if (!changed) return prev

      try {
        const raw = localStorage.getItem(OUTLET_APPROVAL_STATUS_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        const rid = String(restaurantData?._id || restaurantData?.id || restaurantMongoId || restaurantId || "default")
        parsed[rid] = next
        localStorage.setItem(OUTLET_APPROVAL_STATUS_KEY, JSON.stringify(parsed))
      } catch (error) {
        debugError("Failed to sync local approval status:", error)
      }

      return next
    })
  }, [restaurantData?.status, restaurantData?._id, restaurantData?.id, restaurantMongoId, restaurantId])

  const getSectionStatus = (section) => {
    const globalStatus = normalizeApprovalStatus(restaurantData?.status)
    const localStatus = getLocalStatusValue(section)
    const sectionKeys = ["name", "basic", "compliance", "bank"]
    const anyLocalPending = sectionKeys.some((key) => getLocalStatusValue(key) === "pending")

    // Edited section waiting for admin — always show pending even if global status is stale.
    if (localStatus === "pending") return "pending"

    if (globalStatus === "rejected") return "rejected"
    if (globalStatus === "approved") return "approved"

    if (globalStatus === "pending") {
      // Re-approval: only edited sections show pending; onboarding: all sections pending.
      return anyLocalPending ? "approved" : "pending"
    }

    const backendStatus = readSectionStatusFromBackend(section)
    if (backendStatus) return backendStatus
    return "approved"
  }

  const applyProfileSaveResult = (response, section, fallbackPatch = {}) => {
    const updated =
      response?.data?.data?.restaurant ||
      response?.data?.restaurant ||
      null

    if (updated) {
      setRestaurantData({ ...updated, status: "pending" })
    } else {
      setRestaurantData((prev) =>
        prev ? { ...prev, ...fallbackPatch, status: "pending" } : prev,
      )
    }
    markSectionPending(section)
  }

  // Handle profile image replacement
  const handleProfileImageReplace = async (file) => {
    if (!file) return

    try {
      setUploadingImage(true)
      setImageType('profile')

      // Upload image to Cloudinary
      const uploadResponse = await restaurantAPI.uploadProfileImage(file)
      const uploadedImage = uploadResponse?.data?.data?.profileImage

      if (uploadedImage) {
        if (uploadedImage.url) {
          setThumbnailImage(toDisplayImageUrl(uploadedImage.url))
        }
        
        // Refresh restaurant data
        const data = await getCurrentRestaurantCached({ force: true })
        if (data) {
          setRestaurantData(data)
          if (data.profileImage?.url) {
            setThumbnailImage(toDisplayImageUrl(data.profileImage.url))
          }
        }
      }
    } catch (error) {
      debugError("Error uploading profile image:", error)
      toast.error("Failed to upload image. Please try again.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
    }
  }

  // Handle multiple cover images addition
  const handleCoverImageAdd = async (files) => {
    if (!files || (Array.isArray(files) && files.length === 0)) return
    const fileArray = Array.isArray(files) ? files : [files]

    try {
      setUploadingImage(true)
      setImageType('menu')
      setUploadingCount(fileArray.length)

      // Get current images
      const currentData = await getCurrentRestaurantCached()
      const existingImages = currentData?.menuImages && Array.isArray(currentData.menuImages)
        ? currentData.menuImages.map(img => ({
            url: toDisplayImageUrl(img.url),
            publicId: img.publicId
          }))
        : []

      const uploadedImageData = []
      const failedUploads = []
      
      for (let i = 0; i < fileArray.length; i++) {
        try {
          const uploadResponse = await restaurantAPI.uploadMenuImage(fileArray[i])
          const uploadedImage = uploadResponse?.data?.data?.menuImage
          if (uploadedImage?.url) {
            uploadedImageData.push({
              url: toDisplayImageUrl(uploadedImage.url),
              publicId: uploadedImage.publicId || null
            })
          }
        } catch (error) {
          failedUploads.push({ fileName: fileArray[i]?.name || "image", error: error.message })
        }
      }

      if (uploadedImageData.length > 0) {
        const allImages = [...existingImages]
        uploadedImageData.forEach(uploaded => {
          if (!allImages.find(img => img.url === uploaded.url)) {
            allImages.push(uploaded)
          }
        })

        try {
          await restaurantAPI.updateProfile({ menuImages: allImages })
          toast.success(`Successfully uploaded ${uploadedImageData.length} image(s)`)
        } catch (updateError) {
          toast.error("Images uploaded but failed to save.")
        }

        setCoverImages(allImages)
        if (allImages.length > 0) setMainImage(allImages[0].url)
      }
    } catch (error) {
      toast.error("Failed to upload images.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
      setUploadingCount(0)
    }
  }

  const handleImageClick = (type, ref, title, multiple = false) => {
    if (isFlutterBridgeAvailable()) {
      setActivePicker({ type, ref, title, multiple })
    } else {
      ref.current?.click()
    }
  }

  const handleDocImageClick = (docType, ref, title) => {
    if (isFlutterBridgeAvailable()) {
      setActivePicker({
        type: `${docType}-doc`,
        ref,
        title,
        multiple: false,
        onFileSelect: (file) => handleComplianceDocUpload(docType, file),
        description: `Choose how to upload your ${docType.toUpperCase()} document`,
        fileNamePrefix: `outlet-${docType}-doc`,
      })
    } else {
      ref.current?.click()
    }
  }

  const handleComplianceDocUpload = async (type, file) => {
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size too large. Max 5MB allowed.")
        return
      }
      setUploadingDocType(type)
      const uploadRes = await uploadAPI.uploadMedia(file, { folder: `food/restaurants/compliance/${type}` })
      const url = uploadRes?.data?.data?.url || uploadRes?.data?.url || ""
      if (!url) throw new Error("Upload failed")
      const fieldMap = { pan: "panImage", gst: "gstImage", fssai: "fssaiImage" }
      const field = fieldMap[type]
      const response = await restaurantAPI.updateProfile({ [field]: url })
      applyProfileSaveResult(response, "compliance", { [field]: url })
      toast.success("Document submitted for admin approval")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to upload document")
    } finally {
      setUploadingDocType(null)
    }
  }

  // Handle cover image deletion
  const handleCoverImageDelete = async (indexToDelete) => {
    if (!window.confirm("Are you sure you want to delete this cover image?")) return

    try {
      setUploadingImage(true)
      setImageType('menu')

      const updatedImages = coverImages.filter((_, index) => index !== indexToDelete)
      const menuImagesForBackend = updatedImages.map(img => ({
        url: img.url,
        publicId: img.publicId || null
      }))

      await restaurantAPI.updateProfile({ menuImages: menuImagesForBackend })
      setCoverImages(updatedImages)
      if (indexToDelete === 0 && updatedImages.length > 0) {
        setMainImage(updatedImages[0].url)
      } else if (updatedImages.length === 0) {
        setMainImage("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop")
      }
      toast.success("Image deleted successfully")
    } catch (error) {
      toast.error("Failed to delete image.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
    }
  }

  const handleProfileImageDelete = async () => {
    if (!window.confirm("Are you sure you want to delete outlet image?")) return
    try {
      setUploadingImage(true)
      setImageType('profile')
      await restaurantAPI.updateProfile({ profileImage: "" })
      setThumbnailImage("https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop")
      const data = await getCurrentRestaurantCached({ force: true })
      if (data) {
        setRestaurantData(data)
        if (data.profileImage?.url) {
          setThumbnailImage(toDisplayImageUrl(data.profileImage.url))
        }
      }
      toast.success("Outlet image deleted successfully")
    } catch (error) {
      toast.error("Failed to delete outlet image.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
    }
  }

  // Handle edit name dialog
  const handleOpenEditDialog = () => {
    setEditNameValue(restaurantName)
    setShowEditNameDialog(true)
  }

  const handleSaveCompliance = async () => {
    const panNumber = String(complianceForm.panNumber || "").trim().toUpperCase()
    const gstNumber = String(complianceForm.gstNumber || "").trim().toUpperCase()
    const gstLegalName = String(complianceForm.gstLegalName || "").trim()
    const gstAddress = String(complianceForm.gstAddress || "").trim()
    const fssaiNumber = String(complianceForm.fssaiNumber || "").trim()

    if (panNumber && !PAN_REGEX.test(panNumber)) {
      toast.error("Invalid PAN format (e.g. ABCDE1234F)")
      return
    }
    if (complianceForm.gstRegistered && !gstNumber) {
      toast.error("GST number is required when GST is registered")
      return
    }
    if (gstNumber && !GST_REGEX.test(gstNumber)) {
      toast.error("Invalid GST format (e.g. 27ABCDE1234F1Z5)")
      return
    }
    if (complianceForm.gstRegistered && !gstLegalName) {
      toast.error("GST legal name is required")
      return
    }
    if (complianceForm.gstRegistered && !gstAddress) {
      toast.error("GST address is required")
      return
    }
    if (fssaiNumber && !FSSAI_REGEX.test(fssaiNumber)) {
      toast.error("FSSAI number must be exactly 14 digits")
      return
    }

    try {
      setSavingCompliance(true)
      const payload = {
        panNumber,
        gstRegistered: complianceForm.gstRegistered === true,
        gstNumber: complianceForm.gstRegistered ? gstNumber : "",
        gstLegalName: complianceForm.gstRegistered ? gstLegalName : "",
        gstAddress: complianceForm.gstRegistered ? gstAddress : "",
        fssaiNumber,
        fssaiExpiry: complianceForm.fssaiExpiry || null,
      }
      const response = await restaurantAPI.updateProfile(payload)
      applyProfileSaveResult(response, "compliance", payload)
      setShowEditComplianceDialog(false)
      toast.success("Compliance details submitted for admin approval")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update compliance details")
    } finally {
      setSavingCompliance(false)
    }
  }

  const handleBankQrUpload = async (file) => {
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size too large. Max 5MB allowed.")
        return
      }
      setUploadingBankQr(true)
      const response = await uploadAPI.uploadMedia(file, { folder: "food/restaurants/upi-qr" })
      const url = response?.data?.data?.url || response?.data?.url || ""
      if (!url) throw new Error("Upload failed")
      setBankForm((prev) => ({ ...prev, upiQrImage: url }))
      toast.success("UPI QR uploaded")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to upload UPI QR")
    } finally {
      setUploadingBankQr(false)
    }
  }

  const handleSaveBankDetails = async () => {
    const accountNumber = String(bankForm.accountNumber || "").replace(/\s|-/g, "")
    const confirmAccountNumber = String(bankForm.confirmAccountNumber || "").replace(/\s|-/g, "")
    const ifscCode = String(bankForm.ifscCode || "").trim().toUpperCase()
    const upiId = String(bankForm.upiId || "").trim()
    const accountHolderName = String(bankForm.accountHolderName || "").trim()
    if ((accountNumber || ifscCode || accountHolderName) && !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
      toast.error("Account number must be 9 to 18 digits")
      return
    }
    if (confirmAccountNumber !== accountNumber) {
      toast.error("Account numbers do not match")
      return
    }
    if ((accountNumber || ifscCode || accountHolderName) && !IFSC_REGEX.test(ifscCode)) {
      toast.error("Invalid IFSC format (e.g. SBIN0001234)")
      return
    }
    if (upiId && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) {
      toast.error("Invalid UPI ID format (e.g. name@bank)")
      return
    }

    try {
      setSavingBank(true)
      const payload = {
        accountHolderName,
        accountNumber,
        ifscCode,
        upiId,
        upiQrImage: String(bankForm.upiQrImage || "").trim(),
      }
      const response = await restaurantAPI.updateProfile(payload)
      applyProfileSaveResult(response, "bank", payload)
      setShowEditBankDialog(false)
      toast.success("Bank details submitted for admin approval")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update bank details")
    } finally {
      setSavingBank(false)
    }
  }

  const handleSaveName = async () => {
    const newName = editNameValue.trim()
    if (!newName) return
    try {
      const response = await restaurantAPI.updateProfile({ name: newName })
      setRestaurantName(newName)
      applyProfileSaveResult(response, "name", { name: newName, restaurantName: newName })
      setShowEditNameDialog(false)
      toast.success("Name submitted for admin approval")
    } catch (error) {
      toast.error("Failed to update name")
    }
  }

  const handleSaveBasicDetails = async () => {
    const ownerName = String(basicForm.ownerName || "").trim()
    const ownerEmail = String(basicForm.ownerEmail || "").trim().toLowerCase()
    const primaryContactNumber = String(basicForm.primaryContactNumber || "").replace(/\D/g, "")
    const currentPureVeg = restaurantData?.pureVegRestaurant === true
    const nextPureVeg = basicForm.pureVegRestaurant === true

    if (!ownerName || !OWNER_NAME_REGEX.test(ownerName)) {
      toast.error("Owner name should contain only letters and spaces")
      return
    }
    if (!ownerEmail || !EMAIL_REGEX.test(ownerEmail) || hasSuspiciousEmailTld(ownerEmail)) {
      toast.error("Please enter a valid email address")
      return
    }
    if (primaryContactNumber && !INDIAN_MOBILE_REGEX.test(primaryContactNumber)) {
      toast.error("Primary contact must be a valid 10-digit Indian mobile number")
      return
    }
    // Business rule: allow Pure Veg -> Mixed, but restrict Mixed -> Pure Veg from edit info flow.
    if (!currentPureVeg && nextPureVeg) {
      toast.error("Changing restaurant type from Mixed to Pure Veg is not allowed from Edit Info.")
      return
    }

    try {
      setSavingBasic(true)
      const payload = {
        ownerName,
        ownerEmail,
        pureVegRestaurant: basicForm.pureVegRestaurant === true,
      }
      const response = await restaurantAPI.updateProfile(payload)
      applyProfileSaveResult(response, "basic", payload)
      setShowEditBasicDialog(false)
      toast.success("Basic details submitted for admin approval")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update basic details")
    } finally {
      setSavingBasic(false)
    }
  }

  const direct = (value) => (value === null || value === undefined ? "" : String(value))

  const maskAccountNumber = (value) => {
    const digits = String(value || "").replace(/\D/g, "")
    if (!digits) return ""
    if (digits.length <= 4) return digits
    return `•••• •••• ${digits.slice(-4)}`
  }

  const formatDate = (dateValue) => {
    if (!dateValue) return ""
    const d = new Date(dateValue)
    if (Number.isNaN(d.getTime())) return direct(dateValue)
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const isGstRegistered = restaurantData?.gstRegistered === true
  const onboardingStep3 = restaurantData?.onboarding?.step3 || {}
  const panOnboarding = onboardingStep3?.pan || {}
  const gstOnboarding = onboardingStep3?.gst || {}
  const fssaiOnboarding = onboardingStep3?.fssai || {}

  const readDocUrl = (value) => {
    if (!value) return ""
    if (typeof value === "string") return value.trim()
    if (typeof value === "object") {
      return String(value.url || value.secure_url || value.location || "").trim()
    }
    return ""
  }

  const panDocUrl =
    readDocUrl(restaurantData?.panImage) ||
    readDocUrl(panOnboarding?.image)
  const gstDocUrl =
    readDocUrl(restaurantData?.gstImage) ||
    readDocUrl(gstOnboarding?.image)
  const fssaiDocUrl =
    readDocUrl(restaurantData?.fssaiImage) ||
    readDocUrl(fssaiOnboarding?.image)

  const getViewLabel = (url) => {
    if (!url) return ""
    const cleanUrl = String(url).split("?")[0].toLowerCase()
    return cleanUrl.endsWith(".pdf") ? "View pdf" : "View image"
  }

  const openImagePreview = (url) => {
    const cleanUrl = String(url || "").trim()
    if (!cleanUrl) return
    setPreviewImageUrl(cleanUrl)
  }

  const normalizeRating = (value) => {
    if (value === null || value === undefined || value === "") return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.min(5, Math.round(parsed * 10) / 10)
  }

  const extractOrderRating = (order) =>
    normalizeRating(
      order?.review?.rating ??
      order?.ratings?.restaurant?.rating ??
      order?.feedback?.rating ??
      order?.rating
    )

  const getRestaurantRatingFallback = (data) =>
    normalizeRating(
      data?.rating ??
      data?.averageRating ??
      data?.ratings?.average ??
      data?.metrics?.rating ??
      data?.stats?.averageRating ??
      data?.analytics?.averageRating
    ) || 0

  const getRestaurantReviewCountFallback = (data) =>
    Number(
      data?.totalRatings ??
      data?.ratings?.count ??
      data?.reviewCount ??
      data?.reviewsCount ??
      data?.stats?.totalRatings ??
      data?.analytics?.totalRatings ??
      0
    ) || 0

  useEffect(() => {
    const fetchLiveRatingSnapshot = async () => {
      try {
        const limit = 200
        const maxPages = 20
        let page = 1
        let hasMore = true
        const allOrders = []

        while (hasMore && page <= maxPages) {
          const response = await restaurantAPI.getOrders({ page, limit, status: "delivered" })
          const orders = response?.data?.data?.orders || []
          allOrders.push(...orders)

          const totalPages = response?.data?.data?.pagination?.totalPages || response?.data?.data?.totalPages || 1
          if (orders.length < limit || (totalPages > 0 && page >= totalPages)) {
            hasMore = false
          } else {
            page += 1
          }
        }

        const ratings = allOrders.map(extractOrderRating).filter((value) => value !== null)
        if (ratings.length === 0) {
          setRatingSnapshot({ average: 0, total: 0 })
          return
        }

        const avg = ratings.reduce((sum, value) => sum + value, 0) / ratings.length
        setRatingSnapshot({ average: Math.round(avg * 10) / 10, total: ratings.length })
      } catch (error) {
        // Keep fallback values from restaurant profile if live pull fails.
      }
    }

    fetchLiveRatingSnapshot()
  }, [restaurantData?._id, restaurantData?.id])

  const displayRating = ratingSnapshot.average ?? getRestaurantRatingFallback(restaurantData)
  const displayTotalRatings = ratingSnapshot.total ?? getRestaurantReviewCountFallback(restaurantData)

  const locationData = restaurantData?.location || {}
  const fullAddress = locationData.formattedAddress || locationData.address || address || ""

  return (
    <>
      <div className="min-h-screen bg-white overflow-x-hidden pb-8 md:min-h-full md:h-full md:overflow-y-auto md:bg-slate-50 md:pb-10">
        {/* Header */}
        <div className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-50 md:border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 md:mx-auto md:max-w-6xl md:px-8 md:py-5">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors md:hidden">
                <ArrowLeft className="w-6 h-6 text-gray-900" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 md:text-2xl">Outlet info</h1>
                <p className="hidden md:block text-sm text-slate-500 mt-0.5">
                  Manage profile, contact, compliance, and bank details
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs sm:text-sm text-gray-900 font-normal truncate max-w-[140px] sm:max-w-none">
                Restaurant id: {loading ? "Loading..." : (restaurantMongoId && restaurantMongoId.length >= 5 ? restaurantMongoId.slice(-5) : (restaurantId || "N/A"))}
              </span>
            </div>
          </div>
        </div>

        <div className="md:mx-auto md:max-w-6xl md:px-8 md:pt-6">
        {/* Outlet Image Section */}
        <div className="relative w-full h-[200px] overflow-hidden md:h-[280px] md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">
            <img
              src={toDisplayImageUrl(mainImage || thumbnailImage)}
              alt="Outlet"
              className="w-full h-full object-cover"
            />
          <input
            ref={menuImageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleCoverImageAdd(Array.from(e.target.files || []))}
          />
          
          <input
            ref={profileImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleProfileImageReplace(e.target.files?.[0])}
          />

          <div className="absolute right-4 bottom-4 z-20 flex items-center gap-2">
            <button
              onClick={() => handleImageClick('profile', profileImageInputRef, "Add Outlet Image")}
              disabled={uploadingImage}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white min-w-[90px] disabled:opacity-50 md:rounded-xl md:px-3.5 md:py-2.5 md:text-sm"
            >
              {uploadingImage && imageType === 'profile' ? 'Uploading...' : 'Add image'}
            </button>
            <button
              onClick={handleProfileImageDelete}
              disabled={uploadingImage}
              className="inline-flex items-center justify-center rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white min-w-[90px] disabled:opacity-50 md:rounded-xl md:px-3.5 md:py-2.5 md:text-sm"
            >
              Remove
            </button>
          </div>
        </div>

        {/* Desktop profile strip */}
        <div className="hidden md:flex items-end gap-4 px-1 -mt-12 relative z-20 mb-6">
          <div className="w-24 h-24 rounded-2xl border-4 border-white bg-white shadow-lg overflow-hidden shrink-0">
            <img
              src={toDisplayImageUrl(thumbnailImage || mainImage)}
              alt="Restaurant thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="pb-2 min-w-0 flex-1">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight truncate">
              {loading ? "Loading..." : (restaurantName || "Restaurant Name")}
            </h2>
            <p className="text-sm text-slate-500 mt-1 truncate">
              {cuisineTags || "Update cuisines and outlet details below"}
            </p>
          </div>
        </div>

        <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-200 md:px-0 md:pt-0 md:pb-0 md:bg-transparent md:border-0 md:mt-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 gap-3 md:rounded-2xl md:bg-white md:shadow-sm md:px-4 md:py-4">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              {coverImages.length > 0 ? (
                coverImages.map((img, index) => (
                  <button
                    key={`${img.url}-${index}`}
                    type="button"
                    onClick={() => setMainImage(img.url)}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                      mainImage === img.url ? "border-slate-900" : "border-slate-200"
                    }`}
                  >
                    <img src={toDisplayImageUrl(img.url)} alt={`Menu ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))
              ) : (
                <p className="text-xs text-slate-500 self-center">No images</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleImageClick('cover', menuImageInputRef, "Add Cover Image", true)}
                disabled={uploadingImage}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white min-w-[86px] disabled:opacity-50"
              >
                {uploadingImage && imageType === 'menu' ? `Uploading ${uploadingCount}...` : 'Add image'}
              </button>
              <button
                onClick={() => {
                  const selectedIndex = coverImages.findIndex((img) => img.url === mainImage)
                  if (selectedIndex >= 0) handleCoverImageDelete(selectedIndex)
                }}
                disabled={uploadingImage || !coverImages.find((img) => img.url === mainImage)}
                className="inline-flex items-center justify-center rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white min-w-[86px] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="px-4 pt-4 pb-4 bg-white md:px-0 md:bg-transparent md:pt-4">
          <div className="flex items-start gap-4 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-4 md:shadow-sm">
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => navigate("/food/restaurant/ratings-reviews")} className="flex items-center gap-2 text-left w-full">
                <div
                  className="px-2.5 py-1.5 rounded flex items-center gap-1 shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.90), var(--module-theme-color,#2563EB))",
                  }}
                >
                  <span className="text-white text-sm font-bold">{Number(displayRating || 0).toFixed(1)}</span>
                  <Star className="w-3.5 h-3.5 text-white fill-white" />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--module-theme-color, #2563EB)" }}>
                  {displayTotalRatings || 0} DELIVERY REVIEWS
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-auto" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 md:px-0 md:pt-6 md:pb-4">
          <h2 className="text-base font-bold text-gray-900 md:text-lg">Restaurant Information</h2>
          <p className="text-sm text-gray-500 mt-1">All onboarding and profile details at one place.</p>
        </div>

        <div className="px-4 pb-6 space-y-3 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:px-0 md:pb-10">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm md:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 font-medium mb-1">Restaurant name</p>
                <p className="text-base font-semibold text-slate-900">{loading ? "Loading..." : direct(restaurantName)}</p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold mr-2 ${getApprovalBadgeClass(getSectionStatus("name"))}`}>
                {getApprovalLabel(getSectionStatus("name"))}
              </span>
              <button onClick={handleOpenEditDialog} className="text-blue-600 text-sm font-medium hover:underline">Edit</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm md:shadow-md">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Basic details</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${getApprovalBadgeClass(getSectionStatus("basic"))}`}>
                  {getApprovalLabel(getSectionStatus("basic"))}
                </span>
              </div>
              <button onClick={() => setShowEditBasicDialog(true)} className="text-blue-600 text-sm font-medium hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">Owner name</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.ownerName)}</p></div>
              <div><p className="text-xs text-slate-500">Primary contact</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.primaryContactNumber)}</p></div>
              <div><p className="text-xs text-slate-500">Email</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.ownerEmail)}</p></div>
              <div>
                <p className="text-xs text-slate-500">Restaurant type</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <div
                    className={`h-4 w-4 rounded-sm border-2 flex items-center justify-center ${restaurantData?.pureVegRestaurant === true ? "" : "border-red-500"}`}
                    style={restaurantData?.pureVegRestaurant === true ? { borderColor: "#16A34A", backgroundColor: "#F0FDF4" } : undefined}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${restaurantData?.pureVegRestaurant === true ? "" : "bg-red-500"}`}
                      style={restaurantData?.pureVegRestaurant === true ? { backgroundColor: "#16A34A" } : undefined}
                    />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${restaurantData?.pureVegRestaurant === true ? "" : "bg-rose-50 text-rose-700"}`}
                    style={restaurantData?.pureVegRestaurant === true ? { backgroundColor: "#ECFDF3", color: "#15803D" } : undefined}
                  >
                    {restaurantData?.pureVegRestaurant === true ? "Pure Veg" : "Mixed"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm md:shadow-md">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Address and location</h3>
            <div className="space-y-2">
              <div><p className="text-xs text-slate-500">Full address</p><p className="text-sm font-medium text-slate-900">{direct(fullAddress)}</p></div>
              {String(restaurantData?.locationUpdateStatus || "").toLowerCase() === "pending" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  New location pending admin approval. Customers still see the address above until approved.
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm md:shadow-md">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Compliance details</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${getApprovalBadgeClass(getSectionStatus("compliance"))}`}>
                  {getApprovalLabel(getSectionStatus("compliance"))}
                </span>
              </div>
              <button onClick={() => setShowEditComplianceDialog(true)} className="text-blue-600 text-sm font-medium hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">PAN number</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.panNumber)}</p></div>
              <div><p className="text-xs text-slate-500">GST registered</p><p className="text-sm font-medium text-slate-900">{isGstRegistered ? "Yes" : "No"}</p></div>
              {isGstRegistered ? (
                <>
                  <div><p className="text-xs text-slate-500">GST number</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.gstNumber)}</p></div>
                  <div><p className="text-xs text-slate-500">GST legal name</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.gstLegalName)}</p></div>
                  <div className="sm:col-span-2"><p className="text-xs text-slate-500">GST address</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.gstAddress)}</p></div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">GST document</p>
                    <div className="mt-1 flex items-center gap-3">
                      {gstDocUrl ? (
                        getViewLabel(gstDocUrl) === "View pdf" ? (
                          <a href={gstDocUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2">
                            {getViewLabel(gstDocUrl)}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openImagePreview(gstDocUrl)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                          >
                            View image
                          </button>
                        )
                      ) : (
                        <p className="text-sm font-medium text-slate-900">Not uploaded</p>
                      )}
                      <input
                        ref={gstDocInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleComplianceDocUpload("gst", e.target.files?.[0])}
                      />
                      <button
                        onClick={() => handleDocImageClick("gst", gstDocInputRef, "Upload GST Document")}
                        className="text-xs font-semibold text-blue-600"
                        disabled={uploadingDocType === "gst"}
                      >
                        {uploadingDocType === "gst" ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
              <div><p className="text-xs text-slate-500">FSSAI number</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.fssaiNumber)}</p></div>
              <div><p className="text-xs text-slate-500">FSSAI expiry</p><p className="text-sm font-medium text-slate-900">{formatDate(restaurantData?.fssaiExpiry)}</p></div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">FSSAI document</p>
                <div className="mt-1 flex items-center gap-3">
                  {fssaiDocUrl ? (
                    getViewLabel(fssaiDocUrl) === "View pdf" ? (
                      <a href={fssaiDocUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2">
                        {getViewLabel(fssaiDocUrl)}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openImagePreview(fssaiDocUrl)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                      >
                        View image
                      </button>
                    )
                  ) : (
                    <p className="text-sm font-medium text-slate-900">Not uploaded</p>
                  )}
                  <input
                    ref={fssaiDocInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleComplianceDocUpload("fssai", e.target.files?.[0])}
                  />
                  <button
                    onClick={() => handleDocImageClick("fssai", fssaiDocInputRef, "Upload FSSAI Document")}
                    className="text-xs font-semibold text-blue-600"
                    disabled={uploadingDocType === "fssai"}
                  >
                    {uploadingDocType === "fssai" ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">PAN document</p>
                <div className="mt-1 flex items-center gap-3">
                  {panDocUrl ? (
                    getViewLabel(panDocUrl) === "View pdf" ? (
                      <a href={panDocUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2">
                        {getViewLabel(panDocUrl)}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openImagePreview(panDocUrl)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                      >
                        View image
                      </button>
                    )
                  ) : (
                    <p className="text-sm font-medium text-slate-900">Not uploaded</p>
                  )}
                  <input
                    ref={panDocInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleComplianceDocUpload("pan", e.target.files?.[0])}
                  />
                  <button
                    onClick={() => handleDocImageClick("pan", panDocInputRef, "Upload PAN Document")}
                    className="text-xs font-semibold text-blue-600"
                    disabled={uploadingDocType === "pan"}
                  >
                    {uploadingDocType === "pan" ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm md:shadow-md">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Bank and UPI details</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${getApprovalBadgeClass(getSectionStatus("bank"))}`}>
                  {getApprovalLabel(getSectionStatus("bank"))}
                </span>
              </div>
              <button onClick={() => setShowEditBankDialog(true)} className="text-blue-600 text-sm font-medium hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">Account holder</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.accountHolderName)}</p></div>
              <div><p className="text-xs text-slate-500">Account number</p><p className="text-sm font-medium text-slate-900">{maskAccountNumber(restaurantData?.accountNumber)}</p></div>
              <div><p className="text-xs text-slate-500">IFSC code</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.ifscCode)}</p></div>
              <div><p className="text-xs text-slate-500">UPI ID</p><p className="text-sm font-medium text-slate-900">{direct(restaurantData?.upiId)}</p></div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">UPI QR image</p>
                {String(restaurantData?.upiQrImage?.url || restaurantData?.upiQrImage || "").trim() ? (
                  <button
                    type="button"
                    onClick={() => openImagePreview(String(restaurantData?.upiQrImage?.url || restaurantData?.upiQrImage || "").trim())}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                  >
                    View
                  </button>
                ) : (
                  <p className="text-sm font-medium text-slate-900">Not uploaded</p>
                )}
              </div>
            </div>
          </div>

          <div
            className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200 shadow-sm cursor-pointer md:col-span-2 md:shadow-md hover:border-amber-300 transition-colors"
            onClick={() => navigate("/food/restaurant/subscription")}
          >
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Subscription</h3>
            <p className="text-xs text-slate-600">
              Your plan is assigned automatically each month based on your GMV. Tap to view current month estimate, invoices and dues.
            </p>
          </div>
        </div>
        </div>
      </div>

      <Dialog open={showEditNameDialog} onOpenChange={setShowEditNameDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100"><DialogTitle className="text-lg font-bold">Edit restaurant name</DialogTitle></DialogHeader>
          <div className="p-4"><Input value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} placeholder="Enter restaurant name" className="w-full" /></div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditNameDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={!editNameValue.trim()} className="bg-blue-600 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBasicDialog} onOpenChange={setShowEditBasicDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100">
            <DialogTitle className="text-lg font-bold">Edit basic details</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Owner name</p>
              <Input
                value={basicForm.ownerName}
                onChange={(e) =>
                  setBasicForm((prev) => ({
                    ...prev,
                    ownerName: e.target.value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " "),
                  }))
                }
                placeholder="Enter owner name"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Primary contact</p>
              <Input
                value={basicForm.primaryContactNumber}
                readOnly
                disabled
                placeholder="Enter primary contact"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Email</p>
              <Input
                value={basicForm.ownerEmail}
                onChange={(e) =>
                  setBasicForm((prev) => ({
                    ...prev,
                    ownerEmail: e.target.value.replace(/\s/g, "").toLowerCase(),
                  }))
                }
                placeholder="Enter email"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Restaurant type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBasicForm((prev) => ({ ...prev, pureVegRestaurant: true }))
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    basicForm.pureVegRestaurant === true
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Pure Veg
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setBasicForm((prev) => ({ ...prev, pureVegRestaurant: false }))
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    basicForm.pureVegRestaurant === false
                      ? "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Mixed
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditBasicDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveBasicDetails} disabled={savingBasic} className="bg-blue-600 text-white">
              {savingBasic ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditComplianceDialog} onOpenChange={setShowEditComplianceDialog}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-xl w-[92%]">
          <DialogHeader className="p-4 border-b border-gray-100">
            <DialogTitle className="text-lg font-bold">Edit compliance details</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <p className="text-xs text-slate-500 mb-1">PAN number</p>
              <Input
                value={complianceForm.panNumber}
                onChange={(e) =>
                  setComplianceForm((prev) => ({
                    ...prev,
                    panNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
                  }))
                }
                placeholder="Enter PAN number"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">GST registered</p>
              <select
                value={complianceForm.gstRegistered ? "yes" : "no"}
                onChange={(e) => setComplianceForm((prev) => ({ ...prev, gstRegistered: e.target.value === "yes" }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {complianceForm.gstRegistered ? (
              <>
                <div>
                  <p className="text-xs text-slate-500 mb-1">GST number</p>
                  <Input
                    value={complianceForm.gstNumber}
                    onChange={(e) =>
                      setComplianceForm((prev) => ({
                        ...prev,
                        gstNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
                      }))
                    }
                    placeholder="Enter GST number"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">GST legal name</p>
                  <Input
                    value={complianceForm.gstLegalName}
                    onChange={(e) => setComplianceForm((prev) => ({ ...prev, gstLegalName: e.target.value }))}
                    placeholder="Enter GST legal name"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">GST address</p>
                  <Input
                    value={complianceForm.gstAddress}
                    onChange={(e) => setComplianceForm((prev) => ({ ...prev, gstAddress: e.target.value }))}
                    placeholder="Enter GST address"
                  />
                </div>
              </>
            ) : null}
            <div>
              <p className="text-xs text-slate-500 mb-1">FSSAI number</p>
              <Input
                value={complianceForm.fssaiNumber}
                onChange={(e) =>
                  setComplianceForm((prev) => ({
                    ...prev,
                    fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14),
                  }))
                }
                placeholder="Enter FSSAI number"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">FSSAI expiry</p>
              <Input
                type="date"
                value={complianceForm.fssaiExpiry}
                onChange={(e) => setComplianceForm((prev) => ({ ...prev, fssaiExpiry: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditComplianceDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCompliance} disabled={savingCompliance} className="bg-blue-600 text-white">
              {savingCompliance ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBankDialog} onOpenChange={setShowEditBankDialog}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-xl w-[92%]">
          <DialogHeader className="p-4 border-b border-gray-100">
            <DialogTitle className="text-lg font-bold">Edit bank & UPI details</DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <p className="text-xs text-slate-500 mb-1">Account holder name</p>
              <Input
                value={bankForm.accountHolderName}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    accountHolderName: e.target.value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " "),
                  }))
                }
                placeholder="Enter account holder name"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Account number</p>
              <Input
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) }))}
                placeholder="Enter account number"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Confirm account number</p>
              <Input
                value={bankForm.confirmAccountNumber}
                onChange={(e) => setBankForm((prev) => ({ ...prev, confirmAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) }))}
                placeholder="Re-enter account number"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">IFSC code</p>
              <Input
                value={bankForm.ifscCode}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
                  }))
                }
                placeholder="e.g. SBIN0018764"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">UPI ID</p>
              <Input
                value={bankForm.upiId}
                onChange={(e) => setBankForm((prev) => ({ ...prev, upiId: e.target.value }))}
                placeholder="e.g. merchant@okaxis"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">UPI QR image</p>
              <div className="flex items-center gap-3">
                {bankForm.upiQrImage ? (
                  <a href={bankForm.upiQrImage} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2">
                    View image
                  </a>
                ) : (
                  <p className="text-sm text-slate-600">Not uploaded</p>
                )}
                <input
                  ref={bankQrInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleBankQrUpload(e.target.files?.[0])}
                />
                <button
                  onClick={() => {
                    if (isFlutterBridgeAvailable()) {
                      setActivePicker({
                        type: "upi-qr",
                        ref: bankQrInputRef,
                        title: "Upload UPI QR",
                        multiple: false,
                        onFileSelect: (file) => handleBankQrUpload(file),
                        description: "Choose how to upload your UPI QR image",
                        fileNamePrefix: "outlet-upi-qr",
                      })
                    } else {
                      bankQrInputRef.current?.click()
                    }
                  }}
                  className="text-xs font-semibold text-blue-600"
                  disabled={uploadingBankQr}
                >
                  {uploadingBankQr ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditBankDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveBankDetails} disabled={savingBank || uploadingBankQr} className="bg-blue-600 text-white">
              {savingBank ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewImageUrl ? (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4">
          <div className="relative w-full max-w-3xl bg-white rounded-xl p-3">
            <button
              type="button"
              onClick={() => setPreviewImageUrl("")}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
            <img
              src={toDisplayImageUrl(previewImageUrl)}
              alt="Preview"
              className="w-full max-h-[80vh] object-contain rounded-md"
            />
          </div>
        </div>
      ) : null}
 

      <ImageSourcePicker
        isOpen={!!activePicker}
        onClose={() => setActivePicker(null)}
        onFileSelect={(file) => {
          if (activePicker?.onFileSelect) {
            activePicker.onFileSelect(file)
          } else if (activePicker?.type === 'profile') {
            handleProfileImageReplace(file)
          } else {
            handleCoverImageAdd(file)
          }
        }}
        title={activePicker?.title}
        description={activePicker?.description || `Choose how to upload your ${activePicker?.type} photo`}
        fileNamePrefix={activePicker?.fileNamePrefix || `outlet-${activePicker?.type}`}
        galleryInputRef={activePicker?.ref}
      />
    </>
  )
}
