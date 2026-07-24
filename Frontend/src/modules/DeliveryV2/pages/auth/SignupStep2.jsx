import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check, Camera, Image as ImageIcon } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import { openCamera, openGallery } from "@food/utils/imageUploadUtils"
import { clearModuleAuth, isModuleAuthenticated } from "@food/utils/auth"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
import { useDeliveryOnboardingStore } from "../../store/useDeliveryOnboardingStore"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const createEmptyUploadedDocs = () => ({
  profilePhoto: null,
  aadharPhoto: null,
  panPhoto: null,
  drivingLicensePhoto: null
})

const sanitizeUploadedDocValue = (value) => {
  if (!value) return null

  if (typeof value === "string") {
    return value.startsWith("blob:") ? null : value
  }

  if (typeof value === "object") {
    const url = typeof value.url === "string" ? value.url : ""
    if (url.startsWith("blob:")) {
      return null
    }
    return value
  }

  return null
}

const sanitizeUploadedDocs = (docs) => ({
  profilePhoto: sanitizeUploadedDocValue(docs?.profilePhoto),
  aadharPhoto: sanitizeUploadedDocValue(docs?.aadharPhoto),
  panPhoto: sanitizeUploadedDocValue(docs?.panPhoto),
  drivingLicensePhoto: sanitizeUploadedDocValue(docs?.drivingLicensePhoto)
})

const MAX_DOCUMENT_IMAGE_BYTES = 5 * 1024 * 1024
const TARGET_DOCUMENT_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_DOCUMENT_IMAGE_EDGE = 1600

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image"))
    }
    image.src = objectUrl
  })

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })

const waitForPreviewReady = (src) =>
  new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("Preview source is required"))
      return
    }

    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(src)
    image.onerror = () => reject(new Error("Failed to render preview"))
    image.src = src
  })

const optimizeDocumentImage = async (file) => {
  if (!(file instanceof File) || !String(file.type || "").startsWith("image/")) {
    return file
  }

  if (typeof document === "undefined" || typeof URL === "undefined") {
    return file
  }

  try {
    const image = await loadImageFromFile(file)
    const originalWidth = Number(image.naturalWidth || image.width || 0)
    const originalHeight = Number(image.naturalHeight || image.height || 0)
    if (!originalWidth || !originalHeight) return file

    const longestEdge = Math.max(originalWidth, originalHeight)
    const scale = longestEdge > MAX_DOCUMENT_IMAGE_EDGE
      ? MAX_DOCUMENT_IMAGE_EDGE / longestEdge
      : 1

    const targetWidth = Math.max(1, Math.round(originalWidth * scale))
    const targetHeight = Math.max(1, Math.round(originalHeight * scale))
    const shouldProcess =
      scale < 1 || file.size > TARGET_DOCUMENT_IMAGE_BYTES

    if (!shouldProcess) return file

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) return file

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    const preferredType =
      file.type === "image/png" ? "image/jpeg" : (file.type || "image/jpeg")
    const optimizedBlob = await canvasToBlob(canvas, preferredType, 0.82)
    if (!optimizedBlob) return file

    if (optimizedBlob.size >= file.size && scale === 1) {
      return file
    }

    const baseName = String(file.name || "document").replace(/\.[^.]+$/, "")
    const extension = preferredType === "image/png"
      ? "png"
      : preferredType === "image/webp"
        ? "webp"
        : "jpg"

    return new File([optimizedBlob], `${baseName}.${extension}`, {
      type: preferredType,
      lastModified: Date.now()
    })
  } catch (error) {
    debugWarn("Failed to optimize document image", error)
    return file
  }
}

const getFriendlyRegistrationError = (error) => {
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ""

  if (/E11000 duplicate key error/i.test(rawMessage)) {
    if (/vehicleNumber_1/i.test(rawMessage) || /vehicleNumber/i.test(rawMessage)) {
      return "This vehicle number is already registered. Please use a different vehicle number."
    }

    if (/panNumber_1/i.test(rawMessage) || /panNumber/i.test(rawMessage)) {
      return "This PAN number is already registered."
    }

    if (/aadharNumber_1/i.test(rawMessage) || /aadharNumber/i.test(rawMessage)) {
      return "This Aadhar number is already registered."
    }

    if (/drivingLicense/i.test(rawMessage)) {
      return "This driving license number is already registered."
    }

    return "This account detail is already registered. Please check your information."
  }

  return rawMessage || "Failed to register. Please try again."
}

const DELIVERY_ONBOARDING_DB_CANDIDATES = [
  "deliveryOnboardingFiles",
  "delivery-onboarding-files",
  "deliverySignupFiles",
  "delivery-signup-files",
  "delivery_signup_files"
]

const deleteIndexedDbByName = (dbName) =>
  new Promise((resolve) => {
    if (!dbName || typeof indexedDB === "undefined") {
      resolve(false)
      return
    }
    try {
      const request = indexedDB.deleteDatabase(dbName)
      request.onsuccess = () => resolve(true)
      request.onerror = () => resolve(false)
      request.onblocked = () => resolve(false)
    } catch {
      resolve(false)
    }
  })

const cleanupDeliveryOnboardingIndexedDb = async () => {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return

  const candidateNames = new Set(DELIVERY_ONBOARDING_DB_CANDIDATES)
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases()
      dbs
        .map((db) => String(db?.name || "").trim())
        .filter((name) => name && /delivery/i.test(name) && /onboard|signup|upload|doc/i.test(name))
        .forEach((name) => candidateNames.add(name))
    }
  } catch {
    // Ignore discovery failure and fallback to static allow-list only.
  }

  await Promise.all(Array.from(candidateNames).map((name) => deleteIndexedDbByName(name)))
}


export default function SignupStep2() {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const isMobileDevice =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "")
  const fileInputRefs = useRef({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const { documents, setDocument, removeDocument, clearOnboardingState } = useDeliveryOnboardingStore()
  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const initial = createEmptyUploadedDocs()
    Object.keys(documents).forEach(key => {
      if (documents[key]) initial[key] = { file: true }
    })
    return initial
  })
  const [activePicker, setActivePicker] = useState(null) // { docType: string, title: string, ref: any }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState({})
  const documentTypes = ["profilePhoto", "aadharPhoto", "panPhoto", "drivingLicensePhoto"]
  const isMountedRef = useRef(true)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (!saved) return
    if (/\"dataUrl\"\s*:/.test(saved) || saved.length > 250000) {
      sessionStorage.removeItem("deliverySignupDocs")
    }
  }, [])

  const documentsRef = useRef(documents)
  useEffect(() => {
    documentsRef.current = documents
  }, [documents])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      // Do NOT revokeObjectURL here anymore because we want to preserve 
      // the previews when navigating back and forth between steps.
      // The browser will clean them up when the tab is closed or 
      // when we explicitly revoke them during file replacement/removal.
    }
  }, [])

  const navigateWithFallback = (path) => {
    navigate(path, { replace: true })

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (!isMountedRef.current) return
        if (window.location.pathname !== path) {
          window.location.replace(path)
        }
      }, 250)
    }
  }

  const getPreviewSrc = (docType) => {
    const localFile = documents[docType]
    if (localFile instanceof File) {
      if (!localFile._previewUrl) {
        localFile._previewUrl = URL.createObjectURL(localFile)
      }
      return localFile._previewUrl
    }

    const uploaded = uploadedDocs[docType]
    if (typeof uploaded === "string") return uploaded
    if (uploaded?.url) return uploaded.url

    return null
  }

  const handleOpenUploadOptions = (docType) => {
    fileInputRefs.current[docType]?.click()
  }

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    setUploading((prev) => ({ ...prev, [docType]: true }))

    if (!file.type.startsWith("image/")) {
      setUploading((prev) => ({ ...prev, [docType]: false }))
      toast.error("Please select an image file")
      return
    }

    try {
      const normalizedFile = await optimizeDocumentImage(file)

      if (normalizedFile.size > MAX_DOCUMENT_IMAGE_BYTES) {
        toast.error("Image size should be less than 5MB")
        return
      }

      const oldFile = documents[docType]
      if (oldFile instanceof File && oldFile._previewUrl && String(oldFile._previewUrl).startsWith("blob:")) {
        URL.revokeObjectURL(oldFile._previewUrl)
      }

      normalizedFile._previewUrl = URL.createObjectURL(normalizedFile)
      await waitForPreviewReady(normalizedFile._previewUrl)

      setDocument(docType, normalizedFile)
      setUploadedDocs((prev) => ({
        ...prev,
        [docType]: {
          name: normalizedFile.name,
          type: normalizedFile.type,
          size: normalizedFile.size,
          file: true
        }
      }))
      toast.success(`${docType.replace(/([A-Z])/g, " $1").trim()} selected`)
    } catch (error) {
      debugError("Failed to process selected file:", error)
      toast.error("Failed to process image")
    } finally {
      setUploading((prev) => ({ ...prev, [docType]: false }))
    }
  }

  const handleTakeCameraPhoto = (docType, label) => {
    openCamera({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`
    })
  }

  const handlePickFromGallery = async (docType) => {
    await openGallery({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`
    })
  }

  const handleRemove = (docType) => {
    const file = documents[docType]
    if (file instanceof File && file._previewUrl && String(file._previewUrl).startsWith("blob:")) {
      URL.revokeObjectURL(file._previewUrl)
    }
    removeDocument(docType)
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const isAnyUploading = Object.values(uploading).some(Boolean)
    if (isAnyUploading) {
      toast.error("Please wait until all image previews are ready")
      return
    }

    if (!documents.profilePhoto || !documents.aadharPhoto || !documents.panPhoto || !documents.drivingLicensePhoto) {
      toast.error("Please upload all required documents")
      return
    }

    const raw = sessionStorage.getItem("deliverySignupDetails")
    if (!raw) {
      toast.error("Session expired. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    let details
    try {
      details = JSON.parse(raw)
    } catch {
      toast.error("Invalid session. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    const formData = new FormData()
    formData.append("name", details.name || "")
    formData.append("phone", String(details.phone || "").replace(/\D/g, "").slice(0, 15))
    if (details.email) formData.append("email", String(details.email).trim())
    if (details.ref) formData.append("ref", String(details.ref).trim())
    if (details.countryCode) formData.append("countryCode", details.countryCode)
    if (details.address) formData.append("address", details.address)
    if (details.city) formData.append("city", details.city)
    if (details.state) formData.append("state", details.state)
    if (details.vehicleType) formData.append("vehicleType", details.vehicleType)
    if (details.vehicleName) formData.append("vehicleName", details.vehicleName)
    if (details.vehicleNumber) formData.append("vehicleNumber", details.vehicleNumber)
    if (details.drivingLicenseNumber) {
      formData.append("drivingLicenseNumber", details.drivingLicenseNumber)
      formData.append("documents[drivingLicense][number]", details.drivingLicenseNumber)
    }
    if (details.panNumber) formData.append("panNumber", details.panNumber)
    if (details.aadharNumber) formData.append("aadharNumber", details.aadharNumber)
    formData.append("profilePhoto", documents.profilePhoto)
    formData.append("aadharPhoto", documents.aadharPhoto)
    formData.append("panPhoto", documents.panPhoto)
    formData.append("drivingLicensePhoto", documents.drivingLicensePhoto)

    // Try to get FCM token before registering
    let fcmToken = null;
    let platform = "web";
    try {
      if (typeof window !== "undefined") {
        if (window.flutter_inappwebview) {
          platform = "mobile";
          const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
          for (const handlerName of handlerNames) {
            try {
              const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" });
              if (t && typeof t === "string" && t.length > 20) {
                fcmToken = t.trim();
                break;
              }
            } catch (e) {}
          }
        } else {
          fcmToken = localStorage.getItem("fcm_web_registered_token_delivery") || null;
        }
      }
    } catch (e) {
      debugWarn("Failed to get FCM token during signup", e);
    }

    if (fcmToken) {
      formData.append("fcmToken", fcmToken);
      formData.append("platform", platform);
    }

    const isCompleteProfile = sessionStorage.getItem("deliveryNeedsRegistration") === "true"

    setIsSubmitting(true)

    try {
      // New number (OTP ke baad pehli baar): DB me abhi partner nahi hai,
      // is case me register hi call karna hai (no auth token needed).
      const response = isCompleteProfile
        ? await deliveryAPI.register(formData)
        : await deliveryAPI.completeProfile(formData)

      if (response?.data?.success) {
        sessionStorage.removeItem("deliverySignupDetails")
        sessionStorage.removeItem("deliverySignupDocs")
        sessionStorage.removeItem("deliveryAuthData")
        clearOnboardingState()
        void cleanupDeliveryOnboardingIndexedDb().catch((error) => {
          debugWarn("Failed to cleanup onboarding IndexedDB", error)
        })
        if (isCompleteProfile) {
          sessionStorage.removeItem("deliveryNeedsRegistration")
          clearModuleAuth("delivery")
          toast.success("Registration successful. Please login with OTP.")
          navigateWithFallback("/food/delivery/login")
        } else {
          const targetPath = isModuleAuthenticated("delivery")
            ? "/food/delivery"
            : "/food/delivery/login"
          toast.success("Profile submitted. Waiting for admin approval.")
          navigateWithFallback(targetPath)
        }
        return
      }
    } catch (error) {
      debugError("Error submitting registration:", error)
      const message = getFriendlyRegistrationError(error)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const uploaded = uploadedDocs[docType]
    const isUploading = Boolean(uploading[docType])
    const previewSrc = getPreviewSrc(docType)
    const hasPreview = Boolean(previewSrc)
    const controlsDisabled = isUploading || isSubmitting

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded && hasPreview ? (
          <div className="relative">
            <img
              src={previewSrc}
              alt={label}
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => handleRemove(docType)}
              className={`absolute top-2 right-2 text-white p-2 rounded-full transition-colors ${
                controlsDisabled ? "bg-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 transition-colors px-4">
            <div className="flex flex-col items-center justify-center pt-5 pb-3">
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-sm text-gray-500">Preparing preview...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Upload document</p>
                  <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>

            {!isUploading && (
              <div className="w-full grid grid-cols-2 gap-2 pb-4">
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => handleTakeCameraPhoto(docType, label)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-xs font-bold transition-all ${
                    controlsDisabled
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gray-900 cursor-pointer hover:bg-black active:scale-95"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Photo</span>
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => handlePickFromGallery(docType)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-xs font-bold transition-all ${
                    controlsDisabled
                      ? "bg-[#8fd8b6] cursor-not-allowed"
                      : "bg-[#00B761] cursor-pointer hover:bg-[#00A055] active:scale-95"
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Gallery</span>
                </button>
              </div>
            )}

            <input
              ref={(node) => {
                fileInputRefs.current[docType] = node
              }}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onClick={(e) => {
                e.target.value = ""
              }}
              onChange={(e) => {
                const selectedFile = e.target.files[0]
                if (selectedFile) {
                  handleFileSelect(docType, selectedFile)
                }
                e.target.value = ""
              }}
              disabled={controlsDisabled}
            />
          </div>
        )}
      </div>
    )
  }

  const isAnyUploading = documentTypes.some((docType) => Boolean(uploading[docType]))
  const hasAllDocuments = documentTypes.every((docType) => documents[docType])
  const hasAllPreviews = documentTypes.every((docType) => {
    if (!documents[docType]) return false
    return Boolean(getPreviewSrc(docType))
  })
  const disableSubmit = isSubmitting || isAnyUploading || !hasAllDocuments || !hasAllPreviews

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={goBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={disableSubmit}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${disableSubmit
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Submitting..." : isAnyUploading ? "Preparing images..." : "Complete Signup"}
          </button>
        </form>
      </div>

    </div>
  )
}
